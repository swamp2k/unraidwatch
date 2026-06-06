import { Hono } from 'hono';
import { scrypt } from '@noble/hashes/scrypt';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import type { Env, User } from '../types';
import { authMiddleware } from '../middleware/auth';
import { sendMagicLink } from '../services/emailService';

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

function randomHex(bytes = 32): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

function hashPassword(password: string, salt: string): string {
  const hash = scrypt(new TextEncoder().encode(password), hexToBytes(salt), { N: 16384, r: 8, p: 1, dkLen: 32 });
  return `${salt}:${bytesToHex(hash)}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  const hash = scrypt(new TextEncoder().encode(password), hexToBytes(salt), { N: 16384, r: 8, p: 1, dkLen: 32 });
  return bytesToHex(hash) === expected;
}

async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomHex(32);
  await env.SESSIONS.put(`sessions:${token}`, JSON.stringify({ user_id: userId, created_at: Date.now() }), { expirationTtl: SESSION_TTL });
  return token;
}

function sessionCookie(token: string): string {
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}; Path=/`;
}

const auth = new Hono<{ Bindings: Env; Variables: { user: User } }>();

auth.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  const user = await c.env.DB.prepare('SELECT id, email, role, password_hash FROM users WHERE email = ?')
    .bind(email.toLowerCase()).first<User & { password_hash: string }>();
  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  await c.env.DB.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').bind(user.id).run();
  const token = await createSession(c.env, user.id);
  c.res.headers.set('Set-Cookie', sessionCookie(token));
  return c.json({ id: user.id, email: user.email, role: user.role });
});

auth.post('/magic-request', async (c) => {
  const { email } = await c.req.json<{ email: string }>();
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first<{ id: string }>();
  if (!user) return c.json({ ok: true }); // don't reveal if email exists
  const token = randomHex(16);
  await c.env.SESSIONS.put(`magic:${token}`, user.id, { expirationTtl: 900 });
  await sendMagicLink(c.env, email, token);
  return c.json({ ok: true });
});

auth.get('/magic-verify', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Missing token' }, 400);
  const userId = await c.env.SESSIONS.get(`magic:${token}`);
  if (!userId) return c.json({ error: 'Invalid or expired token' }, 401);
  await c.env.SESSIONS.delete(`magic:${token}`);
  await c.env.DB.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').bind(userId).run();
  const sessionToken = await createSession(c.env, userId);
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': sessionCookie(sessionToken),
    },
  });
});

auth.post('/logout', authMiddleware, async (c) => {
  const cookie = c.req.header('Cookie') ?? '';
  const match = cookie.match(/session=([^;]+)/);
  if (match) await c.env.SESSIONS.delete(`sessions:${match[1]}`);
  c.res.headers.set('Set-Cookie', 'session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/');
  return c.json({ ok: true });
});

auth.get('/me', authMiddleware, (c) => {
  const user = c.get('user');
  return c.json({ id: user.id, email: user.email, role: user.role });
});

// Accept invite — create user account
auth.post('/accept-invite', async (c) => {
  const { token, password } = await c.req.json<{ token: string; password: string }>();
  const invite = await c.env.DB.prepare('SELECT * FROM invites WHERE token = ? AND used_at IS NULL AND expires_at > unixepoch()')
    .bind(token).first<{ id: string; email: string }>();
  if (!invite) return c.json({ error: 'Invalid or expired invite' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(invite.email).first();
  if (existing) return c.json({ error: 'Account already exists' }, 409);

  const salt = randomHex(16);
  const passwordHash = hashPassword(password, salt);

  await c.env.DB.prepare(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)'
  ).bind(invite.email, passwordHash).run();

  const newUser = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(invite.email).first<{ id: string }>();
  if (!newUser) return c.json({ error: 'Failed to create account' }, 500);

  await c.env.DB.prepare('UPDATE invites SET used_at = unixepoch() WHERE id = ?').bind(invite.id).run();

  const sessionToken = await createSession(c.env, newUser.id);
  c.res.headers.set('Set-Cookie', sessionCookie(sessionToken));
  return c.json({ ok: true });
});

export default auth;
