import { Hono } from 'hono';
import type { Env, User } from '../types';
import { authMiddleware } from '../middleware/auth';

const metrics = new Hono<{ Bindings: Env; Variables: { user: User } }>();

metrics.use('*', authMiddleware);

const WINDOWS = {
  '1h':  { seconds: 3600,   bucket: 60   },
  '6h':  { seconds: 21600,  bucket: 300  },
  '24h': { seconds: 86400,  bucket: 900  },
  '7d':  { seconds: 604800, bucket: 3600 },
} as const;

metrics.get('/history', async (c) => {
  const user = c.get('user');
  const window = c.req.query('window') ?? '1h';

  if (!(window in WINDOWS)) return c.json({ error: 'Invalid window' }, 400);

  const serverRow = await c.env.DB.prepare(
    'SELECT id FROM servers WHERE user_id = ?'
  ).bind(user.id).first<{ id: string }>();

  if (!serverRow) return c.json({ error: 'No server configured' }, 404);

  const { seconds, bucket } = WINDOWS[window as keyof typeof WINDOWS];

  const rows = await c.env.DB.prepare(`
    SELECT (ts / ?) * ? AS ts,
           ROUND(AVG(cpu_pct), 1) AS cpu_pct,
           ROUND(AVG(ram_pct), 1) AS ram_pct,
           ROUND(AVG(COALESCE(net_rx_kbps, 0)), 0) AS net_rx_kbps,
           ROUND(AVG(COALESCE(net_tx_kbps, 0)), 0) AS net_tx_kbps,
           ROUND(AVG(COALESCE(temp_avg, 0)), 1) AS temp_avg
    FROM system_metrics
    WHERE server_id = ? AND ts > unixepoch() - ?
    GROUP BY (ts / ?)
    ORDER BY ts
  `).bind(bucket, bucket, serverRow.id, seconds, bucket)
    .all<{ ts: number; cpu_pct: number; ram_pct: number; net_rx_kbps: number; net_tx_kbps: number; temp_avg: number }>();

  return c.json(rows.results);
});

metrics.get('/history/container/:id', async (c) => {
  const user = c.get('user');
  const containerId = c.req.param('id');
  const window = c.req.query('window') ?? '1h';

  if (!(window in WINDOWS)) return c.json({ error: 'Invalid window' }, 400);

  const serverRow = await c.env.DB.prepare(
    'SELECT id FROM servers WHERE user_id = ?'
  ).bind(user.id).first<{ id: string }>();

  if (!serverRow) return c.json({ error: 'No server configured' }, 404);

  const { seconds, bucket } = WINDOWS[window as keyof typeof WINDOWS];

  try {
    const rows = await c.env.DB.prepare(`
      SELECT (ts / ?) * ? AS ts,
             ROUND(AVG(cpu_pct), 1) AS cpu_pct,
             ROUND(AVG(mem_mb), 0) AS mem_mb,
             ROUND(AVG(COALESCE(net_rx_kbps, 0)), 0) AS net_rx_kbps,
             ROUND(AVG(COALESCE(net_tx_kbps, 0)), 0) AS net_tx_kbps
      FROM container_metrics
      WHERE server_id = ? AND container_id = ? AND ts > unixepoch() - ?
      GROUP BY (ts / ?)
      ORDER BY ts
    `).bind(bucket, bucket, serverRow.id, containerId, seconds, bucket)
      .all<{ ts: number; cpu_pct: number; mem_mb: number; net_rx_kbps: number; net_tx_kbps: number }>();

    return c.json(rows.results);
  } catch (err) {
    console.error('container history query failed:', err);
    return c.json([]);
  }
});

export default metrics;
