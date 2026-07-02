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
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, KeyboardWrapper, OnboardingHeader } from '../../components/ui';
import { useTheme } from '../../theme';
import { OnboardingStorage } from '../../lib/onboarding-storage';
import { useAuthStore } from '../../store/auth.store';

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

    try {
      // In production: sends a real magic link email via the server
      // In __DEV__: the server call still fires but the dev-skip button in
      // verify.tsx lets you bypass it without opening the email.
      await signIn(normalised, name);
    } catch (err) {
      // Non-fatal if the server is unreachable during local dev
      if (__DEV__) {
        console.warn('[email] signIn failed (dev mode — use skip button):', err);
      } else {
        setSendError(err instanceof Error ? err.message : 'Could not send email. Please try again.');
        return;
      }
    }

    router.push({ pathname: '/(onboarding)/verify', params: { email: normalised } });
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
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Email address"
                  placeholder="you@example.com"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  error={errors.email?.message}
                  onSubmitEditing={handleSubmit(onSubmit)}
                />
              )}
            />
          </Animated.View>
        </View>

        {/* Continue */}
        <Animated.View entering={FadeInUp.delay(350).duration(500)}>
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
        </Animated.View>
      </View>
    </KeyboardWrapper>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:           1,
    justifyContent: 'space-between',
  },
  content: {
    flex:           1,
    justifyContent: 'center',
    paddingBottom:  24,
  },
  iconWrap: {
    alignSelf: 'flex-start',
  },
});
