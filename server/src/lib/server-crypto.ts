/**
 * Server-side DEK encryption
 *
 * The user's Data Encryption Key (DEK) is stored in the database encrypted
 * with a server master key (AES-256-GCM). This means:
 *   - A database breach alone does not expose DEKs.
 *   - Authenticated users can fetch their own plaintext DEK via the API.
 *   - The server never logs or transmits the plaintext DEK outside that endpoint.
 *
 * Wire format stored in `users.encrypted_dek`:
 *   base64( iv[12] || ciphertext || authTag[16] )
 *
 * Environment:
 *   SERVER_DEK_MASTER_KEY — 64-char hex string (32 bytes), generated once at
 *   server setup with: openssl rand -hex 32
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM  = 'aes-256-gcm' as const;
const IV_BYTES   = 12;
const TAG_BYTES  = 16;

function getMasterKey(): Buffer {
  const hex = process.env.SERVER_DEK_MASTER_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'SERVER_DEK_MASTER_KEY must be set to a 64-char hex string (32 bytes). ' +
      'Generate one with: openssl rand -hex 32',
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a DEK (64-char hex string) for storage in PostgreSQL.
 * Returns a base64 blob: base64( iv[12] || ciphertext || tag[16] ).
 */
export function encryptDekForStorage(dekHex: string): string {
  const key       = getMasterKey();
  const iv        = randomBytes(IV_BYTES);
  const cipher    = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(dekHex, 'utf8'), cipher.final()]);
  const tag       = cipher.getAuthTag(); // 16 bytes
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

/**
 * Decrypt a blob from PostgreSQL back to the plaintext DEK hex string.
 * Throws if the auth tag fails (tampered data or wrong master key).
 */
export function decryptDekFromStorage(blob: string): string {
  const key       = getMasterKey();
  const buf       = Buffer.from(blob, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Encrypted DEK blob is too short — likely corrupt');
  }
  const iv        = buf.subarray(0, IV_BYTES);
  const tag       = buf.subarray(buf.length - TAG_BYTES);
  const encrypted = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher  = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
