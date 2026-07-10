import React, { useCallback, useRef, useState } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PinPad, OnboardingHeader, LoadingScreen } from '../../components/ui';
import type { PinPadRef } from '../../components/ui';
import { useAuthStore } from '../../store';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Spacing } from '../../theme/spacing';

// ─── Screen ────────────────────────────────────────────────────────────────

type PinPhase = 'create' | 'confirm' | 'syncing';

export default function PinSetupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ returning?: string }>();

  // returning=1 → user has an existing account on another device
  const isReturning = params.returning === '1';

  const { setupPin, completeOnboardingAndUnlock } = useAuthStore();

  const [phase, setPhase]         = useState<PinPhase>('create');
  const [firstPin, setFirstPin]   = useState('');
  const [errorMsg, setErrorMsg]   = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const padRef = useRef<PinPadRef>(null);

  function triggerShake() {
    padRef.current?.triggerError();
  }

  const handleCreateComplete = useCallback((pin: string) => {
    setFirstPin(pin);
    setErrorMsg('');
    setTimeout(() => setPhase('confirm'), 300);
  }, []);

  const handleConfirmComplete = useCallback(
    async (pin: string) => {
      if (pin !== firstPin) {
        setErrorMsg("Passcodes don't match. Try again.");
        triggerShake();
        setTimeout(() => setPhase('create'), 600);
        setTimeout(() => setFirstPin(''), 700);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMsg('');
        await setupPin(pin);
        // Atomic: sets hasOnboarded:true + isLocked:false in one set() call.
        // Two separate calls cause the nav guard to see the intermediate state
        // hasOnboarded:true + isLocked:true, which triggers a stray /(auth) redirect on Android.
        await completeOnboardingAndUnlock();

        if (isReturning) {
          // Returning user — skip onboarding, show syncing state, pull data
          setPhase('syncing');
          try {
            const { fullSync } = await import('../../lib/sync/engine');
            await fullSync();
          } catch {
            // Non-fatal — user can still use the app with whatever synced
          }
          router.replace('/(tabs)');
        } else {
          // New user — continue to biometric setup
          router.replace('/(onboarding)/biometric');
        }
      } catch (err) {
        console.error('[pin-setup] handleConfirmComplete error:', err);
        setErrorMsg('Something went wrong. Please try again.');
        triggerShake();
        setIsLoading(false);
      }
    },
    [firstPin, setupPin, completeOnboardingAndUnlock, isReturning, router],
  );

  // Copy — different for returning vs new user
  const title = isReturning
    ? (phase === 'create' ? 'Set your Akù passcode' : 'Confirm your passcode')
    : (phase === 'create' ? 'Create your passcode'  : 'Confirm your passcode');

  const subtitle = isReturning
    ? (phase === 'create'
        ? 'Use the same passcode as before to restore your records.'
        : 'Enter the same 6 digits again to confirm.')
    : (phase === 'create'
        ? "6 digits. You'll use this to access Akù."
        : 'Enter the same 6 digits to confirm.');

  // ── Syncing overlay ────────────────────────────────────────────────────────
  if (phase === 'syncing') {
    return (
      <LoadingScreen
        title="Restoring your data…"
        subtitle="Pulling your expenses, bills and goals securely."
      />
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View
        style={[
          styles.container,
          {
            paddingTop:    insets.top + 8,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        {/* Hide the step counter for returning users — they aren't in onboarding */}
        {!isReturning && (
          <View style={styles.headerWrapper}>
            <OnboardingHeader
              step={4}
              total={8}
              onBack={() => router.back()}
              dark={true}
            />
          </View>
        )}

        <Animated.View style={[styles.inner, isReturning && styles.innerCentered]}>
          {phase === 'create' ? (
            <Animated.View
              key="create"
              style={styles.padContainer}
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(200)}
            >
              <PinPad
                ref={padRef}
                title={title}
                subtitle={subtitle}
                onComplete={handleCreateComplete}
                pinLength={6}
                darkMode
              />
            </Animated.View>
          ) : (
            <Animated.View
              key="confirm"
              style={styles.padContainer}
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(200)}
            >
              <PinPad
                ref={padRef}
                title={title}
                subtitle={subtitle}
                onComplete={handleConfirmComplete}
                pinLength={6}
                darkMode
              />
            </Animated.View>
          )}

          {/* Error message */}
          {errorMsg.length > 0 && (
            <Animated.View entering={FadeIn.duration(250)} style={styles.errorRow}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Palette.forest,
  },
  headerWrapper: {
    paddingHorizontal: 24,
  },
  inner: {
    flex: 1,
  },
  innerCentered: {
    justifyContent: 'center',
  },
  padContainer: {
    flex: 1,
  },
  errorRow: {
    position:   'absolute',
    bottom:     80,
    left:       0,
    right:      0,
    alignItems: 'center',
    paddingHorizontal: Spacing[6],
  },
  errorText: {
    fontFamily: FontFamily.sansMedium,
    fontSize:   FontSize.sm,
    color:      Palette.goldLight,
    textAlign:  'center',
  },
});
