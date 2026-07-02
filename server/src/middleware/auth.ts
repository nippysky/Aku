/**
 * Auth middleware — validates the Bearer JWT on every protected route.
 *
 * Usage:
 *   app.use('/api/user/*', authMiddleware);
 *   app.use('/api/avatar', authMiddleware);
 */
import type { Context, Next } from 'hono';
import { verifyJWT, hashToken, type AkuJWTPayload } from '../lib/jwt.js';
import { db } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { and, eq, isNull, gt } from 'drizzle-orm';

export type AuthContext = {
  jwtPayload: AkuJWTPayload;
};

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or malformed Authorization header' }, 401);
  }

  const token = authHeader.slice(7);

  let payload: AkuJWTPayload;
  try {
    payload = await verifyJWT(token);
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Verify the session still exists in the DB and hasn't been revoked
  const tokenHash = hashToken(token);
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session) {
    return c.json({ error: 'Session not found or revoked' }, 401);
  }

  c.set('jwtPayload', payload);
  await next();
}
