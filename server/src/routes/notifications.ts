/**
 * Notifications routes
 *
 * POST   /api/notifications/token         — Register a device push token
 * DELETE /api/notifications/token         — Deregister a device push token
 * POST   /api/notifications/circle-event  — Fan out circle push to recipient user IDs
 */
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pushTokens } from '../db/schema.js';
import { sendExpoPush } from '../lib/expo-push.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';

const router = new Hono<{ Variables: AuthContext }>();

function generateId(): string {
  return randomBytes(16).toString('hex');
}

const EXPO_TOKEN_RE = /^ExponentPushToken\[.{22}\]$/;

// ─── POST /api/notifications/token ───────────────────────────────────────────
// Register a push token for the authenticated user.
// Upserts — safe to call on every app launch.

router.post('/token', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload');
  const userId  = payload.sub;

  let body: { token?: string; platform?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { token, platform } = body;

  if (!token || !EXPO_TOKEN_RE.test(token)) {
    return c.json({ error: 'Invalid Expo push token' }, 400);
  }

  if (!platform || !['ios', 'android'].includes(platform)) {
    return c.json({ error: 'platform must be "ios" or "android"' }, 400);
  }

  // Check if token already exists (from any user — device recycle / re-register)
  const [existing] = await db
    .select({ id: pushTokens.id, userId: pushTokens.userId })
    .from(pushTokens)
    .where(eq(pushTokens.token, token))
    .limit(1);

  const now = new Date();

  if (existing) {
    // If it already belongs to this user, just touch updatedAt
    if (existing.userId === userId) {
      await db
        .update(pushTokens)
        .set({ platform, updatedAt: now })
        .where(eq(pushTokens.id, existing.id));
    } else {
      // Token transferred to a new user (device wiped / re-sold)
      await db
        .update(pushTokens)
        .set({ userId, platform, updatedAt: now })
        .where(eq(pushTokens.id, existing.id));
    }
  } else {
    await db.insert(pushTokens).values({
      id:        generateId(),
      userId,
      token,
      platform,
      createdAt: now,
      updatedAt: now,
    });
  }

  return c.json({ success: true });
});

// ─── POST /api/notifications/circle-event ────────────────────────────────────
// Fan out a push notification to a list of recipient user IDs.
// Called by any circle member after logging / verifying a contribution.
// The caller supplies recipient user IDs — server looks up their registered tokens.

router.post('/circle-event', authMiddleware, async (c) => {
  let body: {
    recipientUserIds?: string[];
    title?: string;
    body?: string;
    data?: Record<string, string>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { recipientUserIds, title, body: bodyText, data } = body;

  if (!Array.isArray(recipientUserIds) || recipientUserIds.length === 0) {
    return c.json({ error: 'recipientUserIds must be a non-empty array' }, 400);
  }
  if (!title || !bodyText) {
    return c.json({ error: 'title and body are required' }, 400);
  }

  // Cap recipients to prevent abuse
  const ids = recipientUserIds.slice(0, 50);

  try {
    const rows = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(inArray(pushTokens.userId, ids));

    const tokens = rows.map((r) => r.token);

    if (tokens.length > 0) {
      await sendExpoPush(tokens, {
        title,
        body:      bodyText,
        channelId: 'circles',
        data:      data ?? {},
      });
    }

    return c.json({ success: true, sent: tokens.length });
  } catch (err) {
    console.error('[notifications] circle-event error:', err);
    return c.json({ error: 'Failed to send notifications' }, 500);
  }
});

// ─── DELETE /api/notifications/token ─────────────────────────────────────────
// Deregister a push token — call on sign-out so this device stops receiving pushes.

router.delete('/token', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload');
  const userId  = payload.sub;

  let body: { token?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.token) {
    return c.json({ error: 'token is required' }, 400);
  }

  await db
    .delete(pushTokens)
    .where(
      and(
        eq(pushTokens.token, body.token),
        eq(pushTokens.userId, userId),
      )
    );

  return c.json({ success: true });
});

export default router;
