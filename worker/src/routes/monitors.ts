import { Hono } from 'hono';
import type { Env, User, DockerMonitor, LogMonitor, MonitorEvent } from '../types';
import { authMiddleware } from '../middleware/auth';

const DEFAULT_LAYOUT = JSON.stringify([
  { id: 'stats-cards',           visible: true, order: 0 },
  { id: 'cpu-ram-chart',         visible: true, order: 1 },
  { id: 'docker-overview',       visible: true, order: 2 },
  { id: 'ups-status',            visible: true, order: 3 },
  { id: 'docker-monitor-status', visible: true, order: 4 },
  { id: 'log-monitor-status',    visible: true, order: 5 },
  { id: 'array-status',          visible: true, order: 6 },
  { id: 'shares-overview',       visible: true, order: 7 },
  { id: 'recent-alerts',         visible: true, order: 8 },
]);

const monitors = new Hono<{ Bindings: Env; Variables: { user: User } }>();

monitors.use('*', authMiddleware);

// ─── Docker Monitors ─────────────────────────────────────────────────────────

monitors.get('/docker', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    'SELECT * FROM docker_monitors WHERE user_id = ? ORDER BY created_at'
  ).bind(user.id).all<DockerMonitor>();
  return c.json(rows.results);
});

monitors.post('/docker', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    container_id: string;
    container_name: string;
    notify_email?: number;
    notify_record?: number;
    notify_action?: number;
    action_type?: string | null;
    cooldown_s?: number;
  }>();

  await c.env.DB.prepare(
    `INSERT INTO docker_monitors
       (user_id, container_id, container_name, notify_email, notify_record, notify_action, action_type, cooldown_s)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, container_id) DO UPDATE SET
       container_name = excluded.container_name,
       notify_email   = excluded.notify_email,
       notify_record  = excluded.notify_record,
       notify_action  = excluded.notify_action,
       action_type    = excluded.action_type,
       cooldown_s     = excluded.cooldown_s`
  ).bind(
    user.id,
    body.container_id,
    body.container_name,
    body.notify_email ?? 0,
    body.notify_record ?? 1,
    body.notify_action ?? 0,
    body.action_type ?? null,
    body.cooldown_s ?? 3600,
  ).run();

  return c.json({ ok: true });
});

monitors.put('/docker/:id', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Partial<DockerMonitor>>();
  await c.env.DB.prepare(
    `UPDATE docker_monitors SET
       enabled      = COALESCE(?, enabled),
       notify_email = COALESCE(?, notify_email),
       notify_record= COALESCE(?, notify_record),
       notify_action= COALESCE(?, notify_action),
       action_type  = COALESCE(?, action_type),
       cooldown_s   = COALESCE(?, cooldown_s)
     WHERE id = ? AND user_id = ?`
  ).bind(
    body.enabled ?? null,
    body.notify_email ?? null,
    body.notify_record ?? null,
    body.notify_action ?? null,
    body.action_type ?? null,
    body.cooldown_s ?? null,
    c.req.param('id'),
    user.id,
  ).run();
  return c.json({ ok: true });
});

monitors.delete('/docker/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM docker_monitors WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

// ─── Log Monitors ─────────────────────────────────────────────────────────────

monitors.get('/log', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    'SELECT * FROM log_monitors WHERE user_id = ? ORDER BY created_at'
  ).bind(user.id).all<LogMonitor>();
  return c.json(rows.results.map(r => ({ ...r, keywords: JSON.parse(r.keywords) as string[] })));
});

