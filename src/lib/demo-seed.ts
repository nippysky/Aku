/**
 * demo-seed.ts — populates the App Store / Play Store review demo account
 * with realistic sample data on its very first sign-in, so reviewers land on
 * a working app instead of an empty state.
 *
 * Runs exactly once, ever: the server only reports `isNew: true` for the demo
 * account the very first time it's created (see server/src/routes/auth.ts).
 * Every sign-in after that is treated as a normal returning user and pulls
 * these same records back down via the regular sync engine — no duplicates,
 * no re-seeding, and it survives reinstalls/new devices just like real data.
 *
 * DEMO_EMAIL must match the server's DEMO_EMAIL env var exactly.
 */
import { useExpensesStore } from '../store/expenses.store';
import { useIncomeStore } from '../store/income.store';
import { useBillsStore } from '../store/bills.store';
import { useGoalsStore } from '../store/goals.store';

export const DEMO_EMAIL = 'demo@nippysky.com';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Seeds a small, realistic set of expenses/income/bills/a goal for the demo
 * account. Failures are swallowed — a seed error can never block sign-in;
 * worst case the reviewer just sees an empty (but fully functional) app.
 */
export async function seedDemoDataIfNeeded(userId: string, email: string): Promise<void> {
  if (email.trim().toLowerCase() !== DEMO_EMAIL) return;

  const { add: addExpense } = useExpensesStore.getState();
  const { add: addIncome }  = useIncomeStore.getState();
  const { add: addBill }    = useBillsStore.getState();
  const { add: addGoal, addContribution } = useGoalsStore.getState();

  try {
    // ── Income: one salary credit this month ──
    await addIncome({
      amount:      45_000_000, // ₦450,000.00 (kobo)
      category:    'salary',
      description: 'Monthly salary',
      date:        daysAgo(8),
    }, userId);

    // ── Expenses: a spread across categories + days, so charts have shape ──
    await addExpense({ amount: 850_000,  category: 'food',          description: 'Groceries — Shoprite',        date: daysAgo(1) }, userId);
    await addExpense({ amount: 350_000,  category: 'transport',     description: 'Uber to work',                date: daysAgo(2) }, userId);
    await addExpense({ amount: 1_200_000, category: 'utilities',    description: 'PHCN prepaid units',          date: daysAgo(3) }, userId);
    await addExpense({ amount: 600_000,  category: 'entertainment', description: 'Netflix + Showmax',           date: daysAgo(5) }, userId);
    await addExpense({ amount: 2_500_000, category: 'shopping',     description: 'New pair of shoes',           date: daysAgo(6) }, userId);
    await addExpense({ amount: 400_000,  category: 'food',          description: 'Lunch with colleagues',       date: daysAgo(7) }, userId);

    // ── Bills: one upcoming, one further out ──
    await addBill({
      name:      'House rent',
      amount:    120_000_000, // ₦1,200,000.00
      category:  'housing',
      dueDate:   daysFromNow(10),
      frequency: 'yearly',
      notes:     null,
      autoPay:   false,
      notify30:  true,
      notify14:  true,
      notify7:   true,
      notify3:   true,
      notify1:   true,
      notifyDay: true,
    }, userId);

    await addBill({
      name:      'Netflix subscription',
      amount:    550_000, // ₦5,500.00
      category:  'subscriptions',
      dueDate:   daysFromNow(4),
      frequency: 'monthly',
      notes:     null,
      autoPay:   true,
      notify30:  false,
      notify14:  false,
      notify7:   false,
      notify3:   true,
      notify1:   true,
      notifyDay: true,
    }, userId);

    // ── Goal: a savings target with one contribution already made ──
    const goal = await addGoal({
      name:          'Emergency fund',
      targetAmount:  100_000_000, // ₦1,000,000.00
      targetDate:    daysFromNow(180),
      notes:         '3 months of expenses set aside',
      emoji:         '🛟',
      color:         '#C9A96A',
      bankName:      null,
      accountName:   null,
      accountNumber: null,
    }, userId);

    await addContribution({
      goalId: goal.id,
      amount: 15_000_000, // ₦150,000.00
      note:   'First deposit',
      date:   daysAgo(8),
    }, userId);
  } catch (err) {
    console.warn('[demo-seed] Failed to seed demo data (non-fatal):', err);
  }
}
