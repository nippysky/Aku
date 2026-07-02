/**
 * JWT helpers using `jose` (no native dependencies — works on any Node.js).
 *
 * Payload:
 *   { sub: userId, email, name, sessionId }
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash } from 'crypto';

export interface AkuJWTPayload extends JWTPayload {
  sub:       string;  // userId
  email:     string;
  name:      string;
  sessionId: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(secret);
}

function getExpiry(): string {
  return process.env.JWT_EXPIRY ?? '30d';
}

/** Sign a JWT for a user session. */
export async function signJWT(payload: Omit<AkuJWTPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(getExpiry())
    .sign(getSecret());
}

/** Verify and decode a JWT. Throws if invalid or expired. */
export async function verifyJWT(token: string): Promise<AkuJWTPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as AkuJWTPayload;
}

/** SHA-256 hash of a token for safe DB storage. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
