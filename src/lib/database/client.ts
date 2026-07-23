import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { schema } from './schema';

// ─── Database Client ───────────────────────────────────────────────────────
// Single SQLite connection, shared across the app.
// Opened lazily on first access.

const DB_NAME = 'aku.db';

let _db: ReturnType<typeof drizzle> | null = null;
let _sqliteDb: SQLite.SQLiteDatabase | null = null;

export function getDatabase() {
  if (!_db) {
    _sqliteDb = SQLite.openDatabaseSync(DB_NAME);
    _db = drizzle(_sqliteDb, { schema });
  }
  return _db;
}

export function getSQLiteDatabase() {
  if (!_sqliteDb) {
    getDatabase(); // initializes both
  }
  return _sqliteDb!;
}

// ─── DB Migration / Setup ─────────────────────────────────────────────────
// Creates all tables if they don't exist.
// Safe to call on every app start.

const CREATE_TABLES_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    pin_hash TEXT,
    biometric_enabled INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL,
    due_date TEXT NOT NULL,
    frequency TEXT NOT NULL,
    notes TEXT,
    is_paid INTEGER DEFAULT 0,
    paid_at TEXT,
    last_payment_expense_id TEXT,
    auto_pay INTEGER DEFAULT 0,
    notify_30 INTEGER DEFAULT 0,
    notify_14 INTEGER DEFAULT 1,
    notify_7 INTEGER DEFAULT 1,
    notify_3 INTEGER DEFAULT 1,
    notify_1 INTEGER DEFAULT 1,
    notify_day INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    target_amount INTEGER NOT NULL,
    saved_amount INTEGER NOT NULL DEFAULT 0,
    target_date TEXT,
    notes TEXT,
    emoji TEXT,
    color TEXT,
    bank_name TEXT,
    account_name TEXT,
    account_number TEXT,
    is_completed INTEGER DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS goal_contributions (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    reference_id TEXT,
    is_read INTEGER DEFAULT 0,
    scheduled_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recurring_expenses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL,
    frequency TEXT NOT NULL,
    next_date TEXT NOT NULL,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS income (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_income_user ON income(user_id);
  CREATE INDEX IF NOT EXISTS idx_income_date ON income(date);
  CREATE INDEX IF NOT EXISTS idx_income_category ON income(category);

  CREATE TABLE IF NOT EXISTS recurring_income (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL,
    frequency TEXT NOT NULL,
    next_date TEXT NOT NULL,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user ON recurring_expenses(user_id);
  CREATE INDEX IF NOT EXISTS idx_recurring_expenses_next ON recurring_expenses(next_date);
  CREATE INDEX IF NOT EXISTS idx_recurring_income_user ON recurring_income(user_id);
  CREATE INDEX IF NOT EXISTS idx_recurring_income_next ON recurring_income(next_date);

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id);
  CREATE INDEX IF NOT EXISTS idx_bills_due ON bills(due_date);
  CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
  CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
  CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
  CREATE INDEX IF NOT EXISTS idx_contributions_goal ON goal_contributions(goal_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
`;

// ─── Column migrations (safe to run on every boot) ────────────────────────
// ALTER TABLE IF NOT EXISTS COLUMN ... is not supported in older SQLite.
// We catch "duplicate column name" errors and continue.

const MIGRATIONS_SQL = [
  // recurring income → goal auto-contribute
  "ALTER TABLE recurring_income ADD COLUMN goal_id TEXT",
  "ALTER TABLE recurring_income ADD COLUMN allocation_pct INTEGER DEFAULT 0",
  // unified ledger: bill → auto-logged expense link
  "ALTER TABLE bills ADD COLUMN last_payment_expense_id TEXT",
  // Auto-pay bills (merged in from the old separate Recurring Expenses feature)
  "ALTER TABLE bills ADD COLUMN auto_pay INTEGER DEFAULT 0",
  // goal destination account details
  "ALTER TABLE goals ADD COLUMN bank_name TEXT",
  "ALTER TABLE goals ADD COLUMN account_name TEXT",
  "ALTER TABLE goals ADD COLUMN account_number TEXT",
  // ── Pools/Circles feature removed — clean up on existing installs ──
  "DROP TABLE IF EXISTS circle_contributions",
  "DROP TABLE IF EXISTS circle_settings",
  "DROP TABLE IF EXISTS household_members",
  "DROP TABLE IF EXISTS households",
  "DROP INDEX IF EXISTS idx_users_household",
  "DROP INDEX IF EXISTS idx_bills_household",
  "DROP INDEX IF EXISTS idx_expenses_household",
  "DROP INDEX IF EXISTS idx_goals_household",
  "ALTER TABLE users DROP COLUMN household_id",
  "ALTER TABLE bills DROP COLUMN household_id",
  "ALTER TABLE bills DROP COLUMN is_shared",
  "ALTER TABLE expenses DROP COLUMN household_id",
  "ALTER TABLE expenses DROP COLUMN is_shared",
  "ALTER TABLE budgets DROP COLUMN household_id",
  "ALTER TABLE budgets DROP COLUMN is_shared",
  "ALTER TABLE goals DROP COLUMN household_id",
  "ALTER TABLE goals DROP COLUMN is_shared",
  // ── Budgets feature removed — clean up on existing installs ──
  "DROP TABLE IF EXISTS budgets",
  "DROP INDEX IF EXISTS idx_budgets_user",
  "DROP INDEX IF EXISTS idx_budgets_category",
  // ── Avatar feature removed — clean up on existing installs ──
  "ALTER TABLE users DROP COLUMN avatar_url",
  "ALTER TABLE users DROP COLUMN avatar_data",
];

export async function initializeDatabase(): Promise<void> {
  const sqlite = getSQLiteDatabase();
  // execSync runs multiple statements separated by semicolons
  sqlite.execSync(CREATE_TABLES_SQL);
  // Run column migrations; ignore "duplicate column" errors on fresh installs
  for (const sql of MIGRATIONS_SQL) {
    try { sqlite.execSync(sql); } catch { /* column already exists */ }
  }
}

export { schema };
export type AkuDB = ReturnType<typeof getDatabase>;
