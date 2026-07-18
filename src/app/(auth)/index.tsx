/**
 * (auth)/index.tsx — Lock screen.
 *
 * No app passcode: unlocking uses the device's own security via the system
 * sheet (Face ID / Touch ID / fingerprint, falling back to the device
 * PIN / pattern / passcode automatically). Devices without any enrolled
 * security unlock freely.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { Lock } from 'lucide-react-native';
import { useAuthStore } from '../../store';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Spacing, Layout } from '../../theme/spacing';

// ─── Small monogram ────────────────────────────────────────────────────────

function AkuMonogramSmall() {
  return (
    <Svg width={56} height={56} viewBox="0 0 56 56">
      <Circle cx={28} cy={28} r={26} stroke={Palette.gold} strokeWidth={1.5} fill="none" opacity={0.5} />
      <Path
        d="M18 38 L28 16 L38 38 M22.5 30 L33.5 30"
        stroke={Palette.gold}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function AuthGateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { user, unlockWithDeviceAuth } = useAuthStore();
  const [attempted, setAttempted] = useState(false);

  const userName = user?.name ?? '';

  const tryUnlock = useCallback(async () => {
    const success = await unlockWithDeviceAuth();
    if (success) {
      router.replace('/(tabs)');
    } else {
      setAttempted(true);
    }
  }, [unlockWithDeviceAuth, router]);

  // Auto-trigger the system auth sheet shortly after mount
  useEffect(() => {
    const timer = setTimeout(() => {
      tryUnlock();
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {/* Logo area */}
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.logoArea}>
          <AkuMonogramSmall />
          <Text style={styles.wordmark}>Akù</Text>
        </Animated.View>

        {/* Greeting */}
        <Animated.View entering={FadeInDown.delay(220).duration(500)} style={styles.greeting}>
          <Text style={styles.greetingText}>
            Welcome back{userName.length > 0 ? `, ${userName}.` : '.'}
          </Text>
          <Text style={styles.greetingSubtitle}>
            {attempted
              ? 'Authentication was cancelled. Tap below to try again.'
              : 'Unlocking with your device security…'}
          </Text>
        </Animated.View>

        {/* Unlock button — shown after a cancelled/failed attempt */}
        <Animated.View entering={FadeInUp.delay(350).duration(500)} style={styles.buttons}>
          <Pressable
            onPress={tryUnlock}
            accessibilityRole="button"
            accessibilityLabel="Unlock Akù"
            style={({ pressed }) => [styles.unlockBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Lock size={18} color={Palette.forest} strokeWidth={2} />
            <Text style={styles.unlockText}>Unlock</Text>
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
    justifyContent:  'space-between',
  },
  logoArea: {
    alignItems: 'center',
    gap:        Spacing[2],
  },
  wordmark: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize.xl,
    color:         Palette.gold,
    letterSpacing: -0.5,
  },
  greeting: {
    flex:       1,
    alignItems: 'center',
    justifyContent: 'center',
    gap:        Spacing[2],
    paddingBottom: Spacing[8],
  },
  greetingText: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['3xl'],
    color:         Palette.linen,
    textAlign:     'center',
    letterSpacing: -0.5,
    lineHeight:    FontSize['3xl'] * 1.15,
  },
  greetingSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.base,
    color:      'rgba(250,250,248,0.45)',
    textAlign:  'center',
  },
  buttons: {
    gap: Spacing[3],
  },
  unlockBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    backgroundColor: Palette.gold,
    borderRadius:    100,
    paddingVertical: 16,
  },
  unlockText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize:   FontSize.base,
    color:      Palette.forest,
  },
});
