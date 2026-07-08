import { int, text, sqliteTable, index } from 'drizzle-orm/sqlite-core';

// ─── Akù Database Schema (Drizzle + Expo SQLite) ─────────────────────────
// All dates stored as ISO8601 text. Amounts stored as integers (kobo).
// UUIDs generated client-side with crypto.randomUUID().

// ─── Users ────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  email:       text('email').notNull().unique(),
  householdId: text('household_id'),
  avatarUrl:   text('avatar_url'),
  /** Base64 data URI for profile photo — stored locally, never hits a CDN. */
  avatarData:  text('avatar_data'),
  pinHash:     text('pin_hash'),          // bcrypt hash
  biometricEnabled: int('biometric_enabled', { mode: 'boolean' }).default(false),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
}, (t) => [
  index('idx_users_email').on(t.email),
  index('idx_users_household').on(t.householdId),
]);

// ─── Households ───────────────────────────────────────────────────────────

export const households = sqliteTable('households', {
  id:         text('id').primaryKey(),
  name:       text('name').notNull(),
  ownerId:    text('owner_id').notNull(),
  inviteCode: text('invite_code'),   // 8-char alphanumeric, unique per circle
  createdAt:  text('created_at').notNull(),
});

export const householdMembers = sqliteTable('household_members', {
  id:          text('id').primaryKey(),
  householdId: text('household_id').notNull(),
  userId:      text('user_id').notNull(),
  role:        text('role', { enum: ['owner', 'member'] }).notNull().default('member'),
  joinedAt:    text('joined_at').notNull(),
}, (t) => [
  index('idx_members_household').on(t.householdId),
  index('idx_members_user').on(t.userId),
]);

// ─── Bills ────────────────────────────────────────────────────────────────

export const bills = sqliteTable('bills', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  householdId: text('household_id'),
  name:        text('name').notNull(),
  amount:      int('amount').notNull(),       // in kobo
  category:    text('category').notNull(),
  dueDate:     text('due_date').notNull(),    // 'YYYY-MM-DD'
  frequency:   text('frequency').notNull(),
  notes:       text('notes'),
  isShared:    int('is_shared', { mode: 'boolean' }).default(false),
  isPaid:      int('is_paid', { mode: 'boolean' }).default(false),
  paidAt:      text('paid_at'),
  // notification toggles
  notify30:    int('notify_30', { mode: 'boolean' }).default(false),
  notify14:    int('notify_14', { mode: 'boolean' }).default(true),
  notify7:     int('notify_7',  { mode: 'boolean' }).default(true),
  notify3:     int('notify_3',  { mode: 'boolean' }).default(true),
  notify1:     int('notify_1',  { mode: 'boolean' }).default(true),
  notifyDay:   int('notify_day',{ mode: 'boolean' }).default(true),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
}, (t) => [
  index('idx_bills_user').on(t.userId),
  index('idx_bills_due').on(t.dueDate),
  index('idx_bills_household').on(t.householdId),
]);

// ─── Expenses ─────────────────────────────────────────────────────────────

export const expenses = sqliteTable('expenses', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  householdId: text('household_id'),
  amount:      int('amount').notNull(),       // in kobo
  category:    text('category').notNull(),
  description: text('description'),
  date:        text('date').notNull(),        // 'YYYY-MM-DD'
  isShared:    int('is_shared', { mode: 'boolean' }).default(false),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
}, (t) => [
  index('idx_expenses_user').on(t.userId),
  index('idx_expenses_date').on(t.date),
  index('idx_expenses_category').on(t.category),
  index('idx_expenses_household').on(t.householdId),
]);

// ─── Income ───────────────────────────────────────────────────────────────

export const income = sqliteTable('income', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  amount:      int('amount').notNull(),       // in kobo
  category:    text('category').notNull(),
  description: text('description'),
  date:        text('date').notNull(),        // 'YYYY-MM-DD'
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
}, (t) => [
  index('idx_income_user').on(t.userId),
  index('idx_income_date').on(t.date),
  index('idx_income_category').on(t.category),
]);

// ─── Budgets ──────────────────────────────────────────────────────────────

export const budgets = sqliteTable('budgets', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  householdId: text('household_id'),
  category:    text('category').notNull(),
  amount:      int('amount').notNull(),       // in kobo
  period:      text('period', { enum: ['weekly', 'monthly', 'yearly'] }).notNull(),
  isShared:    int('is_shared', { mode: 'boolean' }).default(false),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
}, (t) => [
  index('idx_budgets_user').on(t.userId),
  index('idx_budgets_category').on(t.category),
]);

// ─── Goals ────────────────────────────────────────────────────────────────

export const goals = sqliteTable('goals', {
  id:           text('id').primaryKey(),
  userId:       text('user_id').notNull(),
  householdId:  text('household_id'),
  name:         text('name').notNull(),
  targetAmount: int('target_amount').notNull(),   // in kobo
  savedAmount:  int('saved_amount').notNull().default(0),
  targetDate:   text('target_date'),
  notes:        text('notes'),
  emoji:        text('emoji'),
  color:        text('color'),
  isShared:     int('is_shared', { mode: 'boolean' }).default(false),
  isCompleted:  int('is_completed', { mode: 'boolean' }).default(false),
  completedAt:  text('completed_at'),
  createdAt:    text('created_at').notNull(),
  updatedAt:    text('updated_at').notNull(),
}, (t) => [
  index('idx_goals_user').on(t.userId),
  index('idx_goals_household').on(t.householdId),
]);

