import { scrypt } from '@noble/hashes/scrypt';
import { bytesToHex } from '@noble/hashes/utils';
import { randomBytes } from 'crypto';

const password = process.argv[2];
if (!password) { console.error('Usage: node hash-password.mjs <password>'); process.exit(1); }

const salt = randomBytes(16);
const saltHex = salt.toString('hex');
const hash = scrypt(new TextEncoder().encode(password), Uint8Array.from(salt), { N: 16384, r: 8, p: 1, dkLen: 32 });
console.log(`${saltHex}:${bytesToHex(hash)}`);
