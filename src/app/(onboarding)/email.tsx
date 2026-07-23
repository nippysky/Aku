import React, { useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, OnboardingHeader } from '../../components/ui';
import { useTheme } from '../../theme';
import { OnboardingStorage } from '../../lib/onboarding-storage';
import { useAuthStore } from '../../store/auth.store';
import { getFriendlyErrorMessage, ApiError } from '../../lib/api-client';

// ─── Schema ────────────────────────────────────────────────────────────────

const schema = z.object({
  email: z
    .string()
    .min(1, 'Please enter your email address.')
    .email('Please enter a valid email address.'),
});

type FormValues = z.infer<typeof schema>;

// ─── Screen ────────────────────────────────────────────────────────────────

export default function EmailScreen() {
  const { colors, spacing, text, layout } = useTheme();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { signIn, isLoading, error } = useAuthStore();

  const [sendError, setSendError] = useState<string | null>(null);
  // Inline, field-level error — set when the server tells us this email is
  // already registered (a distinct case from "invalid email format").
  const [emailError, setEmailError]             = useState<string | null>(null);
  const [emailAlreadyUsed, setEmailAlreadyUsed] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver:      zodResolver(schema),
    defaultValues: { email: '' },
    mode:          'onChange',
  });

  async function onSubmit({ email }: FormValues) {
    const normalised = email.trim().toLowerCase();
    const name       = OnboardingStorage.getName() ?? undefined;
    OnboardingStorage.setEmail(normalised);
    setSendError(null);
    setEmailError(null);
    setEmailAlreadyUsed(false);

    try {
      // Sends a real magic link email via the server.
      await signIn(normalised, name, 'sign-up');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setEmailError('That email is already registered.');
        setEmailAlreadyUsed(true);
        return;
      }
      setSendError(getFriendlyErrorMessage(err, 'Could not send the email. Please try again.'));
      return;
    }

    router.push({ pathname: '/(onboarding)/verify', params: { email: normalised } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Scroll area — auto-scrolls to keep the email input above keyboard */}
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop:        insets.top + spacing[2],
            paddingHorizontal: layout.screenPadding,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={20}
      >
        <OnboardingHeader
          step={3}
          total={6}
          onBack={() => router.back()}
          dark={false}
        />

        {/* Centred content */}
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
            <Text style={[text.body, { color: colors.textSecondary, marginTop: spacing[3] }]}>
              Only used to verify your account and restore your data on a new device. No spam, ever.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(280).duration(500)}
            style={{ marginTop: spacing[8] }}
          >
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Email address"
                  placeholder="you@example.com"
                  value={value}
                  onChangeText={(v) => {
                    onChange(v);
                    if (emailAlreadyUsed) { setEmailError(null); setEmailAlreadyUsed(false); }
                  }}
                  onBlur={onBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  error={errors.email?.message ?? emailError ?? undefined}
                  onSubmitEditing={handleSubmit(onSubmit)}
                />
              )}
            />
            {emailAlreadyUsed && (
              <Pressable
                onPress={() => router.push('/sign-in' as never)}
                style={styles.inlineActionLink}
                accessibilityRole="button"
              >
                <Text style={[text.bodySm, { color: colors.textSecondary }]}>
                  Already have an account?{' '}
                  <Text style={{ color: colors.primary }}>Sign in instead</Text>
                </Text>
              </Pressable>
            )}
          </Animated.View>
        </View>
      </KeyboardAwareScrollView>

      {/* Fixed footer — never pushed up by keyboard */}
      <Animated.View
        entering={FadeInUp.delay(350).duration(500)}
        style={[
          styles.footer,
          {
            paddingHorizontal: layout.screenPadding,
            paddingBottom:     Math.max(insets.bottom, spacing[6]) + spacing[4],
          },
        ]}
      >
        {sendError ? (
          <Text style={[text.bodySm, { color: colors.danger, textAlign: 'center', marginBottom: 12 }]}>
            {sendError}
          </Text>
        ) : null}
        <Button
          label="Continue"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!isValid || isLoading}
          loading={isLoading}
          onPress={handleSubmit(onSubmit)}
        />
        <Text style={[text.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: 12 }]}>
          By continuing, you agree to Akù's{' '}
          <Text
            style={{ color: colors.primary }}
            onPress={() => Linking.openURL('https://aku.nippysky.com/terms').catch(() => {})}
          >
            Terms
          </Text>{' '}
          and{' '}
          <Text
            style={{ color: colors.primary }}
            onPress={() => Linking.openURL('https://aku.nippysky.com/privacy').catch(() => {})}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </Animated.View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex:           1,
    justifyContent: 'center',
    paddingBottom:  32,
  },
  iconWrap: {
    alignSelf: 'flex-start',
  },
  footer: {
    paddingTop: 8,
  },
  inlineActionLink: {
    marginTop:       10,
    paddingVertical: 2,
  },
});
