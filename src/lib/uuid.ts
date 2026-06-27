/**
 * Pure-JS UUID v4 generator.
 * React Native's Hermes engine does not expose the Web Crypto API
 * (crypto.randomUUID), so we use Math.random()-based generation here.
 * For cryptographic purposes (e.g. server-side tokens) use a secure backend.
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
