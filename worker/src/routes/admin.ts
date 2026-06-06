import { Hono } from 'hono';
import { bytesToHex } from '@noble/hashes/utils';
import type { Env, User } from '../types';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { sendInvite } from '../services/emailService';

const admin = new Hono<{ Bindings: Env; Variables: { user: User } }>();

admin.use('*', authMiddleware, adminMiddleware);

admin.get('/invites', async (c) => {
  const invites = await c.env.DB.prepare(
    'SELECT id, email, token, created_by, used_at, expires_at FROM invites ORDER BY expires_at DESC'
  ).all();
  return c.json(invites.results);
});

admin.post('/invites', async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  const user = c.get('user');
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;

  await c.env.DB.prepare(
    'INSERT INTO invites (email, token, created_by, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(email.toLowerCase(), token, user.id, expiresAt).run();

  await sendInvite(c.env, email, token);
  return c.json({ ok: true });
});

admin.delete('/invites/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM invites WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

admin.get('/users', async (c) => {
  const users = await c.env.DB.prepare('SELECT id, email, role, created_at, last_login FROM users ORDER BY created_at').all();
  return c.json(users.results);
});

export default admin;
