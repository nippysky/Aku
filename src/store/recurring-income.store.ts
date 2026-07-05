/**
 * recurring-income.store.ts
 *
 * Manages recurring income templates (salary, rent, dividends, etc.).
 * On app unlock, processOverdue() auto-logs any overdue items
 * as real income entries and advances their nextDate.
 */

import { create } from 'zustand';
import { eq, and, lte } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { format, addDays, addWeeks, addMonths, addYears, parseISO } from 'date-fns';
import { generateUUID } from '../lib/uuid';
import type { IncomeCategory } from '../types';
import type { RecurringFrequency } from './recurring-expenses.store';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecurringIncome {
  id:            string;
  userId:        string;
  name:          string;
  amount:        number;   // kobo
  category:      IncomeCategory;
  frequency:     RecurringFrequency;
  nextDate:      string;   // 'YYYY-MM-DD'
  notes:         string | null;
  isActive:      boolean;
  /** Optional: auto-contribute to a goal when this income is logged */
  goalId:        string | null;
  allocationPct: number;   // 0–100
  createdAt:     string;
  updatedAt:     string;
}

export interface RecurringIncomeCreateInput {
  name:           string;
  amount:         number;
  category:       IncomeCategory;
  frequency:      RecurringFrequency;
  nextDate:       string;
  notes?:         string;
  goalId?:        string | null;
  allocationPct?: number;
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

// ─── DB mapper ────────────────────────────────────────────────────────────────

function fromDb(row: typeof schema.recurringIncome.$inferSelect): RecurringIncome {
  return {
    id:            row.id,
    userId:        row.userId,
    name:          row.name,
    amount:        row.amount,
    category:      row.category as IncomeCategory,
    frequency:     row.frequency as RecurringFrequency,
    nextDate:      row.nextDate,
    notes:         row.notes ?? null,
    isActive:      Boolean(row.isActive),
    goalId:        (row as Record<string, unknown>).goalId as string | null ?? null,
    allocationPct: Number((row as Record<string, unknown>).allocationPct ?? 0),
    createdAt:     row.createdAt,
    updatedAt:     row.updatedAt,
  };
}

// ─── State ────────────────────────────────────────────────────────────────────

interface RecurringIncomeState {
  items:     RecurringIncome[];
  isLoading: boolean;

