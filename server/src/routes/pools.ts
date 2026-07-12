/**
 * Pools routes
 *
 * POST   /api/pools              — Register a new pool (owner calls on creation)
 * POST   /api/pools/join         — Join a pool by 8-char invite code
 * GET    /api/pools              — List all pools the authenticated user belongs to
 * PATCH  /api/pools/:id          — Update pool name (owner only)
 * GET    /api/pools/preview/:code — Preview a pool by invite code (no membership created)
 * GET    /api/pools/:id/members  — Get members of a pool (owner or member only)
 */
import { Hono } from 'hono';
import { eq, and, inArray } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { db } from '../db/client.js';
import { pools, poolMembers, users, pushTokens } from '../db/schema.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';
import { sendExpoPush } from '../lib/expo-push.js';
import { notifyUser } from '../lib/ws-registry.js';

const router = new Hono<{ Variables: AuthContext }>();

router.use('*', authMiddleware);

function generateId(): string {
  return randomBytes(16).toString('hex');
}

// ─── POST /api/pools ──────────────────────────────────────────────────────────
// Called by the pool owner immediately after creating the pool locally.
// Idempotent — if the pool already exists for this owner, it's a no-op.

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

  const existing = await db.select({ id: pools.id })
    .from(pools)
    .where(eq(pools.id, id))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(pools).values({ id, name, emoji, inviteCode, ownerId: userId });

    // Owner is automatically the first member
    await db.insert(poolMembers).values({
      id:     generateId(),
      poolId: id,
      userId,
      role:   'owner',
    });
  }

  // Notify all other devices of this user so they pick up the new pool
  notifyUser(userId);

  return c.json({ success: true });
});

// ─── POST /api/pools/join ─────────────────────────────────────────────────────
// New member joins by providing the 8-char invite code.
// Returns pool metadata so the client can seed its local SQLite.
// Also fires a push notification to the pool owner (fire-and-forget).

router.post('/join', async (c) => {
  const { sub: userId, name: memberName } = c.get('jwtPayload');

  const body = await c.req.json<{ code: string }>();
  const code  = body?.code?.trim().toUpperCase();

  if (!code || code.length !== 8) {
    return c.json({ error: 'A valid 8-character invite code is required' }, 400);
  }

  // Look up the pool
  const poolRows = await db.select()
    .from(pools)
    .where(eq(pools.inviteCode, code))
    .limit(1);

  if (poolRows.length === 0) {
    return c.json({ error: 'Invalid or expired invite code' }, 404);
  }

  const pool = poolRows[0];

  // Check if already a member (idempotent)
  const membership = await db.select({ id: poolMembers.id })
    .from(poolMembers)
    .where(and(
      eq(poolMembers.poolId, pool.id),
      eq(poolMembers.userId, userId),
    ))
    .limit(1);

  const isNewMember = membership.length === 0;

  if (isNewMember) {
    await db.insert(poolMembers).values({
      id:     generateId(),
      poolId: pool.id,
      userId,
      role:   'member',
    });
  }

  // Fetch owner name for display
  const ownerRows = await db.select({ name: users.name })
    .from(users)
    .where(eq(users.id, pool.ownerId))
    .limit(1);

  // On a genuine new join: notify ALL existing members via push + WS
  if (isNewMember) {
    // Get all current members (excluding the person who just joined)
    const allMemberRows = await db
      .select({ userId: poolMembers.userId })
      .from(poolMembers)
      .where(eq(poolMembers.poolId, pool.id));

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
            title:     `${memberName ?? 'Someone'} joined "${pool.name}" 🎉`,
            body:      `You now have a new Pool member. Check your Pool!`,
            channelId: 'pools',
            data: {
              type:   'pool_member_joined',
              screen: 'pool',
              poolId: pool.id,
            },
          },
        ).catch((err) => {
          console.error('[pools] Failed to send join push:', err);
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
    poolId:     pool.id,
    name:       pool.name,
    emoji:      pool.emoji,
    inviteCode: pool.inviteCode,
    ownerId:    pool.ownerId,
    ownerName:  ownerRows[0]?.name ?? null,
  });
});

// ─── GET /api/pools ───────────────────────────────────────────────────────────
// Returns all pools the authenticated user belongs to.

router.get('/', async (c) => {
  const { sub: userId } = c.get('jwtPayload');

  const rows = await db
    .select({
      id:         pools.id,
      name:       pools.name,
      emoji:      pools.emoji,
      inviteCode: pools.inviteCode,
      ownerId:    pools.ownerId,
      role:       poolMembers.role,
    })
    .from(poolMembers)
    .innerJoin(pools, eq(poolMembers.poolId, pools.id))
    .where(eq(poolMembers.userId, userId));

  return c.json({ pools: rows });
});

// ─── GET /api/pools/preview/:code ────────────────────────────────────────────
// Returns pool preview data for a given invite code WITHOUT creating membership.
// Used by the join screen to show what the pool looks like before confirming.

