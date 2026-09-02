/**
 * Nexus integration contract — v1.
 *
 * This file is the stable, platform-neutral boundary between UnraidWatch (which
 * owns all Unraid API behaviour) and consumers such as Nexus.
 *
 * Rules for this file:
 *   - No Cloudflare-specific types. Nothing from `@cloudflare/workers-types`,
 *     no Request/Response, no D1, no Env.
 *   - Plain JSON-serializable values only, so the same DTOs survive any
 *     transport (Service Binding RPC today, HTTP or anything else later).
 *   - camelCase, matching the shape consumers render directly.
 *   - Explicit null for "not available", never a magic sentinel.
 *   - Read-only. Phase 1 exposes no mutations.
 *
 * Changing a field's meaning is a breaking change: bump CONTRACT_VERSION and
 * keep the previous shape until consumers have migrated.
 */

export const CONTRACT_VERSION = 1;

/** Stable machine-readable failure codes. Carried as the thrown Error's `message`. */
export type IntegrationErrorCode =
  /** Token missing, malformed, unknown or revoked. */
  | 'unauthorized'
  /** Token is valid but its UnraidWatch account has no Unraid server saved. */
  | 'not_configured'
  /** UnraidWatch could not reach or authenticate against the Unraid server. */
  | 'upstream_unavailable'
  /** Anything else. */
  | 'internal';

/**
 * Error carrying a stable code. `message` is deliberately set to the code so it
 * survives transports that only preserve the message (Cloudflare RPC included).
 * Human-readable detail lives in `detail`.
 */
export class IntegrationError extends Error {
  readonly code: IntegrationErrorCode;
  readonly detail: string;

  constructor(code: IntegrationErrorCode, detail: string) {
    super(code);
    this.name = 'IntegrationError';
    this.code = code;
    this.detail = detail;
  }
}

export interface UnraidStatsDto {
  cpuPct: number;
  ramPct: number;
  ramUsedGb: number;
  ramTotalGb: number;
  uptimeS: number;
  /** Average temperature in Celsius, or null when the server reports no sensors. */
  tempAvg: number | null;
}

export interface UnraidDiskDto {
  slot: string;
  name: string;
  /** Celsius, or null when the disk reports no temperature. */
  temp: number | null;
  health: string;
  usedGb: number;
  totalGb: number;
}

export interface UnraidArrayDto {
  status: string;
  capacityUsedTb: number;
  capacityTotalTb: number;
  disks: UnraidDiskDto[];
  cache: UnraidDiskDto[];
}

export interface UnraidContainerDto {
  id: string;
  name: string;
  status: string;
}

export interface UnraidVmDto {
  id: string;
  name: string;
  status: string;
}

export interface UnraidShareDto {
  name: string;
  usedGb: number;
  totalGb: number;
  pct: number;
}

export interface UnraidUpsDto {
  model: string;
  status: string;
  batteryPct: number;
  runtimeMin: number;
  loadPct: number;
}

export interface UnraidServerDto {
  label: string;
  /**
   * Reachable at `fetchedAt`. In a successful overview this is proven true by
   * the read itself — the stats query round-tripped to the Unraid server.
   */
  online: boolean;
  /**
   * What UnraidWatch's availability monitor believes, as an ISO-8601 instant,
   * or null when it considers the server up.
   *
   * Deliberately separate from `online`: the monitor runs once a minute, so it
   * can lag reality in both directions. A server that is reachable right now
   * but still flagged by the monitor is a normal state during recovery.
   */
  monitorOfflineSince: string | null;
}

/**
 * Sections of an overview that are fetched independently and can report failure.
 *
 * UPS is deliberately absent: `getUPS` in services/unraidClient resolves null
 * for both "no UPS" and "query failed" and cannot distinguish them, so a UPS
 * failure is not reportable in v1. See the note on `UnraidOverviewDto.ups`.
 */
export type OverviewSection = 'array' | 'containers' | 'vms' | 'shares';

/**
 * Everything the Nexus Unraid page renders, in one round trip.
 *
 * Availability is explicit rather than encoded in the values: a section listed
 * in `unavailable` could not be read this cycle, and its field carries null (or
 * an empty list) as a placeholder. That keeps null meaning one thing per field —
 * an empty `containers` with `unavailable` empty means the server really has no
 * containers, which is genuinely different from "the Docker query failed".
 */
export interface UnraidOverviewDto {
  contractVersion: number;
  /** ISO-8601. When UnraidWatch actually read this from the Unraid server. */
  fetchedAt: string;
  server: UnraidServerDto;
  stats: UnraidStatsDto;
  /** Null only when `unavailable` includes 'array'. */
  array: UnraidArrayDto | null;
  containers: UnraidContainerDto[];
  vms: UnraidVmDto[];
  shares: UnraidShareDto[];
  /**
   * Null for "no UPS configured" — and, in v1 only, also null if the UPS query
   * failed. These are not distinguishable today; treat null as "nothing to
   * show". Fixing this at the source is a contract change, not a silent one.
   */
  ups: UnraidUpsDto | null;
  /** Empty on a fully successful read. */
  unavailable: OverviewSection[];
}

/** Cheap liveness/authorization probe. Does not touch the Unraid server. */
export interface IntegrationIdentityDto {
  contractVersion: number;
  /**
   * Label of the Unraid server this token can read, or null when the account
   * has no server saved yet. Never an empty string.
   */
  serverLabel: string | null;
  /** False when the account has a token but no Unraid server saved yet. */
  serverConfigured: boolean;
  scope: 'read';
}

/**
 * The contract consumers depend on.
 *
 * `token` is the caller's credential and is deliberately a plain method
 * argument rather than an ambient transport concern — that keeps the same
 * signature meaningful over RPC (argument) and HTTP (Authorization header).
 *
 * Every method rejects with {@link IntegrationError} on failure.
 */
export interface NexusUnraidIntegration {
  /** Verify a token and report what it can see, without calling Unraid. */
  identify(token: string): Promise<IntegrationIdentityDto>;
  getOverview(token: string): Promise<UnraidOverviewDto>;
  getStats(token: string): Promise<UnraidStatsDto>;
  getArray(token: string): Promise<UnraidArrayDto>;
  getDocker(token: string): Promise<UnraidContainerDto[]>;
  getVMs(token: string): Promise<UnraidVmDto[]>;
  getShares(token: string): Promise<UnraidShareDto[]>;
  getUPS(token: string): Promise<UnraidUpsDto | null>;
}
