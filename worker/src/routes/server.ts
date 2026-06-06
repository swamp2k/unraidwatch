import { Hono } from 'hono';
import type { Env, User, ServerConfig } from '../types';
import { authMiddleware } from '../middleware/auth';
import { encrypt, decrypt } from '../services/encryption';
import { getStats } from '../services/unraidClient';

const server = new Hono<{ Bindings: Env; Variables: { user: User } }>();

server.use('*', authMiddleware);

server.get('/', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT id, user_id, label, url, verified_at, created_at, updated_at FROM servers WHERE user_id = ?'
  ).bind(user.id).first<Omit<ServerConfig, 'api_key'>>();
  if (!row) return c.json(null);
  return c.json(row);
});

server.put('/', async (c) => {
  const user = c.get('user');
  const { label, url, api_key } = await c.req.json<{ label: string; url: string; api_key: string }>();
  const encryptedKey = await encrypt(api_key, c.env);

  const existing = await c.env.DB.prepare('SELECT id FROM servers WHERE user_id = ?').bind(user.id).first();
  if (existing) {
    await c.env.DB.prepare(
      'UPDATE servers SET label = ?, url = ?, api_key = ?, verified_at = NULL, updated_at = unixepoch() WHERE user_id = ?'
    ).bind(label, url, encryptedKey, user.id).run();
  } else {
    await c.env.DB.prepare(
      'INSERT INTO servers (user_id, label, url, api_key) VALUES (?, ?, ?, ?)'
    ).bind(user.id, label, url, encryptedKey).run();
  }
  return c.json({ ok: true });
});

server.post('/test', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT url, api_key FROM servers WHERE user_id = ?').bind(user.id).first<{ url: string; api_key: string }>();
  if (!row) return c.json({ error: 'No server configured — save your settings first.' }, 404);

  let apiKey: string;
  try {
    apiKey = await decrypt(row.api_key, c.env);
  } catch (e) {
    return c.json({ error: 'Failed to decrypt stored API key. Try re-saving your server config.' }, 500);
  }

  try {
    await getStats(row.url, apiKey);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }

  await c.env.DB.prepare('UPDATE servers SET verified_at = unixepoch() WHERE user_id = ?').bind(user.id).run();
  return c.json({ ok: true });
});

server.delete('/', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM servers WHERE user_id = ?').bind(user.id).run();
  return c.json({ ok: true });
});

export default server;
