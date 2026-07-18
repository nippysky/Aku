import { useEffect, useRef } from 'react';
import { View, StatusBar, Platform, AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as ExpoNotifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useColorScheme } from 'react-native';
import { initializeDatabase } from '../lib/database/client';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import { useNotifPrefsStore } from '../store/notif-prefs.store';
import { useRecurringExpensesStore } from '../store/recurring-expenses.store';
import { useRecurringIncomeStore } from '../store/recurring-income.store';
import { useNotifHistoryStore } from '../store/notif-history.store';
import { ToastContainer } from '../components/ui/ToastContainer';
import { AppLoader } from '../components/ui/AppLoader';
import { LightColors, DarkColors } from '../theme/colors';
import { notificationService, useNotificationNavigation } from '../lib/notifications';
import { registerPushToken } from '../lib/api-client';
import { useSyncStore } from '../store/sync.store';
import { wsClient } from '../lib/sync/ws-client';
import * as Device from 'expo-device';

// Prevent auto-hide while fonts + auth load
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme     = useColorScheme();
  const router     = useRouter();
  const segments   = useSegments();

  const { isInitialized, user, session, isLocked, hasOnboarded, initialize } = useAuthStore();
  const { themeMode, loadSettings } = useUIStore();
  const loadNotifPrefs = useNotifPrefsStore((s) => s.load);

  // Track whether we've registered the push token for this session
  const pushTokenRegistered = useRef(false);

  // Track the last calendar day recurring items were processed.
  // Used by the foreground AppState handler to catch midnight crossovers
  // when the app stays open all night without locking.
  const lastRecurringDateRef = useRef<string>('');

  // Resolve dark mode: respect in-app preference, then fall back to system
  const isDark =
    themeMode === 'dark'  ? true  :
    themeMode === 'light' ? false :
    scheme === 'dark';

  const colors = isDark ? DarkColors : LightColors;

  // Wire up notification deep-link navigation
  useNotificationNavigation();

  const [fontsLoaded] = useFonts({
    // Fraunces — display serif
    Fraunces_300Light:       require('../../assets/fonts/Fraunces_300Light.ttf'),
    Fraunces_400Regular:     require('../../assets/fonts/Fraunces_400Regular.ttf'),
    Fraunces_300Light_Italic:require('../../assets/fonts/Fraunces_300Light_Italic.ttf'),
    // Plus Jakarta Sans — body
    PlusJakartaSans_300Light:    require('../../assets/fonts/PlusJakartaSans_300Light.ttf'),
    PlusJakartaSans_400Regular:  require('../../assets/fonts/PlusJakartaSans_400Regular.ttf'),
    PlusJakartaSans_500Medium:   require('../../assets/fonts/PlusJakartaSans_500Medium.ttf'),
    PlusJakartaSans_600SemiBold: require('../../assets/fonts/PlusJakartaSans_600SemiBold.ttf'),
    PlusJakartaSans_700Bold:     require('../../assets/fonts/PlusJakartaSans_700Bold.ttf'),
  });

  // ── Database + Auth + Notifications init ─────────────────────────────
  useEffect(() => {
    (async () => {
      await initializeDatabase();
      // Load persisted theme + currency before auth so the correct theme
      // is applied from the very first render after cold start.
      await loadSettings();
      // Load notification preferences (SQLite app_state — synchronous after DB init)
      loadNotifPrefs();
      await initialize();

      // Request notification permissions, set up Android channels, and
      // schedule the repeating daily digest. All three are safe to call
      // on every cold start — they are idempotent.
      const granted = await notificationService.requestPermissions();
      if (granted) {
        await notificationService.setupNotificationChannels();
        // Only schedule daily digest if user has opted in (defaults to false)
        const { dailyDigest } = useNotifPrefsStore.getState();
        if (dailyDigest) {
          await notificationService.scheduleDailyDigest(8, 0);
        } else {
          await notificationService.cancelDailyDigest();
        }
      }
    })();
  }, []);

  // ── Hide splash when ready ───────────────────────────────────────────
  useEffect(() => {
    if (fontsLoaded && isInitialized) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isInitialized]);

  // ── Recurring expenses: auto-log overdue items on unlock ────────────
  const prevLockedRef = useRef(true);
  useEffect(() => {
    const wasLocked = prevLockedRef.current;
    prevLockedRef.current = isLocked;

    // Fired when transitioning locked → unlocked with a valid user
    if (wasLocked && !isLocked && user) {
      const today = new Date().toISOString().slice(0, 10);
      lastRecurringDateRef.current = today;

      const { processOverdue: processExpenses } = useRecurringExpensesStore.getState();
      const { processOverdue: processIncome }   = useRecurringIncomeStore.getState();

      Promise.all([processExpenses(user.id), processIncome(user.id)])
        .then(([expLogged, incLogged]) => {
          const allLogged = [...expLogged, ...incLogged];
          if (allLogged.length > 0) {
            const { showToast } = useUIStore.getState();
            const names = allLogged.map((l) => l.name).join(', ');
            showToast('info', `Auto-logged: ${names}`);
          }
        })
        .catch(() => {});
    }
  }, [isLocked, user]);

  // ── Foreground: clear badge + pull latest data from server ──────────
  // When the app comes to foreground (user switches from device A to device B,
  // or returns from background) we pull any changes made on other devices.
  // bumpSyncVersion() inside pullAndMerge notifies tab screens to reload silently.
  // Re-lock after 5+ minutes in the background (device-auth on return).
  // Quick app switches stay seamless; long absences require an unlock.
  const backgroundedAtRef = useRef<number | null>(null);
  const RELOCK_AFTER_MS = 5 * 60 * 1000;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        backgroundedAtRef.current = Date.now();
      }
      if (nextState === 'active') {
        // ── Re-lock check ──
        const away = backgroundedAtRef.current
          ? Date.now() - backgroundedAtRef.current : 0;
        backgroundedAtRef.current = null;
        const { biometric, hasOnboarded, lock } = useAuthStore.getState();
        if (away >= RELOCK_AFTER_MS && user && hasOnboarded && biometric.enabled) {
          lock();
          return; // locked — skip refresh work until unlocked
        }

        // Clear the notification badge
        import('expo-notifications').then(({ setBadgeCountAsync }) => {
          setBadgeCountAsync(0).catch(() => {});
        });

        // Midnight crossover: if the date changed since last recurring-process run,
        // run processOverdue again so items due today get logged even if the app
        // stayed open all night (no unlock transition).
        const today = new Date().toISOString().slice(0, 10);
        if (user && !isLocked && lastRecurringDateRef.current && lastRecurringDateRef.current < today) {
          lastRecurringDateRef.current = today;
          const { processOverdue: processExpenses } = useRecurringExpensesStore.getState();
          const { processOverdue: processIncome }   = useRecurringIncomeStore.getState();
          Promise.all([processExpenses(user.id), processIncome(user.id)])
            .then(([expLogged, incLogged]) => {
              const allLogged = [...expLogged, ...incLogged];
              if (allLogged.length > 0) {
                const { showToast } = useUIStore.getState();
                const names = allLogged.map((l) => l.name).join(', ');
                showToast('info', `Auto-logged: ${names}`);
              }
            })
            .catch(() => {});
        }

        // Pull delta from server — only fires when DEK is loaded (user unlocked)
        const { dek, lastSyncAt } = useSyncStore.getState();
        if (dek && user && !isLocked) {
          import('../lib/sync/engine').then(({ pullAndMerge }) => {
            pullAndMerge(lastSyncAt).catch(() => {});
          });
        }
      }
    });
    return () => sub.remove();
  }, [user, isLocked]);

  // ── WebSocket — persistent real-time sync connection ────────────────
  // Replaces the 30-second polling interval. The server pushes a 'sync'
  // nudge to all connected devices whenever any device writes new data.
  // AppState foreground trigger above acts as a fallback safety net.
  useEffect(() => {
    if (user && session && !isLocked) {
      wsClient.connect();
    } else {
      wsClient.disconnect();
    }
  }, [user, session, isLocked]);

  // ── Push token registration ──────────────────────────────────────────
  // Register after the user is authenticated and unlocked, once per session.
  // Skip entirely on simulators — push tokens require a physical device.
  useEffect(() => {
    if (!Device.isDevice) return;
    if (!session || !user || isLocked || pushTokenRegistered.current) return;
    pushTokenRegistered.current = true;

    (async () => {
      try {
        const token = await notificationService.getExpoPushToken();
        if (!token) return;
        const platform: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios';
        await registerPushToken(token, platform);
      } catch (err) {
        // Non-critical — push notifications are additive, not required
        console.warn('[layout] Push token registration failed:', err);
      }
    })();
  }, [session, user, isLocked]);

  // Reset flag on sign-out so the next login re-registers
  useEffect(() => {
    if (!session) pushTokenRegistered.current = false;
  }, [session]);

  // ── Load notification history when authenticated + unlocked ─────────
  useEffect(() => {
    if (user && !isLocked) {
      useNotifHistoryStore.getState().load(user.id);
    }
  }, [user, isLocked]);

  // ── Persist received notifications to history ────────────────────────
  // Track identifiers already persisted to prevent duplicates when the user
  // taps a foreground banner (which fires both received + response listeners).
  const savedNotifIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const persistNotif = (
      identifier: string,
      title: string | null | undefined,
      body:  string | null | undefined,
      data:  Record<string, unknown> | null | undefined,
    ) => {
      if (!title) return;
      if (savedNotifIds.current.has(identifier)) return; // deduplicate
      savedNotifIds.current.add(identifier);
      useNotifHistoryStore.getState().add({
        userId:      user.id,
        type:        (data?.type as string) ?? 'general',
        title,
        body:        body ?? '',
        referenceId: (data?.id as string) ?? null,
      });
    };

    // Foreground: app is open when notification arrives
    const foregroundSub = ExpoNotifications.addNotificationReceivedListener(
      (notif) => {
        const { title, body, data } = notif.request.content;
        persistNotif(notif.request.identifier, title, body, data as Record<string, unknown>);
      },
    );

    // Background / quit-state: user taps notification to open app
    const responseSub = ExpoNotifications.addNotificationResponseReceivedListener(
      (response) => {
        const { title, body, data } = response.notification.request.content;
        persistNotif(
          response.notification.request.identifier,
          title,
          body,
          data as Record<string, unknown>,
        );
      },
    );

    return () => {
      foregroundSub.remove();
      responseSub.remove();
    };
  }, [user]);

  // ── Navigation guard ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized || !fontsLoaded) return;

    const inAuth        = segments[0] === '(auth)';
    const inOnboarding  = segments[0] === '(onboarding)';
    const inTabs        = segments[0] === '(tabs)';
    // sign-in.tsx lives at root level — allow it so returning users on a new
    // device can authenticate without being bounced back to onboarding.
    const inSignIn      = segments[0] === 'sign-in';
    // auth-callback.tsx handles its own routing after processing the magic-link
    // deep link. The guard must never redirect mid-callback or the token is lost
    // and the user gets bounced back to the welcome screen.
    const inAuthCallback = segments[0] === 'auth-callback';

    if (inAuthCallback) return;

    const hasSession = !!session && !!user;

    if (!hasOnboarded) {
      // First-time user — force onboarding.
      // Exception: /sign-in is whitelisted so returning users on a new device
      // can sign in via magic link without looping back to the welcome screen.
      if (!inOnboarding && !inSignIn) router.replace('/(onboarding)');

    } else if (isLocked) {
      // Locked — force PIN/biometric auth
      if (!inAuth) router.replace('/(auth)');

    } else if (hasSession) {
      // Authenticated & unlocked — allow anywhere in the app.
      // Only push back to tabs if we're stuck in an auth/onboarding shell.
      if (inAuth || inOnboarding) router.replace('/(tabs)');

    } else {
      // Onboarding complete but no active session — force re-auth
      if (!inAuth && !inOnboarding) router.replace('/(auth)');
    }
  }, [isInitialized, fontsLoaded, user, session, isLocked, hasOnboarded, segments]);

  // Fonts or auth not ready yet — native splash is still visible at this point,
  // but return the branded loader as a safety fallback for edge-case flicker.
  if (!fontsLoaded || !isInitialized) {
    return <AppLoader />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <BottomSheetModalProvider>
            <View style={{ flex: 1, backgroundColor: colors.background }}>
              <StatusBar
                barStyle={isDark ? 'light-content' : 'dark-content'}
                backgroundColor={colors.background}
                translucent={false}
              />
              <Stack screenOptions={{ headerShown: false }} />
              <ToastContainer />
              {/* Status bar shield — only on tab screens where scrollable content can
                  bleed behind the status bar. For auth/onboarding/standalone screens
                  we use transparent so their own dark backgrounds show through. */}
              <StatusBarShield
                backgroundColor={segments[0] === '(tabs)' ? colors.background : 'transparent'}
              />
            </View>
          </BottomSheetModalProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ─── StatusBarShield ──────────────────────────────────────────────────────────
// Must be a child component so useSafeAreaInsets runs inside SafeAreaProvider.

function StatusBarShield({ backgroundColor }: { backgroundColor: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position:        'absolute',
        top:             0,
        left:            0,
        right:           0,
        height:          insets.top,
        backgroundColor,
        zIndex:          999,
        pointerEvents:   'none' as const,
      }}
    />
  );
}
