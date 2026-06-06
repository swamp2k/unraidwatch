import { Hono } from 'hono';
import type { Env, User, AlertRule } from '../types';
import { authMiddleware } from '../middleware/auth';

const alerts = new Hono<{ Bindings: Env; Variables: { user: User } }>();

alerts.use('*', authMiddleware);

alerts.get('/rules', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare('SELECT * FROM alert_rules WHERE user_id = ? ORDER BY created_at').bind(user.id).all();
  return c.json(rows.results);
});

alerts.post('/rules', async (c) => {
  const user = c.get('user');
  const { name, metric, operator, threshold } = await c.req.json<Omit<AlertRule, 'id' | 'user_id' | 'enabled' | 'created_at'>>();
  await c.env.DB.prepare(
    'INSERT INTO alert_rules (user_id, name, metric, operator, threshold) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.id, name, metric, operator, threshold).run();
  return c.json({ ok: true });
});

alerts.put('/rules/:id', async (c) => {
  const user = c.get('user');
  const { name, metric, operator, threshold, enabled } = await c.req.json<Partial<AlertRule>>();
  await c.env.DB.prepare(
    'UPDATE alert_rules SET name = COALESCE(?, name), metric = COALESCE(?, metric), operator = COALESCE(?, operator), threshold = COALESCE(?, threshold), enabled = COALESCE(?, enabled) WHERE id = ? AND user_id = ?'
  ).bind(name ?? null, metric ?? null, operator ?? null, threshold ?? null, enabled ?? null, c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

alerts.delete('/rules/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM alert_rules WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

alerts.get('/history', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    'SELECT * FROM alert_history WHERE user_id = ? ORDER BY fired_at DESC LIMIT 100'
  ).bind(user.id).all();
  return c.json(rows.results);
});

export default alerts;
