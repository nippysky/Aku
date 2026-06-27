import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Svg, { Path, Circle } from 'react-native-svg';
import { Button, OnboardingHeader } from '../../components/ui';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import { OnboardingStorage } from '../../lib/onboarding-storage';
import { useAuthStore } from '../../store';

// ─── Envelope + Check SVG ──────────────────────────────────────────────────

function EnvelopeCheckIllustration() {
  return (
    <Svg width={120} height={100} viewBox="0 0 120 100" fill="none">
      {/* Envelope body */}
      <Path
        d="M10 30 L10 80 Q10 88 18 88 L102 88 Q110 88 110 80 L110 30 Q110 22 102 22 L18 22 Q10 22 10 30 Z"
        stroke={Palette.forest}
        strokeWidth={2.5}
        fill="none"
        strokeLinejoin="round"
      />
      {/* Envelope flap open */}
      <Path
        d="M10 30 L60 58 L110 30"
        stroke={Palette.forest}
        strokeWidth={2.5}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Check mark circle overlay top-right */}
      <Circle cx={92} cy={22} r={18} fill={Palette.linen} />
      <Circle cx={92} cy={22} r={18} stroke={Palette.forest} strokeWidth={2} fill="none" />
      {/* Check tick */}
      <Path
        d="M83 22 L90 29 L101 14"
        stroke={Palette.forest}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function VerifyScreen() {
  const { colors, spacing, text, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { createLocalUser } = useAuthStore();

  const params = useLocalSearchParams<{ email: string }>();
  const email  = params.email ?? 'your inbox';

  const [resent, setResent]       = useState(false);
  const [resending, setResending] = useState(false);
  const [skipping, setSkipping]   = useState(false);

  const handleDevSkip = useCallback(async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      const name        = OnboardingStorage.getName();
      const storedEmail = OnboardingStorage.getEmail();
      await createLocalUser(name || 'User', storedEmail || 'dev@aku.app');
      router.push('/(onboarding)/pin-setup');
    } finally {
      setSkipping(false);
    }
  }, [skipping, createLocalUser, router]);

  const handleResend = useCallback(async () => {
    if (resending) return;
    setResending(true);
    // Simulated resend delay — wire to real email API later
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 4000);
  }, [resending]);

  // In a real app, a deep-link listener would call router.replace('/(onboarding)/pin-setup')
  // when the magic link is tapped. Here we provide a manual dev shortcut via the dev button.

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor:   colors.background,
          paddingTop:        insets.top + spacing[2],
          paddingBottom:     Math.max(insets.bottom, spacing[6]) + spacing[4],
          paddingHorizontal: layout.screenPadding,
        },
      ]}
    >
      <OnboardingHeader
        step={3}
        total={9}
        onBack={() => router.back()}
        dark={false}
      />

      {/* Main content */}
      <View style={styles.content}>
        <Animated.View entering={FadeInDown.delay(80).duration(600)} style={styles.illustration}>
          <EnvelopeCheckIllustration />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(500)}>
          <Text style={[text.onboardingTitle, { color: colors.text, marginTop: spacing[8] }]}>
            Check your{'\n'}inbox.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(260).duration(500)}>
          <Text
            style={[text.body, { color: colors.textSecondary, marginTop: spacing[3] }]}
          >
            We sent a link to{' '}
            <Text style={{ color: colors.primary, fontFamily: 'PlusJakartaSans_500Medium' }}>
              {email}
            </Text>
            . Tap it to continue.
          </Text>
        </Animated.View>

        {/* Loading spinner — awaiting deep-link */}
        <Animated.View
          entering={FadeInDown.delay(340).duration(500)}
          style={[styles.spinnerRow, { marginTop: spacing[8] }]}
        >
          <ActivityIndicator size="small" color={colors.textTertiary} />
          <Text style={[text.bodySm, { color: colors.textTertiary, marginLeft: spacing[2] }]}>
            Waiting for you to tap the link…
          </Text>
        </Animated.View>
      </View>

      {/* Bottom actions */}
      <Animated.View entering={FadeInUp.delay(400).duration(500)} style={styles.bottomActions}>
        {/* Resend */}
        <Button
          label={resending ? 'Sending…' : resent ? 'Email sent!' : 'Resend email'}
          variant="secondary"
          size="lg"
          fullWidth
          loading={resending}
          disabled={resending}
          onPress={handleResend}
        />

        {/* Wrong email */}
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={styles.backLink}
        >
          <Text style={[text.bodySm, { color: colors.textSecondary }]}>
            Wrong email?{' '}
            <Text style={{ color: colors.primary }}>Go back</Text>
          </Text>
        </Pressable>

        {/* Dev shortcut */}
        <Pressable
          onPress={handleDevSkip}
          accessibilityRole="button"
          disabled={skipping}
          style={[styles.devSkipBtn, { borderColor: Palette.gold, opacity: skipping ? 0.6 : 1 }]}
        >
          <Text style={[text.bodySm, { color: Palette.gold, fontFamily: 'PlusJakartaSans_500Medium' }]}>
            {skipping ? 'Creating account…' : '⚡ Continue without email (Dev)'}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 24,
  },
  illustration: {
    alignSelf: 'flex-start',
  },
  spinnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomActions: {
    gap: 16,
    alignItems: 'center',
  },
  backLink: {
    paddingVertical: 4,
  },
  devSkipBtn: {
    paddingVertical:   10,
    paddingHorizontal: 20,
    borderRadius:      10,
    borderWidth:       1.5,
    alignItems:        'center',
  },
});
