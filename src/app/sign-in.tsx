/**
 * Sign In Screen — for returning users on a new device or after reinstall.
 *
 * Flow:
 *   Enter email → email sent (magic link + 6-digit code) → "Check your inbox" state
 *   User either:
 *     (a) taps link in email → auth-callback.tsx → lock screen
 *     (b) enters 6-digit code inline → verifyMagicOTP → handleAuthCallback → lock screen
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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
import { verifyMagicOTP, getFriendlyErrorMessage } from '../lib/api-client';

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
  const { signIn, handleAuthCallback, isLoading } = useAuthStore();

  const [step, setStep]           = useState<'input' | 'sent'>('input');
  const [sentEmail, setSentEmail] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent]       = useState(false);

  // OTP inline entry
  const [otp, setOtp]           = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const otpRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
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
      setOtp('');
      setOtpError(null);
      setStep('sent');
    } catch (err) {
      setSendError(getFriendlyErrorMessage(err, 'Could not send the email. Please try again.'));
    }
  }, [signIn]);

  const handleResend = useCallback(async () => {
    if (resending) return;
    setResending(true);
    setSendError(null);
    setOtpError(null);
    setOtp('');
    try {
      await signIn(sentEmail);
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } catch (err) {
      setSendError(getFriendlyErrorMessage(err, 'Could not resend. Please try again.'));
    } finally {
      setResending(false);
    }
  }, [resending, sentEmail, signIn]);

  const handleOtpChange = useCallback(async (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setOtp(digits);
    setOtpError(null);

    if (digits.length === 6) {
      setOtpLoading(true);
      try {
        const { jwt, user: profile, isNew } = await verifyMagicOTP(sentEmail, digits);
        await handleAuthCallback(jwt, profile);
        // Mirror auth-callback.tsx routing:
        // sign-in screen is only reachable when hasOnboarded = false (new device / reinstall)
        if (isNew) {
          router.replace('/(onboarding)/secure' as never);
        } else {
          router.replace('/(onboarding)/secure?returning=1' as never);
        }
      } catch (err) {
        setOtpError(getFriendlyErrorMessage(err, 'Invalid code. Please try again.'));
        setOtp('');
        setTimeout(() => otpRef.current?.focus(), 100);
      } finally {
        setOtpLoading(false);
      }
    }
  }, [sentEmail, handleAuthCallback]);

  // ── "Check your inbox" state ──────────────────────────────────────────────

  if (step === 'sent') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
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
          <Pressable
            onPress={() => setStep('input')}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={22} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>

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
                We sent a sign-in link and a{' '}
                <Text style={{ color: colors.text, fontFamily: 'PlusJakartaSans_500Medium' }}>
                  6-digit code
                </Text>{' '}
                to{' '}
                <Text style={{ color: colors.primary, fontFamily: 'PlusJakartaSans_500Medium' }}>
                  {sentEmail}
                </Text>
                .
              </Text>
            </Animated.View>

            {/* OTP entry — scrolls into view above keyboard */}
            <Animated.View
              entering={FadeInDown.delay(300).duration(500)}
              style={{ marginTop: spacing[8] }}
            >
              <Text style={[text.label, { color: colors.textSecondary, marginBottom: spacing[3] }]}>
                Enter 6-digit code
              </Text>
              <TextInput
                ref={otpRef}
                value={otp}
                onChangeText={handleOtpChange}
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
                editable={!otpLoading}
                placeholder="——————"
                placeholderTextColor={colors.border}
                style={[
                  styles.otpInput,
                  {
                    backgroundColor: colors.backgroundSecondary,
                    borderColor:     otpError ? colors.danger : otp.length > 0 ? colors.primary : colors.border,
                    color:           colors.text,
                  },
                ]}
              />
              {otpLoading ? (
                <View style={[styles.otpFeedbackRow, { marginTop: spacing[3] }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[text.bodySm, { color: colors.textSecondary, marginLeft: spacing[2] }]}>
                    Verifying…
                  </Text>
                </View>
              ) : otpError ? (
                <Text style={[text.bodySm, { color: colors.danger, marginTop: spacing[2] }]}>
                  {otpError}
                </Text>
              ) : null}
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(380).duration(500)}
              style={[styles.dividerRow, { marginTop: spacing[8] }]}
            >
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[text.caption, { color: colors.textTertiary, marginHorizontal: spacing[3] }]}>
                or tap the link in the email
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </Animated.View>
          </View>
        </KeyboardAwareScrollView>

        {/* Fixed bottom actions */}
        <Animated.View
          entering={FadeInUp.delay(440).duration(500)}
          style={[
            styles.bottomActions,
            {
              paddingHorizontal: layout.screenPadding,
              paddingBottom:     Math.max(insets.bottom, spacing[6]) + spacing[4],
            },
          ]}
        >
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
            disabled={resending || otpLoading}
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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={22} color={colors.textSecondary} strokeWidth={2} />
        </Pressable>

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
              Enter your email and we'll send you a sign-in link and a 6-digit code. No password needed.
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
      </KeyboardAwareScrollView>

      {/* Fixed CTA — never pushed up by keyboard */}
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
          label="Send sign-in email"
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
  backBtn: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
    marginLeft:     -8,
    marginBottom:   8,
  },
  content: {
    flex:           1,
    justifyContent: 'center',
    paddingBottom:  32,
  },
  iconWrap: {
    alignSelf: 'flex-start',
  },
  otpInput: {
    height:        64,
    borderWidth:   1.5,
    borderRadius:  14,
    fontSize:      28,
    letterSpacing: 10,
    fontFamily:    'PlusJakartaSans_600SemiBold',
  },
  otpFeedbackRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  dividerLine: {
    flex:   1,
    height: 1,
  },
  bottomActions: {
    gap:        16,
    alignItems: 'center',
    paddingTop: 8,
  },
  changeEmailLink: {
    paddingVertical: 4,
  },
  footer: {
    paddingTop: 8,
  },
});