  load:          (userId: string) => Promise<void>;
  add:           (input: RecurringIncomeCreateInput, userId: string) => Promise<RecurringIncome>;
  update:        (id: string, input: Partial<RecurringIncomeCreateInput>) => Promise<void>;
  remove:        (id: string) => Promise<void>;
  toggleActive:  (id: string) => Promise<void>;
  /**
   * Auto-log all overdue active items as income entries.
   * Called once after PIN unlock. Returns logged items.
   */
  processOverdue: (userId: string) => Promise<{ name: string; amount: number }[]>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRecurringIncomeStore = create<RecurringIncomeState>()((set, get) => ({
  items:     [],
  isLoading: false,

  load: async (userId) => {
    set({ isLoading: true });
    try {
      const db   = getDatabase();
      const rows = await db
        .select()
        .from(schema.recurringIncome)
        .where(eq(schema.recurringIncome.userId, userId))
        .orderBy(schema.recurringIncome.name);
      set({ items: rows.map(fromDb) });
    } finally {
      set({ isLoading: false });
    }
  },

  add: async (input, userId) => {
    const db  = getDatabase();
    const now = new Date().toISOString();
    const id  = generateUUID();

    await db.insert(schema.recurringIncome).values({
      id,
      userId,
      name:      input.name,
      amount:    input.amount,
      category:  input.category,
      frequency: input.frequency,
      nextDate:  input.nextDate,
      notes:     input.notes ?? null,
      isActive:      true,
      goalId:        input.goalId ?? null,
      allocationPct: input.allocationPct ?? 0,
      createdAt: now,
      updatedAt: now,
    });

    const newItem: RecurringIncome = {
      id, userId,
      name:          input.name,
      amount:        input.amount,
      category:      input.category,
      frequency:     input.frequency,
      nextDate:      input.nextDate,
      notes:         input.notes ?? null,
      isActive:      true,
      goalId:        input.goalId ?? null,
      allocationPct: input.allocationPct ?? 0,
      createdAt:     now,
      updatedAt:     now,
    };

    set((s) => ({ items: [...s.items, newItem].sort((a, b) => a.name.localeCompare(b.name)) }));
    return newItem;
  },

  update: async (id, input) => {
    const db  = getDatabase();
    const now = new Date().toISOString();
    await db
      .update(schema.recurringIncome)
      .set({ ...input, updatedAt: now })
      .where(eq(schema.recurringIncome.id, id));

    set((s) => ({
      items: s.items.map((item) =>
        item.id === id ? { ...item, ...input, updatedAt: now } : item
      ),
    }));
  },

  remove: async (id) => {
    const db = getDatabase();
    await db.delete(schema.recurringIncome).where(eq(schema.recurringIncome.id, id));
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },

  toggleActive: async (id) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    const db      = getDatabase();
    const now     = new Date().toISOString();
    const newActive = !item.isActive;
    await db
      .update(schema.recurringIncome)
      .set({ isActive: newActive, updatedAt: now })
      .where(eq(schema.recurringIncome.id, id));

    set((s) => ({
      items: s.items.map((i) =>
        i.id === id ? { ...i, isActive: newActive, updatedAt: now } : i
      ),
    }));
  },

  processOverdue: async (userId) => {
    const db      = getDatabase();
    const today   = format(new Date(), 'yyyy-MM-dd');
    const logged: { name: string; amount: number }[] = [];

    const overdue = await db
      .select()
      .from(schema.recurringIncome)
      .where(
        and(
          eq(schema.recurringIncome.userId,   userId),
          eq(schema.recurringIncome.isActive, true),
          lte(schema.recurringIncome.nextDate, today),
        )
      );

    for (const row of overdue) {
      const item = fromDb(row);

      // Log it as an income entry on its nextDate
      const incomeId = generateUUID();
      const now      = new Date().toISOString();
      await db.insert(schema.income).values({
        id:          incomeId,
        userId,
        amount:      item.amount,
        category:    item.category,
        description: item.name,
        date:        item.nextDate,
        createdAt:   now,
        updatedAt:   now,
      });

      // Auto-contribute to a goal if configured
      if (item.goalId && item.allocationPct > 0) {
        const contribAmount = Math.round(item.amount * item.allocationPct / 100);
        if (contribAmount > 0) {
          const contribId = generateUUID();
          await db.insert(schema.goalContributions).values({
            id:        contribId,
            goalId:    item.goalId,
            userId,
            amount:    contribAmount,
            note:      `Auto from ${item.name}`,
            date:      item.nextDate,
            createdAt: now,
          });
          // Update goal's savedAmount
          const [goal] = await db
            .select({ savedAmount: schema.goals.savedAmount })
            .from(schema.goals)
            .where(eq(schema.goals.id, item.goalId))
            .limit(1);
          if (goal) {
            await db
              .update(schema.goals)
              .set({ savedAmount: goal.savedAmount + contribAmount, updatedAt: now })
              .where(eq(schema.goals.id, item.goalId));
          }
        }
      }

      // Advance nextDate past today
      let next = item.nextDate;
      while (next <= today) {
        next = advanceDate(next, item.frequency);
      }

      await db
        .update(schema.recurringIncome)
        .set({ nextDate: next, updatedAt: now })
        .where(eq(schema.recurringIncome.id, item.id));

      logged.push({ name: item.name, amount: item.amount });
    }

    if (logged.length > 0) {
      const rows = await db
        .select()
        .from(schema.recurringIncome)
        .where(eq(schema.recurringIncome.userId, userId))
        .orderBy(schema.recurringIncome.name);
      set({ items: rows.map(fromDb) });
    }

    return logged;
  },
}));
