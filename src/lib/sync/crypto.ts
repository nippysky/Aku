/**
 * Akù Sync Crypto
 *
 * Provides AES-256-GCM encryption for financial data before it leaves the
 * device. The server receives only ciphertext — it cannot read your data.
 *
 * DEK architecture (Option B — server-stored random DEK):
 *   - DEK = 32 cryptographically random bytes, generated once at account creation.
 *   - Stored in SecureStore (device Keychain) as hex under key 'aku_dek'.
 *   - Also stored server-side, encrypted with the server master key (AES-256-GCM).
 *   - PIN is a screen-lock only — SHA-256 hash for local verification, never
 *     used for key derivation. Forgotten PIN → re-auth via email → same DEK → data intact.
 *
 * Wire-format: base64( iv[12] || ciphertext || authTag[16] )
 *   AES-GCM appends the 16-byte tag to the ciphertext, so the layout is:
 *   bytes 0-11:  IV (random, per-record)
 *   bytes 12-N:  ciphertext
 *   bytes N-N+16: auth tag (appended by GCM)
 *
 * DEK lifecycle:
 *   - Generated once at first PIN setup (new accounts) via generateDEK().
 *   - Uploaded to the server immediately (POST /api/user/dek).
 *   - Stored in SecureStore (device Keychain) as hex.
 *   - Loaded into the in-memory sync store after every successful unlock.
 *   - On new device: fetched from server after email auth (GET /api/user/dek).
 *   - Deleted from SecureStore on sign-out (server copy persists for restore).
 */

import { gcm } from '@noble/ciphers/aes.js';
import * as ExpoC from 'expo-crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

/** AES-GCM IV length in bytes. */
const IV_BYTES = 12;

// ─── Encoding helpers ─────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const len = hex.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── DEK generation ───────────────────────────────────────────────────────────

/**
 * Generate a fresh 32-byte Data Encryption Key using the OS CSPRNG.
 * Called exactly once per account at first PIN setup. The result is stored in
 * SecureStore (device Keychain) and also uploaded to the server (encrypted at
 * rest) so it can be restored on any new device after email authentication.
 */
export async function generateDEK(): Promise<Uint8Array> {
  const bytes = await ExpoC.getRandomBytesAsync(32);
  return new Uint8Array(bytes);
}

/**
 * Encode a DEK for SecureStore storage.
 * We store as hex (not base64) to make it trivially inspectable in audits
 * and to avoid any base64 padding edge-cases.
 */
export function encodeDEK(dek: Uint8Array): string {
  return toHex(dek);
}

/** Decode a hex-encoded DEK retrieved from SecureStore. */
export function decodeDEK(hex: string): Uint8Array {
  return fromHex(hex);
}

// ─── Encryption ───────────────────────────────────────────────────────────────

/**
 * Encrypt a plain-JS object.
 * Returns base64( iv[12] || ciphertext+tag[n+16] ).
 */
export async function encryptRecord(data: object, dek: Uint8Array): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(data));

  // 12 cryptographically random bytes for the IV — unique per record.
  const ivBytes = await ExpoC.getRandomBytesAsync(IV_BYTES);
  const iv = new Uint8Array(ivBytes);

  const cipher = gcm(dek, iv);
  const ciphertextWithTag = cipher.encrypt(plaintext); // tag appended

  // Concatenate IV + ciphertext+tag
  const combined = new Uint8Array(IV_BYTES + ciphertextWithTag.length);
  combined.set(iv, 0);
  combined.set(ciphertextWithTag, IV_BYTES);

  return toBase64(combined);
}

// ─── Decryption ───────────────────────────────────────────────────────────────

/**
 * Decrypt a base64 blob produced by encryptRecord().
 * Throws if the auth tag fails (data tampered / wrong key).
 */
export function decryptRecord<T = unknown>(b64: string, dek: Uint8Array): T {
  const combined = fromBase64(b64);
  if (combined.length < IV_BYTES + 16) {
    throw new Error('Ciphertext too short — likely corrupt or wrong format');
  }

  const iv             = combined.slice(0, IV_BYTES);
  const ciphertextWithTag = combined.slice(IV_BYTES);

  const decipher = gcm(dek, iv);
  const plaintext = decipher.decrypt(ciphertextWithTag); // throws on auth failure

  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
