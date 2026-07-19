/**
 * notif-prefs.store.ts
 *
 * Persists user notification preferences in SQLite app_state table.
 * NotificationService reads getNotifPrefs() before scheduling any alert.
 */

import { create } from 'zustand';
import { getSQLiteDatabase } from '../lib/database/client';
import { updateNotifPrefs } from '../lib/api-client';

// ─── Preference keys ──────────────────────────────────────────────────────────

const KEY_BILL_REMINDERS  = 'notif_bill_reminders';
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
  goalMilestones: true,
  // Master switch for the daily engagement stream (hourly nudges, 7pm digest,
  // bedtime check-in, weekly summary). Defaults ON — matches the server-side
  // worker default so client and backend always agree.
  dailyDigest:    true,
  isLoaded:       false,

  load: () => {
    const prefs: NotifPrefs = {
      billReminders:  appStateGet(KEY_BILL_REMINDERS,  true),
      goalMilestones: appStateGet(KEY_GOAL_MILESTONES, true),
      dailyDigest:    appStateGet(KEY_DAILY_DIGEST,    true),
    };
    set({ ...prefs, isLoaded: true });
  },

  set: (key, value) => {
    set((s) => ({ ...s, [key]: value }));
    const keyMap: Record<keyof NotifPrefs, string> = {
      billReminders:  KEY_BILL_REMINDERS,
      goalMilestones: KEY_GOAL_MILESTONES,
      dailyDigest:    KEY_DAILY_DIGEST,
    };
    appStateSet(keyMap[key], value);

    // Sync updated prefs to the server so the notification worker respects them.
    // Fire-and-forget — updateNotifPrefs catches its own errors.
    const current = useNotifPrefsStore.getState();
    updateNotifPrefs({
      billReminders:  key === 'billReminders'  ? value : current.billReminders,
      goalMilestones: key === 'goalMilestones' ? value : current.goalMilestones,
      dailyDigest:    key === 'dailyDigest'    ? value : current.dailyDigest,
    });
  },
}));

// ─── Exported getter (used by NotificationService synchronously) ──────────────

export function getNotifPrefs(): NotifPrefs {
  return useNotifPrefsStore.getState();
}
