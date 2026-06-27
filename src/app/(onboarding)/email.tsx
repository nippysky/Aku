import React, { useState } from 'react';
import {
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
import { Mail } from 'lucide-react-native';
import { Button, Input, KeyboardWrapper, OnboardingHeader } from '../../components/ui';
import { useTheme } from '../../theme';
import { OnboardingStorage } from '../../lib/onboarding-storage';

// ─── Email Validation ──────────────────────────────────────────────────────

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function EmailScreen() {
  const { colors, spacing, text, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [touched, setTouched] = useState(false);

  const canContinue = isValidEmail(email);

  function handleContinue() {
    setTouched(true);
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    OnboardingStorage.setEmail(email.trim().toLowerCase());
    router.push({ pathname: '/(onboarding)/verify', params: { email } });
  }

  return (
    <KeyboardWrapper style={{ backgroundColor: colors.background }}>
      <View
        style={[
          styles.container,
          {
            paddingTop:        insets.top + spacing[2],
            paddingBottom:     Math.max(insets.bottom, spacing[6]) + spacing[4],
            paddingHorizontal: layout.screenPadding,
          },
        ]}
      >
        <OnboardingHeader
          step={2}
          total={9}
          onBack={() => router.back()}
          dark={false}
        />

        {/* Content */}
        <View style={styles.content}>
          {/* Mail icon */}
          <Animated.View entering={FadeInDown.delay(60).duration(500)} style={styles.iconWrap}>
            <Mail size={40} color={colors.primary} strokeWidth={1.5} />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(500)}>
            <Text style={[text.onboardingTitle, { color: colors.text, marginTop: spacing[5] }]}>
              Your email is{'\n'}your safety net.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(500)}>
            <Text
              style={[text.body, { color: colors.textSecondary, marginTop: spacing[3] }]}
            >
              Only used to verify your account and reset your passcode. No spam, ever.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(280).duration(500)}
            style={{ marginTop: spacing[8] }}
          >
            <Input
              label="Email address"
              placeholder="you@example.com"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (touched && error) setError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="done"
              error={error || undefined}
              onSubmitEditing={handleContinue}
            />
          </Animated.View>
        </View>

        {/* Continue */}
        <Animated.View entering={FadeInUp.delay(350).duration(500)}>
          <Button
            label="Continue"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canContinue}
            onPress={handleContinue}
          />
        </Animated.View>
      </View>
    </KeyboardWrapper>
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
  iconWrap: {
    alignSelf: 'flex-start',
  },
});
