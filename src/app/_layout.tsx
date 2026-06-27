import { useEffect } from 'react';
import { View, StatusBar } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
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
  const isDark     = scheme === 'dark';
  const colors     = isDark ? DarkColors : LightColors;
  const router     = useRouter();
  const segments   = useSegments();

  const { isInitialized, user, session, isLocked, hasOnboarded, hasSeenTour, markTourSeen, initialize } = useAuthStore();
  const { startTour } = useUIStore();

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
      await initialize();

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
      // First-time user — must complete onboarding
      if (!inOnboarding) {
        router.replace('/(onboarding)');
      }
    } else if (isLocked) {
      // Returning user — session exists but needs PIN/biometric to unlock.
      // Leave alone while still completing onboarding (PIN setup etc.)
      if (!inAuth && !inOnboarding) {
        router.replace('/(auth)');
      }
    } else if (hasSession) {
      // Authenticated + unlocked → go to app
      if (!inTabs && !inOnboarding) {
        router.replace('/(tabs)');
      }
      // Show tour on very first landing in tabs
      if (inTabs && !hasSeenTour) {
        const t = setTimeout(() => {
          startTour();
          void markTourSeen();
        }, 800);
        return () => clearTimeout(t);
      }
    } else {
      // Onboarding was completed but session expired (edge case) — re-auth
      if (!inAuth && !inOnboarding) {
        router.replace('/(auth)');
      }
    }
  }, [isInitialized, fontsLoaded, user, session, isLocked, hasOnboarded, hasSeenTour, segments]);

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
              />
              <Slot />
              <ToastContainer />
            </View>
          </BottomSheetModalProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
