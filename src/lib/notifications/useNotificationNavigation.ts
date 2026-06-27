import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

// ─── Notification data payload shape ──────────────────────────────────────────

interface NotificationData {
  screen?: string;
  id?:     string;
  type?:   string;
}

// ─── useNotificationNavigation ────────────────────────────────────────────────
// Call this hook once in the root layout. It wires up two listeners:
//   1. Notification received while app is foregrounded (no-op for now, but
//      extensible — e.g. show an in-app banner).
//   2. User taps a notification (background → foreground, or already-foreground).
// It also handles the cold-start case: app was killed and opened via a tap.

export function useNotificationNavigation(): void {
  const router = useRouter();

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener     = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // ── Foreground: notification received while app is open ──────────────
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (_notification) => {
        // Future: display an in-app toast/banner here using the UIStore.
        // Keeping this intentionally minimal — the OS banner is already shown
        // because setNotificationHandler sets shouldShowBanner: true.
      },
    );

    // ── Background → foreground: user tapped a notification ──────────────
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as NotificationData;
        navigateFromData(router, data);
      },
    );

    // ── Cold start: app was closed and opened via a notification tap ──────
    // In Expo SDK 56, getLastNotificationResponse() is synchronous.
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse?.notification.request.content.data) {
      const data = lastResponse.notification.request.content.data as NotificationData;
      // Delay slightly to ensure the router is mounted before navigating
      setTimeout(() => navigateFromData(router, data, true), 500);
    }

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [router]);
}

// ─── Navigation helper ────────────────────────────────────────────────────────

function navigateFromData(
  router: ReturnType<typeof useRouter>,
  data: NotificationData,
  isColdStart: boolean = false,
): void {
  if (!data.screen) return;

  // Cold-start navigations are already delayed by the caller.
  // For bill deep-links on cold start, apply an extra delay so the
  // navigation stack has time to settle on the tabs screen first.
  const billDelay = isColdStart ? 300 : 0;

  switch (data.screen) {
    case 'bill':
      if (data.id) {
        setTimeout(
          () => router.push(`/bills/${data.id}` as const),
          billDelay,
        );
      }
      break;

    case 'budgets':
      router.push('/budgets' as const);
      break;

    case 'goal':
      if (data.id) {
        router.push(`/goals/${data.id}` as const);
      }
      break;

    case 'home':
    default:
      router.push('/(tabs)/index' as never);
      break;
  }
}
