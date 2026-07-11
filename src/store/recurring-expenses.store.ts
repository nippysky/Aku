/**
 * recurring-expenses.store.ts
 *
 * Manages recurring expense templates (Netflix, gym, etc.).
 * On app unlock, processOverdue() auto-logs any overdue items
 * as real expenses and advances their nextDate.
 */

import { create } from 'zustand';
import { eq, and, lte } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { format, addDays, addWeeks, addMonths, addYears, parseISO } from 'date-fns';
import { generateUUID } from '../lib/uuid';
import { triggerPush } from '../lib/sync/trigger';
import type { ExpenseCategory } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface RecurringExpense {
  id:        string;
  userId:    string;
  name:      string;
  amount:    number;   // kobo
  category:  ExpenseCategory;
  frequency: RecurringFrequency;
  nextDate:  string;   // 'YYYY-MM-DD'
  notes:     string | null;
  isActive:  boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringCreateInput {
  name:      string;
  amount:    number;
  category:  ExpenseCategory;
  frequency: RecurringFrequency;
  nextDate:  string;
  notes?:    string;
}

// ─── Frequency advance ────────────────────────────────────────────────────────

function advanceDate(date: string, frequency: RecurringFrequency): string {
  const d = parseISO(date);
  switch (frequency) {
    case 'daily':    return format(addDays(d, 1),    'yyyy-MM-dd');
    case 'weekly':   return format(addWeeks(d, 1),   'yyyy-MM-dd');
    case 'biweekly': return format(addWeeks(d, 2),   'yyyy-MM-dd');
    case 'monthly':  return format(addMonths(d, 1),  'yyyy-MM-dd');
    case 'yearly':   return format(addYears(d, 1),   'yyyy-MM-dd');
  }
}

export const RECURRING_FREQ_LABELS: Record<RecurringFrequency, string> = {
  daily:    'Daily',
  weekly:   'Weekly',
  biweekly: 'Every 2 weeks',
  monthly:  'Monthly',
  yearly:   'Yearly',
};

// ─── DB mapper ────────────────────────────────────────────────────────────────

function fromDb(row: typeof schema.recurringExpenses.$inferSelect): RecurringExpense {
  return {
    id:        row.id,
    userId:    row.userId,
    name:      row.name,
    amount:    row.amount,
    category:  row.category as ExpenseCategory,
    frequency: row.frequency as RecurringFrequency,
    nextDate:  row.nextDate,
    notes:     row.notes ?? null,
    isActive:  Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Concurrency guard ────────────────────────────────────────────────────────
// Prevents processOverdue from running concurrently (e.g. rapid unlock events).
// Key: userId → true if in-flight. Module-level so it persists across store updates.
const processingGuard = new Map<string, boolean>();

// ─── State ────────────────────────────────────────────────────────────────────

interface RecurringExpensesState {
  items:     RecurringExpense[];
  isLoading: boolean;

  load:          (userId: string) => Promise<void>;
  add:           (input: RecurringCreateInput, userId: string) => Promise<RecurringExpense>;
  update:        (id: string, input: Partial<RecurringCreateInput>) => Promise<void>;
  remove:        (id: string) => Promise<void>;
  toggleActive:  (id: string) => Promise<void>;
  /**
   * Auto-log all overdue active items as expenses.
   * Called once after PIN unlock and on foreground resume when date changed.
   * Returns the list of items that were logged. Safe to call concurrently —
   * a module-level guard prevents double-processing per user.
   */
  processOverdue: (userId: string) => Promise<{ name: string; amount: number }[]>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRecurringExpensesStore = create<RecurringExpensesState>()((set, get) => ({
  items:     [],
  isLoading: false,

  load: async (userId) => {
    const hasData = get().items.length > 0;
    if (!hasData) set({ isLoading: true });
    try {
      const db   = getDatabase();
      const rows = await db
        .select()
        .from(schema.recurringExpenses)
        .where(eq(schema.recurringExpenses.userId, userId))
        .orderBy(schema.recurringExpenses.name);
      set({ items: rows.map(fromDb) });
    } finally {
      set({ isLoading: false });
    }
  },

  add: async (input, userId) => {
    const db  = getDatabase();
    const now = new Date().toISOString();
    const id  = generateUUID();

    await db.insert(schema.recurringExpenses).values({
      id,
      userId,
      name:      input.name,
      amount:    input.amount,
      category:  input.category,
      frequency: input.frequency,
      nextDate:  input.nextDate,
      notes:     input.notes ?? null,
      isActive:  true,
      createdAt: now,
      updatedAt: now,
    });

    const newItem: RecurringExpense = {
      id, userId,
      name:      input.name,
      amount:    input.amount,
      category:  input.category,
      frequency: input.frequency,
      nextDate:  input.nextDate,
      notes:     input.notes ?? null,
      isActive:  true,
      createdAt: now,
      updatedAt: now,
    };

    set((s) => ({ items: [...s.items, newItem].sort((a, b) => a.name.localeCompare(b.name)) }));
    triggerPush();
    return newItem;
  },

  update: async (id, input) => {
    const db  = getDatabase();
    const now = new Date().toISOString();
    await db
      .update(schema.recurringExpenses)
      .set({ ...input, updatedAt: now })
      .where(eq(schema.recurringExpenses.id, id));

    set((s) => ({
      items: s.items.map((item) =>
        item.id === id ? { ...item, ...input, updatedAt: now } : item
      ),
    }));
    triggerPush();
  },

  remove: async (id) => {
    const db = getDatabase();
    await db.delete(schema.recurringExpenses).where(eq(schema.recurringExpenses.id, id));
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    triggerPush();
  },

  toggleActive: async (id) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const db  = getDatabase();
    const now = new Date().toISOString();
    const newActive = !item.isActive;
    await db
      .update(schema.recurringExpenses)
      .set({ isActive: newActive, updatedAt: now })
      .where(eq(schema.recurringExpenses.id, id));

    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, isActive: newActive, updatedAt: now } : i
      ),
    }));
    triggerPush();
  },

  processOverdue: async (userId) => {
    // Concurrency guard — skip if already processing for this user
    if (processingGuard.get(userId)) return [];
    processingGuard.set(userId, true);

    const db      = getDatabase();
    const today   = format(new Date(), 'yyyy-MM-dd');
    const logged: { name: string; amount: number }[] = [];

    try {

    // Query active items due on or before today
    const overdue = await db
      .select()
      .from(schema.recurringExpenses)
      .where(
        and(
          eq(schema.recurringExpenses.userId,   userId),
          eq(schema.recurringExpenses.isActive, true),
          lte(schema.recurringExpenses.nextDate, today),
        )
      );

    for (const row of overdue) {
      const item = fromDb(row);

      // Log it as an expense on its nextDate
      const expenseId  = generateUUID();
      const now        = new Date().toISOString();
      await db.insert(schema.expenses).values({
        id:          expenseId,
        userId,
        householdId: null,
        amount:      item.amount,
        category:    item.category,
        description: item.name,
        date:        item.nextDate,  // log on the due date
        isShared:    false,
        createdAt:   now,
        updatedAt:   now,
      });

      // Advance nextDate past today (handle multiple overdue periods)
      let next = item.nextDate;
      while (next <= today) {
        next = advanceDate(next, item.frequency);
      }

      await db
        .update(schema.recurringExpenses)
        .set({ nextDate: next, updatedAt: now })
        .where(eq(schema.recurringExpenses.id, item.id));

      logged.push({ name: item.name, amount: item.amount });
    }

      // Refresh in-memory list after processing
      if (logged.length > 0) {
        const rows = await db
          .select()
          .from(schema.recurringExpenses)
          .where(eq(schema.recurringExpenses.userId, userId))
          .orderBy(schema.recurringExpenses.name);
        set({ items: rows.map(fromDb) });
        triggerPush();
      }

      return logged;
    } finally {
      processingGuard.delete(userId);
    }
  },
}));
