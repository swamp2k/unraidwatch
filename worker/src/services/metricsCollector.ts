import type { Env, UserRow } from '../types';
import { decrypt } from './encryption';
import {
  getStats, getNetworkStats, getContainers,
  startContainerStatsWs, type ContainerStatEntry,
} from './unraidClient';

const DEFAULT_RETENTION_S = 604800; // 7 days

// How long to hold the container-stats subscription open per collection so we
// receive at least two pushes and can derive a network rate.
const SAMPLE_MS = 8000;

async function getRetentionSeconds(db: D1Database, userId: string, resourceType: string): Promise<number> {
  try {
    const row = await db.prepare(
      'SELECT retention_days FROM retention_settings WHERE user_id = ? AND resource_type = ?'
    ).bind(userId, resourceType).first<{ retention_days: number }>();
    if (row) return row.retention_days * 86400;
  } catch { /* table may not exist yet */ }
  return DEFAULT_RETENTION_S;
}

/**
 * Collect one minute-bucket of system and container metrics for a user and
 * persist them. Runs from the per-minute cron so history accrues even when no
 * dashboard (SSE stream) is open. Container stats come from a short-lived
 * dockerContainerStats WebSocket subscription.
 */
export async function collectMetrics(user: UserRow, env: Env): Promise<void> {
  try {
    const apiKey = await decrypt(user.api_key, env);

    const server = await env.DB.prepare('SELECT id FROM servers WHERE user_id = ?')
      .bind(user.id).first<{ id: string }>();
    if (!server) return;
    const serverId = server.id;

    const now = Date.now();
    const ts = Math.floor(now / 60_000) * 60;

    // Open the container-stats subscription and let it collect for a few seconds.
    const statsCache = new Map<string, ContainerStatEntry>();
    const statsAbort = new AbortController();
    startContainerStatsWs(user.url, apiKey, statsCache, statsAbort.signal);

    // Meanwhile fetch the system stats and container list.
    const [statsR, netR, containersR] = await Promise.allSettled([
      getStats(user.url, apiKey),
      getNetworkStats(user.url, apiKey),
      getContainers(user.url, apiKey),
    ]);

    await new Promise(r => setTimeout(r, SAMPLE_MS));
    statsAbort.abort();

    // ── System metrics ──────────────────────────────────────────────────────
    if (statsR.status === 'fulfilled') {
      const stats = statsR.value;
      const net = netR.status === 'fulfilled' ? netR.value : null;
      const rx = net ? net.rx_kbps : stats.net_rx_kbps;
      const tx = net ? net.tx_kbps : stats.net_tx_kbps;
      const retentionS = await getRetentionSeconds(env.DB, user.id, 'system');
      try {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO system_metrics (server_id, ts, cpu_pct, ram_pct, net_rx_kbps, net_tx_kbps, temp_avg) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(serverId, ts, stats.cpu_pct, stats.ram_pct, rx, tx, stats.temp_avg).run();
        await env.DB.prepare(
          'DELETE FROM system_metrics WHERE server_id = ? AND ts < unixepoch() - ?'
        ).bind(serverId, retentionS).run();
      } catch { /* table may not exist yet during migration rollout */ }
    }

    // ── Container metrics ───────────────────────────────────────────────────
    if (containersR.status === 'fulfilled') {
      const running = containersR.value.filter(ct => ct.status === 'running');
      const retentionS = await getRetentionSeconds(env.DB, user.id, 'container');
      let withStats = 0;
      try {
        const inserts: D1PreparedStatement[] = [];
        for (const ct of running) {
          const st = statsCache.get(ct.id);
          if (st) withStats++;
          inserts.push(
            env.DB.prepare(
              `INSERT OR IGNORE INTO container_metrics
               (server_id, container_id, container_name, ts, cpu_pct, mem_mb, net_rx_kbps, net_tx_kbps)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              serverId, ct.id, ct.name, ts,
              st?.cpu ?? 0, st?.memMb ?? 0, st?.netRxKbps ?? 0, st?.netTxKbps ?? 0,
            )
          );
        }
        if (inserts.length > 0) await env.DB.batch(inserts);
        await env.DB.prepare(
          'DELETE FROM container_metrics WHERE server_id = ? AND ts < unixepoch() - ?'
        ).bind(serverId, retentionS).run();
      } catch { /* table may not exist yet during migration rollout */ }
      console.log(`[metrics] user=${user.id} running=${running.length} withStats=${withStats}`);
    }
  } catch (err) {
    console.error(`Metric collection failed for user ${user.id}:`, err);
  }
}
