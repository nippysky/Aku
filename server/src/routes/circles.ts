/**
 * Circles routes
 *
 * POST /api/circles              — Register a new circle (owner calls on creation)
 * POST /api/circles/join         — Join a circle by 8-char invite code
 * GET  /api/circles              — List all circles the authenticated user belongs to
 * GET  /api/circles/preview/:code — Preview a circle by invite code (no membership created)
 * GET  /api/circles/:id/members  — Get members of a circle (owner or member only)
 */
import { Hono } from 'hono';
import { eq, and, inArray } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { db } from '../db/client.js';
import { circles, circleMembers, users, pushTokens } from '../db/schema.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';
import { sendExpoPush } from '../lib/expo-push.js';
import { notifyUser } from '../lib/ws-registry.js';

const router = new Hono<{ Variables: AuthContext }>();

router.use('*', authMiddleware);

function generateId(): string {
  return randomBytes(16).toString('hex');
}

// ─── POST /api/circles ────────────────────────────────────────────────────────
// Called by the circle owner immediately after creating the circle locally.
// Idempotent — if the circle already exists for this owner, it's a no-op.

router.post('/', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  const body = await c.req.json<{
    id:         string;
    name:       string;
    emoji?:     string;
    inviteCode: string;
  }>();

  const { id, name, emoji = '💰', inviteCode } = body;

  if (!id || !name || !inviteCode) {
    return c.json({ error: 'id, name and inviteCode are required' }, 400);
  }

  const existing = await db.select({ id: circles.id })
    .from(circles)
    .where(eq(circles.id, id))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(circles).values({ id, name, emoji, inviteCode, ownerId: userId });

    // Owner is automatically the first member
    await db.insert(circleMembers).values({
      id:       generateId(),
      circleId: id,
      userId,
      role:     'owner',
    });
  }

  // Notify all other devices of this user so they pick up the new circle
  notifyUser(userId);

  return c.json({ success: true });
});

// ─── POST /api/circles/join ───────────────────────────────────────────────────
// New member joins by providing the 8-char invite code.
// Returns circle metadata so the client can seed its local SQLite.
// Also fires a push notification to the circle owner (fire-and-forget).

router.post('/join', async (c) => {
  const { sub: userId, name: memberName } = c.get('jwtPayload');

  const body = await c.req.json<{ code: string }>();
  const code  = body?.code?.trim().toUpperCase();

  if (!code || code.length !== 8) {
    return c.json({ error: 'A valid 8-character invite code is required' }, 400);
  }

  // Look up the circle
  const circleRows = await db.select()
    .from(circles)
    .where(eq(circles.inviteCode, code))
    .limit(1);

  if (circleRows.length === 0) {
    return c.json({ error: 'Invalid or expired invite code' }, 404);
  }

  const circle = circleRows[0];

  // Check if already a member (idempotent)
  const membership = await db.select({ id: circleMembers.id })
    .from(circleMembers)
    .where(and(
      eq(circleMembers.circleId, circle.id),
      eq(circleMembers.userId,   userId),
    ))
    .limit(1);

  const isNewMember = membership.length === 0;

  if (isNewMember) {
    await db.insert(circleMembers).values({
      id:       generateId(),
      circleId: circle.id,
      userId,
      role:     'member',
    });
  }

  // Fetch owner name for display
  const ownerRows = await db.select({ name: users.name })
    .from(users)
    .where(eq(users.id, circle.ownerId))
    .limit(1);

  // On a genuine new join: notify ALL existing members via push + WS
  if (isNewMember) {
    // Get all current members (excluding the person who just joined)
    const allMemberRows = await db
      .select({ userId: circleMembers.userId })
      .from(circleMembers)
      .where(eq(circleMembers.circleId, circle.id));

    const otherMemberIds = allMemberRows
      .map((r) => r.userId)
      .filter((id) => id !== userId);

    // Push notification to every existing member
    if (otherMemberIds.length > 0) {
      const tokenRows = await db
        .select({ token: pushTokens.token })
        .from(pushTokens)
        .where(inArray(pushTokens.userId, otherMemberIds));

      if (tokenRows.length > 0) {
        sendExpoPush(
          tokenRows.map((r) => r.token),
          {
            title:     `${memberName ?? 'Someone'} joined "${circle.name}" 🎉`,
            body:      `You now have a new circle member. Check your circle!`,
            channelId: 'circles',
            data: {
              type:     'circle_member_joined',
              screen:   'circle',
              circleId: circle.id,
            },
          },
        ).catch((err) => {
          console.error('[circles] Failed to send join push:', err);
        });
      }

      // WS nudge — each member's device will call syncFromServer to pick up
      // the new membership without needing a full app restart
      for (const memberId of otherMemberIds) {
        notifyUser(memberId);
      }
    }
  }

  return c.json({
    circleId:   circle.id,
    name:       circle.name,
    emoji:      circle.emoji,
    inviteCode: circle.inviteCode,
    ownerId:    circle.ownerId,
    ownerName:  ownerRows[0]?.name ?? null,
  });
});

