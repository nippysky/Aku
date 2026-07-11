/**
 * useNotificationNavigation — smart notification deep-link router.
 *
 * Handles three tap scenarios:
 *  1. App foregrounded — notification arrives while user is in the app
 *  2. App backgrounded — user taps OS banner, app comes to foreground
 *  3. Cold start — app was killed, user tapped notification in tray
 *
 * Each notification type maps to the most contextually relevant screen:
 *
 *  bill_reminder    → /bills/[id]          (bill detail)
 *  budget_alert     → /budgets/[id]        (budget detail)
 *  goal_milestone   → /goals/[id]          (goal detail)
 *  daily_digest     → /(tabs)/expenses     (log today's spending)
 *  daily_reminder   → /(tabs)/expenses     (server push → log spending)
 *  weekly_summary   → /(tabs)/index        (home — financial overview)
 *  household_invite → /pool/join         (join pool))
 *  default          → /(tabs)/index        (home)
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

// ─── Notification data payload (shared with server worker) ────────────────────

export interface NotificationData {
  type?:     string;   // 'bill_reminder' | 'budget_alert' | 'goal_milestone' | 'circle_member_joined' | …
  screen?:   string;   // legacy / override: 'bill' | 'budgets' | 'goal' | 'circle' | 'home'
  id?:       string;   // entity ID — bill/budget/goal primary key
  circleId?: string;   // circle ID — for circle_member_joined + circle_event notifications
  action?:   string;   // optional action hint ('log', 'review', 'pay')
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotificationNavigation(): void {
  const router = useRouter();

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener     = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // 1. Foreground — notification arrived while app is open.
    //    The OS banner is shown automatically (setNotificationHandler returns
    //    shouldShowBanner: true). We don't navigate — the user is already in the app.
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (_notification) => {
        // Future: show an in-app toast with UIStore here.
      },
    );

    // 2. Background → foreground — user tapped the OS notification banner.
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as NotificationData;
        navigate(router, data);
      },
    );

    // 3. Cold start — app was killed; user tapped notification in the tray.
    //    expo-notifications stores the last tapped notification synchronously.
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification.request.content.data) {
      const data = last.notification.request.content.data as NotificationData;
      // Delay: the router and nav stack aren't mounted yet at this point.
      // We need to wait for: fonts + auth init + tab stack settle.
      setTimeout(() => navigate(router, data, true), 800);
    }

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router]);
}

// ─── Navigation resolver ──────────────────────────────────────────────────────

function navigate(
  router: ReturnType<typeof useRouter>,
  data: NotificationData,
  isColdStart = false,
): void {
  // On cold start, delay entity-level navigations a bit more to let the tabs
  // stack mount before we try to push a modal/detail screen on top.
  const entityDelay = isColdStart ? 400 : 0;

  const resolved = resolveRoute(data);

  if (!resolved) return;

  if (resolved.type === 'tab') {
    // Navigate to a tab — safe to do immediately (tabs always exist)
    router.push(resolved.href as never);
    return;
  }

  // Navigate to a detail screen — needs the stack to be ready
  setTimeout(() => router.push(resolved.href as never), entityDelay);
}

interface ResolvedRoute {
  href: string;
  type: 'tab' | 'detail';
}

/**
 * Map a notification data payload to an Expo Router href.
 *
 * Priority order:
 *  1. Specific `type` mapping (most precise)
 *  2. Legacy `screen` field (backwards-compat with older notification payloads)
 *  3. Home tab fallback
 */
function resolveRoute(data: NotificationData): ResolvedRoute | null {
  const { type, screen, id, circleId } = data;

  // ── Type-based routing (preferred) ──────────────────────────────────────

  switch (type) {
    // Bill due reminders — go directly to the bill card
    case 'bill_reminder':
    case 'bill-upcoming':
    case 'bill-due-today':
    case 'bill-overdue':
      if (id) return { href: `/bills/${id}`, type: 'detail' };
      return { href: '/(tabs)/bills', type: 'tab' };

    // Budget alerts — go to the specific budget detail
    case 'budget_alert':
    case 'budget-near-limit':
    case 'budget-exceeded':
      if (id) return { href: `/budgets/${id}`, type: 'detail' };
      return { href: '/budgets', type: 'tab' };

    // Goal milestones — go to the goal detail
    case 'goal_milestone':
    case 'goal-milestone':
    case 'goal-completed':
      if (id) return { href: `/goals/${id}`, type: 'detail' };
      return { href: '/(tabs)/goals', type: 'tab' };

    // Server push: daily spend reminder
    // Contextual: open the Expenses tab so user can log what they spent
    case 'daily_reminder':
    case 'daily_digest':
      return { href: '/(tabs)/expenses', type: 'tab' };

    // Server push: weekly summary
    // Open the home dashboard which shows the weekly financial overview
    case 'weekly_summary':
      return { href: '/(tabs)/index', type: 'tab' };

    // Circle/household invite
    case 'household_invite':
    case 'circle_invite':
      return { href: '/pool/join', type: 'detail' };

    // New member joined a circle — navigate to that specific circle
    case 'circle_member_joined':
      if (circleId) return { href: `/pool/${circleId}`, type: 'detail' };
      return { href: '/(tabs)/index', type: 'tab' };

    // Contribution logged/verified in a circle
    case 'circle_event':
      if (circleId) return { href: `/pool/${circleId}`, type: 'detail' };
      return { href: '/(tabs)/index', type: 'tab' };
  }

  // ── Legacy screen-field routing (backwards compatibility) ────────────────

  if (screen) {
    switch (screen) {
      case 'bill':
        if (id) return { href: `/bills/${id}`, type: 'detail' };
        return { href: '/(tabs)/bills', type: 'tab' };

      case 'bills':
        return { href: '/(tabs)/bills', type: 'tab' };

      case 'budget':
        if (id) return { href: `/budgets/${id}`, type: 'detail' };
        return { href: '/budgets', type: 'tab' };

      case 'budgets':
        return { href: '/budgets', type: 'tab' };

      case 'goal':
        if (id) return { href: `/goals/${id}`, type: 'detail' };
        return { href: '/(tabs)/goals', type: 'tab' };

      case 'goals':
        return { href: '/(tabs)/goals', type: 'tab' };

      case 'expense':
      case 'expenses':
        return { href: '/(tabs)/expenses', type: 'tab' };

      case 'notifications':
        return { href: '/notifications', type: 'detail' };

      case 'circle':
        if (circleId) return { href: `/pool/${circleId}`, type: 'detail' };
        return { href: '/(tabs)/index', type: 'tab' };

      case 'home':
      default:
        return { href: '/(tabs)/index', type: 'tab' };
    }
  }

  // ── Default: home ────────────────────────────────────────────────────────
  return { href: '/(tabs)/index', type: 'tab' };
}
