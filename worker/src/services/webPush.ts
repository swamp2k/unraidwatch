import type { Env } from '../types';

/**
 * Self-contained Web Push (VAPID + RFC 8291 aes128gcm) implementation built on
 * the Web Crypto API, so it runs natively on Cloudflare Workers without the
 * Node-only `web-push` library.
 *
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are expected in the standard
 * `web-push generate-vapid-keys` base64url format: the public key is the
 * 65-byte uncompressed P-256 point, the private key is the raw 32-byte scalar.
 */

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushNotification {
  title: string;
  body: string;
  /** Path within the app to open when the notification is tapped. */
  url?: string;
  /** Coalesce notifications that share a tag. */
  tag?: string;
}

// ── encoding helpers ──────────────────────────────────────────────────────
function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const bin = atob(s + '='.repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

// ── crypto primitives ─────────────────────────────────────────────────────
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** HKDF producing `length` (≤32) bytes via a single expand step. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const out = await hmac(prk, concat(info, new Uint8Array([1])));
  return out.slice(0, length);
}

// ── VAPID JWT (ES256) ─────────────────────────────────────────────────────
async function importVapidSigningKey(publicKey: Uint8Array, privateKey: Uint8Array): Promise<CryptoKey> {
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(publicKey.slice(1, 33)),
    y: bytesToB64url(publicKey.slice(33, 65)),
    d: bytesToB64url(privateKey),
    ext: true,
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function buildVapidAuthHeader(
  endpoint: string,
  vapidPublic: Uint8Array,
  signingKey: CryptoKey,
  subject: string,
): Promise<string> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const header = bytesToB64url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(utf8(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })));
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, utf8(signingInput));
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${bytesToB64url(vapidPublic)}`;
}

// ── payload encryption (RFC 8291 / RFC 8188 aes128gcm) ────────────────────
async function encryptPayload(
  payload: Uint8Array,
  uaPublic: Uint8Array,
  authSecret: Uint8Array,
): Promise<Uint8Array> {
  const asKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  ) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey) as ArrayBuffer); // 65 bytes

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(
    // workers-types calls the spec's `public` field `$public`; the runtime uses
    // the spec name, so pass `public` and bypass the stale type definition.
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      asKeyPair.privateKey,
      256,
    ),
  );

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public)
  const keyInfo = concat(utf8('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  // record = payload || 0x02 padding delimiter (single, final record)
  const record = concat(payload, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record),
  );

  // aes128gcm header: salt(16) || rs(4, uint32) || idlen(1) || keyid(as_public)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const header = concat(salt, rs, new Uint8Array([asPublic.length]), asPublic);
  return concat(header, ciphertext);
}

/** Send a single push. Returns the upstream HTTP status (or 0 on transport error). */
async function sendPush(env: Env, sub: StoredSubscription, notification: PushNotification): Promise<number> {
  const vapidPublic = b64urlToBytes(env.VAPID_PUBLIC_KEY);
  const vapidPrivate = b64urlToBytes(env.VAPID_PRIVATE_KEY);
  const signingKey = await importVapidSigningKey(vapidPublic, vapidPrivate);
  const authHeader = await buildVapidAuthHeader(sub.endpoint, vapidPublic, signingKey, env.VAPID_SUBJECT);

  const body = await encryptPayload(
    utf8(JSON.stringify(notification)),
    b64urlToBytes(sub.p256dh),
    b64urlToBytes(sub.auth),
  );

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
    },
    body,
  });
  return res.status;
}

/**
 * Deliver a notification to every push subscription registered for a user.
 * Dead subscriptions (404/410) are pruned automatically. Never throws.
 */
export async function sendPushToUser(env: Env, userId: string, notification: PushNotification): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  let subs;
  try {
    subs = await env.DB.prepare(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    ).bind(userId).all<StoredSubscription>();
  } catch (err) {
    console.error('push: failed to load subscriptions', err);
    return;
  }

  for (const sub of subs.results) {
    try {
      const status = await sendPush(env, sub, notification);
      if (status === 404 || status === 410) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run();
      } else if (status >= 400) {
        console.error(`push: ${status} for ${sub.endpoint}`);
      }
    } catch (err) {
      console.error('push: send failed', err);
    }
  }
}