router.get('/preview/:code', async (c) => {
  const { sub: userId } = c.get('jwtPayload');
  const code = c.req.param('code').trim().toUpperCase();

  if (!code || code.length !== 8) {
    return c.json({ error: 'A valid 8-character invite code is required' }, 400);
  }

  const poolRows = await db.select()
    .from(pools)
    .where(eq(pools.inviteCode, code))
    .limit(1);

  if (poolRows.length === 0) {
    return c.json({ error: 'Invalid or expired invite code' }, 404);
  }

  const pool = poolRows[0];

  // Check if requester is already a member
  const existing = await db.select({ id: poolMembers.id })
    .from(poolMembers)
    .where(and(
      eq(poolMembers.poolId, pool.id),
      eq(poolMembers.userId, userId),
    ))
    .limit(1);

  // Get owner name
  const ownerRow = await db.select({ name: users.name })
    .from(users)
    .where(eq(users.id, pool.ownerId))
    .limit(1);

  // Get up to 6 member names + avatars for the preview strip
  const memberRows = await db
    .select({ name: users.name, avatarData: users.avatarData })
    .from(poolMembers)
    .innerJoin(users, eq(poolMembers.userId, users.id))
    .where(eq(poolMembers.poolId, pool.id));

  return c.json({
    id:            pool.id,
    name:          pool.name,
    emoji:         pool.emoji,
    memberCount:   memberRows.length,
    ownerName:     ownerRow[0]?.name ?? 'Unknown',
    members:       memberRows.slice(0, 6).map((m) => ({ name: m.name, avatarData: m.avatarData })),
    alreadyMember: existing.length > 0,
  });
});

// ─── PATCH /api/pools/:id ─────────────────────────────────────────────────────
// Owner updates pool name (and optionally emoji). Called immediately after
// the user saves a name change so the server stays in sync with local SQLite.

router.patch('/:id', async (c) => {
  const { sub: userId } = c.get('jwtPayload');
  const poolId          = c.req.param('id');

  const poolRows = await db.select({ ownerId: pools.ownerId })
    .from(pools)
    .where(eq(pools.id, poolId))
    .limit(1);

  if (poolRows.length === 0) return c.json({ error: 'Pool not found' }, 404);
  if (poolRows[0].ownerId !== userId) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{ name?: string; emoji?: string }>();
  const updates: Record<string, string> = {};
  if (body.name?.trim())  updates.name  = body.name.trim();
  if (body.emoji?.trim()) updates.emoji = body.emoji.trim();

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'Nothing to update' }, 400);
  }

  await db.update(pools).set(updates as any).where(eq(pools.id, poolId));

  // Nudge all members via WS so they reload and see the new name
  const allMembers = await db
    .select({ userId: poolMembers.userId })
    .from(poolMembers)
    .where(eq(poolMembers.poolId, poolId));

  for (const m of allMembers) notifyUser(m.userId);

  return c.json({ success: true });
});

// ─── PUT /api/pools/:id/settings ─────────────────────────────────────────────
// Owner saves pool settings so all members can see them on next sync.
// Accepts a JSON body that is stored verbatim in settings_json.

router.put('/:id/settings', async (c) => {
  const { sub: userId } = c.get('jwtPayload');
  const poolId          = c.req.param('id');

  // Only the owner can update settings
  const poolRows = await db.select({ ownerId: pools.ownerId })
    .from(pools)
    .where(eq(pools.id, poolId))
    .limit(1);

  if (poolRows.length === 0) return c.json({ error: 'Pool not found' }, 404);
  if (poolRows[0].ownerId !== userId) return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json();
  const settingsJson = JSON.stringify(body);

  await db.update(pools)
    .set({ settingsJson } as any)
    .where(eq(pools.id, poolId));

  return c.json({ success: true });
});

// ─── GET /api/pools/:id/settings ─────────────────────────────────────────────
// Members fetch the latest pool settings (set by the owner).

router.get('/:id/settings', async (c) => {
  const { sub: userId } = c.get('jwtPayload');
  const poolId          = c.req.param('id');

  // Verify requester is a member
  const membership = await db.select({ id: poolMembers.id })
    .from(poolMembers)
    .where(and(eq(poolMembers.poolId, poolId), eq(poolMembers.userId, userId)))
    .limit(1);

  if (membership.length === 0) return c.json({ error: 'Not a member' }, 403);

  const poolRows = await db.select({ settingsJson: (pools as any).settingsJson })
    .from(pools)
    .where(eq(pools.id, poolId))
    .limit(1);

  const raw = poolRows[0]?.settingsJson as string | null;
  const settings = raw ? JSON.parse(raw) : null;

  return c.json({ settings });
});

// ─── DELETE /api/pools/:id/members/:userId ────────────────────────────────────
// Owner removes a member. Sends push to the removed user AND all remaining
// members. WS-nudges all affected users so their devices refresh immediately.

