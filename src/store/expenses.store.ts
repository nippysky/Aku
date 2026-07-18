import { create } from 'zustand';
import { eq, and, gte, lte } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { format } from 'date-fns';
import { generateUUID } from '../lib/uuid';
import type {
  Expense, ExpenseCreateInput, ExpenseUpdateInput,
  ExpenseSummary, ExpenseCategory,
} from '../types';
import { useBudgetsStore } from './budgets.store';
import { triggerPush, triggerDelete } from '../lib/sync/trigger';

// ─── Helpers ──────────────────────────────────────────────────────────────

function fromDb(row: typeof schema.expenses.$inferSelect): Expense {
  return {
    id:          row.id,
    userId:      row.userId,
    amount:      row.amount,
    category:    row.category as ExpenseCategory,
    description: row.description ?? null,
    date:        row.date,
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
  };
}

function buildSummary(expenses: Expense[], month: string): ExpenseSummary {
  const zero = {} as Record<ExpenseCategory, number>;
  const cats: ExpenseCategory[] = [
    'food','transport','shopping','entertainment','housing',
    'utilities','health','family','education','savings','gifts','other',
  ];
  cats.forEach((c) => { zero[c] = 0; });

  const monthExpenses = expenses.filter((e) => e.date.startsWith(month));
  const byCategory = { ...zero };
  let totalAmount = 0;

  monthExpenses.forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
    totalAmount += e.amount;
  });

  return { totalAmount, byCategory, month, previousMonth: null };
}

// ─── State ────────────────────────────────────────────────────────────────

interface ExpensesState {
  expenses:       Expense[];
  allExpenses:    Expense[];  // all-time, unfiltered — for "All" view
  summary:        ExpenseSummary | null;
  selectedMonth:  string; // 'YYYY-MM' | 'all'
  isLoading:      boolean;
  error:          string | null;

  // Actions
  load:           (userId: string) => Promise<void>;
  loadAll:        (userId: string) => Promise<void>;  // loads all-time without month filter
  loadMonth:      (userId: string, month: string) => Promise<void>;
  add:            (input: ExpenseCreateInput, userId: string) => Promise<Expense>;
  update:         (input: ExpenseUpdateInput) => Promise<void>;
  remove:         (id: string) => Promise<void>;
  setMonth:       (month: string) => void;
  clearError:     () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useExpensesStore = create<ExpensesState>()((set, get) => ({
  expenses:      [],
  allExpenses:   [],
  summary:       null,
  selectedMonth: 'all',   // default to all-time view
  isLoading:     false,
  error:         null,

  load: async (userId) => {
    const hasData = get().expenses.length > 0 || get().allExpenses.length > 0;
    if (!hasData) set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const month = get().selectedMonth;

      const rows = await db
        .select()
        .from(schema.expenses)
        .where(
          and(
            eq(schema.expenses.userId, userId),
            gte(schema.expenses.date, `${month}-01`),
            lte(schema.expenses.date, `${month}-31`),
          )
        )
        .orderBy(schema.expenses.date);

      const expenses = rows.map(fromDb);
      const summary = buildSummary(expenses, month);
      set({ expenses, summary });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load expenses' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadAll: async (userId) => {
    const hasData = get().allExpenses.length > 0;
    if (!hasData) set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const rows = await db
        .select()
        .from(schema.expenses)
        .where(eq(schema.expenses.userId, userId))
        .orderBy(schema.expenses.date);

      const allExpenses = rows.map(fromDb).sort((a, b) => b.date.localeCompare(a.date));
      const currentMonth = format(new Date(), 'yyyy-MM');
      const summary = buildSummary(allExpenses, currentMonth);
      set({ allExpenses, expenses: allExpenses, summary });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load expenses' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadMonth: async (userId, month) => {
    set({ selectedMonth: month });
    await get().load(userId);
  },

  add: async (input, userId) => {
    set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      const id = generateUUID();

      await db.insert(schema.expenses).values({
        id,
        userId,
        amount:      input.amount,
        category:    input.category,
        description: input.description,
        date:        input.date,
        createdAt:   now,
        updatedAt:   now,
      });

      const newExpense: Expense = {
        ...input,
        id,
        userId,
        createdAt: now,
        updatedAt: now,
      };

      const expenses = [newExpense, ...get().expenses].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      const allExpenses = [newExpense, ...get().allExpenses].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      const currentMonth = format(new Date(), 'yyyy-MM');
      const summaryMonth = get().selectedMonth === 'all' ? currentMonth : get().selectedMonth;
      const summary = buildSummary(expenses, summaryMonth);
      set({ expenses, allExpenses, summary });

      // Refresh period-aware budget spent + fire threshold notifications (fire-and-forget)
      useBudgetsStore
        .getState()
        .refreshCategory(userId, input.category)
        .catch(() => {});

      triggerPush();
      return newExpense;
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to add expense' });
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
      .update(schema.expenses)
      .set({ ...rest, updatedAt: now })
      .where(eq(schema.expenses.id, id));

    const patch = { ...rest, updatedAt: now };
    const expenses    = get().expenses.map((e)    => e.id === id ? { ...e, ...patch } : e);
    const allExpenses = get().allExpenses.map((e) => e.id === id ? { ...e, ...patch } : e);
    const summary = buildSummary(expenses, get().selectedMonth);
    set({ expenses, allExpenses, summary });
    triggerPush();
  },

  remove: async (id) => {
    const db = getDatabase();
    await db.delete(schema.expenses).where(eq(schema.expenses.id, id));
    const expenses    = get().expenses.filter((e)    => e.id !== id);
    const allExpenses = get().allExpenses.filter((e) => e.id !== id);
    const summary = buildSummary(expenses, get().selectedMonth);
    set({ expenses, allExpenses, summary });
    triggerDelete('expense', id);
  },

  setMonth: (month) => {
    set({ selectedMonth: month });
  },

  clearError: () => set({ error: null }),
}));
