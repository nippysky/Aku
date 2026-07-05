/**
 * Sign In Screen — for returning users on a new device or after reinstall.
 *
 * Flow:
 *   Enter email → magic link sent → "Check your inbox" state
 *   User taps link in email → auth-callback.tsx → lock screen (/(auth))
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, Mail } from 'lucide-react-native';
import { Button, Input } from '../components/ui';
import { useTheme } from '../theme';
import { useAuthStore } from '../store/auth.store';

// ─── Schema ────────────────────────────────────────────────────────────────

const schema = z.object({
  email: z
    .string()
    .min(1, 'Please enter your email address.')
    .email('Please enter a valid email address.'),
});

type FormValues = z.infer<typeof schema>;

// ─── Screen ────────────────────────────────────────────────────────────────

export default function SignInScreen() {
  const { colors, spacing, text, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, isLoading } = useAuthStore();

  const [step, setStep]           = useState<'input' | 'sent'>('input');
  const [sentEmail, setSentEmail] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent]       = useState(false);

  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver:      zodResolver(schema),
    defaultValues: { email: '' },
    mode:          'onChange',
  });

  const onSubmit = useCallback(async ({ email }: FormValues) => {
    const normalised = email.trim().toLowerCase();
    setSendError(null);
    try {
      await signIn(normalised);
      setSentEmail(normalised);
      setStep('sent');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send email. Please try again.');
    }
  }, [signIn]);

  const handleResend = useCallback(async () => {
    if (resending) return;
    setResending(true);
    setSendError(null);
    try {
      await signIn(sentEmail);
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not resend. Please try again.');
    } finally {
      setResending(false);
    }
  }, [resending, sentEmail, signIn]);

  // ── "Check your inbox" state ──────────────────────────────────────────────

  if (step === 'sent') {
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
        {/* Back */}
        <Pressable
          onPress={() => setStep('input')}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={22} color={colors.textSecondary} strokeWidth={2} />
        </Pressable>

        {/* Content */}
        <View style={styles.content}>
          <Animated.View entering={FadeInDown.delay(60).duration(500)} style={styles.iconWrap}>
            <Mail size={44} color={colors.primary} strokeWidth={1.4} />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(140).duration(500)}>
            <Text style={[text.onboardingTitle, { color: colors.text, marginTop: spacing[6] }]}>
              Check your{'\n'}inbox.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(220).duration(500)}>
            <Text style={[text.body, { color: colors.textSecondary, marginTop: spacing[3] }]}>
              We sent a sign-in link to{' '}
              <Text style={{ color: colors.primary, fontFamily: 'PlusJakartaSans_500Medium' }}>
                {sentEmail}
              </Text>
              .{'\n'}Tap it to open the app and sign in.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(300).duration(500)}
            style={[styles.spinnerRow, { marginTop: spacing[8] }]}
          >
            <ActivityIndicator size="small" color={colors.textTertiary} />
            <Text style={[text.bodySm, { color: colors.textTertiary, marginLeft: spacing[2] }]}>
              Waiting for you to tap the link…
            </Text>
          </Animated.View>
        </View>

        {/* Bottom actions */}
        <Animated.View entering={FadeInUp.delay(380).duration(500)} style={styles.bottomActions}>
          {sendError ? (
            <Text style={[text.bodySm, { color: colors.danger, textAlign: 'center' }]}>
              {sendError}
            </Text>
          ) : null}
          <Button
            label={resending ? 'Sending…' : resent ? 'Email sent!' : 'Resend email'}
            variant="secondary"
            size="lg"
            fullWidth
            loading={resending}
            disabled={resending}
            onPress={handleResend}
          />
          <Pressable
            onPress={() => setStep('input')}
            accessibilityRole="button"
            style={styles.changeEmailLink}
          >
            <Text style={[text.bodySm, { color: colors.textSecondary }]}>
              Wrong email?{' '}
              <Text style={{ color: colors.primary }}>Change it</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  // ── Email input state ─────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
          {/* Back */}
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={22} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>

          {/* Content */}
          <View style={styles.content}>
            <Animated.View entering={FadeInDown.delay(60).duration(500)} style={styles.iconWrap}>
              <Mail size={40} color={colors.primary} strokeWidth={1.5} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(120).duration(500)}>
              <Text style={[text.onboardingTitle, { color: colors.text, marginTop: spacing[5] }]}>
                Welcome{'\n'}back.
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(500)}>
              <Text style={[text.body, { color: colors.textSecondary, marginTop: spacing[3] }]}>
                Enter your email and we'll send you a sign-in link. No password needed.
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

          {/* CTA */}
          <Animated.View entering={FadeInUp.delay(350).duration(500)}>
            {sendError ? (
              <Text
                style={[text.bodySm, { color: colors.danger, textAlign: 'center', marginBottom: 12 }]}
              >
                {sendError}
              </Text>
            ) : null}
            <Button
              label="Send sign-in link"
              variant="primary"
              size="lg"
              fullWidth
              disabled={!isValid || isLoading}
              loading={isLoading}
              onPress={handleSubmit(onSubmit)}
            />
          </Animated.View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:           1,
    justifyContent: 'space-between',
  },
  backBtn: {
    width:           40,
    height:          40,
    alignItems:      'center',
    justifyContent:  'center',
    marginLeft:      -8,
    marginBottom:    8,
  },
  content: {
    flex:          1,
    justifyContent: 'center',
    paddingBottom:  24,
  },
  iconWrap: {
    alignSelf: 'flex-start',
  },
  spinnerRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  bottomActions: {
    gap:        16,
    alignItems: 'center',
  },
  changeEmailLink: {
    paddingVertical: 4,
  },
});
