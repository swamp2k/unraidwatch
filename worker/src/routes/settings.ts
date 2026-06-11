import { Hono } from 'hono';
import type { Env, User } from '../types';
import { authMiddleware } from '../middleware/auth';

const settings = new Hono<{ Bindings: Env; Variables: { user: User } }>();

settings.use('*', authMiddleware);

const RESOURCE_TYPES = ['system', 'container', 'vm'] as const;
const MIN_DAYS = 1;
const MAX_DAYS = 7;
const DEFAULT_DAYS = 7;

settings.get('/retention', async (c) => {
  const user = c.get('user');
  try {
    const rows = await c.env.DB.prepare(
      'SELECT resource_type, retention_days FROM retention_settings WHERE user_id = ?'
    ).bind(user.id).all<{ resource_type: string; retention_days: number }>();

    const map = Object.fromEntries(rows.results.map(r => [r.resource_type, r.retention_days]));
    return c.json({
      system:    map['system']    ?? DEFAULT_DAYS,
      container: map['container'] ?? DEFAULT_DAYS,
      vm:        map['vm']        ?? DEFAULT_DAYS,
    });
  } catch {
    return c.json({ system: DEFAULT_DAYS, container: DEFAULT_DAYS, vm: DEFAULT_DAYS });
  }
});

settings.put('/retention', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Record<string, number>>();

  for (const type of RESOURCE_TYPES) {
    const days = body[type];
    if (days === undefined) continue;
    const clamped = Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(days)));
    try {
      await c.env.DB.prepare(
        `INSERT INTO retention_settings (user_id, resource_type, retention_days)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, resource_type) DO UPDATE SET retention_days = excluded.retention_days`
      ).bind(user.id, type, clamped).run();
    } catch { /* table may not exist yet */ }
  }

  return c.json({ ok: true });
});

export default settings;
