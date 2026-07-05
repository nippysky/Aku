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

  // ── Clear badge when app comes to foreground ────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Silently clear the red notification badge
        import('expo-notifications').then(({ setBadgeCountAsync }) => {
          setBadgeCountAsync(0).catch(() => {});
        });
      }
    });
    return () => sub.remove();
  }, []);

  // ── Push token registration ──────────────────────────────────────────
  // Register after the user is authenticated and unlocked, once per session.
  useEffect(() => {
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
        referenceId: (data?.id as string) ?? (data?.circleId as string) ?? null,
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

    const inAuth       = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inTabs       = segments[0] === '(tabs)';
    // sign-in.tsx lives at root level — allow it so returning users on a new
    // device can authenticate without being bounced back to onboarding.
    const inSignIn     = segments[0] === 'sign-in';

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
