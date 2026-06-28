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
import { useRouter } from 'expo-router';
import { PinPad, OnboardingHeader } from '../../components/ui';
import type { PinPadRef } from '../../components/ui';
import { useAuthStore } from '../../store';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Spacing } from '../../theme/spacing';

// ─── Screen ────────────────────────────────────────────────────────────────

type PinPhase = 'create' | 'confirm';

export default function PinSetupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { setupPin } = useAuthStore();

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
    // Brief pause then transition to confirm phase
    setTimeout(() => setPhase('confirm'), 300);
  }, []);

  const handleConfirmComplete = useCallback(
    async (pin: string) => {
      if (pin !== firstPin) {
        setErrorMsg('Passcodes don\'t match. Try again.');
        triggerShake();
        setTimeout(() => setPhase('create'), 600);
        setTimeout(() => setFirstPin(''), 700);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMsg('');
        await setupPin(pin);
        router.push('/(onboarding)/biometric');
      } catch {
        setErrorMsg('Something went wrong. Please try again.');
        triggerShake();
      } finally {
        setIsLoading(false);
      }
    },
    [firstPin, setupPin, router],
  );

  const title    = phase === 'create' ? 'Create your passcode' : 'Confirm your passcode';
  const subtitle = phase === 'create'
    ? '6 digits. You\'ll use this to access Akù.'
    : 'Enter the same 6 digits to confirm.';

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
      <View style={styles.headerWrapper}>
        <OnboardingHeader
          step={4}
          total={9}
          onBack={() => router.back()}
          dark={true}
        />
      </View>

      <Animated.View style={styles.inner}>
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
