import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Fingerprint, ScanFace } from 'lucide-react-native';
import { PinPad } from '../../components/ui';
import type { PinPadRef } from '../../components/ui';
import { useAuthStore } from '../../store';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Spacing, Layout } from '../../theme/spacing';

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

// ─── Screen ────────────────────────────────────────────────────────────────

export default function PinScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { verifyPin, unlock, biometric, authenticateBiometric } = useAuthStore();

  const padRef = useRef<PinPadRef>(null);

  const [failCount, setFailCount]     = useState(0);
  const [isLocked, setIsLocked]       = useState(false);
  const [countdown, setCountdown]     = useState(LOCKOUT_SECONDS);
  const [errorMsg, setErrorMsg]       = useState('');

  // Auto-trigger biometric on mount if enabled
  useEffect(() => {
    if (biometric.enabled) {
      authenticateBiometric().then((success) => {
        if (success) {
          router.replace('/(tabs)');
        }
      }).catch(() => {
        // Biometric failed — fall through to PIN entry
      });
    }
  // Run only on initial mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer during lockout
  useEffect(() => {
    if (!isLocked) return;

    let remaining = LOCKOUT_SECONDS;
    setCountdown(remaining);

    const interval = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        setIsLocked(false);
        setFailCount(0);
        setErrorMsg('');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLocked]);

  const handleComplete = useCallback(
    async (pin: string) => {
      if (isLocked) return;

      const correct = await verifyPin(pin);

      if (correct) {
        unlock();
        router.replace('/(tabs)');
        return;
      }

      const newCount = failCount + 1;
      setFailCount(newCount);
      padRef.current?.triggerError();

      if (newCount >= MAX_ATTEMPTS) {
        setIsLocked(true);
        setErrorMsg(`Too many attempts. Try again in ${LOCKOUT_SECONDS}s.`);
      } else {
        setErrorMsg(`Incorrect passcode. ${MAX_ATTEMPTS - newCount} attempt${MAX_ATTEMPTS - newCount === 1 ? '' : 's'} remaining.`);
      }
    },
    [isLocked, failCount, verifyPin, unlock, router],
  );

  const handleBiometric = useCallback(async () => {
    const success = await authenticateBiometric();
    if (success) {
      router.replace('/(tabs)');
    }
  }, [authenticateBiometric, router]);

  function handleForgot() {
    router.push('/(auth)/forgot-pin');
  }

  const biometricLabel =
    biometric.type === 'faceId'
      ? 'Use Face ID'
      : biometric.type === 'fingerprint' || biometric.type === 'touchId'
      ? 'Use Touch ID'
      : 'Use Biometrics';

  const BiometricIcon =
    biometric.type === 'faceId' ? ScanFace : Fingerprint;

  return (
    <>
      <StatusBar barStyle="light-content" />
    <View
      style={[
        styles.container,
        {
          paddingTop:    insets.top,
          paddingBottom: Math.max(insets.bottom, Spacing[6]) + Spacing[2],
        },
      ]}
    >
      {/* PinPad takes the full flex space */}
      <PinPad
        ref={padRef}
        title="Enter your passcode"
        onComplete={handleComplete}
        pinLength={6}
        darkMode
      />

      {/* Error / lockout message */}
      {errorMsg.length > 0 && (
        <Animated.View entering={FadeIn.duration(250)} style={styles.errorRow}>
          <Text style={styles.errorText}>
            {isLocked ? `Locked. Try again in ${countdown}s.` : errorMsg}
          </Text>
        </Animated.View>
      )}

      {/* Biometric button — only if biometric is enabled */}
      {biometric.enabled && (
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.biometricRow}>
          <Pressable
            onPress={handleBiometric}
            accessibilityRole="button"
            accessibilityLabel={biometricLabel}
            style={styles.biometricBtn}
          >
            <BiometricIcon size={22} color={Palette.goldLight} strokeWidth={1.5} />
            <Text style={styles.biometricText}>{biometricLabel}</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Forgot passcode */}
      <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.forgotRow}>
        <Pressable
          onPress={handleForgot}
          accessibilityRole="button"
          style={styles.forgotBtn}
        >
          <Text style={styles.forgotText}>Forgot passcode?</Text>
        </Pressable>
      </Animated.View>
    </View>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Palette.obsidian,
  },
  errorRow: {
    position:   'absolute',
    bottom:     130,
    left:       0,
    right:      0,
    alignItems: 'center',
    paddingHorizontal: Layout.screenPadding,
  },
  errorText: {
    fontFamily: FontFamily.sansMedium,
    fontSize:   FontSize.sm,
    color:      Palette.goldLight,
    textAlign:  'center',
  },
  biometricRow: {
    alignItems:     'center',
    paddingVertical: Spacing[2],
  },
  biometricBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[5],
  },
  biometricText: {
    fontFamily: FontFamily.sansMedium,
    fontSize:   FontSize.sm,
    color:      Palette.goldLight,
  },
  forgotRow: {
    alignItems:     'center',
    paddingVertical: Spacing[2],
    paddingBottom:   Spacing[2],
  },
  forgotBtn: {
    paddingVertical: Spacing[2],
  },
  forgotText: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.sm,
    color:      'rgba(250,250,248,0.45)',
  },
});
