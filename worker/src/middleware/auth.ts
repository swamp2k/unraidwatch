import { createMiddleware } from 'hono/factory';
import type { Env, User, SessionData } from '../types';

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: { user: User } }>(async (c, next) => {
  const cookie = c.req.header('Cookie') ?? '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return c.json({ error: 'Unauthorized' }, 401);

  const token = match[1];
  const raw = await c.env.SESSIONS.get(`sessions:${token}`);
  if (!raw) return c.json({ error: 'Unauthorized' }, 401);

  const session = JSON.parse(raw) as SessionData;
  const user = await c.env.DB.prepare('SELECT id, email, role FROM users WHERE id = ?')
    .bind(session.user_id).first<User>();
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  c.set('user', user);
  return next();
});

export const adminMiddleware = createMiddleware<{ Bindings: Env; Variables: { user: User } }>(async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  return next();
});
