import { create } from 'zustand';
import { eq, and, gte, lte } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { format } from 'date-fns';
import { generateUUID } from '../lib/uuid';
import type {
  Income, IncomeCreateInput, IncomeUpdateInput,
  IncomeSummary, IncomeCategory,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────

function fromDb(row: typeof schema.income.$inferSelect): Income {
  return {
    id:          row.id,
    userId:      row.userId,
    amount:      row.amount,
    category:    row.category as IncomeCategory,
    description: row.description ?? null,
    date:        row.date,
    createdAt:   row.createdAt,
    updatedAt:   row.updatedAt,
  };
}

function buildSummary(records: Income[], month: string): IncomeSummary {
  const cats: IncomeCategory[] = [
    'salary', 'freelance', 'business', 'investment',
    'rental', 'transfer', 'refund', 'other',
  ];
  const byCategory = {} as Record<IncomeCategory, number>;
  cats.forEach((c) => { byCategory[c] = 0; });

  const monthRecords = month === 'all'
    ? records
    : records.filter((r) => r.date.startsWith(month));

  let totalAmount = 0;
  monthRecords.forEach((r) => {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + r.amount;
    totalAmount += r.amount;
  });

  return { totalAmount, byCategory, month };
}

// ─── State ────────────────────────────────────────────────────────────────

interface IncomeState {
  records:       Income[];
  allRecords:    Income[];
  summary:       IncomeSummary | null;
  selectedMonth: string; // 'YYYY-MM' | 'all'
  isLoading:     boolean;
  error:         string | null;

  load:      (userId: string) => Promise<void>;
  loadAll:   (userId: string) => Promise<void>;
  loadMonth: (userId: string, month: string) => Promise<void>;
  add:       (input: IncomeCreateInput, userId: string) => Promise<Income>;
  update:    (input: IncomeUpdateInput) => Promise<void>;
  remove:    (id: string) => Promise<void>;
  setMonth:  (month: string) => void;
  clearError: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useIncomeStore = create<IncomeState>()((set, get) => ({
  records:       [],
  allRecords:    [],
  summary:       null,
  selectedMonth: 'all',
  isLoading:     false,
  error:         null,

  load: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const db    = getDatabase();
      const month = get().selectedMonth;

      let rows;
      if (month === 'all') {
        rows = await db
          .select()
          .from(schema.income)
          .where(eq(schema.income.userId, userId))
          .orderBy(schema.income.date);
      } else {
        rows = await db
          .select()
          .from(schema.income)
          .where(
            and(
              eq(schema.income.userId, userId),
              gte(schema.income.date, `${month}-01`),
              lte(schema.income.date, `${month}-31`),
            )
          )
          .orderBy(schema.income.date);
      }

      const records = rows.map(fromDb).sort((a, b) => b.date.localeCompare(a.date));
      const summary = buildSummary(records, month);
      set({ records, summary });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load income' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadAll: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const db = getDatabase();
      const rows = await db
        .select()
        .from(schema.income)
        .where(eq(schema.income.userId, userId))
        .orderBy(schema.income.date);

      const allRecords = rows.map(fromDb).sort((a, b) => b.date.localeCompare(a.date));
      const currentMonth = format(new Date(), 'yyyy-MM');
      const summary = buildSummary(allRecords, currentMonth);
      set({ allRecords, records: allRecords, summary });
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to load income' });
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
      const db  = getDatabase();
      const now = new Date().toISOString();
      const id  = generateUUID();

      await db.insert(schema.income).values({
        id,
        userId,
        amount:      input.amount,
        category:    input.category,
        description: input.description,
        date:        input.date,
        createdAt:   now,
        updatedAt:   now,
      });

      const newRecord: Income = { ...input, id, userId, createdAt: now, updatedAt: now };

      const records = [newRecord, ...get().records].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      const allRecords = [newRecord, ...get().allRecords].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      const currentMonth = format(new Date(), 'yyyy-MM');
      const summaryMonth = get().selectedMonth === 'all' ? currentMonth : get().selectedMonth;
      const summary = buildSummary(records, summaryMonth);
      set({ records, allRecords, summary });

      return newRecord;
    } catch (e: any) {
      set({ error: e?.message ?? 'Failed to add income' });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  update: async (input) => {
    const { id, ...rest } = input;
    const db  = getDatabase();
    const now = new Date().toISOString();

    await db
      .update(schema.income)
      .set({ ...rest, updatedAt: now })
      .where(eq(schema.income.id, id));

    const patch = { ...rest, updatedAt: now };
    const records    = get().records.map((r)    => r.id === id ? { ...r, ...patch } : r);
    const allRecords = get().allRecords.map((r) => r.id === id ? { ...r, ...patch } : r);
    const summary = buildSummary(records, get().selectedMonth);
    set({ records, allRecords, summary });
  },

  remove: async (id) => {
    const db = getDatabase();
    await db.delete(schema.income).where(eq(schema.income.id, id));
    const records    = get().records.filter((r)    => r.id !== id);
    const allRecords = get().allRecords.filter((r) => r.id !== id);
    const summary = buildSummary(records, get().selectedMonth);
    set({ records, allRecords, summary });
  },

  setMonth: (month) => set({ selectedMonth: month }),

  clearError: () => set({ error: null }),
}));
