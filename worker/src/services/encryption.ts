import type { Env } from '../types';

const ALGORITHM = { name: 'AES-GCM', length: 256 } as const;

async function getKey(env: Env): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(env.ENCRYPTION_KEY), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, ALGORITHM, false, ['encrypt', 'decrypt']);
}

export async function encrypt(text: string, env: Env): Promise<string> {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array([...iv, ...new Uint8Array(ciphertext)]);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(stored: string, env: Env): Promise<string> {
  const key = await getKey(env);
  const combined = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
