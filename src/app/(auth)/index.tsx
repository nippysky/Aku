import React, { useCallback, useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Button } from '../../components/ui';
import { useAuthStore } from '../../store';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Spacing, Layout } from '../../theme/spacing';

// ─── Akù "A" monogram (small, for auth) ───────────────────────────────────

function AkuMonogramSmall() {
  return (
    <Svg width={56} height={56} viewBox="0 0 140 140" fill="none">
      <Path
        d="M70 16 L22 124"
        stroke={Palette.gold}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <Path
        d="M70 16 L118 124"
        stroke={Palette.gold}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <Path
        d="M38 80 L70 58 L102 80"
        stroke={Palette.gold}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M70 5 L70 13"
        stroke={Palette.gold}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function AuthGateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { user, biometric, authenticateBiometric } = useAuthStore();

  const userName = user?.name ?? '';

  const biometricLabel = biometric.type === 'faceId'
    ? 'Use Face ID'
    : biometric.type === 'fingerprint' || biometric.type === 'touchId'
    ? 'Use Touch ID'
    : 'Use biometrics';

  // Auto-trigger biometric on mount if enabled
  const tryBiometric = useCallback(async () => {
    if (!biometric.enabled) return;
    const success = await authenticateBiometric();
    if (success) {
      router.replace('/(tabs)');
    }
  }, [biometric.enabled, authenticateBiometric, router]);

  useEffect(() => {
    // Slight delay so screen renders before native prompt appears
    const timer = setTimeout(() => {
      tryBiometric();
    }, 400);
    return () => clearTimeout(timer);
  }, [tryBiometric]);

  function handleEnterPasscode() {
    router.push('/(auth)/pin');
  }

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
          Authenticate to continue.
        </Text>
      </Animated.View>

      {/* Bottom auth options */}
      <Animated.View entering={FadeInUp.delay(350).duration(500)} style={styles.buttons}>
        {biometric.enabled && (
          <Button
            label={biometricLabel}
            variant="primary"
            size="lg"
            fullWidth
            onPress={tryBiometric}
          />
        )}

        <Button
          label="Enter passcode"
          variant={biometric.enabled ? 'secondary' : 'primary'}
          size="lg"
          fullWidth
          onPress={handleEnterPasscode}
        />
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
});
