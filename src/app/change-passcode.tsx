/**
 * change-passcode.tsx — Standalone screen for changing the user's passcode.
 *
 * Three-phase flow (no onboarding indicators):
 *   1. verify   — enter current PIN to confirm identity
 *   2. create   — enter new PIN
 *   3. confirm  — re-enter new PIN
 *
 * Navigates back on success. Shows inline error + shake on mismatch.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { PinPad } from '../components/ui';
import type { PinPadRef } from '../components/ui';
import { useAuthStore } from '../store/auth.store';
import { Palette } from '../theme/colors';
import { FontFamily, FontSize } from '../theme/typography';
import { Spacing } from '../theme/spacing';

// ─── Phase type ───────────────────────────────────────────────────────────────

type Phase = 'verify' | 'create' | 'confirm';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChangePasscodeScreen() {
  const insets = useSafeAreaInsets();
  const router  = useRouter();

  const { verifyPin, setupPin } = useAuthStore();

  const [phase, setPhase]         = useState<Phase>('verify');
  const [newPin, setNewPin]       = useState('');
  const [errorMsg, setErrorMsg]   = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const padRef = useRef<PinPadRef>(null);

  function shake() {
    padRef.current?.triggerError();
  }

  // ── Phase 1: verify current PIN ─────────────────────────────────────
  const handleVerify = useCallback(async (pin: string) => {
    const ok = await verifyPin(pin);
    if (!ok) {
      setErrorMsg('Incorrect passcode. Try again.');
      shake();
      return;
    }
    setErrorMsg('');
    setTimeout(() => setPhase('create'), 300);
  }, [verifyPin]);

  // ── Phase 2: enter new PIN ───────────────────────────────────────────
  const handleCreate = useCallback((pin: string) => {
    setNewPin(pin);
    setErrorMsg('');
    setTimeout(() => setPhase('confirm'), 300);
  }, []);

  // ── Phase 3: confirm new PIN ─────────────────────────────────────────
  const handleConfirm = useCallback(async (pin: string) => {
    if (pin !== newPin) {
      setErrorMsg("Passcodes don't match. Try again.");
      shake();
      setTimeout(() => {
        setPhase('create');
        setNewPin('');
      }, 600);
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg('');
      await setupPin(pin);
      router.back();
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
      shake();
    } finally {
      setIsLoading(false);
    }
  }, [newPin, setupPin, router]);

  // ── Labels per phase ─────────────────────────────────────────────────
  const config: Record<Phase, { title: string; subtitle: string; onComplete: (pin: string) => void | Promise<void> }> = {
    verify: {
      title:    'Enter current passcode',
      subtitle: 'Confirm your identity before changing.',
      onComplete: handleVerify,
    },
    create: {
      title:    'New passcode',
      subtitle: 'Choose a new 6-digit passcode.',
      onComplete: handleCreate,
    },
    confirm: {
      title:    'Confirm new passcode',
      subtitle: 'Enter the same 6 digits again.',
      onComplete: handleConfirm,
    },
  };

  const { title, subtitle, onComplete } = config[phase];

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop:    insets.top + 8,
          paddingBottom: Math.max(insets.bottom, 24),
        },
      ]}
    >
      {/* ── Custom back button (no onboarding dots) ── */}
      <View style={[styles.headerRow, { paddingHorizontal: Spacing[6] }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <ChevronLeft size={24} color={Palette.gold} strokeWidth={1.8} />
        </Pressable>

        {/* Phase indicator: simple text badge */}
        <View style={styles.phaseBadge}>
          <Text style={styles.phaseText}>
            {phase === 'verify' ? 'Step 1 of 3' : phase === 'create' ? 'Step 2 of 3' : 'Step 3 of 3'}
          </Text>
        </View>
      </View>

      {/* ── PinPad ── */}
      <View style={styles.inner}>
        {phase === 'verify' && (
          <Animated.View
            key="verify"
            style={styles.padContainer}
            entering={FadeIn.duration(300)}
            exiting={FadeOut.duration(200)}
          >
            <PinPad
              ref={padRef}
              title={title}
              subtitle={subtitle}
              onComplete={onComplete}
              pinLength={6}
              darkMode
            />
          </Animated.View>
        )}
        {phase === 'create' && (
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
              onComplete={onComplete}
              pinLength={6}
              darkMode
            />
          </Animated.View>
        )}
        {phase === 'confirm' && (
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
              onComplete={onComplete}
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

        {isLoading && (
          <Animated.View entering={FadeIn.duration(250)} style={styles.errorRow}>
            <Text style={styles.errorText}>Saving…</Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Palette.forest,
  },
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   8,
  },
  backBtn: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
  },
  phaseBadge: {
    backgroundColor: 'rgba(201,169,106,0.15)',
    paddingHorizontal: 12,
    paddingVertical:   5,
    borderRadius:      100,
  },
  phaseText: {
    fontFamily: FontFamily.sansMedium,
    fontSize:   FontSize.xs,
    color:      Palette.gold,
    letterSpacing: 0.3,
  },
  inner: {
    flex: 1,
  },
  padContainer: {
    flex: 1,
  },
  errorRow: {
    position:          'absolute',
    bottom:            80,
    left:              0,
    right:             0,
    alignItems:        'center',
    paddingHorizontal: Spacing[6],
  },
  errorText: {
    fontFamily: FontFamily.sansMedium,
    fontSize:   FontSize.sm,
    color:      Palette.goldLight,
    textAlign:  'center',
  },
});
