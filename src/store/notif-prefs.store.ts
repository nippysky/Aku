/**
 * notif-prefs.store.ts
 *
 * All notification types (bill reminders, goal milestones, daily digest /
 * hourly engagement) are always enabled by default — there is no user-facing
 * toggle. Akù already sends aggressive, well-targeted push, so the settings
 * screen was removed; this store exists only so the small number of call
 * sites that ask "is this notification type on?" keep working unchanged.
 */

export interface NotifPrefs {
  billReminders:  boolean;
  goalMilestones: boolean;
  dailyDigest:    boolean;
}

const ALWAYS_ON: NotifPrefs = {
  billReminders:  true,
  goalMilestones: true,
  dailyDigest:    true,
};

// ─── Exported getter (used synchronously by NotificationService + _layout) ────

export function getNotifPrefs(): NotifPrefs {
  return ALWAYS_ON;
}
