import type { Env } from '../types';
import { decrypt } from '../services/encryption';
import * as unraid from '../services/unraidClient';
import { resolveToken } from './tokens';
import {
  CONTRACT_VERSION,
  IntegrationError,
  type IntegrationIdentityDto,
  type OverviewSection,
  type UnraidArrayDto,
  type UnraidContainerDto,
  type UnraidDiskDto,
  type UnraidOverviewDto,
  type UnraidShareDto,
  type UnraidStatsDto,
  type UnraidUpsDto,
  type UnraidVmDto,
} from './contract';

/**
 * Implementation of the Nexus integration contract.
 *
 * These are plain functions on purpose. The Cloudflare WorkerEntrypoint in
 * `index.ts` is a thin adapter over them; an HTTP controller would be an
 * equally thin adapter. No transport concern belongs in this file.
 *
 * All Unraid access goes through `services/unraidClient` — UnraidWatch's single
 * implementation of the Unraid GraphQL API. Nothing here re-queries Unraid
 * directly, and no consumer ever sees the Unraid API key.
 */

interface ServerRow {
  id: string;
  label: string;
  url: string;
  api_key: string;
  offline_since: number | null;
}

interface Connection {
  server: ServerRow;
  apiKey: string;
}

/**
 * UnraidWatch reports an unknown temperature as 0 (see `mapDisk` and `getStats`
 * in services/unraidClient). The contract promises explicit null instead, so we
 * translate at the boundary. A running array never legitimately reports 0 °C.
 *
 * Follow-up: make the sentinel null at the source, after which this is a no-op.
 */
function temperature(value: number | null | undefined): number | null {
  return value === null || value === undefined || value === 0 ? null : value;
}

async function connect(env: Env, token: string): Promise<Connection> {
  const { userId } = await resolveToken(env, token);

  const server = await env.DB.prepare(
    'SELECT id, label, url, api_key, offline_since FROM servers WHERE user_id = ?'
  ).bind(userId).first<ServerRow>();

  if (!server) {
    throw new IntegrationError('not_configured', 'This UnraidWatch account has no Unraid server configured.');
  }

  let apiKey: string;
  try {
    apiKey = await decrypt(server.api_key, env);
  } catch {
    throw new IntegrationError('internal', 'Stored Unraid API key could not be decrypted.');
  }

  return { server, apiKey };
}

/** Wrap an unraidClient call so upstream detail never leaks a stack or a key. */
async function upstream<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof IntegrationError) throw e;
    throw new IntegrationError(
      'upstream_unavailable',
      e instanceof Error ? e.message : 'Unraid server did not respond.',
    );
  }
}

function toDisk(d: unraid.UnraidDisk): UnraidDiskDto {
  return {
    slot: d.slot,
    name: d.name,
    temp: temperature(d.temp),
    health: d.health,
    usedGb: d.used_gb,
    totalGb: d.total_gb,
  };
}

function toStats(s: unraid.UnraidStats): UnraidStatsDto {
  return {
    cpuPct: s.cpu_pct,
    ramPct: s.ram_pct,
    ramUsedGb: s.ram_used_gb,
    ramTotalGb: s.ram_total_gb,
    uptimeS: s.uptime_s,
    tempAvg: temperature(s.temp_avg),
  };
}

function toArray(a: unraid.UnraidArray): UnraidArrayDto {
  return {
    status: a.status,
    capacityUsedTb: a.capacity_used_tb,
    capacityTotalTb: a.capacity_total_tb,
    disks: a.disks.map(toDisk),
    cache: a.cache.map(toDisk),
  };
}

const toContainer = (c: unraid.UnraidContainer): UnraidContainerDto =>
  ({ id: c.id, name: c.name, status: c.status });

const toVm = (v: unraid.UnraidVM): UnraidVmDto =>
  ({ id: v.id, name: v.name, status: v.status });

const toShare = (s: unraid.UnraidShare): UnraidShareDto =>
  ({ name: s.name, usedGb: s.used_gb, totalGb: s.total_gb, pct: s.pct });

const toUps = (u: unraid.UnraidUPS | null): UnraidUpsDto | null =>
  u === null ? null : {
    model: u.model,
    status: u.status,
    batteryPct: u.battery_pct,
    runtimeMin: u.runtime_min,
    loadPct: u.load_pct,
  };

