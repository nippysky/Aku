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
    household_id TEXT,
    avatar_url TEXT,
    pin_hash TEXT,
    biometric_enabled INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    invite_code TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS household_members (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    household_id TEXT,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL,
    due_date TEXT NOT NULL,
    frequency TEXT NOT NULL,
    notes TEXT,
    is_shared INTEGER DEFAULT 0,
    is_paid INTEGER DEFAULT 0,
    paid_at TEXT,
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
    household_id TEXT,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    is_shared INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    household_id TEXT,
    category TEXT NOT NULL,
    amount INTEGER NOT NULL,
    period TEXT NOT NULL,
    is_shared INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    household_id TEXT,
    name TEXT NOT NULL,
    target_amount INTEGER NOT NULL,
    saved_amount INTEGER NOT NULL DEFAULT 0,
    target_date TEXT,
    notes TEXT,
    emoji TEXT,
    color TEXT,
    is_shared INTEGER DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS circle_settings (
    id TEXT PRIMARY KEY,
    emoji TEXT,
    target_amount INTEGER,
    description TEXT,
    frequency TEXT,
    per_member_amount INTEGER,
    contribution_type TEXT DEFAULT 'equal',
    deadline TEXT,
    account_name TEXT,
    account_number TEXT,
    bank_name TEXT,
    notes TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS circle_contributions (
    id TEXT PRIMARY KEY,
    circle_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    verified_at TEXT,
    verified_by TEXT
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_circle_contributions_circle ON circle_contributions(circle_id);
  CREATE INDEX IF NOT EXISTS idx_circle_contributions_user ON circle_contributions(user_id);
  CREATE INDEX IF NOT EXISTS idx_circle_contributions_status ON circle_contributions(status);

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_household ON users(household_id);
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
  "ALTER TABLE circle_settings ADD COLUMN emoji TEXT",
  "ALTER TABLE circle_settings ADD COLUMN frequency TEXT",
  "ALTER TABLE circle_settings ADD COLUMN per_member_amount INTEGER",
  "ALTER TABLE circle_settings ADD COLUMN contribution_type TEXT DEFAULT 'equal'",
  "ALTER TABLE circle_settings ADD COLUMN deadline TEXT",
  "ALTER TABLE households ADD COLUMN invite_code TEXT",
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