monitors.post('/log', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    name: string;
    source_type: 'syslog' | 'docker';
    source_id?: string | null;
    source_label?: string | null;
    keywords: string[];
    notify_email?: number;
    notify_record?: number;
    notify_action?: number;
    action_container_id?: string | null;
    action_type?: string | null;
    cooldown_s?: number;
  }>();

  if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);
  if (!Array.isArray(body.keywords) || body.keywords.length === 0) {
    return c.json({ error: 'At least one keyword is required' }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO log_monitors
       (user_id, name, source_type, source_id, source_label, keywords,
        notify_email, notify_record, notify_action, action_container_id, action_type, cooldown_s)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.id,
    body.name.trim(),
    body.source_type,
    body.source_id ?? null,
    body.source_label ?? null,
    JSON.stringify(body.keywords),
    body.notify_email ?? 0,
    body.notify_record ?? 1,
    body.notify_action ?? 0,
    body.action_container_id ?? null,
    body.action_type ?? null,
    body.cooldown_s ?? 3600,
  ).run();

  return c.json({ ok: true });
});

monitors.put('/log/:id', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<Partial<Omit<LogMonitor, 'keywords'>> & { keywords?: string[] }>();

  const keywordsJson = body.keywords ? JSON.stringify(body.keywords) : null;

  await c.env.DB.prepare(
    `UPDATE log_monitors SET
       name                = COALESCE(?, name),
       enabled             = COALESCE(?, enabled),
       source_type         = COALESCE(?, source_type),
       source_id           = COALESCE(?, source_id),
       source_label        = COALESCE(?, source_label),
       keywords            = COALESCE(?, keywords),
       notify_email        = COALESCE(?, notify_email),
       notify_record       = COALESCE(?, notify_record),
       notify_action       = COALESCE(?, notify_action),
       action_container_id = COALESCE(?, action_container_id),
       action_type         = COALESCE(?, action_type),
       cooldown_s          = COALESCE(?, cooldown_s)
     WHERE id = ? AND user_id = ?`
  ).bind(
    body.name ?? null,
    body.enabled ?? null,
    body.source_type ?? null,
    body.source_id ?? null,
    body.source_label ?? null,
    keywordsJson,
    body.notify_email ?? null,
    body.notify_record ?? null,
    body.notify_action ?? null,
    body.action_container_id ?? null,
    body.action_type ?? null,
    body.cooldown_s ?? null,
    c.req.param('id'),
    user.id,
  ).run();
  return c.json({ ok: true });
});

monitors.delete('/log/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM log_monitors WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

// ─── Monitor Events ──────────────────────────────────────────────────────────

monitors.get('/events', async (c) => {
  const user = c.get('user');
  const type = c.req.query('type');
  const query = type
    ? 'SELECT * FROM monitor_events WHERE user_id = ? AND monitor_type = ? ORDER BY fired_at DESC LIMIT 100'
    : 'SELECT * FROM monitor_events WHERE user_id = ? ORDER BY fired_at DESC LIMIT 100';

  const stmt = type
    ? c.env.DB.prepare(query).bind(user.id, type)
    : c.env.DB.prepare(query).bind(user.id);

  const rows = await stmt.all<MonitorEvent>();
  return c.json(rows.results.map(r => ({
    ...r,
    detail: JSON.parse(r.detail) as unknown,
    actions_taken: JSON.parse(r.actions_taken) as string[],
  })));
});

monitors.delete('/events/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM monitor_events WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

// ─── Dashboard Layout ─────────────────────────────────────────────────────────

monitors.get('/dashboard-layout', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT layout FROM dashboard_layouts WHERE user_id = ?'
  ).bind(user.id).first<{ layout: string }>();
  return c.json(JSON.parse(row?.layout ?? DEFAULT_LAYOUT));
});

monitors.put('/dashboard-layout', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<unknown>();
  if (!Array.isArray(body)) return c.json({ error: 'layout must be an array' }, 400);

  await c.env.DB.prepare(
    `INSERT INTO dashboard_layouts (user_id, layout, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT (user_id) DO UPDATE SET layout = excluded.layout, updated_at = unixepoch()`
  ).bind(user.id, JSON.stringify(body)).run();

  return c.json({ ok: true });
});

export default monitors;
