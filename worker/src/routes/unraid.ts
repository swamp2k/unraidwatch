import { Hono } from 'hono';
import type { Env, User } from '../types';
import { authMiddleware } from '../middleware/auth';
import { decrypt } from '../services/encryption';
import * as unraid from '../services/unraidClient';

const unraidRoutes = new Hono<{ Bindings: Env; Variables: { user: User; server: { url: string; apiKey: string } } }>();

unraidRoutes.use('*', authMiddleware);

// Load server config for each request
unraidRoutes.use('*', async (c, next) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT url, api_key FROM servers WHERE user_id = ?')
    .bind(user.id).first<{ url: string; api_key: string }>();
  if (!row) return c.json({ error: 'No server configured' }, 404);
  const apiKey = await decrypt(row.api_key, c.env);
  c.set('server', { url: row.url, apiKey });
  return next();
});

unraidRoutes.get('/stats', async (c) => {
  const { url, apiKey } = c.get('server');
  return c.json(await unraid.getStats(url, apiKey));
});

unraidRoutes.get('/array', async (c) => {
  const { url, apiKey } = c.get('server');
  return c.json(await unraid.getArray(url, apiKey));
});

unraidRoutes.get('/docker', async (c) => {
  const { url, apiKey } = c.get('server');
  return c.json(await unraid.getContainers(url, apiKey));
});

unraidRoutes.post('/docker/:id/start', async (c) => {
  const { url, apiKey } = c.get('server');
  await unraid.containerAction(url, apiKey, c.req.param('id'), 'start');
  return c.json({ ok: true });
});

unraidRoutes.post('/docker/:id/stop', async (c) => {
  const { url, apiKey } = c.get('server');
  await unraid.containerAction(url, apiKey, c.req.param('id'), 'stop');
  return c.json({ ok: true });
});

unraidRoutes.post('/docker/:id/restart', async (c) => {
  const { url, apiKey } = c.get('server');
  await unraid.containerAction(url, apiKey, c.req.param('id'), 'restart');
  return c.json({ ok: true });
});

unraidRoutes.get('/docker/:id/logs', async (c) => {
  const { url, apiKey } = c.get('server');
  const logs = await unraid.getContainerLogs(url, apiKey, c.req.param('id'));
  return new Response(logs, { headers: { 'Content-Type': 'text/plain' } });
});

unraidRoutes.get('/vms', async (c) => {
  const { url, apiKey } = c.get('server');
  return c.json(await unraid.getVMs(url, apiKey));
});

unraidRoutes.post('/vms/:id/start', async (c) => {
  const { url, apiKey } = c.get('server');
  await unraid.vmAction(url, apiKey, c.req.param('id'), 'start');
  return c.json({ ok: true });
});

unraidRoutes.post('/vms/:id/stop', async (c) => {
  const { url, apiKey } = c.get('server');
  await unraid.vmAction(url, apiKey, c.req.param('id'), 'stop');
  return c.json({ ok: true });
});

unraidRoutes.get('/shares', async (c) => {
  const { url, apiKey } = c.get('server');
  return c.json(await unraid.getShares(url, apiKey));
});

unraidRoutes.get('/ups', async (c) => {
  const { url, apiKey } = c.get('server');
  return c.json(await unraid.getUPS(url, apiKey));
});

unraidRoutes.get('/syslog', async (c) => {
  const { url, apiKey } = c.get('server');
  const lines = parseInt(c.req.query('lines') ?? '500');
  const log = await unraid.getSyslog(url, apiKey, lines);
  return new Response(log, { headers: { 'Content-Type': 'text/plain' } });
});

export default unraidRoutes;