// ─── GET /api/circles ─────────────────────────────────────────────────────────
// Returns all circles the authenticated user belongs to.

router.get('/', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  const rows = await db
    .select({
      id:         circles.id,
      name:       circles.name,
      emoji:      circles.emoji,
      inviteCode: circles.inviteCode,
      ownerId:    circles.ownerId,
      role:       circleMembers.role,
    })
    .from(circleMembers)
    .innerJoin(circles, eq(circleMembers.circleId, circles.id))
    .where(eq(circleMembers.userId, userId));

  return c.json({ circles: rows });
});

// ─── GET /api/circles/preview/:code ──────────────────────────────────────────
// Returns circle preview data for a given invite code WITHOUT creating membership.
// Used by the join screen to show what the circle looks like before confirming.

router.get('/preview/:code', async (c) => {
  const { sub: userId } = c.get('jwtPayload');
  const code = c.req.param('code').trim().toUpperCase();

  if (!code || code.length !== 8) {
    return c.json({ error: 'A valid 8-character invite code is required' }, 400);
  }

  const circleRows = await db.select()
    .from(circles)
    .where(eq(circles.inviteCode, code))
    .limit(1);

  if (circleRows.length === 0) {
    return c.json({ error: 'Invalid or expired invite code' }, 404);
  }

  const circle = circleRows[0];

  // Check if requester is already a member
  const existing = await db.select({ id: circleMembers.id })
    .from(circleMembers)
    .where(and(
      eq(circleMembers.circleId, circle.id),
      eq(circleMembers.userId,   userId),
    ))
    .limit(1);

  // Get owner name
  const ownerRow = await db.select({ name: users.name })
    .from(users)
    .where(eq(users.id, circle.ownerId))
    .limit(1);

  // Get up to 6 member names + avatars for the preview strip
  const memberRows = await db
    .select({ name: users.name, avatarData: users.avatarData })
    .from(circleMembers)
    .innerJoin(users, eq(circleMembers.userId, users.id))
    .where(eq(circleMembers.circleId, circle.id));

  return c.json({
    id:            circle.id,
    name:          circle.name,
    emoji:         circle.emoji,
    memberCount:   memberRows.length,
    ownerName:     ownerRow[0]?.name ?? 'Unknown',
    members:       memberRows.slice(0, 6).map((m) => ({ name: m.name, avatarData: m.avatarData })),
    alreadyMember: existing.length > 0,
  });
});

// ─── PUT /api/circles/:id/settings ───────────────────────────────────────────
// Owner saves circle settings so all members can see them on next sync.
// Accepts a JSON body that is stored verbatim in settings_json.

router.put('/:id/settings', async (c) => {
  const { sub: userId } = c.get('jwtPayload');
  const circleId        = c.req.param('id');

  // Only the owner can update settings
  const circleRows = await db.select({ ownerId: circles.ownerId })
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);

  if (circleRows.length === 0) return c.json({ error: 'Circle not found' }, 404);
  if (circleRows[0].ownerId !== userId) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json();
  const settingsJson = JSON.stringify(body);

  await db.update(circles)
    .set({ settingsJson } as any)
    .where(eq(circles.id, circleId));

  return c.json({ success: true });
});

// ─── GET /api/circles/:id/settings ───────────────────────────────────────────
// Members fetch the latest circle settings (set by the owner).

