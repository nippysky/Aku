import { create } from 'zustand';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { generateUUID } from '../lib/uuid';
import type { Budget, BudgetWithSpent, BudgetCreateInput, BudgetStatus, ExpenseCategory } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────

function getStatus(progress: number): BudgetStatus {
  if (progress >= 1)    return 'exceeded';
  if (progress >= 0.8)  return 'near-limit';
  return 'healthy';
}

function fromDb(row: typeof schema.budgets.$inferSelect): Budget {
  return {
    id:          row.id,
    userId:      row.userId,
    householdId: row.householdId ?? null,
    category:    row.category as ExpenseCategory,
    amount:      row.amount,
    period:      row.period as Budget['period'],
    isShared:    Boolean(row.isShared),
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
  };
}

// ─── State ────────────────────────────────────────────────────────────────

interface BudgetsState {
  budgets:    BudgetWithSpent[];
  isLoading:  boolean;
  error:      string | null;

  // Actions
  load:       (userId: string, spentByCategory: Record<string, number>) => Promise<void>;
  add:        (input: BudgetCreateInput, userId: string) => Promise<void>;
  update:     (id: string, patch: Partial<BudgetCreateInput>) => Promise<void>;
  remove:     (id: string) => Promise<void>;
  syncSpent:  (spentByCategory: Record<string, number>) => void;
  clearError: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useBudgetsStore = create<BudgetsState>()((set, get) => ({
  budgets:   [],
  isLoading: false,
  error:     null,

  load: async (userId, spentByCategory) => {
    set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const rows = await db
        .select()
        .from(schema.budgets)
        .where(eq(schema.budgets.userId, userId));

      const budgets: BudgetWithSpent[] = rows.map(fromDb).map((b) => {
        const spent    = spentByCategory[b.category] ?? 0;
        const remaining = Math.max(b.amount - spent, 0);
        const progress  = b.amount > 0 ? spent / b.amount : 0;
        return { ...b, spent, remaining, progress, status: getStatus(progress) };
      });

      set({ budgets });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load budgets' });
    } finally {
      set({ isLoading: false });
    }
  },

  add: async (input, userId) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = generateUUID();

    await db.insert(schema.budgets).values({
      id,
      userId,
      householdId: input.householdId,
      category:    input.category,
      amount:      input.amount,
      period:      input.period,
      isShared:    input.isShared,
      createdAt:   now,
      updatedAt:   now,
    });

    const newBudget: BudgetWithSpent = {
      ...input, id, userId,
      spent:     0,
      remaining: input.amount,
      progress:  0,
      status:    'healthy',
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ budgets: [...s.budgets, newBudget] }));
  },

  update: async (id, patch) => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db
      .update(schema.budgets)
      .set({ ...patch, updatedAt: now })
      .where(eq(schema.budgets.id, id));

    set((s) => ({
      budgets: s.budgets.map((b) => {
        if (b.id !== id) return b;
        const updated = { ...b, ...patch, updatedAt: now };
        const progress = updated.amount > 0 ? updated.spent / updated.amount : 0;
        return {
          ...updated,
          remaining: Math.max(updated.amount - updated.spent, 0),
          progress,
          status: getStatus(progress),
        };
      }),
    }));
  },

  remove: async (id) => {
    const db = getDatabase();
    await db.delete(schema.budgets).where(eq(schema.budgets.id, id));
    set((s) => ({ budgets: s.budgets.filter((b) => b.id !== id) }));
  },

  syncSpent: (spentByCategory) => {
    set((s) => ({
      budgets: s.budgets.map((b) => {
        const spent    = spentByCategory[b.category] ?? 0;
        const remaining = Math.max(b.amount - spent, 0);
        const progress  = b.amount > 0 ? spent / b.amount : 0;
        return { ...b, spent, remaining, progress, status: getStatus(progress) };
      }),
    }));
  },

  clearError: () => set({ error: null }),
}));
