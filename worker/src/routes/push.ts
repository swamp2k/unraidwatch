import { Hono } from 'hono';
import type { Env, User, PushSubscription } from '../types';
import { authMiddleware } from '../middleware/auth';

const push = new Hono<{ Bindings: Env; Variables: { user: User } }>();

push.use('*', authMiddleware);

push.get('/vapid-key', (c) => {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

push.post('/subscribe', async (c) => {
  const user = c.get('user');
  const { endpoint, p256dh, auth } = await c.req.json<PushSubscription>();
  const ua = c.req.header('User-Agent');

  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
  ).bind(user.id, endpoint, p256dh, auth, ua ?? null).run();

  return c.json({ ok: true });
});

push.delete('/subscribe', async (c) => {
  const user = c.get('user');
  const { endpoint } = await c.req.json<{ endpoint: string }>();
  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').bind(user.id, endpoint).run();
  return c.json({ ok: true });
});

export default push;
