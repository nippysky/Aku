import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { parseISO, addDays, startOfDay, setHours, setMinutes, setSeconds } from 'date-fns';
import type { Bill, Goal } from '../../types';
import { getNotifPrefs } from '../../store/notif-prefs.store';
import { formatAmount } from '../format';

// ─── Notification Handler ─────────────────────────────────────────────────────
// Controls how notifications appear when the app is foregrounded.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────

type BillReminderDays = 14 | 7 | 3 | 1 | 0;

interface BillReminderConfig {
  days: BillReminderDays;
  enabled: boolean;
}

// ─── NotificationService ──────────────────────────────────────────────────────

class NotificationService {
  // Suppress duplicate "physical device required" warnings in dev/simulator
  private _simulatorWarnShown = false;

  // ── Permissions ─────────────────────────────────────────────────────────

  async requestPermissions(): Promise<boolean> {
    // Local notifications work in simulators; skip the Device check so
    // the app functions correctly during development on emulators.
    if (!Device.isDevice && Platform.OS !== 'ios' && Platform.OS !== 'android') {
      console.warn('[NotificationService] Notifications not supported on this platform.');
      return false;
    }

    if (Platform.OS === 'android') {
      await this.setupNotificationChannels();
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    if (existingStatus === 'granted') {
      return true;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }

  // ── Android Channels ─────────────────────────────────────────────────────

  async setupNotificationChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;

    await Notifications.setNotificationChannelAsync('bills', {
      name: 'Bill Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      // No custom sound = OS plays the system default for HIGH importance
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync('goals', {
      name: 'Goal Milestones',
      importance: Notifications.AndroidImportance.DEFAULT,
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync('digest', {
      name: 'Daily Digest',
      importance: Notifications.AndroidImportance.DEFAULT,
      enableVibrate: false,
      showBadge: false,
    });

    // Pools channel removed with the Pools feature — delete on existing installs
    try { await Notifications.deleteNotificationChannelAsync('pools'); } catch { /* never existed */ }
  }

  // ── Bill Reminders ───────────────────────────────────────────────────────

  async scheduleBillReminders(bill: Bill, currencySymbol = '₦'): Promise<void> {
    // Cancel any existing reminders for this bill first
    await this.cancelBillReminders(bill.id);

    if (bill.isPaid) return;

    // Respect user notification preferences
    if (!getNotifPrefs().billReminders) return;

    const dueDate = parseISO(bill.dueDate);
    const today   = startOfDay(new Date());

    const reminderConfigs: BillReminderConfig[] = [
      { days: 14, enabled: bill.notify14 },
      { days: 7,  enabled: bill.notify7  },
      { days: 3,  enabled: bill.notify3  },
      { days: 1,  enabled: bill.notify1  },
      { days: 0,  enabled: bill.notifyDay },
    ];

    const amountFormatted = formatAmount(bill.amount, currencySymbol);

    for (const config of reminderConfigs) {
      if (!config.enabled) continue;

      // Compute the trigger date: dueDate minus N days, at 9:00 AM
      const triggerDate = setSeconds(
        setMinutes(
          setHours(
            config.days === 0 ? dueDate : addDays(dueDate, -config.days),
            9
          ),
          0
        ),
        0
      );

      // Skip dates in the past
      if (triggerDate <= today) continue;

      const title = config.days === 0
        ? 'Bill due today!'
        : `Bill due in ${config.days} day${config.days === 1 ? '' : 's'}`;

      const body = `${bill.name} — ${amountFormatted}`;

      const identifier = `bill_${bill.id}_${config.days}d`;

      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title,
          body,
          sound: true,
          badge: 1,
          data: {
            screen: 'bill',
            id:     bill.id,
            type:   'bill_reminder',
          },
          ...(Platform.OS === 'android' ? { channelId: 'bills' } : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
    }
  }

  async cancelBillReminders(billId: string): Promise<void> {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();

    const cancelIds = scheduled
      .filter((n) => n.identifier.startsWith(`bill_${billId}_`))
      .map((n) => n.identifier);

    await Promise.all(
      cancelIds.map((id) => Notifications.cancelScheduledNotificationAsync(id))
    );
  }

  // ── Goal Milestones ──────────────────────────────────────────────────────

  async scheduleGoalMilestone(goal: Goal, percent: number): Promise<void> {
    if (!getNotifPrefs().goalMilestones) return;
    const milestones = [25, 50, 75, 100] as const;
    if (!(milestones as readonly number[]).includes(percent)) return;

    const title = percent === 100
      ? 'Goal reached! 🎉'
      : `${percent}% there! 💪`;

    const body = `${goal.emoji ?? '🎯'} ${goal.name}`;

    await Notifications.scheduleNotificationAsync({
      identifier: `goal_milestone_${goal.id}_${percent}`,
      content: {
        title,
        body,
        sound: true,
        badge: 1,
        data: {
          screen: 'goal',
          id:     goal.id,
          type:   'goal_milestone',
        },
        ...(Platform.OS === 'android' ? { channelId: 'goals' } : {}),
      },
      trigger: null, // Fire immediately
    });
  }

  // ── Daily Digest ─────────────────────────────────────────────────────────

  async scheduleDailyDigest(hour: number = 8, minute: number = 0): Promise<void> {
    await this.cancelDailyDigest();

    await Notifications.scheduleNotificationAsync({
      identifier: 'aku_daily_digest',
      content: {
        title: 'Your Akù daily summary',
        body:  'Tap to see your financial snapshot for today.',
        sound: true,
        data: {
          screen: 'home',
          type:   'daily_digest',
        },
        ...(Platform.OS === 'android' ? { channelId: 'digest' } : {}),
      },
      trigger: {
        type:    Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  }

  async cancelDailyDigest(): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync('aku_daily_digest');
    } catch {
      // Notification may not exist yet — safe to ignore
    }
  }

  // ── Expo Push Token ──────────────────────────────────────────────────────

  /**
   * Obtains the Expo push token for this device.
   * Returns null if:
   *  - Running on a simulator / web (push not supported)
   *  - Permissions denied
   *  - projectId is missing from app config
   */
  async getExpoPushToken(): Promise<string | null> {
    if (!Device.isDevice) {
      // Physical device required for real push tokens.
      // In dev you can still test local notifications.
      if (!this._simulatorWarnShown) {
        console.warn('[NotificationService] Push tokens require a physical device.');
        this._simulatorWarnShown = true;
      }
      return null;
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('[NotificationService] EAS projectId not found in app config.');
      return null;
    }

    try {
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      return result.data;
    } catch (err) {
      console.error('[NotificationService] Failed to get push token:', err);
      return null;
    }
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  async cancelAll(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  async getBadgeCount(): Promise<number> {
    return Notifications.getBadgeCountAsync();
  }

  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const notificationService = new NotificationService();
