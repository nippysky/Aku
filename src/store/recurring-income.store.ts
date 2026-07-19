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
import { triggerPush, triggerDelete } from '../lib/sync/trigger';
import { notificationService } from '../lib/notifications';
import { useUIStore } from './ui.store';
import type { IncomeCategory } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export const RECURRING_FREQ_LABELS: Record<RecurringFrequency, string> = {
  daily:    'Daily',
  weekly:   'Weekly',
  biweekly: 'Every 2 weeks',
  monthly:  'Monthly',
  yearly:   'Yearly',
};

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
  name:      string;
  amount:    number;
  category:  IncomeCategory;
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

/**
 * Logs one overdue recurring income item as a real income entry and advances
 * its nextDate. Shared by processOverdue() — the batch catch-up that runs on
 * unlock/foreground — and by add()/toggleActive(), which call this
 * immediately so an item created (or reactivated) with a nextDate of today
 * or earlier doesn't have to wait for the next unlock cycle to log.
 *
 * Returns null if the item isn't eligible (inactive, not yet due).
 */
async function logOverdueRecurringIncome(
  item: RecurringIncome,
): Promise<{ item: RecurringIncome; summary: { name: string; amount: number } } | null> {
  const today = format(new Date(), 'yyyy-MM-dd');
  if (!item.isActive || item.nextDate > today) return null;

  const db = getDatabase();
  const now = new Date().toISOString();

  // Log it as an income entry on its nextDate
  const incomeId = generateUUID();
  await db.insert(schema.income).values({
    id:          incomeId,
    userId:      item.userId,
    amount:      item.amount,
    category:    item.category,
    description: item.name,
    date:        item.nextDate,
    createdAt:   now,
    updatedAt:   now,
  });

  // Auto-contribute to a goal if configured (legacy rows only — new items
  // can't set this from the UI anymore, see the "keep it simple" removal).
  if (item.goalId && item.allocationPct > 0) {
    const contribAmount = Math.round(item.amount * item.allocationPct / 100);
    if (contribAmount > 0) {
      const contribId = generateUUID();
      await db.insert(schema.goalContributions).values({
        id:        contribId,
        goalId:    item.goalId,
        userId:    item.userId,
        amount:    contribAmount,
        note:      `Auto from ${item.name}`,
        date:      item.nextDate,
        createdAt: now,
      });
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

  // Advance nextDate past today, catching up multiple missed periods in one go.
  let next = item.nextDate;
  while (next <= today) {
    next = advanceDate(next, item.frequency);
  }

  await db
    .update(schema.recurringIncome)
    .set({ nextDate: next, updatedAt: now })
    .where(eq(schema.recurringIncome.id, item.id));

  const updated: RecurringIncome = { ...item, nextDate: next, updatedAt: now };

  // Confirm to the user it happened — fires immediately, no future scheduling.
  notificationService
    .scheduleIncomeAutoLogConfirmation(item, useUIStore.getState().currency.symbol)
    .catch(() => {});

  return { item: updated, summary: { name: item.name, amount: item.amount } };
}

// ─── Concurrency guard ────────────────────────────────────────────────────────
const processingGuard = new Map<string, boolean>();

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
   * Safe to call concurrently — module-level guard prevents double-processing per user.
   */
  processOverdue: (userId: string) => Promise<{ name: string; amount: number }[]>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useRecurringIncomeStore = create<RecurringIncomeState>()((set, get) => ({
  items:     [],
  isLoading: false,

  load: async (userId) => {
    const hasData = get().items.length > 0;
    if (!hasData) set({ isLoading: true });
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
      // Auto-allocate-to-goal was removed from the create flow for simplicity —
      // goal contributions are manual only now. Columns kept for legacy rows.
      goalId:        null,
      allocationPct: 0,
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
      goalId:        null,
      allocationPct: 0,
      createdAt:     now,
      updatedAt:     now,
    };

    // If this new item's first nextDate is already today or earlier, log it
    // immediately rather than waiting for the next unlock/foreground cycle.
    let finalItem = newItem;
    const autoResult = await logOverdueRecurringIncome(newItem);
    if (autoResult) finalItem = autoResult.item;

    set((s) => ({ items: [...s.items, finalItem].sort((a, b) => a.name.localeCompare(b.name)) }));
    triggerPush();
    return finalItem;
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
    triggerPush();
  },

  remove: async (id) => {
    const db = getDatabase();
    await db.delete(schema.recurringIncome).where(eq(schema.recurringIncome.id, id));
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    triggerDelete('recurring_income', id);
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

    let updatedItem: RecurringIncome = { ...item, isActive: newActive, updatedAt: now };

    set((s) => ({
      items: s.items.map((i) => (i.id === id ? updatedItem : i)),
    }));
    triggerPush();

    // Resuming an item whose nextDate is already today or earlier logs it
    // immediately — don't make the user wait for the next unlock cycle.
    if (newActive) {
      const autoResult = await logOverdueRecurringIncome(updatedItem);
      if (autoResult) {
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? autoResult.item : i)),
        }));
        triggerPush();
      }
    }
  },

  processOverdue: async (userId) => {
    // Concurrency guard
    if (processingGuard.get(userId)) return [];
    processingGuard.set(userId, true);

    const today   = format(new Date(), 'yyyy-MM-dd');
    const logged: { name: string; amount: number }[] = [];

    try {
      const db = getDatabase();
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
        const result = await logOverdueRecurringIncome(fromDb(row));
        if (result) logged.push(result.summary);
      }

      if (logged.length > 0) {
        const rows = await db
          .select()
          .from(schema.recurringIncome)
          .where(eq(schema.recurringIncome.userId, userId))
          .orderBy(schema.recurringIncome.name);
        set({ items: rows.map(fromDb) });
        triggerPush();
      }

      return logged;
    } finally {
      processingGuard.delete(userId);
    }
  },
}));