export const goalContributions = sqliteTable('goal_contributions', {
  id:        text('id').primaryKey(),
  goalId:    text('goal_id').notNull(),
  userId:    text('user_id').notNull(),
  amount:    int('amount').notNull(),             // in kobo
  note:      text('note'),
  date:      text('date').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('idx_contributions_goal').on(t.goalId),
  index('idx_contributions_date').on(t.date),
]);

// ─── Notifications ────────────────────────────────────────────────────────

export const notifications = sqliteTable('notifications', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  type:        text('type').notNull(),
  title:       text('title').notNull(),
  body:        text('body').notNull(),
  referenceId: text('reference_id'),       // billId, goalId, budgetId, etc.
  isRead:      int('is_read', { mode: 'boolean' }).default(false),
  scheduledAt: text('scheduled_at'),       // ISO8601 — null means "sent immediately"
  createdAt:   text('created_at').notNull(),
}, (t) => [
  index('idx_notifications_user').on(t.userId),
  index('idx_notifications_read').on(t.isRead),
  // Composite index for the common query: unread notifications for a user,
  // ordered chronologically.
  index('idx_notifications_user_created').on(t.userId, t.createdAt),
  // Fast lookup by referenceId (e.g. "all notifications for bill X")
  index('idx_notifications_reference').on(t.referenceId),
]);

// ─── Circle Settings ──────────────────────────────────────────────────────
// One-to-one extension of households for contribution-circle features.

export const circleSettings = sqliteTable('circle_settings', {
  id:               text('id').primaryKey(),         // = householdId
  emoji:            text('emoji'),                   // circle emoji icon
  targetAmount:     int('target_amount'),             // kobo; null = no target / open-ended
  description:      text('description'),             // purpose / reason for the circle
  frequency:        text('frequency'),               // 'weekly'|'biweekly'|'monthly'|'quarterly'|'yearly'|'one-time'
  perMemberAmount:  int('per_member_amount'),         // kobo; null = auto (target/memberCount)
  contributionType: text('contribution_type'),        // 'equal' | 'custom'
  deadline:         text('deadline'),                 // ISO date; optional
  accountName:      text('account_name'),             // optional payment details
  accountNumber:    text('account_number'),
  bankName:         text('bank_name'),
  notes:            text('notes'),
  updatedAt:        text('updated_at').notNull(),
});

// ─── Circle Contributions ─────────────────────────────────────────────────

export const circleContributions = sqliteTable('circle_contributions', {
  id:         text('id').primaryKey(),
  circleId:   text('circle_id').notNull(),
  userId:     text('user_id').notNull(),
  amount:     int('amount').notNull(),             // in kobo
  note:       text('note'),
  status:     text('status', { enum: ['pending', 'verified'] })
                .notNull().default('pending'),
  createdAt:  text('created_at').notNull(),
  verifiedAt: text('verified_at'),
  verifiedBy: text('verified_by'),
}, (t) => [
  index('idx_circle_contributions_circle').on(t.circleId),
  index('idx_circle_contributions_user').on(t.userId),
  index('idx_circle_contributions_status').on(t.status),
]);

// ─── App State (persisted UI preferences) ────────────────────────────────

export const appState = sqliteTable('app_state', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),
});

// ─── Recurring Expenses ───────────────────────────────────────────────────
// Templates that auto-log an expense on a schedule.
// e.g. Netflix monthly, gym membership, etc.

export const recurringExpenses = sqliteTable('recurring_expenses', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  name:        text('name').notNull(),
  amount:      int('amount').notNull(),       // in kobo
  category:    text('category').notNull(),
  frequency:   text('frequency').notNull(),   // 'daily'|'weekly'|'biweekly'|'monthly'|'yearly'
  nextDate:    text('next_date').notNull(),   // 'YYYY-MM-DD'
  notes:       text('notes'),
  isActive:    int('is_active', { mode: 'boolean' }).default(true),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
}, (t) => [
  index('idx_recurring_expenses_user').on(t.userId),
  index('idx_recurring_expenses_next').on(t.nextDate),
]);

// ─── Recurring Income ─────────────────────────────────────────────────────
// Templates that auto-log an income entry on a schedule.
// e.g. monthly salary, rental income, dividends, etc.

export const recurringIncome = sqliteTable('recurring_income', {
  id:            text('id').primaryKey(),
  userId:        text('user_id').notNull(),
  name:          text('name').notNull(),
  amount:        int('amount').notNull(),       // in kobo
  category:      text('category').notNull(),   // IncomeCategory
  frequency:     text('frequency').notNull(),   // 'daily'|'weekly'|'biweekly'|'monthly'|'yearly'
  nextDate:      text('next_date').notNull(),   // 'YYYY-MM-DD'
  notes:         text('notes'),
  isActive:      int('is_active', { mode: 'boolean' }).default(true),
  /** Optional: auto-contribute a % of this income to a goal */
  goalId:        text('goal_id'),
  allocationPct: int('allocation_pct').default(0), // 0–100
  createdAt:     text('created_at').notNull(),
  updatedAt:     text('updated_at').notNull(),
}, (t) => [
  index('idx_recurring_income_user').on(t.userId),
  index('idx_recurring_income_next').on(t.nextDate),
]);

// ─── Schema Export ────────────────────────────────────────────────────────

export const schema = {
  users,
  households,
  householdMembers,
  bills,
  expenses,
  income,
  budgets,
  goals,
  goalContributions,
  notifications,
  circleSettings,
  recurringExpenses,
  recurringIncome,
  circleContributions,
  appState,
};
