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
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { generateUUID } from '../lib/uuid';
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

  load:         (userId: string) => Promise<void>;
  create:       (name: string, ownerId: string, settings?: CircleCreateSettings) => Promise<Household>;
  joinByCode:   (code: string, userId: string) => Promise<{ circleId: string; circleName: string }>;
  joinById:     (circleId: string, userId: string) => Promise<void>;
  updateName:   (name: string) => Promise<void>;
  loadMembers:  (circleId: string) => Promise<void>;
  clearError:   () => void;
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

      const circleRows = await Promise.all(
        memberships.map((m) =>
          db
            .select()
            .from(schema.households)
            .where(eq(schema.households.id, m.householdId))
            .then((rows) => rows[0]),
        ),
      );

      const circles: Household[] = circleRows
        .filter(Boolean)
        .map((h) => ({
          id:         h!.id,
          name:       h!.name,
          ownerId:    h!.ownerId,
          inviteCode: (h as any).inviteCode ?? null,
          createdAt:  h!.createdAt,
        }));

      const activeCircle = circles[0] ?? null;
      set({ circles, activeCircle });

      if (activeCircle) await get().loadMembers(activeCircle.id);
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load circles' });
    } finally {
      set({ isLoading: false });
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
    return { id: circleId, name, ownerId, inviteCode, createdAt: now };
  },

  // ── Join by 8-char invite code ────────────────────────────────────────────
  joinByCode: async (code, userId) => {
    const db = getDatabase();
    const upperCode = code.trim().toUpperCase();

    // Look up circle with this invite code
    const rows = await db
      .select()
      .from(schema.households)
      .where(eq((schema.households as any).inviteCode, upperCode));

    if (!rows || rows.length === 0) {
      throw new Error('Invalid or expired invite code');
    }

    const circle = rows[0];

    // Check if already a member
    const existing = await db
      .select()
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.householdId, circle.id));

    if (existing.some((m: any) => m.userId === userId)) {
      return { circleId: circle.id, circleName: circle.name };
    }

    // Add as member
    await db.insert(schema.householdMembers).values({
      id:          generateUUID(),
      householdId: circle.id,
      userId,
      role:        'member',
      joinedAt:    new Date().toISOString(),
    });

    await get().load(userId);
    return { circleId: circle.id, circleName: circle.name };
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