/**
 * Very small per-isolate overview cache.
 *
 * An overview is six GraphQL round trips, and consumers poll. A few seconds of
 * reuse collapses concurrent pollers onto one upstream read without adding any
 * infrastructure. It is intentionally not shared across isolates — if that ever
 * matters, this is the one place to change.
 */
const OVERVIEW_TTL_MS = 10_000;
const overviewCache = new Map<string, { at: number; value: UnraidOverviewDto }>();

export async function identify(env: Env, token: string): Promise<IntegrationIdentityDto> {
  const { userId } = await resolveToken(env, token);
  const server = await env.DB.prepare('SELECT label FROM servers WHERE user_id = ?')
    .bind(userId).first<{ label: string }>();

  return {
    contractVersion: CONTRACT_VERSION,
    serverLabel: server?.label ?? null,
    serverConfigured: server !== null,
    scope: 'read',
  };
}

export async function getOverview(env: Env, token: string): Promise<UnraidOverviewDto> {
  const { server, apiKey } = await connect(env, token);

  const cached = overviewCache.get(server.id);
  if (cached && Date.now() - cached.at < OVERVIEW_TTL_MS) return cached.value;

  const { url } = server;
  // Partial results are useful: an unreadable VM list should not blank the whole
  // page. Stats is the exception — if it fails the server is unreachable and the
  // whole call fails. Sections that fail are reported in `unavailable` rather
  // than being faked, so the consumer can tell "could not read" from "empty".
  const unavailable: OverviewSection[] = [];
  const failed = <T>(section: OverviewSection, fallback: T) => (): T => {
    unavailable.push(section);
    return fallback;
  };

  const [stats, array, containers, vms, shares, ups] = await Promise.all([
    upstream(() => unraid.getStats(url, apiKey)),
    upstream(() => unraid.getArray(url, apiKey)).catch(failed('array', null)),
    upstream(() => unraid.getContainers(url, apiKey)).catch(failed('containers', [])),
    upstream(() => unraid.getVMs(url, apiKey)).catch(failed('vms', [])),
    upstream(() => unraid.getShares(url, apiKey)).catch(failed('shares', [])),
    // getUPS resolves null both for "no UPS" and for a failed query, and cannot
    // distinguish them; it never rejects, so 'ups' is never reported here.
    unraid.getUPS(url, apiKey).catch(() => null),
  ]);

  const value: UnraidOverviewDto = {
    contractVersion: CONTRACT_VERSION,
    fetchedAt: new Date().toISOString(),
    server: {
      label: server.label,
      // The stats read above round-tripped to the Unraid server, so it is
      // reachable regardless of what the once-a-minute monitor last recorded.
      online: true,
      monitorOfflineSince: server.offline_since === null
        ? null
        : new Date(server.offline_since * 1000).toISOString(),
    },
    stats: toStats(stats),
    array: array === null ? null : toArray(array),
    containers: containers.map(toContainer),
    vms: vms.map(toVm),
    shares: shares.map(toShare),
    ups: toUps(ups),
    unavailable,
  };

  overviewCache.set(server.id, { at: Date.now(), value });
  return value;
}

export async function getStats(env: Env, token: string): Promise<UnraidStatsDto> {
  const { server, apiKey } = await connect(env, token);
  return toStats(await upstream(() => unraid.getStats(server.url, apiKey)));
}

export async function getArray(env: Env, token: string): Promise<UnraidArrayDto> {
  const { server, apiKey } = await connect(env, token);
  return toArray(await upstream(() => unraid.getArray(server.url, apiKey)));
}

export async function getDocker(env: Env, token: string): Promise<UnraidContainerDto[]> {
  const { server, apiKey } = await connect(env, token);
  return (await upstream(() => unraid.getContainers(server.url, apiKey))).map(toContainer);
}

export async function getVMs(env: Env, token: string): Promise<UnraidVmDto[]> {
  const { server, apiKey } = await connect(env, token);
  return (await upstream(() => unraid.getVMs(server.url, apiKey))).map(toVm);
}

export async function getShares(env: Env, token: string): Promise<UnraidShareDto[]> {
  const { server, apiKey } = await connect(env, token);
  return (await upstream(() => unraid.getShares(server.url, apiKey))).map(toShare);
}

export async function getUPS(env: Env, token: string): Promise<UnraidUpsDto | null> {
  const { server, apiKey } = await connect(env, token);
  return toUps(await unraid.getUPS(server.url, apiKey).catch(() => null));
}
