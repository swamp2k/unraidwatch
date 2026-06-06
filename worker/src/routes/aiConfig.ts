import { Hono } from 'hono';
import type { Env, User, AIConfig } from '../types';
import { authMiddleware } from '../middleware/auth';
import { encrypt } from '../services/encryption';

const aiConfig = new Hono<{ Bindings: Env; Variables: { user: User } }>();

aiConfig.use('*', authMiddleware);

aiConfig.get('/', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT id, user_id, provider, default_model, created_at, updated_at FROM ai_configs WHERE user_id = ?'
  ).bind(user.id).first<Omit<AIConfig, 'api_key'>>();
  if (!row) return c.json(null);
  return c.json(row);
});

aiConfig.put('/', async (c) => {
  const user = c.get('user');
  const { provider, api_key, default_model } = await c.req.json<{ provider: string; api_key: string; default_model: string }>();
  const encryptedKey = await encrypt(api_key, c.env);

  const existing = await c.env.DB.prepare('SELECT id FROM ai_configs WHERE user_id = ?').bind(user.id).first();
  if (existing) {
    await c.env.DB.prepare(
      'UPDATE ai_configs SET provider = ?, api_key = ?, default_model = ?, updated_at = unixepoch() WHERE user_id = ?'
    ).bind(provider, encryptedKey, default_model, user.id).run();
  } else {
    await c.env.DB.prepare(
      'INSERT INTO ai_configs (user_id, provider, api_key, default_model) VALUES (?, ?, ?, ?)'
    ).bind(user.id, provider, encryptedKey, default_model).run();
  }
  return c.json({ ok: true });
});

export default aiConfig;
