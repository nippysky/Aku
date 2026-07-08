/**
 * circles.store.ts — User's Circle membership state
 *
 * Manages all circles the authenticated user belongs to (as owner or member).
 * "activeCircle" is the first/primary circle, kept for backward compatibility
 * with screens that only care about one circle context at a time.
 *
 * For contribution / leaderboard features within a single circle,
 * see circle.store.ts.
 */
import { create } from 'zustand';
import { eq, and, inArray } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { generateUUID } from '../lib/uuid';
import { registerCircle, joinCircleByCode, fetchUserCircles } from '../lib/api-client';
import type { Household, HouseholdMember, CircleFrequency, ContributionType } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a random 8-character alphanumeric invite code (uppercase) */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0,O,1,I)
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CircleCreateSettings {
  emoji?:            string | null;
  description?:      string | null;
  targetAmount?:     number | null;
  frequency?:        CircleFrequency;
  perMemberAmount?:  number | null;
  contributionType?: ContributionType;
  deadline?:         string | null;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface CirclesState {
  /** All circles the user belongs to (owner or member) */
  circles:      Household[];
  /** Primary / active circle — first membership found */
  activeCircle: Household | null;
  /** Members of the active circle (loaded via loadMembers) */
  members:      HouseholdMember[];
  isLoading:    boolean;
  error:        string | null;

  load:             (userId: string) => Promise<void>;
  syncFromServer:   (userId: string) => Promise<void>;
  create:           (name: string, ownerId: string, settings?: CircleCreateSettings) => Promise<Household>;
  joinByCode:       (code: string, userId: string) => Promise<{ circleId: string; circleName: string }>;
  joinById:         (circleId: string, userId: string) => Promise<void>;
  updateName:       (name: string) => Promise<void>;
  loadMembers:      (circleId: string) => Promise<void>;
  clearError:       () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useCirclesStore = create<CirclesState>()((set, get) => ({
  circles:      [],
  activeCircle: null,
  members:      [],
  isLoading:    false,
  error:        null,

  // ── Load all circles user belongs to ─────────────────────────────────────
  load: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const db = getDatabase();

      const memberships = await db
        .select()
        .from(schema.householdMembers)
        .where(eq(schema.householdMembers.userId, userId));

      if (memberships.length === 0) {
        set({ circles: [], activeCircle: null, members: [] });
        return;
      }

      // Single JOIN — no N+1
      const householdIds = memberships.map((m) => m.householdId);
      const householdRows = await db
        .select()
        .from(schema.households)
        .where(inArray(schema.households.id, householdIds));

      const circles: Household[] = householdRows.map((h) => ({
        id:         h.id,
        name:       h.name,
        ownerId:    h.ownerId,
        inviteCode: (h as any).inviteCode ?? null,
        createdAt:  h.createdAt,
      }));

      const activeCircle = circles[0] ?? null;
      set({ circles, activeCircle });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load circles' });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Sync circles from server → seed local SQLite → reload ────────────────
  // Called by the WS client when another device creates/joins a circle.
  syncFromServer: async (userId) => {
    try {
      const serverCircles = await fetchUserCircles();
      const db  = getDatabase();
      const now = new Date().toISOString();

      for (const c of serverCircles) {
        // Upsert the household row
        const existing = await db
          .select({ id: schema.households.id })
          .from(schema.households)
          .where(eq(schema.households.id, c.id));

        if (existing.length === 0) {
          await (db.insert(schema.households) as any).values({
            id:         c.id,
            name:       c.name,
            ownerId:    c.ownerId,
            inviteCode: c.inviteCode,
            createdAt:  now,
          });
          await (db.insert(schema.circleSettings) as any).values({
            id:               c.id,
            emoji:            c.emoji ?? '💰',
            description:      null,
            targetAmount:     null,
            frequency:        'monthly',
            perMemberAmount:  null,
            contributionType: 'equal',
            deadline:         null,
            accountName:      null,
            accountNumber:    null,
            bankName:         null,
            notes:            null,
            updatedAt:        now,
          });
        }

        // Upsert membership
        const existingMember = await db
          .select({ id: schema.householdMembers.id })
          .from(schema.householdMembers)
          .where(
            and(
              eq(schema.householdMembers.householdId, c.id),
              eq(schema.householdMembers.userId, userId),
            ),
          );

        if (existingMember.length === 0) {
          await db.insert(schema.householdMembers).values({
            id:          generateUUID(),
            householdId: c.id,
            userId,
            role:        c.role as any,
            joinedAt:    now,
          });
        }
      }

      await get().load(userId);
    } catch {
      // Non-fatal — circles will load normally on next app open
    }
  },

  // ── Create a new circle ───────────────────────────────────────────────────
  create: async (name, ownerId, settings) => {
    const db       = getDatabase();
    const now      = new Date().toISOString();
    const circleId = generateUUID();
    const memberId = generateUUID();
    const inviteCode = generateInviteCode();

    await (db.insert(schema.households) as any).values({
      id:         circleId,
      name,
      ownerId,
      inviteCode,
      createdAt:  now,
    });

    await db.insert(schema.householdMembers).values({
      id:          memberId,
      householdId: circleId,
      userId:      ownerId,
      role:        'owner',
      joinedAt:    now,
    });

    await (db.insert(schema.circleSettings) as any).values({
      id:               circleId,
      emoji:            settings?.emoji            ?? null,
      description:      settings?.description      ?? null,
      targetAmount:     settings?.targetAmount      ?? null,
      frequency:        settings?.frequency         ?? 'monthly',
      perMemberAmount:  settings?.perMemberAmount   ?? null,
      contributionType: settings?.contributionType  ?? 'equal',
      deadline:         settings?.deadline          ?? null,
      accountName:      null,
      accountNumber:    null,
      bankName:         null,
      notes:            null,
      updatedAt:        now,
    });

    await get().load(ownerId);

    // Register with server so other users can find this circle by invite code.
    // Fire-and-forget — never blocks local circle creation.
    const emoji = settings?.emoji ?? '💰';
    registerCircle(circleId, name, emoji, inviteCode).catch(() => {
      // Non-fatal: the circle is usable locally; retry logic can be added later.
    });

    return { id: circleId, name, ownerId, inviteCode, createdAt: now };
  },

  // ── Join by 8-char invite code ────────────────────────────────────────────
  // Calls the server to look up the circle and record membership.
  // Then seeds local SQLite so the app can render the circle immediately.
  joinByCode: async (code, userId) => {
    const db  = getDatabase();
    const now = new Date().toISOString();

    // 1. Ask the server — this is the authoritative source for invite codes
    const result = await joinCircleByCode(code);
    const { circleId, name, emoji, inviteCode, ownerId } = result;

    // 2. Upsert the circle into local SQLite (in case we don't have it yet)
    const existingCircle = await db
      .select({ id: schema.households.id })
      .from(schema.households)
      .where(eq(schema.households.id, circleId));

    if (existingCircle.length === 0) {
      await (db.insert(schema.households) as any).values({
        id:         circleId,
        name,
        ownerId,
        inviteCode,
        createdAt:  now,
      });
      await (db.insert(schema.circleSettings) as any).values({
        id:               circleId,
        emoji,
        description:      null,
        targetAmount:     null,
        frequency:        'monthly',
        perMemberAmount:  null,
        contributionType: 'equal',
        deadline:         null,
        accountName:      null,
        accountNumber:    null,
        bankName:         null,
        notes:            null,
        updatedAt:        now,
      });
    }

    // 3. Upsert self as a member
    const existingMember = await db
      .select({ id: schema.householdMembers.id })
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.householdId, circleId));

    if (!existingMember.some((m: any) => m.userId === userId)) {
      await db.insert(schema.householdMembers).values({
        id:          generateUUID(),
        householdId: circleId,
        userId,
        role:        'member',
        joinedAt:    now,
      });
    }

    await get().load(userId);
    return { circleId, circleName: name };
  },

  // ── Join by circleId (deep link confirm) ─────────────────────────────────
  joinById: async (circleId, userId) => {
    const db = getDatabase();

    const circleRows = await db
      .select()
      .from(schema.households)
      .where(eq(schema.households.id, circleId));

    if (circleRows.length === 0) throw new Error('Circle not found');

    const existing = await db
      .select()
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.householdId, circleId));

    if (existing.some((m) => m.userId === userId)) return; // already a member

    await db.insert(schema.householdMembers).values({
      id:          generateUUID(),
      householdId: circleId,
      userId,
      role:        'member',
      joinedAt:    new Date().toISOString(),
    });

    await get().load(userId);
  },

  updateName: async (name) => {
    const { activeCircle } = get();
    if (!activeCircle) return;
    const db = getDatabase();
    await db
      .update(schema.households)
      .set({ name })
      .where(eq(schema.households.id, activeCircle.id));
    set((s) => ({
      activeCircle: { ...activeCircle, name },
      circles: s.circles.map((c) => c.id === activeCircle.id ? { ...c, name } : c),
    }));
  },

  loadMembers: async (circleId) => {
    const db = getDatabase();
    const rows = await db
      .select({
        id:          schema.householdMembers.id,
        householdId: schema.householdMembers.householdId,
        userId:      schema.householdMembers.userId,
        role:        schema.householdMembers.role,
        joinedAt:    schema.householdMembers.joinedAt,
        userName:    schema.users.name,
        userEmail:   schema.users.email,
        avatarUrl:   schema.users.avatarUrl,
      })
      .from(schema.householdMembers)
      .leftJoin(schema.users, eq(schema.users.id, schema.householdMembers.userId))
      .where(eq(schema.householdMembers.householdId, circleId));

    const members: HouseholdMember[] = rows.map((r) => ({
      id:          r.id,
      householdId: r.householdId,
      userId:      r.userId,
      name:        r.userName  ?? '',
      email:       r.userEmail ?? '',
      avatarUrl:   r.avatarUrl ?? null,
      role:        r.role as HouseholdMember['role'],
      joinedAt:    r.joinedAt,
    }));
    set({ members });
  },

  clearError: () => set({ error: null }),
}));
