import { useEffect } from 'react';
import { View, StatusBar } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useColorScheme } from 'react-native';
import { initializeDatabase } from '../lib/database/client';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import { ToastContainer } from '../components/ui/ToastContainer';
import { LightColors, DarkColors } from '../theme/colors';
import { notificationService, useNotificationNavigation } from '../lib/notifications';

// Prevent auto-hide while fonts + auth load
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme     = useColorScheme();
  const router     = useRouter();
  const segments   = useSegments();

  const { isInitialized, user, session, isLocked, hasOnboarded, initialize } = useAuthStore();
  const { fetchExchangeRates, themeMode, loadSettings } = useUIStore();

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
      await initialize();

      // Pre-fetch exchange rates so FX conversion is ready immediately.
      // Safe to call unconditionally — the store caches for 1 h and
      // silently no-ops on network failure.
      void fetchExchangeRates();

      // Request notification permissions, set up Android channels, and
      // schedule the repeating daily digest. All three are safe to call
      // on every cold start — they are idempotent.
      const granted = await notificationService.requestPermissions();
      if (granted) {
        await notificationService.setupNotificationChannels();
        await notificationService.scheduleDailyDigest(8, 0);
      }
    })();
  }, []);

  // ── Hide splash when ready ───────────────────────────────────────────
  useEffect(() => {
    if (fontsLoaded && isInitialized) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isInitialized]);

  // ── Navigation guard ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isInitialized || !fontsLoaded) return;

    const inAuth       = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inTabs       = segments[0] === '(tabs)';

    const hasSession = !!session && !!user;

    if (!hasOnboarded) {
      // First-time user — force onboarding
      if (!inOnboarding) router.replace('/(onboarding)');

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

  if (!fontsLoaded || !isInitialized) {
    // Native splash screen handles this state
    return null;
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
