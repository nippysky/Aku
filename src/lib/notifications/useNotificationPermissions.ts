import { useState, useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';

// ─── useNotificationPermissions ───────────────────────────────────────────────
// Use this hook on the profile/settings screen to display the current
// notification permission status and let users toggle it on.
//
// Note: On iOS, once a user denies permissions the OS will not prompt again —
// the `request()` call will return false and you should direct the user to
// Settings. On Android 13+ the system will show a system prompt on first call.

interface NotificationPermissionsResult {
  /** Whether notification permissions are currently granted. */
  granted: boolean;
  /** True while the initial permission check is in progress. */
  loading: boolean;
  /** Re-check the current permission status (e.g. user returned from Settings). */
  check:   () => Promise<void>;
  /** Request permissions from the user. Returns true if granted. */
  request: () => Promise<boolean>;
}

export function useNotificationPermissions(): NotificationPermissionsResult {
  const [granted, setGranted] = useState(false);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setGranted(status === 'granted');
    } finally {
      setLoading(false);
    }
  }, []);

  const request = useCallback(async (): Promise<boolean> => {
    const { status } = await Notifications.requestPermissionsAsync();
    const isGranted = status === 'granted';
    setGranted(isGranted);
    return isGranted;
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return { granted, loading, check, request };
}
