import { Hono } from 'hono';
import type { Env, User } from '../types';
import { authMiddleware } from '../middleware/auth';
import { createToken, listTokens, revokeToken, type IntegrationTokenRow } from '../integration/tokens';
import { CONTRACT_VERSION } from '../integration/contract';

/**
 * Settings → Integrations. Lets a signed-in user mint and revoke tokens for
 * machine consumers such as Nexus.
 *
 * These are session-authenticated management routes. The integration contract
 * itself is not served here — consumers reach it over the Service Binding
 * entrypoint in index.ts.
 */

const integrations = new Hono<{ Bindings: Env; Variables: { user: User } }>();

integrations.use('*', authMiddleware);

/** Never includes the token itself — only the non-secret hint. */
function toPublic(row: IntegrationTokenRow) {
  return {
    id: row.id,
    name: row.name,
    consumer: row.consumer,
    hint: row.token_prefix,
    scope: row.scope,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  };
}

integrations.get('/', async (c) => {
  const user = c.get('user');
  return c.json({
    contract_version: CONTRACT_VERSION,
    tokens: (await listTokens(c.env, user.id)).map(toPublic),
  });
});

/**
 * Mint a token. The raw value is in this response and nowhere else — it cannot
 * be recovered afterwards.
 */
integrations.post('/tokens', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }));
  const name = (body.name ?? 'Nexus').trim().slice(0, 60) || 'Nexus';

  const { raw, row } = await createToken(c.env, user.id, name);
  return c.json({ token: raw, integration: toPublic(row) }, 201);
});

integrations.delete('/tokens/:id', async (c) => {
  const user = c.get('user');
  const revoked = await revokeToken(c.env, user.id, c.req.param('id'));
  if (!revoked) return c.json({ error: 'Token not found or already revoked.' }, 404);
  return c.json({ ok: true });
});

export default integrations;
