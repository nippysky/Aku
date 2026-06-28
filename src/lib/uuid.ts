/**
 * UUID v4 generator.
 * Expo SDK 52+ Hermes exposes globalThis.crypto.randomUUID(), so we use that
 * when available (cryptographically secure). Falls back to Math.random()-based
 * generation on older runtimes only.
 */
export function generateUUID(): string {
  if (typeof globalThis?.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Fallback (should not be reached on Expo SDK 52+)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
