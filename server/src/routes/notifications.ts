/**
 * Notifications routes
 *
 * POST   /api/notifications/token         — Register a device push token (+ timezone)
 * DELETE /api/notifications/token         — Deregister a device push token
 * POST   /api/notifications/insight       — Upsert user financial insight signals
 * POST   /api/notifications/pool-event    — Fan out pool push to recipient user IDs
 * POST   /api/notifications/test          — Send a test push to the caller's own devices
 */
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pushTokens, userInsights } from '../db/schema.js';
import { sendExpoPush } from '../lib/expo-push.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';

const router = new Hono<{ Variables: AuthContext }>();

function generateId(): string {
  return randomBytes(16).toString('hex');
}

// Expo push tokens: ExponentPushToken[...] with variable-length IDs.
const EXPO_TOKEN_RE = /^ExponentPushToken\[.+\]$/;

// ─── POST /api/notifications/token ───────────────────────────────────────────
// Register a push token for the authenticated user.
// Upserts — safe to call on every app launch.
// Accepts optional `timezone` (IANA string) for smart notification timing.

router.post('/token', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload');
  const userId  = payload.sub;

  let body: { token?: string; platform?: string; timezone?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { token, platform, timezone } = body;

  if (!token || !EXPO_TOKEN_RE.test(token)) {
    return c.json({ error: 'Invalid Expo push token' }, 400);
  }

  if (!platform || !['ios', 'android'].includes(platform)) {
    return c.json({ error: 'platform must be "ios" or "android"' }, 400);
  }

  // Validate timezone if provided — try creating an Intl formatter with it
  let validatedTimezone: string | undefined;
  if (timezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      validatedTimezone = timezone;
    } catch {
      // Invalid timezone string — ignore but don't error (non-critical)
    }
  }

  const [existing] = await db
    .select({ id: pushTokens.id, userId: pushTokens.userId })
    .from(pushTokens)
    .where(eq(pushTokens.token, token))
    .limit(1);

  const now = new Date();

  if (existing) {
    if (existing.userId === userId) {
      await db
        .update(pushTokens)
        .set({ platform, timezone: validatedTimezone ?? null, updatedAt: now })
        .where(eq(pushTokens.id, existing.id));
    } else {
      // Token transferred to a new user (device wiped / re-sold)
      await db
        .update(pushTokens)
        .set({ userId, platform, timezone: validatedTimezone ?? null, updatedAt: now })
        .where(eq(pushTokens.id, existing.id));
    }
  } else {
    await db.insert(pushTokens).values({
      id:        generateId(),
      userId,
      token,
      platform,
      timezone:  validatedTimezone ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return c.json({ success: true });
});

// ─── POST /api/notifications/insight ─────────────────────────────────────────
// Upsert financial insight signals for the authenticated user.
// Called fire-and-forget by the app after each successful sync.
// The server only receives aggregated signals (percentages, counts, booleans)
// — never raw financial amounts — to craft personalised push messages.

router.post('/insight', authMiddleware, async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  let body: {
    budgetUtilization?:   number | null;
    hasOverBudget?:       boolean;
    spendingStreak?:      number;
    weeklyChangePct?:     number | null;
    monthlyExpenseCount?: number;
    topCategory?:         string | null;
    totalGoalsCount?:     number;
    goalsOnTrack?:        number;
    hasActiveGoals?:      boolean;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const now = new Date();

  // Clamp / sanitise values so rogue clients can't pollute the DB
  const sanitised = {
    budgetUtilization:   body.budgetUtilization != null
      ? Math.min(Math.max(Number(body.budgetUtilization), 0), 10) : null,
    hasOverBudget:       Boolean(body.hasOverBudget ?? false),
    spendingStreak:      Math.min(Math.max(Math.round(Number(body.spendingStreak ?? 0)), 0), 3650),
    weeklyChangePct:     body.weeklyChangePct != null
      ? Math.min(Math.max(Number(body.weeklyChangePct), -1000), 1000) : null,
    monthlyExpenseCount: Math.min(Math.max(Math.round(Number(body.monthlyExpenseCount ?? 0)), 0), 100_000),
    topCategory:         typeof body.topCategory === 'string'
      ? body.topCategory.slice(0, 100) : null,
    totalGoalsCount:     Math.min(Math.max(Math.round(Number(body.totalGoalsCount ?? 0)), 0), 10_000),
    goalsOnTrack:        Math.min(Math.max(Math.round(Number(body.goalsOnTrack ?? 0)), 0), 10_000),
    hasActiveGoals:      Boolean(body.hasActiveGoals ?? false),
    updatedAt:           now,
  };

  // Upsert: insert on first call, update on subsequent calls
  await db
    .insert(userInsights)
    .values({ userId, ...sanitised })
    .onConflictDoUpdate({
      target: userInsights.userId,
      set:    sanitised,
    });

  return c.json({ success: true });
});

// ─── POST /api/notifications/pool-event ─────────────────────────────────────
// Fan out a push notification to a list of recipient user IDs.
// Called by any pool member after logging / verifying a contribution.

router.post('/pool-event', authMiddleware, async (c) => {
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
        channelId: 'pools',
        data:      data ?? {},
      });
    }

    return c.json({ success: true, sent: tokens.length });
  } catch (err) {
    console.error('[notifications] pool-event error:', err);
    return c.json({ error: 'Failed to send notifications' }, 500);
  }
});

