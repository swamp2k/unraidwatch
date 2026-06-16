import { Hono } from 'hono';
import type { Env, User } from '../types';
import { authMiddleware } from '../middleware/auth';
import { decrypt } from '../services/encryption';
import {
  getStats, getNetworkStats, getContainers, getVMs, getArray, getShares, getUPS,
  startContainerStatsWs, type ContainerStatEntry,
} from '../services/unraidClient';

const sse = new Hono<{ Bindings: Env; Variables: { user: User } }>();

sse.use('*', authMiddleware);

sse.get('/', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT id, url, api_key FROM servers WHERE user_id = ?')
    .bind(user.id).first<{ id: string; url: string; api_key: string }>();

  if (!row) return c.json({ error: 'No server configured' }, 404);

  const apiKey = await decrypt(row.api_key, c.env);
  const { url } = row;

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  function emit(event: string, data: unknown): void {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(chunk)).catch(() => {});
  }

  // Container stats cache — populated by the WebSocket subscription running alongside SSE
  const statsCache = new Map<string, ContainerStatEntry>();
  const statsAbort = new AbortController();
  startContainerStatsWs(url, apiKey, statsCache, statsAbort.signal);
  // Abort the WebSocket when the SSE stream closes
  void writer.closed.finally(() => statsAbort.abort());

  async function poll(): Promise<void> {
    const results = await Promise.allSettled([
      getStats(url, apiKey),
      getContainers(url, apiKey),
      getVMs(url, apiKey),
      getArray(url, apiKey),
      getShares(url, apiKey),
      getUPS(url, apiKey),
      getNetworkStats(url, apiKey),
    ]);

    if (results[0].status === 'fulfilled') {
      const stats = { ...results[0].value };

      // Merge system network stats if available
      if (results[6].status === 'fulfilled' && results[6].value !== null) {
        stats.net_rx_kbps = results[6].value.rx_kbps;
        stats.net_tx_kbps = results[6].value.tx_kbps;
      }

      emit('stats', stats);
    }

    if (results[1].status === 'fulfilled') {
      // Merge live CPU/RAM/network from WebSocket cache into the container list.
      // Historical persistence is handled by the per-minute cron (metricsCollector).
      const containers = results[1].value.map(c => ({
        ...c,
        cpu_pct: statsCache.get(c.id)?.cpu ?? 0,
        mem_mb: statsCache.get(c.id)?.memMb ?? 0,
        net_rx_kbps: statsCache.get(c.id)?.netRxKbps ?? 0,
        net_tx_kbps: statsCache.get(c.id)?.netTxKbps ?? 0,
      }));
      emit('docker', containers);
    }

    if (results[2].status === 'fulfilled') emit('vms', results[2].value);
    if (results[3].status === 'fulfilled') emit('array', results[3].value);
    if (results[4].status === 'fulfilled') emit('shares', results[4].value);
    if (results[5].status === 'fulfilled' && results[5].value !== null) emit('ups', results[5].value);
  }

  poll().then(() => {
    const interval = setInterval(() => {
      poll().catch(() => {
        clearInterval(interval);
        writer.close().catch(() => {});
      });
    }, 5000);

    setTimeout(() => {
      clearInterval(interval);
      writer.close().catch(() => {});
    }, 295_000);
  }).catch(() => writer.close().catch(() => {}));

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

export default sse;
