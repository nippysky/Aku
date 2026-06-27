import { int, real, text, sqliteTable, index } from 'drizzle-orm/sqlite-core';

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
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  ownerId:   text('owner_id').notNull(),
  createdAt: text('created_at').notNull(),
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

// ─── App State (persisted UI preferences) ────────────────────────────────

export const appState = sqliteTable('app_state', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),
});

// ─── Schema Export ────────────────────────────────────────────────────────

export const schema = {
  users,
  households,
  householdMembers,
  bills,
  expenses,
  budgets,
  goals,
  goalContributions,
  notifications,
  appState,
};
