/**
 * migrateRecurringExpensesToBills — one-time data migration.
 *
 * Recurring Expenses used to be a separate feature from Bills, which let the
 * same real-world subscription (e.g. "Netflix 10k monthly") get entered
 * twice — once as a Bill, once as a Recurring Expense — and silently
 * double-log every cycle. Bills absorbed that feature via an `autoPay` flag:
 * an auto-pay Bill behaves exactly like the old Recurring Expense (silently
 * logs itself and advances, no reminders, no confirmation).
 *
 * This runs once per device (gated by an app_state flag) and converts every
 * existing recurring_expenses row into a Bill with autoPay=true, then removes
 * the old row. Recurring Income is untouched — it has no Bills equivalent and
 * no duplication risk, so it stays as its own feature.
 *
 * Multi-device safety: if the same user runs this independently on two
 * devices before syncing, a name+amount dedupe check skips creating a second
 * Bill for an item that's already been migrated (e.g. pulled in from another
 * device in the meantime).
 */
import { eq } from 'drizzle-orm';
import { getDatabase, getSQLiteDatabase, schema } from '../database/client';
import { generateUUID } from '../uuid';
import { triggerPush, triggerDelete } from '../sync/trigger';
import type { BillCategory } from '../../types';

const FLAG_KEY = 'migrated_recurring_expenses_to_bills_v1';

function appStateGet(key: string): string | null {
  try {
    const sqlite = getSQLiteDatabase();
    const row = sqlite.getFirstSync<{ value: string }>(
      'SELECT value FROM app_state WHERE key = ?', [key],
    );
    return row?.value ?? null;
  } catch { return null; }
}

function appStateSet(key: string, value: string): void {
  try {
    const sqlite = getSQLiteDatabase();
    sqlite.runSync(
      'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  } catch { /* ignore — worst case the migration re-runs once more */ }
}

// Recurring expenses used ExpenseCategory; Bills use the (mostly overlapping)
// BillCategory. Map the handful that differ, pass the rest through.
const EXPENSE_TO_BILL_CATEGORY: Record<string, BillCategory> = {
  gifts: 'other',
};

function toBillCategory(expenseCategory: string): BillCategory {
  return (EXPENSE_TO_BILL_CATEGORY[expenseCategory] ?? expenseCategory) as BillCategory;
}

export async function migrateRecurringExpensesToBills(userId: string): Promise<void> {
  if (appStateGet(FLAG_KEY) === '1') return;

  try {
    const db = getDatabase();

    const recurringRows = await db
      .select()
      .from(schema.recurringExpenses)
      .where(eq(schema.recurringExpenses.userId, userId));

    if (recurringRows.length === 0) {
      appStateSet(FLAG_KEY, '1');
      return;
    }

    const existingBills = await db
      .select()
      .from(schema.bills)
      .where(eq(schema.bills.userId, userId));

    for (const r of recurringRows) {
      // Paused items were already "off" — nothing left to preserve.
      if (!r.isActive) {
        await db.delete(schema.recurringExpenses).where(eq(schema.recurringExpenses.id, r.id));
        triggerDelete('recurring_expense', r.id);
        continue;
      }

      // Dedupe guard — another device may have already migrated this one.
      const dup = existingBills.find(
        (b) => b.autoPay
          && b.name.trim().toLowerCase() === r.name.trim().toLowerCase()
          && b.amount === r.amount,
      );
      if (dup) {
        await db.delete(schema.recurringExpenses).where(eq(schema.recurringExpenses.id, r.id));
        triggerDelete('recurring_expense', r.id);
        continue;
      }

      const id  = generateUUID();
      const now = new Date().toISOString();

      await db.insert(schema.bills).values({
        id,
        userId,
        name:                 r.name,
        amount:                r.amount,
        category:              toBillCategory(r.category),
        dueDate:               r.nextDate,
        frequency:             r.frequency,
        notes:                 r.notes,
        isPaid:                false,
        paidAt:                null,
        lastPaymentExpenseId:  null,
        autoPay:               true,
        notify30:              false,
        notify14:              false,
        notify7:               false,
        notify3:               false,
        notify1:               false,
        notifyDay:             false,
        createdAt:             now,
        updatedAt:             now,
      });
      triggerPush();

      await db.delete(schema.recurringExpenses).where(eq(schema.recurringExpenses.id, r.id));
      triggerDelete('recurring_expense', r.id);
    }

    appStateSet(FLAG_KEY, '1');
  } catch {
    // Best-effort — if anything goes wrong, leave the flag unset so it retries
    // on the next unlock rather than silently losing the user's items.
  }
}
