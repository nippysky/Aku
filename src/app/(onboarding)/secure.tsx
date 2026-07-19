/**
 * secure.tsx — Device-security onboarding step.
 *
 * Replaces the old passcode-setup + biometric screens. There is no
 * app-specific passcode anymore: Akù is protected by the device's own
 * security (Face ID / fingerprint / device PIN / pattern).
 *
 * This screen:
 *  1. Sets up the DEK (Keychain → server → generate) — independent of any PIN.
 *  2. Enables the app lock automatically when the device has enrolled security.
 *  3. For returning users (?returning=1): restores their data and goes to tabs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { ScanFace, Fingerprint, ShieldCheck, ShieldAlert } from 'lucide-react-native';
import { LoadingScreen } from '../../components/ui';
import { useAuthStore } from '../../store';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Spacing, Layout } from '../../theme/spacing';

type Phase = 'setting-up' | 'ready' | 'syncing';

function GoldButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.goldBtn, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={styles.goldBtnText}>{label}</Text>
    </Pressable>
  );
}

export default function SecureScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ returning?: string }>();
  const isReturning = params.returning === '1';

  const { setupDeviceSecurity, setupBiometric, completeOnboardingAndUnlock } = useAuthStore();

  const [phase, setPhase]         = useState<Phase>('setting-up');
  const [hasDeviceLock, setHasDeviceLock] = useState(false);
  const [hasFaceId, setHasFaceId] = useState(false);
  const [errorMsg, setErrorMsg]   = useState('');

  // ── Setup: DEK + app lock, then route ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1. Encryption key — fetch (returning) or generate (new account)
        await setupDeviceSecurity();

        // 2. Detect device security & enable the app lock if available
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled    = hasHardware && (await LocalAuthentication.isEnrolledAsync());
        const types       = enrolled
          ? await LocalAuthentication.supportedAuthenticationTypesAsync()
          : [];

        if (cancelled) return;
        setHasDeviceLock(enrolled);
        setHasFaceId(types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION));

        if (enrolled) {
          await setupBiometric(); // flips the app lock on
        }

        if (cancelled) return;

        if (isReturning) {
          // Returning user — mark onboarding done + unlock, restore data, enter.
          // (Atomic set: avoids the nav guard seeing hasOnboarded:true+isLocked:true)
          await completeOnboardingAndUnlock();
          setPhase('syncing');
          try {
            const { fullSync } = await import('../../lib/sync/engine');
            await fullSync();
          } catch { /* non-fatal — partial data still usable */ }
          router.replace('/(tabs)');
        } else {
          // New user — DON'T mark onboarding complete yet; the guard would
          // bounce them to tabs and skip first-bill/first-goal. The final
          // onboarding screen (first-goal) calls markOnboardingComplete().
          setPhase('ready');
        }
      } catch (err) {
        console.error('[secure] setup error:', err);
        if (!cancelled) setErrorMsg('Something went wrong. Please try again.');
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinue = useCallback(() => {
    router.push('/(onboarding)/first-bill');
  }, [router]);

  if (phase === 'syncing') {
    return (
      <LoadingScreen
        title="Restoring your data…"
        subtitle="Pulling your expenses, bills and goals securely."
      />
    );
  }

  const LockIcon = hasDeviceLock
    ? (hasFaceId ? ScanFace : Fingerprint)
    : ShieldAlert;

  const title = phase === 'setting-up'
    ? 'Securing your account…'
    : hasDeviceLock
      ? 'Akù is protected'
      : 'Almost protected';

  const subtitle = phase === 'setting-up'
    ? 'Setting up your private encryption key.'
    : hasDeviceLock
      ? `Akù locks with ${hasFaceId ? 'Face ID' : 'your fingerprint'} — your device PIN is the backup. No extra passcode to remember.`
      : 'Your data is encrypted end-to-end. Add a screen lock in your device settings and Akù will lock automatically too.';

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View
        style={[
          styles.container,
          {
            paddingTop:    insets.top + Spacing[8],
            paddingBottom: Math.max(insets.bottom, Spacing[6]) + Spacing[4],
            paddingHorizontal: Layout.screenPadding,
          },
        ]}
      >
        {/* Icon */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.iconArea}>
          <View style={styles.iconBadge}>
            <LockIcon size={44} color={Palette.gold} strokeWidth={1.4} />
          </View>
          {phase === 'ready' && hasDeviceLock && (
            <View style={styles.checkBadge}>
              <ShieldCheck size={20} color={Palette.forest} strokeWidth={2} />
            </View>
          )}
        </Animated.View>

        {/* Copy */}
        <Animated.View entering={FadeInDown.delay(150).duration(500)} style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{errorMsg || subtitle}</Text>
        </Animated.View>

        {/* Continue */}
        {phase === 'ready' && (
          <Animated.View entering={FadeInDown.delay(250).duration(400)}>
            <GoldButton label="Continue" onPress={handleContinue} />
          </Animated.View>
        )}
      </View>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Palette.forest,
    justifyContent:  'space-between',
  },
  iconArea: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  iconBadge: {
    width:           104,
    height:          104,
    borderRadius:    52,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth:     1.5,
    borderColor:     'rgba(201,169,106,0.4)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  checkBadge: {
    marginTop:       -14,
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: Palette.gold,
    alignItems:      'center',
    justifyContent:  'center',
  },
  copy: {
    alignItems:    'center',
    gap:           Spacing[3],
    paddingBottom: Spacing[8],
  },
  title: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['3xl'],
    color:         Palette.linen,
    textAlign:     'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.base,
    color:      'rgba(250,250,248,0.6)',
    textAlign:  'center',
    lineHeight: FontSize.base * 1.5,
  },
  goldBtn: {
    backgroundColor: Palette.gold,
    borderRadius:    100,
    paddingVertical: 16,
    alignItems:      'center',
  },
  goldBtnText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize:   FontSize.base,
    color:      Palette.forest,
  },
});
