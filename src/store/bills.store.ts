import { create } from 'zustand';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import {
  differenceInDays, parseISO, format,
  addDays, addWeeks, addMonths, addYears,
} from 'date-fns';
import { generateUUID } from '../lib/uuid';
import { notificationService } from '../lib/notifications';
import { useUIStore } from './ui.store';
import { triggerPush, triggerDelete } from '../lib/sync/trigger';
import type { Bill, BillCreateInput, BillUpdateInput, BillStatus, BillFrequency, ExpenseCategory } from '../types';

// ─── Recurring due-date helper ────────────────────────────────────────────────

/**
 * Given the current due date and frequency, returns the next due date string.
 * Returns null for one-time or custom bills (no auto-advance).
 */
function advanceDueDate(dueDate: string, frequency: BillFrequency): string | null {
  if (frequency === 'one-time' || frequency === 'custom') return null;
  const date = parseISO(dueDate);
  switch (frequency) {
    case 'daily':     return format(addDays(date, 1),    'yyyy-MM-dd');
    case 'weekly':    return format(addWeeks(date, 1),   'yyyy-MM-dd');
    case 'biweekly':  return format(addWeeks(date, 2),   'yyyy-MM-dd');
    case 'monthly':   return format(addMonths(date, 1),  'yyyy-MM-dd');
    case 'quarterly': return format(addMonths(date, 3),  'yyyy-MM-dd');
    case 'yearly':    return format(addYears(date, 1),   'yyyy-MM-dd');
    default:          return null;
  }
}

// ─── Status helper ────────────────────────────────────────────────────────────

function computeStatus(bill: Bill): BillStatus {
  if (bill.isPaid) return 'paid';
  const today = new Date();
  const due = parseISO(bill.dueDate);
  const diff = differenceInDays(due, today);
  if (diff < 0)  return 'overdue';
  if (diff === 0) return 'due-today';
  return 'upcoming';
}

function fromDb(row: typeof schema.bills.$inferSelect): Bill {
  return {
    id:          row.id,
    userId:      row.userId,
    name:        row.name,
    amount:      row.amount,
    category:    row.category as Bill['category'],
    dueDate:     row.dueDate,
    frequency:   row.frequency as Bill['frequency'],
    notes:       row.notes ?? null,
    isPaid:      Boolean(row.isPaid),
    paidAt:      row.paidAt ?? null,
    lastPaymentExpenseId: row.lastPaymentExpenseId ?? null,
    autoPay:     Boolean(row.autoPay),
    status:      'upcoming',
    notify30:    Boolean(row.notify30),
    notify14:    Boolean(row.notify14),
    notify7:     Boolean(row.notify7),
    notify3:     Boolean(row.notify3),
    notify1:     Boolean(row.notify1),
    notifyDay:   Boolean(row.notifyDay),
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
  };
}

// ─── State ────────────────────────────────────────────────────────────────────

interface BillsState {
  bills:      Bill[];
  isLoading:  boolean;
  error:      string | null;

  // Computed slices
  upcoming:   Bill[];
  dueToday:   Bill[];
  overdue:    Bill[];
  paid:       Bill[];

  // Actions
  load:       (userId: string) => Promise<void>;
  add:        (input: BillCreateInput, userId: string) => Promise<Bill>;
  update:     (input: BillUpdateInput) => Promise<void>;
  markPaid:   (id: string) => Promise<void>;
  markUnpaid: (id: string) => Promise<void>;
  remove:     (id: string) => Promise<void>;
  clearError: () => void;
  /**
   * Silently logs + advances every due auto-pay bill (dueDate <= today).
   * Mirrors the old recurring-expenses processOverdue behaviour. Called once
   * on unlock and on foreground resume when the calendar day has changed.
   * Safe to call concurrently — a module-level guard prevents double-processing.
   */
  processAutoPay: (userId: string) => Promise<{ name: string; amount: number }[]>;
}

// ─── Store ────────────────────────────────────────────────────────────────────


// ─── Unified ledger ───────────────────────────────────────────────────────────
// Every naira movement ends in exactly one of two ledgers: expenses or income.
// Bills are PLANNING objects — the moment one is paid, it materialises as a
// real expense entry so analytics, statements and sync all agree.

const BILL_TO_EXPENSE_CATEGORY: Record<Bill['category'], ExpenseCategory> = {
  housing:       'housing',
  utilities:     'utilities',
  transport:     'transport',
  food:          'food',
  health:        'health',
  education:     'education',
  entertainment: 'entertainment',
  shopping:      'shopping',
  family:        'family',
  savings:       'savings',
  subscriptions: 'entertainment',
  insurance:     'other',
  other:         'other',
};