router.delete('/:id/members/:targetUserId', async (c) => {
  const { sub: ownerId, name: ownerName } = c.get('jwtPayload');
  const poolId       = c.req.param('id');
  const targetUserId = c.req.param('targetUserId');

  // Verify requester is the pool owner
  const poolRows = await db.select({ ownerId: pools.ownerId, name: pools.name })
    .from(pools)
    .where(eq(pools.id, poolId))
    .limit(1);

  if (poolRows.length === 0) return c.json({ error: 'Pool not found' }, 404);
  const pool = poolRows[0];
  if (pool.ownerId !== ownerId) return c.json({ error: 'Forbidden' }, 403);

  // Get target user's name
  const targetUserRows = await db.select({ name: users.name })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  const targetName = targetUserRows[0]?.name ?? 'A member';

  // Get all remaining members (before deletion)
  const allMemberRows = await db.select({ userId: poolMembers.userId })
    .from(poolMembers)
    .where(eq(poolMembers.poolId, poolId));

  // Delete the membership
  await db.delete(poolMembers)
    .where(and(eq(poolMembers.poolId, poolId), eq(poolMembers.userId, targetUserId)));

  // Push to removed member
  const removedTokenRows = await db.select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.userId, targetUserId));

  if (removedTokenRows.length > 0) {
    sendExpoPush(
      removedTokenRows.map((r) => r.token),
      {
        title:     `You've been removed from "${pool.name}"`,
        body:      `${ownerName ?? 'The admin'} removed you from this Pool.`,
        channelId: 'pools',
        data: { type: 'pool_member_removed', screen: 'home', poolId },
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
          title:     `${targetName} was removed from "${pool.name}"`,
          body:      `${ownerName ?? 'The admin'} removed them from the Pool.`,
          channelId: 'pools',
          data: { type: 'pool_member_removed', screen: 'pool', poolId },
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

// ─── DELETE /api/pools/:id ────────────────────────────────────────────────────
// Owner deletes the pool entirely.
// 1. Notifies all members via push notification
// 2. WS-nudges all members so their devices remove the pool immediately
// 3. Deletes members, then the pool row from Postgres

router.delete('/:id', async (c) => {
  const { sub: ownerId, name: ownerName } = c.get('jwtPayload');
  const poolId = c.req.param('id');

  // Verify requester is the pool owner
  const poolRows = await db.select({ ownerId: pools.ownerId, name: pools.name })
    .from(pools)
    .where(eq(pools.id, poolId))
    .limit(1);

  if (poolRows.length === 0) return c.json({ error: 'Pool not found' }, 404);
  const pool = poolRows[0];
  if (pool.ownerId !== ownerId) return c.json({ error: 'Forbidden' }, 403);

  // Get all member IDs before deleting (for push + WS)
  const allMemberRows = await db
    .select({ userId: poolMembers.userId })
    .from(poolMembers)
    .where(eq(poolMembers.poolId, poolId));

  const memberIds = allMemberRows.map((r) => r.userId).filter((id) => id !== ownerId);

  // Push notification to every member (except the owner who initiated)
  if (memberIds.length > 0) {
    const tokenRows = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(inArray(pushTokens.userId, memberIds));

    if (tokenRows.length > 0) {
      sendExpoPush(
        tokenRows.map((r) => r.token),
        {
          title:     `"${pool.name}" has been closed`,
          body:      `${ownerName ?? 'The admin'} has closed this Pool.`,
          channelId: 'pools',
          data: {
            type:   'pool_deleted',
            screen: 'home',
            poolId,
          },
        },
      ).catch(() => {});
    }

    // WS nudge — members' devices will call syncFromServer to clear the pool
    for (const memberId of memberIds) {
      notifyUser(memberId);
    }
  }

  // Delete memberships, then the pool itself
  await db.delete(poolMembers).where(eq(poolMembers.poolId, poolId));
  await db.delete(pools).where(eq(pools.id, poolId));

  return c.json({ success: true });
});

// ─── GET /api/pools/:id/members ───────────────────────────────────────────────
// Returns members of a pool with their names and avatars.
// Only accessible to current members of the pool.

router.get('/:id/members', async (c) => {
  const { sub: userId } = c.get('jwtPayload');
  const poolId          = c.req.param('id');

  // Verify requester is a member
  const membership = await db.select({ id: poolMembers.id })
    .from(poolMembers)
    .where(and(
      eq(poolMembers.poolId, poolId),
      eq(poolMembers.userId, userId),
    ))
    .limit(1);

  if (membership.length === 0) {
    return c.json({ error: 'Not a member' }, 403);
  }

  const members = await db
    .select({
      userId:     users.id,
      name:       users.name,
      avatarData: users.avatarData,
      role:       poolMembers.role,
      joinedAt:   poolMembers.joinedAt,
    })
    .from(poolMembers)
    .innerJoin(users, eq(poolMembers.userId, users.id))
    .where(eq(poolMembers.poolId, poolId));

  return c.json({ members });
});

export default router;