router.get('/:id/settings', async (c) => {
  const { sub: userId } = c.get('jwtPayload');
  const circleId        = c.req.param('id');

  // Verify requester is a member
  const membership = await db.select({ id: circleMembers.id })
    .from(circleMembers)
    .where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, userId)))
    .limit(1);

  if (membership.length === 0) return c.json({ error: 'Not a member' }, 403);

  const circleRows = await db.select({ settingsJson: (circles as any).settingsJson })
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);

  const raw = circleRows[0]?.settingsJson as string | null;
  const settings = raw ? JSON.parse(raw) : null;

  return c.json({ settings });
});

// ─── DELETE /api/circles/:id/members/:userId ──────────────────────────────────
// Owner removes a member. Sends push to the removed user AND all remaining
// members. WS-nudges all affected users so their devices refresh immediately.

router.delete('/:id/members/:targetUserId', async (c) => {
  const { sub: ownerId, name: ownerName } = c.get('jwtPayload');
  const circleId     = c.req.param('id');
  const targetUserId = c.req.param('targetUserId');

  // Verify requester is the circle owner
  const circleRows = await db.select({ ownerId: circles.ownerId, name: circles.name })
    .from(circles)
    .where(eq(circles.id, circleId))
    .limit(1);

  if (circleRows.length === 0) return c.json({ error: 'Circle not found' }, 404);
  const circle = circleRows[0];
  if (circle.ownerId !== ownerId) return c.json({ error: 'Forbidden' }, 403);

  // Get target user's name
  const targetUserRows = await db.select({ name: users.name })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  const targetName = targetUserRows[0]?.name ?? 'A member';

  // Get all remaining members (before deletion)
  const allMemberRows = await db.select({ userId: circleMembers.userId })
    .from(circleMembers)
    .where(eq(circleMembers.circleId, circleId));

  // Delete the membership
  await db.delete(circleMembers)
    .where(and(eq(circleMembers.circleId, circleId), eq(circleMembers.userId, targetUserId)));

  // Push to removed member
  const removedTokenRows = await db.select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.userId, targetUserId));

  if (removedTokenRows.length > 0) {
    sendExpoPush(
      removedTokenRows.map((r) => r.token),
      {
        title:     `You've been removed from "${circle.name}"`,
        body:      `${ownerName ?? 'The admin'} removed you from this circle.`,
        channelId: 'circles',
        data: { type: 'circle_member_removed', screen: 'home', circleId },
      },
    ).catch(() => {});
  }

  // Push to remaining members
  const remainingIds = allMemberRows
    .map((r) => r.userId)
    .filter((id) => id !== targetUserId && id !== ownerId);

  if (remainingIds.length > 0) {
    const remainingTokenRows = await db.select({ token: pushTokens.token })
      .from(pushTokens)
      .where(inArray(pushTokens.userId, remainingIds));

    if (remainingTokenRows.length > 0) {
      sendExpoPush(
        remainingTokenRows.map((r) => r.token),
        {
          title:     `${targetName} was removed from "${circle.name}"`,
          body:      `${ownerName ?? 'The admin'} removed them from the circle.`,
          channelId: 'circles',
          data: { type: 'circle_member_removed', screen: 'circle', circleId },
        },
      ).catch(() => {});
    }
  }

  // WS nudge — all affected users refresh
  notifyUser(targetUserId);
  for (const memberId of allMemberRows.map((r) => r.userId)) {
    notifyUser(memberId);
  }

  return c.json({ success: true });
});

// ─── GET /api/circles/:id/members ─────────────────────────────────────────────
// Returns members of a circle with their names and avatars.
// Only accessible to current members of the circle.

router.get('/:id/members', async (c) => {
  const { sub: userId } = c.get('jwtPayload');
  const circleId        = c.req.param('id');

  // Verify requester is a member
  const membership = await db.select({ id: circleMembers.id })
    .from(circleMembers)
    .where(and(
      eq(circleMembers.circleId, circleId),
      eq(circleMembers.userId,   userId),
    ))
    .limit(1);

  if (membership.length === 0) {
    return c.json({ error: 'Not a member of this circle' }, 403);
  }

  const members = await db
    .select({
      userId:     users.id,
      name:       users.name,
      avatarData: users.avatarData,
      role:       circleMembers.role,
      joinedAt:   circleMembers.joinedAt,
    })
    .from(circleMembers)
    .innerJoin(users, eq(circleMembers.userId, users.id))
    .where(eq(circleMembers.circleId, circleId));

  return c.json({ members });
});

export default router;