/** Logs the paid bill into the expense ledger. Returns the expense id. */
async function logBillPaymentExpense(bill: Bill): Promise<string> {
  const { generateUUID: genId } = await import('../lib/uuid');
  const expenseId = genId();
  const { useExpensesStore } = await import('./expenses.store');
  const today = new Date().toISOString().split('T')[0]!;
  await useExpensesStore.getState().add(
    {
      amount:      bill.amount,
      category:    BILL_TO_EXPENSE_CATEGORY[bill.category] ?? 'other',
      description: `Bill: ${bill.name}`,
      date:        today,
    },
    bill.userId,
    expenseId,
  );
  return expenseId;
}

// Prevents processAutoPay from running concurrently (e.g. rapid unlock events).
const autoPayProcessingGuard = new Map<string, boolean>();

export const useBillsStore = create<BillsState>()((set, get) => ({
  bills:     [],
  isLoading: false,
  error:     null,
  upcoming:  [],
  dueToday:  [],
  overdue:   [],
  paid:      [],

  load: async (userId) => {
    const hasData = get().bills.length > 0;
    if (!hasData) set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const rows = await db
        .select()
        .from(schema.bills)
        .where(eq(schema.bills.userId, userId))
        .orderBy(schema.bills.dueDate);

      const bills = rows.map(fromDb).map((b) => ({ ...b, status: computeStatus(b) }));
      _setBills(set, bills);
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load bills' });
    } finally {
      set({ isLoading: false });
    }
  },

  add: async (input, userId) => {
    set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      const id = generateUUID();

      await db.insert(schema.bills).values({
        id,
        userId,
        name:        input.name,
        amount:      input.amount,
        category:    input.category,
        dueDate:     input.dueDate,
        frequency:   input.frequency,
        notes:       input.notes,
        isPaid:      false,
        lastPaymentExpenseId: null,
        autoPay:     input.autoPay,
        notify30:    input.notify30,
        notify14:    input.notify14,
        notify7:     input.notify7,
        notify3:     input.notify3,
        notify1:     input.notify1,
        notifyDay:   input.notifyDay,
        createdAt:   now,
        updatedAt:   now,
      });

      const newBill: Bill = {
        ...input,
        id,
        userId,
        isPaid: false,
        paidAt: null,
        lastPaymentExpenseId: null,
        status: computeStatus({ ...input, id, userId, isPaid: false, paidAt: null, lastPaymentExpenseId: null, status: 'upcoming', createdAt: now, updatedAt: now }),
        createdAt: now,
        updatedAt: now,
      };

      // Auto-pay bills never need reminders — they log themselves silently.
      if (!newBill.autoPay) {
        notificationService.scheduleBillReminders(newBill, useUIStore.getState().currency.symbol).catch(() => {});
      }

      const bills = [...get().bills, newBill].sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate)
      );
      _setBills(set, bills);
      triggerPush();
      return newBill;
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to add bill' });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  update: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const now = new Date().toISOString();
      const { id, ...rest } = input;

      await db
        .update(schema.bills)
        .set({ ...rest, updatedAt: now })
        .where(eq(schema.bills.id, id));

      const bills = get().bills.map((b) => {
        if (b.id !== id) return b;
        const updated = { ...b, ...rest, updatedAt: now, status: computeStatus({ ...b, ...rest }) };
        // Auto-pay bills need no reminders; toggling it on cancels any pending
        // ones, toggling it off (re)schedules from the current due date.
        if (updated.autoPay) {
          notificationService.cancelBillReminders(id).catch(() => {});
        } else {
          notificationService.scheduleBillReminders(updated, useUIStore.getState().currency.symbol).catch(() => {});
        }
        return updated;
      });
      _setBills(set, bills);
      triggerPush();
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to update bill' });
    } finally {
      set({ isLoading: false });
    }
  },

  markPaid: async (id) => {
    const now = new Date().toISOString();
    const db  = getDatabase();

    const bill = get().bills.find((b) => b.id === id);
    if (!bill) return;

    // ── Unified ledger: paying a bill records a REAL expense ──────────────
    let paymentExpenseId: string | null = null;
    try {
      paymentExpenseId = await logBillPaymentExpense(bill);
    } catch {
      // Ledger write failed — still mark the bill; user can log manually
    }

    // ── Recurring bill: advance due date instead of permanently marking paid ──
    const nextDue = advanceDueDate(bill.dueDate, bill.frequency);

    if (nextDue) {
      // Reset to unpaid with the next due date. The payment itself lives in
      // the expense ledger, so this cycle's record is never lost.
      await db
        .update(schema.bills)
        .set({ isPaid: false, paidAt: null, dueDate: nextDue, lastPaymentExpenseId: null, updatedAt: now })
        .where(eq(schema.bills.id, id));

      const updated: Bill = {
        ...bill,
        isPaid:  false,
        paidAt:  null,
        dueDate: nextDue,
        lastPaymentExpenseId: null,
        updatedAt: now,
        status: computeStatus({ ...bill, isPaid: false, dueDate: nextDue }),
      };

      // Reschedule notifications for the next due date (skip for auto-pay bills)
      if (!updated.autoPay) {
        notificationService.scheduleBillReminders(updated, useUIStore.getState().currency.symbol).catch(() => {});
      }

      const bills = get().bills.map((b) => b.id === id ? updated : b);
      _setBills(set, bills);
      triggerPush();
    } else {
      // One-time or custom: mark permanently paid + remember the ledger link
      // so un-marking can cleanly reverse the expense.
      await db
        .update(schema.bills)
        .set({ isPaid: true, paidAt: now, lastPaymentExpenseId: paymentExpenseId, updatedAt: now })
        .where(eq(schema.bills.id, id));

      // Cancel any pending reminders — bill is done
      notificationService.cancelBillReminders(id).catch(() => {});

      const bills = get().bills.map((b) =>
        b.id === id
          ? { ...b, isPaid: true, paidAt: now, lastPaymentExpenseId: paymentExpenseId, status: 'paid' as BillStatus, updatedAt: now }
          : b
      );
      _setBills(set, bills);
      triggerPush();
    }
  },

  markUnpaid: async (id) => {
    const now = new Date().toISOString();
    const db  = getDatabase();

    // ── Unified ledger: reverse the auto-logged payment expense ──────────
    const prev = get().bills.find((b) => b.id === id);
    if (prev?.lastPaymentExpenseId) {
      try {
        const { useExpensesStore } = await import('./expenses.store');
        await useExpensesStore.getState().remove(prev.lastPaymentExpenseId);
      } catch { /* expense already gone — fine */ }
    }

    await db
      .update(schema.bills)
      .set({ isPaid: false, paidAt: null, lastPaymentExpenseId: null, updatedAt: now })
      .where(eq(schema.bills.id, id));

    const bills = get().bills.map((b) => {
      if (b.id !== id) return b;
      const updated = { ...b, isPaid: false, paidAt: null, lastPaymentExpenseId: null, status: computeStatus({ ...b, isPaid: false }), updatedAt: now };
      // Re-enable notifications for this bill (skip for auto-pay bills)
      if (!updated.autoPay) {
        notificationService.scheduleBillReminders(updated, useUIStore.getState().currency.symbol).catch(() => {});
      }
      return updated;
    });
    _setBills(set, bills);
    triggerPush();
  },

  remove: async (id) => {
    const db = getDatabase();
    await db.delete(schema.bills).where(eq(schema.bills.id, id));
    // Cancel all scheduled reminders for the deleted bill
    notificationService.cancelBillReminders(id).catch(() => {});
    const bills = get().bills.filter((b) => b.id !== id);
    _setBills(set, bills);
    triggerDelete('bill', id);
  },

  processAutoPay: async (userId) => {
    if (autoPayProcessingGuard.get(userId)) return [];
    autoPayProcessingGuard.set(userId, true);

    const db      = getDatabase();
    const today   = format(new Date(), 'yyyy-MM-dd');
    const logged: { name: string; amount: number }[] = [];

    try {
      const due = get().bills.filter((b) => b.autoPay && !b.isPaid && b.dueDate <= today);

      for (const bill of due) {
        let paymentExpenseId: string | null = null;
        try {
          paymentExpenseId = await logBillPaymentExpense(bill);
        } catch {
          continue; // ledger write failed — retry next time, don't advance
        }

        const now = new Date().toISOString();

        // Advance past today, catching up multiple missed periods in one go
        // (mirrors the old recurring-expenses behaviour — one expense logged,
        // due date fast-forwarded to the next real cycle).
        let nextDue: string | null = bill.dueDate;
        do {
          nextDue = advanceDueDate(nextDue, bill.frequency);
        } while (nextDue && nextDue <= today);

        if (nextDue) {
          await db
            .update(schema.bills)
            .set({ isPaid: false, paidAt: null, dueDate: nextDue, lastPaymentExpenseId: null, updatedAt: now })
            .where(eq(schema.bills.id, bill.id));
        } else {
          // One-time / custom auto-pay bill — logged once, done.
          await db
            .update(schema.bills)
            .set({ isPaid: true, paidAt: now, lastPaymentExpenseId: paymentExpenseId, updatedAt: now })
            .where(eq(schema.bills.id, bill.id));
        }

        logged.push({ name: bill.name, amount: bill.amount });
      }

      if (logged.length > 0) {
        const rows = await db
          .select()
          .from(schema.bills)
          .where(eq(schema.bills.userId, userId))
          .orderBy(schema.bills.dueDate);
        const bills = rows.map(fromDb).map((b) => ({ ...b, status: computeStatus(b) }));
        _setBills(set, bills);
        triggerPush();
      }

      return logged;
    } finally {
      autoPayProcessingGuard.delete(userId);
    }
  },

  clearError: () => set({ error: null }),
}));

// ─── Private helper: set bills + recompute computed slices ────────────────────

function _setBills(set: any, bills: Bill[]) {
  set({
    bills,
    upcoming: bills.filter((b) => b.status === 'upcoming'),
    dueToday: bills.filter((b) => b.status === 'due-today'),
    overdue:  bills.filter((b) => b.status === 'overdue'),
    paid:     bills.filter((b) => b.status === 'paid'),
  });
}
