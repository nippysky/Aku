import { create } from 'zustand';
import { eq, and, gte, lte } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { triggerPush, triggerDelete } from '../lib/sync/trigger';
import {
  format,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  startOfYear, endOfYear,
} from 'date-fns';
import { generateUUID } from '../lib/uuid';
import { notificationService } from '../lib/notifications';
import type { Budget, BudgetWithSpent, BudgetCreateInput, BudgetStatus, ExpenseCategory } from '../types';

// ─── Period date range ────────────────────────────────────────────────────────

/**
 * Returns the inclusive YYYY-MM-DD date range for a budget period.
 * Weekly = ISO week (Mon–Sun). Monthly = 1st–last. Yearly = Jan 1–Dec 31.
 */
function getPeriodRange(period: Budget['period']): { start: string; end: string } {
  const today = new Date();
  switch (period) {
    case 'weekly': {
      const s = startOfWeek(today, { weekStartsOn: 1 }); // Monday
      const e = endOfWeek(today,   { weekStartsOn: 1 });
      return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd') };
    }
    case 'monthly': {
      return {
        start: format(startOfMonth(today), 'yyyy-MM-dd'),
        end:   format(endOfMonth(today),   'yyyy-MM-dd'),
      };
    }
    case 'yearly': {
      return {
        start: format(startOfYear(today), 'yyyy-MM-dd'),
        end:   format(endOfYear(today),   'yyyy-MM-dd'),
      };
    }
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function getStatus(progress: number): BudgetStatus {
  if (progress >= 1)   return 'exceeded';
  if (progress >= 0.8) return 'near-limit';
  return 'healthy';
}

function fromDb(row: typeof schema.budgets.$inferSelect): Budget {
  return {
    id:          row.id,
    userId:      row.userId,
    category:    row.category as ExpenseCategory,
    amount:      row.amount,
    period:      row.period as Budget['period'],
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
  };
}

/**
 * Query the expense DB to compute how much has been spent in a category
 * during the current period for the given budget.
 */
async function computeSpentForPeriod(
  userId: string,
  category: string,
  period: Budget['period'],
): Promise<number> {
  const db = getDatabase();
  const { start, end } = getPeriodRange(period);

  const rows = await db
    .select({ amount: schema.expenses.amount })
    .from(schema.expenses)
    .where(
      and(
        eq(schema.expenses.userId,   userId),
        eq(schema.expenses.category, category),
        gte(schema.expenses.date,    start),
        lte(schema.expenses.date,    end),
      )
    );

  return rows.reduce((sum, r) => sum + r.amount, 0);
}

function enrichBudget(budget: Budget, spent: number): BudgetWithSpent {
  const remaining = Math.max(budget.amount - spent, 0);
  const progress  = budget.amount > 0 ? spent / budget.amount : 0;
  return { ...budget, spent, remaining, progress, status: getStatus(progress) };
}

// ─── State ────────────────────────────────────────────────────────────────────

interface BudgetsState {
  budgets:    BudgetWithSpent[];
  isLoading:  boolean;
  error:      string | null;

  // Actions
  load:               (userId: string) => Promise<void>;
  add:                (input: BudgetCreateInput, userId: string) => Promise<void>;
  update:             (id: string, patch: Partial<BudgetCreateInput>) => Promise<void>;
  remove:             (id: string) => Promise<void>;
  /**
   * After an expense is added/removed, refresh spent amounts for the
   * affected category from the DB (period-aware).
   */
  refreshCategory:    (userId: string, category: ExpenseCategory) => Promise<void>;
  /**
   * Quick in-memory sync when the caller already has current totals.
   * Used by screens that don't need period filtering (e.g. home dashboard).
   */
  syncSpent:          (spentByCategory: Record<string, number>) => void;
  clearError:         () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useBudgetsStore = create<BudgetsState>()((set, get) => ({
  budgets:   [],
  isLoading: false,
  error:     null,

  load: async (userId) => {
    const hasData = get().budgets.length > 0;
    if (!hasData) set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const rows = await db
        .select()
        .from(schema.budgets)
        .where(eq(schema.budgets.userId, userId));

      // Query period-aware spending for each budget in parallel
      const budgets = await Promise.all(
        rows.map(fromDb).map(async (b) => {
          const spent = await computeSpentForPeriod(userId, b.category, b.period);
          return enrichBudget(b, spent);
        })
      );

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
      category:    input.category,
      amount:      input.amount,
      period:      input.period,
      createdAt:   now,
      updatedAt:   now,
    });

    // Compute current period spending for the new budget
    const spent = await computeSpentForPeriod(userId, input.category, input.period);
    const newBudget = enrichBudget(
      { ...input, id, userId, createdAt: now, updatedAt: now },
      spent,
    );

    set((s) => ({ budgets: [...s.budgets, newBudget] }));
    triggerPush();
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
    triggerPush();
  },

  remove: async (id) => {
    const db = getDatabase();
    await db.delete(schema.budgets).where(eq(schema.budgets.id, id));
    set((s) => ({ budgets: s.budgets.filter((b) => b.id !== id) }));
    triggerDelete('budget', id);
  },

  refreshCategory: async (userId, category) => {
    const budgets = get().budgets;
    const matching = budgets.filter((b) => b.category === category);
    if (matching.length === 0) return;

    // Refresh each matching budget (usually 1, but allow multiple periods per cat)
    const updates = await Promise.all(
      matching.map(async (b) => {
        const oldProgress = b.progress;
        const newSpent    = await computeSpentForPeriod(userId, category, b.period);
        const newBudget   = enrichBudget(b, newSpent);

        // Fire budget alert notifications when crossing 80% or 100% thresholds
        _checkThresholds(b, newBudget);

        return newBudget;
      })
    );

    const updatesById = Object.fromEntries(updates.map((u) => [u.id, u]));
    set((s) => ({
      budgets: s.budgets.map((b) => updatesById[b.id] ?? b),
    }));
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

// ─── Threshold notification helper ────────────────────────────────────────────

function _checkThresholds(oldBudget: BudgetWithSpent, newBudget: BudgetWithSpent): void {
  const thresholds: Array<{ pct: number; label: number }> = [
    { pct: 0.8, label: 80 },
    { pct: 1.0, label: 100 },
  ];

  for (const { pct, label } of thresholds) {
    // Fire only when crossing the threshold for the first time in this period
    if (oldBudget.progress < pct && newBudget.progress >= pct) {
      notificationService
        .scheduleBudgetAlert(newBudget.category, label, newBudget.id)
        .catch(() => {});
    }
  }
}
