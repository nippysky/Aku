import { create } from 'zustand';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { differenceInDays, parseISO, format } from 'date-fns';
import { generateUUID } from '../lib/uuid';
import type { Bill, BillCreateInput, BillUpdateInput, BillStatus } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────

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
    householdId: row.householdId ?? null,
    name:        row.name,
    amount:      row.amount,
    category:    row.category as Bill['category'],
    dueDate:     row.dueDate,
    frequency:   row.frequency as Bill['frequency'],
    notes:       row.notes ?? null,
    isShared:    Boolean(row.isShared),
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

// ─── State ────────────────────────────────────────────────────────────────

interface BillsState {
  bills:      Bill[];
  isLoading:  boolean;
  error:      string | null;

  // Computed
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

// ─── Store ────────────────────────────────────────────────────────────────

export const useBillsStore = create<BillsState>()((set, get) => ({
  bills:     [],
  isLoading: false,
  error:     null,
  upcoming:  [],
  dueToday:  [],
  overdue:   [],
  paid:      [],

  load: async (userId) => {
    set({ isLoading: true, error: null });
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
        householdId: input.householdId,
        name:        input.name,
        amount:      input.amount,
        category:    input.category,
        dueDate:     input.dueDate,
        frequency:   input.frequency,
        notes:       input.notes,
        isShared:    input.isShared,
        isPaid:      false,
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

      const bills = [...get().bills, newBill].sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate)
      );
      _setBills(set, bills);
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

      const bills = get().bills.map((b) =>
        b.id === id
          ? { ...b, ...rest, updatedAt: now, status: computeStatus({ ...b, ...rest }) }
          : b
      );
      _setBills(set, bills);
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to update bill' });
    } finally {
      set({ isLoading: false });
    }
  },

  markPaid: async (id) => {
    const now = new Date().toISOString();
    const db = getDatabase();
    await db
      .update(schema.bills)
      .set({ isPaid: true, paidAt: now, updatedAt: now })
      .where(eq(schema.bills.id, id));

    const bills = get().bills.map((b) =>
      b.id === id
        ? { ...b, isPaid: true, paidAt: now, status: 'paid' as BillStatus, updatedAt: now }
        : b
    );
    _setBills(set, bills);
  },

  markUnpaid: async (id) => {
    const now = new Date().toISOString();
    const db = getDatabase();
    await db
      .update(schema.bills)
      .set({ isPaid: false, paidAt: null, updatedAt: now })
      .where(eq(schema.bills.id, id));

    const bills = get().bills.map((b) =>
      b.id === id
        ? { ...b, isPaid: false, paidAt: null, status: computeStatus({ ...b, isPaid: false }), updatedAt: now }
        : b
    );
    _setBills(set, bills);
  },

  remove: async (id) => {
    const db = getDatabase();
    await db.delete(schema.bills).where(eq(schema.bills.id, id));
    const bills = get().bills.filter((b) => b.id !== id);
    _setBills(set, bills);
  },

  clearError: () => set({ error: null }),
}));

// ─── Private helper: set bills + recompute computed slices ────────────────

function _setBills(set: any, bills: Bill[]) {
  set({
    bills,
    upcoming: bills.filter((b) => b.status === 'upcoming'),
    dueToday: bills.filter((b) => b.status === 'due-today'),
    overdue:  bills.filter((b) => b.status === 'overdue'),
    paid:     bills.filter((b) => b.status === 'paid'),
  });
}
