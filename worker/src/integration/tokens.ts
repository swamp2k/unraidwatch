import type { Env } from '../types';
import { IntegrationError } from './contract';

/**
 * Integration tokens for machine-to-machine consumers (Nexus today).
 *
 * Only a SHA-256 hash is stored. The raw token is returned exactly once, at
 * creation, and is never logged or read back.
 */

const TOKEN_PREFIX = 'uwk_';
const TOKEN_BYTES = 32;

export interface IntegrationTokenRow {
  id: string;
  user_id: string;
  name: string;
  consumer: string;
  token_prefix: string;
  scope: string;
  last_used_at: number | null;
  revoked_at: number | null;
  created_at: number;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Mint a raw token. Never persisted — only its hash is. */
export function generateRawToken(): string {
  return TOKEN_PREFIX + base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export async function hashToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A short non-secret fragment shown in the UI so a user can tell two tokens
 * apart without us storing the secret.
 */
export function tokenHint(raw: string): string {
  return raw.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 6);
}

export async function createToken(
  env: Env,
  userId: string,
  name: string,
  consumer = 'nexus',
): Promise<{ raw: string; row: IntegrationTokenRow }> {
  const raw = generateRawToken();
  const id = await env.DB.prepare(
    `INSERT INTO integration_tokens (user_id, name, consumer, token_hash, token_prefix)
     VALUES (?, ?, ?, ?, ?) RETURNING id`
  ).bind(userId, name, consumer, await hashToken(raw), tokenHint(raw)).first<{ id: string }>();

  const row = await env.DB.prepare(
    `SELECT id, user_id, name, consumer, token_prefix, scope, last_used_at, revoked_at, created_at
     FROM integration_tokens WHERE id = ?`
  ).bind(id!.id).first<IntegrationTokenRow>();

  return { raw, row: row! };
}

export async function listTokens(env: Env, userId: string): Promise<IntegrationTokenRow[]> {
  const res = await env.DB.prepare(
    `SELECT id, user_id, name, consumer, token_prefix, scope, last_used_at, revoked_at, created_at
     FROM integration_tokens WHERE user_id = ? ORDER BY created_at DESC`
  ).bind(userId).all<IntegrationTokenRow>();
  return res.results;
}

/** Revoking is irreversible and takes effect on the next call. */
export async function revokeToken(env: Env, userId: string, tokenId: string): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE integration_tokens SET revoked_at = unixepoch()
     WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
  ).bind(tokenId, userId).run();
  return (res.meta.changes ?? 0) > 0;
}

/**
 * Resolve a raw token to the UnraidWatch user it authorizes.
 *
 * Note the multi-user boundary: the token is the *only* thing that decides
 * which UnraidWatch account (and therefore which Unraid server) a consumer may
 * read. Consumer-side user IDs are never trusted or matched against ours.
 */
export async function resolveToken(env: Env, raw: unknown): Promise<{ userId: string; tokenId: string }> {
  if (typeof raw !== 'string' || !raw.startsWith(TOKEN_PREFIX)) {
    throw new IntegrationError('unauthorized', 'Missing or malformed integration token.');
  }

  const row = await env.DB.prepare(
    `SELECT id, user_id FROM integration_tokens WHERE token_hash = ? AND revoked_at IS NULL`
  ).bind(await hashToken(raw)).first<{ id: string; user_id: string }>();

  if (!row) throw new IntegrationError('unauthorized', 'Integration token is unknown or revoked.');

  // Best-effort usage stamp; never fail a read because this write failed.
  try {
    await env.DB.prepare('UPDATE integration_tokens SET last_used_at = unixepoch() WHERE id = ?')
      .bind(row.id).run();
  } catch { /* ignore */ }

  return { userId: row.user_id, tokenId: row.id };
}
