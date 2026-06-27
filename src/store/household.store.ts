import { create } from 'zustand';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { generateUUID } from '../lib/uuid';
import type { Household, HouseholdMember } from '../types';

// ─── State ────────────────────────────────────────────────────────────────

interface HouseholdState {
  household:  Household | null;
  members:    HouseholdMember[];
  isLoading:  boolean;
  error:      string | null;

  // Actions
  load:         (userId: string) => Promise<void>;
  create:       (name: string, ownerId: string) => Promise<Household>;
  updateName:   (name: string) => Promise<void>;
  loadMembers:  (householdId: string) => Promise<void>;
  clearError:   () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useHouseholdStore = create<HouseholdState>()((set, get) => ({
  household:  null,
  members:    [],
  isLoading:  false,
  error:      null,

  load: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const [member] = await db
        .select()
        .from(schema.householdMembers)
        .where(eq(schema.householdMembers.userId, userId));

      if (!member) {
        set({ household: null, members: [] });
        return;
      }

      const [household] = await db
        .select()
        .from(schema.households)
        .where(eq(schema.households.id, member.householdId));

      if (!household) {
        set({ household: null, members: [] });
        return;
      }

      set({
        household: {
          id:        household.id,
          name:      household.name,
          ownerId:   household.ownerId,
          createdAt: household.createdAt,
        },
      });

      await get().loadMembers(household.id);
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load household' });
    } finally {
      set({ isLoading: false });
    }
  },

  create: async (name, ownerId) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const householdId = generateUUID();
    const memberId = generateUUID();

    await db.insert(schema.households).values({
      id:        householdId,
      name,
      ownerId,
      createdAt: now,
    });

    await db.insert(schema.householdMembers).values({
      id:          memberId,
      householdId,
      userId:      ownerId,
      role:        'owner',
      joinedAt:    now,
    });

    const household: Household = { id: householdId, name, ownerId, createdAt: now };
    set({ household });
    return household;
  },

  updateName: async (name) => {
    const { household } = get();
    if (!household) return;
    const db = getDatabase();
    await db
      .update(schema.households)
      .set({ name })
      .where(eq(schema.households.id, household.id));
    set({ household: { ...household, name } });
  },

  loadMembers: async (householdId) => {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.householdId, householdId));

    const members: HouseholdMember[] = rows.map((r) => ({
      id:          r.id,
      householdId: r.householdId,
      userId:      r.userId,
      name:        '',  // loaded separately from users table
      email:       '',
      role:        r.role as HouseholdMember['role'],
      joinedAt:    r.joinedAt,
    }));
    set({ members });
  },

  clearError: () => set({ error: null }),
}));
