import { create } from 'zustand';
import { eq } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import {
  differenceInDays, parseISO, format,
  addWeeks, addMonths, addYears,
} from 'date-fns';
import { generateUUID } from '../lib/uuid';
import { notificationService } from '../lib/notifications';
import { useUIStore } from './ui.store';
import { triggerPush, triggerDelete } from '../lib/sync/trigger';
import type { Bill, BillCreateInput, BillUpdateInput, BillStatus, BillFrequency } from '../types';

// ─── Recurring due-date helper ────────────────────────────────────────────────

/**
 * Given the current due date and frequency, returns the next due date string.
 * Returns null for one-time or custom bills (no auto-advance).
 */
function advanceDueDate(dueDate: string, frequency: BillFrequency): string | null {
  if (frequency === 'one-time' || frequency === 'custom') return null;
  const date = parseISO(dueDate);
  switch (frequency) {
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
}

// ─── Store ────────────────────────────────────────────────────────────────────

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
        status: computeStatus({ ...input, id, userId, isPaid: false, paidAt: null, status: 'upcoming', createdAt: now, updatedAt: now }),
        createdAt: now,
        updatedAt: now,
      };

      // Schedule local notifications for the new bill (fire-and-forget)
      notificationService.scheduleBillReminders(newBill, useUIStore.getState().currency.symbol).catch(() => {});

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
        // Reschedule notifications whenever bill details change (fire-and-forget)
        notificationService.scheduleBillReminders(updated, useUIStore.getState().currency.symbol).catch(() => {});
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

    // ── Recurring bill: advance due date instead of permanently marking paid ──
    const nextDue = advanceDueDate(bill.dueDate, bill.frequency);

    if (nextDue) {
      // Reset to unpaid with the next due date
      await db
        .update(schema.bills)
        .set({ isPaid: false, paidAt: null, dueDate: nextDue, updatedAt: now })
        .where(eq(schema.bills.id, id));

      const updated: Bill = {
        ...bill,
        isPaid:  false,
        paidAt:  null,
        dueDate: nextDue,
        updatedAt: now,
        status: computeStatus({ ...bill, isPaid: false, dueDate: nextDue }),
      };

      // Reschedule notifications for the next due date
      notificationService.scheduleBillReminders(updated, useUIStore.getState().currency.symbol).catch(() => {});

      const bills = get().bills.map((b) => b.id === id ? updated : b);
      _setBills(set, bills);
      triggerPush();
    } else {
      // One-time or custom: mark permanently paid
      await db
        .update(schema.bills)
        .set({ isPaid: true, paidAt: now, updatedAt: now })
        .where(eq(schema.bills.id, id));

      // Cancel any pending reminders — bill is done
      notificationService.cancelBillReminders(id).catch(() => {});

      const bills = get().bills.map((b) =>
        b.id === id
          ? { ...b, isPaid: true, paidAt: now, status: 'paid' as BillStatus, updatedAt: now }
          : b
      );
      _setBills(set, bills);
      triggerPush();
    }
  },

  markUnpaid: async (id) => {
    const now = new Date().toISOString();
    const db  = getDatabase();
    await db
      .update(schema.bills)
      .set({ isPaid: false, paidAt: null, updatedAt: now })
      .where(eq(schema.bills.id, id));

    const bills = get().bills.map((b) => {
      if (b.id !== id) return b;
      const updated = { ...b, isPaid: false, paidAt: null, status: computeStatus({ ...b, isPaid: false }), updatedAt: now };
      // Re-enable notifications for this bill
      notificationService.scheduleBillReminders(updated, useUIStore.getState().currency.symbol).catch(() => {});
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
