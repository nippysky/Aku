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
 *  goal_milestone   → /goals/[id]          (goal detail)
 *  daily_digest     → /(tabs)/expenses     (log today's spending)
 *  daily_reminder   → /(tabs)/expenses     (server push → log spending)
 *  weekly_summary   → /analytics           (financial overview)
 *  hourly_reminder  → /(tabs)/expenses     (log expenses / income)
 *  bedtime_reminder → /(tabs)/expenses     (final log check before sleep)
 *  default          → /(tabs)             (home)
 *
 * Safety: every href below is validated against the app's real route table.
 * `/(tabs)/index` is NOT a valid href — Expo Router collapses an index route
 * to its group's own path (`/(tabs)`), so anything that used to push
 * `/(tabs)/index` landed on "Unmatched Route" (iOS) / a frozen splash-colored
 * screen (Android). Any resolution failure below falls back to `/(tabs)`.
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../../store/auth.store';

const HOME_HREF = '/(tabs)';

// ─── Notification data payload (shared with server worker) ────────────────────

export interface NotificationData {
  type?:     string;   // 'bill_reminder' | 'goal_milestone' | 'hourly_reminder' | …
  screen?:   string;   // legacy / override: 'bill' | 'goal' | 'home'
  id?:       string;   // entity ID — bill/goal primary key
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
      // The router/nav stack + the root layout's auth redirect aren't settled
      // yet at this point. Wait for auth init (fonts + DB + session resolve)
      // rather than guessing a fixed delay, then give the auth-guard's
      // router.replace() a short buffer to land before we push on top of it.
      // Fails open after a bounded wait so we never hang forever.
      waitUntilAuthReady().then(() => {
        setTimeout(() => navigate(router, data, true), 400);
      });
    }

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router]);
}

// ─── Readiness gate ─────────────────────────────────────────────────────────

/**
 * Waits for auth init (fonts + DB + session resolution) to complete before
 * the cold-start deep link fires, so it never races the root layout's own
 * router.replace() redirect. Fails open after MAX_WAIT_MS so a stuck init
 * never permanently swallows the notification tap.
 */
function waitUntilAuthReady(): Promise<void> {
  const POLL_MS    = 150;
  const MAX_WAIT_MS = 4000;

  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const { isInitialized } = useAuthStore.getState();
      if (isInitialized || Date.now() - start >= MAX_WAIT_MS) {
        resolve();
        return;
      }
      setTimeout(check, POLL_MS);
    };
    check();
  });
}

// ─── Navigation resolver ──────────────────────────────────────────────────────

/** Pushes a href, and if that somehow throws, always falls back to home. */
function safePush(router: ReturnType<typeof useRouter>, href: string): void {
  try {
    router.push(href as never);
  } catch {
    try {
      router.push(HOME_HREF as never);
    } catch {
      // Nothing more we can safely do — avoid crashing the app over a
      // notification tap.
    }
  }
}

function navigate(
  router: ReturnType<typeof useRouter>,
  data: NotificationData,
  isColdStart = false,
): void {
  // On cold start, delay entity-level navigations a bit more to let the tabs
  // stack mount before we try to push a modal/detail screen on top.
  const entityDelay = isColdStart ? 400 : 0;

  let resolved: ResolvedRoute;
  try {
    resolved = resolveRoute(data) ?? { href: HOME_HREF, type: 'tab' };
  } catch {
    resolved = { href: HOME_HREF, type: 'tab' };
  }

  if (resolved.type === 'tab') {
    // Navigate to a tab — safe to do immediately (tabs always exist)
    safePush(router, resolved.href);
    return;
  }

  // Navigate to a detail screen — needs the stack to be ready
  setTimeout(() => safePush(router, resolved.href), entityDelay);
}

interface ResolvedRoute {
  href: string;
  type: 'tab' | 'detail';
}

/**
 * Map a notification data payload to an Expo Router href.
 *
 * Priority order:
 *  1. Explicit `screen` field — the sender says exactly where to land
 *     (server messages reuse one `type` across different target screens,
 *      so `screen` is the most precise signal)
 *  2. `type` mapping (fallback for payloads without a screen)
 *  3. Home tab fallback
 */
function resolveRoute(data: NotificationData): ResolvedRoute | null {
  const { type, screen, id } = data;

  // ── Screen-based routing (preferred — sender-specified target) ──────────

  if (screen) {
    switch (screen) {
      case 'bill':
        if (id) return { href: `/bills/${id}`, type: 'detail' };
        return { href: '/(tabs)/bills', type: 'tab' };

      case 'bills':
        return { href: '/(tabs)/bills', type: 'tab' };

      case 'goal':
        if (id) return { href: `/goals/${id}`, type: 'detail' };
        return { href: '/(tabs)/goals', type: 'tab' };

      case 'goals':
        return { href: '/(tabs)/goals', type: 'tab' };

      case 'expense':
      case 'expenses':
      case 'income':
      case 'finance':
        return { href: '/(tabs)/expenses', type: 'tab' };

      case 'analytics':
        return { href: '/analytics', type: 'detail' };

      case 'home':
        return { href: HOME_HREF, type: 'tab' };

      // Unknown screen value — fall through to type-based routing below
    }
  }

  // ── Type-based routing (fallback) ───────────────────────────────────────

  switch (type) {
    // Bill due reminders — go directly to the bill card
    case 'bill_reminder':
    case 'bill-upcoming':
    case 'bill-due-today':
    case 'bill-overdue':
      if (id) return { href: `/bills/${id}`, type: 'detail' };
      return { href: '/(tabs)/bills', type: 'tab' };

    // Goal milestones — go to the goal detail
    case 'goal_milestone':
    case 'goal-milestone':
    case 'goal-completed':
      if (id) return { href: `/goals/${id}`, type: 'detail' };
      return { href: '/(tabs)/goals', type: 'tab' };

    // Server push: daily / hourly spend reminders
    // Contextual: open the Finance tab so user can log expenses & income
    case 'daily_reminder':
    case 'daily_digest':
    case 'hourly_reminder':
    case 'bedtime_reminder':
      return { href: '/(tabs)/expenses', type: 'tab' };

    // Server push: weekly summary
    // Open Analytics, which shows the weekly/monthly financial overview
    case 'weekly_summary':
      return { href: '/analytics', type: 'detail' };

  }

  // ── Default: home ────────────────────────────────────────────────────────
  return { href: HOME_HREF, type: 'tab' };
}
