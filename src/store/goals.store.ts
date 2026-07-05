import { create } from 'zustand';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { differenceInMonths, parseISO } from 'date-fns';
import { generateUUID } from '../lib/uuid';
import { notificationService } from '../lib/notifications';
import type {
  Goal, GoalWithProgress, GoalContribution,
  GoalCreateInput, GoalUpdateInput, ContributionCreateInput,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────

function withProgress(goal: Goal): GoalWithProgress {
  const progress = goal.targetAmount > 0
    ? Math.min(goal.savedAmount / goal.targetAmount, 1)
    : 0;
  const remaining = Math.max(goal.targetAmount - goal.savedAmount, 0);

  let monthlyRequired: number | null = null;
  if (goal.targetDate && remaining > 0) {
    const months = differenceInMonths(parseISO(goal.targetDate), new Date());
    monthlyRequired = months > 0 ? Math.ceil(remaining / months) : null;
  }

  return { ...goal, progress, remaining, monthlyRequired };
}

function fromDb(row: typeof schema.goals.$inferSelect): Goal {
  return {
    id:           row.id,
    userId:       row.userId,
    householdId:  row.householdId ?? null,
    name:         row.name,
    targetAmount: row.targetAmount,
    savedAmount:  row.savedAmount ?? 0,
    targetDate:   row.targetDate ?? null,
    notes:        row.notes ?? null,
    emoji:        row.emoji ?? null,
    color:        row.color ?? null,
    isShared:     Boolean(row.isShared),
    isCompleted:  Boolean(row.isCompleted),
    completedAt:  row.completedAt ?? null,
    createdAt:    row.createdAt,
    updatedAt:    row.updatedAt,
  };
}

function contributionFromDb(
  row: typeof schema.goalContributions.$inferSelect
): GoalContribution {
  return {
    id:        row.id,
    goalId:    row.goalId,
    userId:    row.userId,
    amount:    row.amount,
    note:      row.note ?? null,
    date:      row.date,
    createdAt: row.createdAt,
  };
}

// ─── State ────────────────────────────────────────────────────────────────

interface GoalsState {
  goals:         GoalWithProgress[];
  contributions: Record<string, GoalContribution[]>; // keyed by goalId
  isLoading:     boolean;
  error:         string | null;

  // Actions
  load:               (userId: string) => Promise<void>;
  loadContributions:  (goalId: string) => Promise<void>;
  add:                (input: GoalCreateInput, userId: string) => Promise<GoalWithProgress>;
  update:             (input: GoalUpdateInput) => Promise<void>;
  remove:             (id: string) => Promise<void>;
  addContribution:    (input: ContributionCreateInput, userId: string) => Promise<void>;
  removeContribution: (contributionId: string, goalId: string, amount: number) => Promise<void>;
  clearError:         () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useGoalsStore = create<GoalsState>()((set, get) => ({
  goals:         [],
  contributions: {},
  isLoading:     false,
  error:         null,

  load: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const rows = await db
        .select()
        .from(schema.goals)
        .where(eq(schema.goals.userId, userId))
        .orderBy(schema.goals.createdAt);

      const goals = rows.map(fromDb).map(withProgress);
      set({ goals });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load goals' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadContributions: async (goalId) => {
    try {
      const db = getDatabase();
      const rows = await db
        .select()
        .from(schema.goalContributions)
        .where(eq(schema.goalContributions.goalId, goalId))
        .orderBy(schema.goalContributions.date);

      set((s) => ({
        contributions: {
          ...s.contributions,
          [goalId]: rows.map(contributionFromDb),
        },
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load contributions' });
    }
  },

  add: async (input, userId) => {
    set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      const id = generateUUID();

      await db.insert(schema.goals).values({
        id,
        userId,
        householdId:  input.householdId,
        name:         input.name,
        targetAmount: input.targetAmount,
        savedAmount:  0,
        targetDate:   input.targetDate,
        notes:        input.notes,
        emoji:        input.emoji,
        color:        input.color,
        isShared:     input.isShared,
        isCompleted:  false,
        createdAt:    now,
        updatedAt:    now,
      });

      const newGoal: Goal = {
        ...input,
        id,
        userId,
        savedAmount: 0,
        isCompleted: false,
        completedAt: null,
        createdAt:   now,
        updatedAt:   now,
      };
      const withProg = withProgress(newGoal);
      set((s) => ({ goals: [...s.goals, withProg] }));
      return withProg;
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to add goal' });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  update: async (input) => {
    const { id, ...rest } = input;
    const db = getDatabase();
    const now = new Date().toISOString();
    await db
      .update(schema.goals)
      .set({ ...rest, updatedAt: now })
      .where(eq(schema.goals.id, id));

    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === id ? withProgress({ ...g, ...rest, updatedAt: now }) : g
      ),
    }));
  },

  remove: async (id) => {
    const db = getDatabase();
    await db.delete(schema.goals).where(eq(schema.goals.id, id));
    set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
  },

  addContribution: async (input, userId) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = generateUUID();

    await db.insert(schema.goalContributions).values({
      id,
      goalId:    input.goalId,
      userId,
      amount:    input.amount,
      note:      input.note,
      date:      input.date,
      createdAt: now,
    });

    // Update goal saved amount
    const goal = get().goals.find((g) => g.id === input.goalId);
    if (!goal) return;

    const newSaved = goal.savedAmount + input.amount;
    const isCompleted = newSaved >= goal.targetAmount;
    const completedAt = isCompleted && !goal.isCompleted ? now : goal.completedAt;

    await db
      .update(schema.goals)
      .set({
        savedAmount: newSaved,
        isCompleted,
        completedAt: completedAt ?? undefined,
        updatedAt:   now,
      })
      .where(eq(schema.goals.id, input.goalId));

    const contribution: GoalContribution = { id, ...input, userId, createdAt: now };

    // Fire milestone notification if a threshold was crossed (25 / 50 / 75 / 100%)
    const oldProgress = goal.targetAmount > 0 ? goal.savedAmount / goal.targetAmount : 0;
    const newProgress = goal.targetAmount > 0 ? newSaved / goal.targetAmount : 0;

    const MILESTONES = [0.25, 0.5, 0.75, 1.0] as const;
    for (const m of MILESTONES) {
      if (oldProgress < m && newProgress >= m) {
        const pct = Math.round(m * 100);
        notificationService
          .scheduleGoalMilestone(goal, pct)
          .catch(() => {});
        break; // Only fire the highest newly-crossed milestone per contribution
      }
    }

    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === input.goalId
          ? withProgress({ ...g, savedAmount: newSaved, isCompleted, completedAt: completedAt ?? null, updatedAt: now })
          : g
      ),
      contributions: {
        ...s.contributions,
        [input.goalId]: [...(s.contributions[input.goalId] ?? []), contribution],
      },
    }));
  },

  removeContribution: async (contributionId, goalId, amount) => {
    const db = getDatabase();
    const now = new Date().toISOString();

    await db
      .delete(schema.goalContributions)
      .where(eq(schema.goalContributions.id, contributionId));

    const goal = get().goals.find((g) => g.id === goalId);
    if (!goal) return;

    const newSaved      = Math.max(goal.savedAmount - amount, 0);
    const stillComplete = newSaved >= goal.targetAmount && goal.targetAmount > 0;
    await db
      .update(schema.goals)
      .set({ savedAmount: newSaved, isCompleted: stillComplete, updatedAt: now })
      .where(eq(schema.goals.id, goalId));

    set((s) => ({
      goals: s.goals.map((g) =>
        g.id === goalId
          ? withProgress({ ...g, savedAmount: newSaved, isCompleted: stillComplete, updatedAt: now })
          : g
      ),
      contributions: {
        ...s.contributions,
        [goalId]: (s.contributions[goalId] ?? []).filter((c) => c.id !== contributionId),
      },
    }));
  },

  clearError: () => set({ error: null }),
}));