// ─── POST /api/notifications/test ────────────────────────────────────────────
// Send a test push notification to all of the authenticated user's registered
// devices. Use to verify the end-to-end push pipeline.

router.post('/test', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload');
  const userId  = payload.sub;

  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId));

  const tokens = rows.map((r) => r.token);

  if (tokens.length === 0) {
    return c.json({
      error: 'No push tokens registered for this user. Open the app and grant notification permission.',
    }, 404);
  }

  try {
    await sendExpoPush(tokens, {
      title:     '🔔 Akù push test',
      body:      'Push notifications are working correctly on this device.',
      channelId: 'digest',
      data:      { type: 'test' },
    });
    return c.json({ success: true, sent: tokens.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to send test notification';
    console.error('[notifications] test push error:', err);
    return c.json({ error: msg }, 500);
  }
});

// ─── PATCH /api/notifications/preferences ────────────────────────────────────
// Save client notification preferences to user_insights so the server-side
// notification worker respects them. Lightweight — only updates notif_prefs_json.
// Called immediately whenever the user toggles a setting in the app.

router.patch('/preferences', authMiddleware, async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  let body: {
    billReminders?:  boolean;
    budgetAlerts?:   boolean;
    goalMilestones?: boolean;
    dailyDigest?:    boolean;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Validate: all supplied keys must be booleans
  for (const [k, v] of Object.entries(body)) {
    if (typeof v !== 'boolean') {
      return c.json({ error: `${k} must be a boolean` }, 400);
    }
  }

  const allowedKeys = new Set(['billReminders', 'budgetAlerts', 'goalMilestones', 'dailyDigest']);
  const filtered = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowedKeys.has(k)),
  );

  if (Object.keys(filtered).length === 0) {
    return c.json({ error: 'No valid preference keys provided' }, 400);
  }

  const now = new Date();

  // Merge into existing prefs if a row already exists
  const [existing] = await db
    .select({ notifPrefsJson: userInsights.notifPrefsJson })
    .from(userInsights)
    .where(eq(userInsights.userId, userId))
    .limit(1);

  let merged: Record<string, boolean>;
  if (existing?.notifPrefsJson) {
    try {
      merged = { ...JSON.parse(existing.notifPrefsJson), ...filtered } as Record<string, boolean>;
    } catch {
      merged = filtered as Record<string, boolean>;
    }
  } else {
    merged = filtered as Record<string, boolean>;
  }

  const notifPrefsJson = JSON.stringify(merged);

  await db
    .insert(userInsights)
    .values({ userId, notifPrefsJson, updatedAt: now })
    .onConflictDoUpdate({
      target: userInsights.userId,
      set:    { notifPrefsJson, updatedAt: now },
    });

  return c.json({ success: true });
});

// ─── DELETE /api/notifications/token ─────────────────────────────────────────
// Deregister a push token on sign-out.

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
