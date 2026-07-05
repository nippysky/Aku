/**
 * notif-prefs.store.ts
 *
 * Persists user notification preferences in SQLite app_state table.
 * NotificationService reads getNotifPrefs() before scheduling any alert.
 */

import { create } from 'zustand';
import { getSQLiteDatabase } from '../lib/database/client';

// ─── Preference keys ──────────────────────────────────────────────────────────

const KEY_BILL_REMINDERS  = 'notif_bill_reminders';
const KEY_BUDGET_ALERTS   = 'notif_budget_alerts';
const KEY_GOAL_MILESTONES = 'notif_goal_milestones';
const KEY_DAILY_DIGEST    = 'notif_daily_digest';

// ─── SQLite helpers ───────────────────────────────────────────────────────────

function appStateGet(key: string, fallback: boolean): boolean {
  try {
    const sqlite = getSQLiteDatabase();
    const row = sqlite.getFirstSync<{ value: string }>(
      'SELECT value FROM app_state WHERE key = ?', [key],
    );
    if (row == null) return fallback;
    return row.value === '1';
  } catch { return fallback; }
}

function appStateSet(key: string, value: boolean): void {
  try {
    const sqlite = getSQLiteDatabase();
    sqlite.runSync(
      'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value ? '1' : '0'],
    );
  } catch { /* ignore — prefs just won't persist on error */ }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotifPrefs {
  billReminders:  boolean;
  budgetAlerts:   boolean;
  goalMilestones: boolean;
  dailyDigest:    boolean;
}

interface NotifPrefsState extends NotifPrefs {
  isLoaded: boolean;
  load:     () => void;
  set:      <K extends keyof NotifPrefs>(key: K, value: boolean) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useNotifPrefsStore = create<NotifPrefsState>()((set, get) => ({
  billReminders:  true,
  budgetAlerts:   true,
  goalMilestones: true,
  dailyDigest:    false,
  isLoaded:       false,

  load: () => {
    const prefs: NotifPrefs = {
      billReminders:  appStateGet(KEY_BILL_REMINDERS,  true),
      budgetAlerts:   appStateGet(KEY_BUDGET_ALERTS,   true),
      goalMilestones: appStateGet(KEY_GOAL_MILESTONES, true),
      dailyDigest:    appStateGet(KEY_DAILY_DIGEST,    false),
    };
    set({ ...prefs, isLoaded: true });
  },

  set: (key, value) => {
    set((s) => ({ ...s, [key]: value }));
    const keyMap: Record<keyof NotifPrefs, string> = {
      billReminders:  KEY_BILL_REMINDERS,
      budgetAlerts:   KEY_BUDGET_ALERTS,
      goalMilestones: KEY_GOAL_MILESTONES,
      dailyDigest:    KEY_DAILY_DIGEST,
    };
    appStateSet(keyMap[key], value);
  },
}));

// ─── Exported getter (used by NotificationService synchronously) ──────────────

export function getNotifPrefs(): NotifPrefs {
  return useNotifPrefsStore.getState();
}
