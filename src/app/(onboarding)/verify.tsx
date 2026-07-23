import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle } from 'react-native-svg';
import { Button, OnboardingHeader } from '../../components/ui';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import { useAuthStore } from '../../store/auth.store';
import { OnboardingStorage } from '../../lib/onboarding-storage';
import { verifyMagicOTP, getFriendlyErrorMessage } from '../../lib/api-client';

// Cooldown between resend taps — long enough to discourage hammering the
// button (and the email provider), short enough not to be annoying if the
// email is slow to arrive.
const RESEND_COOLDOWN_SECONDS = 30;

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
  const { colors, spacing, text, layout, font, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const params = useLocalSearchParams<{ email: string }>();
  const email  = params.email ?? OnboardingStorage.getEmail() ?? '';

  const { signIn, handleAuthCallback, hasOnboarded } = useAuthStore();

  const [resent, setResent]       = useState(false);
  const [resending, setResending] = useState(false);
  // Starts already running — the initial send from email.tsx just happened,
  // so a fresh screen shouldn't let the user immediately hammer resend too.
  const [cooldown, setCooldown]   = useState(RESEND_COOLDOWN_SECONDS);

  // OTP toggle state
  const [showOtp, setShowOtp]     = useState(false);
  const [otp, setOtp]             = useState('');
  const [otpError, setOtpError]   = useState('');
  const [verifying, setVerifying] = useState(false);
  const otpInputRef               = useRef<TextInput>(null);

  // Tick the resend cooldown down once a second while it's running.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    if (resending || cooldown > 0) return;
    setResending(true);
    try {
      const name        = OnboardingStorage.getName() ?? undefined;
      const storedEmail = OnboardingStorage.getEmail() ?? email;
      // No intent here: by this point the account already exists (created on
      // the initial send from email.tsx), so the sign-up/sign-in gate on the
      // server doesn't need to run again — it'd only get in the way.
      await signIn(storedEmail, name);
      setResent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setTimeout(() => setResent(false), 4000);
    } catch {
      // Non-fatal — user can try again
    } finally {
      setResending(false);
    }
  }, [resending, cooldown, email, signIn]);

  const handleToggleOtp = useCallback(() => {
    setShowOtp((v) => !v);
    setOtp('');
    setOtpError('');
    setTimeout(() => otpInputRef.current?.focus(), 100);
    Haptics.selectionAsync();
  }, []);

  const handleVerifyOtp = useCallback(async () => {
    const trimmed = otp.trim();
    if (trimmed.length !== 6) {
      setOtpError('Enter the 6-digit code from your email.');
      return;
    }
    setOtpError('');
    setVerifying(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const storedEmail = OnboardingStorage.getEmail() ?? email;
      const res = await verifyMagicOTP(storedEmail, trimmed);

      // handleAuthCallback persists the JWT + user and sets isLocked=true
      await handleAuthCallback(res.jwt, { ...res.user, isNew: res.isNew });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Mirror the routing logic from auth-callback.tsx
      if (hasOnboarded) {
        router.replace('/(auth)');
      } else if (res.isNew) {
        router.replace('/(onboarding)/secure' as never);
      } else {
        router.replace('/(onboarding)/secure?returning=1' as never);
      }
    } catch (e) {
      setOtpError(getFriendlyErrorMessage(e, 'Invalid or expired code. Request a new link and try again.'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setVerifying(false);
    }
  }, [otp, email, handleAuthCallback]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Scroll area — auto-scrolls OTP input above keyboard */}
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
          step={4}
          total={6}
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
            <Text style={[text.body, { color: colors.textSecondary, marginTop: spacing[3] }]}>
              We sent a link to{' '}
              <Text style={{ color: colors.primary, fontFamily: 'PlusJakartaSans_500Medium' }}>
                {email || 'your email'}
              </Text>
              . Tap it to continue.
            </Text>
          </Animated.View>

          {!showOtp && (
            <Animated.View
              entering={FadeInDown.delay(340).duration(500)}
              style={[styles.spinnerRow, { marginTop: spacing[8] }]}
            >
              <ActivityIndicator size="small" color={colors.textTertiary} />
              <Text style={[text.bodySm, { color: colors.textTertiary, marginLeft: spacing[2] }]}>
                Waiting for you to tap the link…
              </Text>
            </Animated.View>
          )}

          {/* OTP input — scrolls into view above keyboard automatically */}
          {showOtp && (
            <Animated.View entering={FadeIn.duration(250)} style={{ marginTop: spacing[8], width: '100%' }}>
              <Text style={[text.label, { color: colors.textSecondary, marginBottom: spacing[2] }]}>
                Enter the 6-digit code from your email
              </Text>
              <View
                style={[
                  styles.otpWrap,
                  {
                    borderColor:     otpError ? colors.danger : otp.length === 6 ? colors.primary : colors.border,
                    borderRadius:    radius.lg,
                    backgroundColor: colors.inputBackground,
                  },
                ]}
              >
                <TextInput
                  ref={otpInputRef}
                  value={otp}
                  onChangeText={(v) => {
                    setOtp(v.replace(/\D/g, '').substring(0, 6));
                    if (otpError) setOtpError('');
                  }}
                  placeholder="123456"
                  placeholderTextColor={colors.inputPlaceholder}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={handleVerifyOtp}
                  style={[
                    styles.otpInput,
                    {
                      fontFamily:    font.sansSemiBold,
                      fontSize:      fontSize['2xl'],
                      color:         otp.length === 6 ? colors.primary : colors.text,
                      letterSpacing: 8,
                    },
                  ]}
                />
              </View>
              {otpError ? (
                <Text style={[text.caption, { color: colors.danger, marginTop: spacing[1] }]}>
                  {otpError}
                </Text>
              ) : (
                <Text style={[text.caption, { color: colors.textTertiary, marginTop: spacing[1] }]}>
                  The code expires in 15 minutes.
                </Text>
              )}
            </Animated.View>
          )}
        </View>
      </KeyboardAwareScrollView>

      {/* Fixed bottom actions — never pushed up by keyboard */}
      <Animated.View
        entering={FadeInUp.delay(400).duration(500)}
        style={[
          styles.bottomActions,
          {
            paddingHorizontal: layout.screenPadding,
            paddingBottom:     Math.max(insets.bottom, spacing[6]) + spacing[4],
          },
        ]}
      >
        {showOtp ? (
          <>
            <Button
              label={verifying ? 'Verifying…' : 'Verify code'}
              variant="primary"
              size="lg"
              fullWidth
              loading={verifying}
              disabled={verifying || otp.length !== 6}
              onPress={handleVerifyOtp}
            />
            <Pressable onPress={handleToggleOtp} style={styles.backLink}>
              <Text style={[text.bodySm, { color: colors.textSecondary }]}>
                Back to waiting for link
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Button
              label={
                resending ? 'Sending…'
                : resent ? 'Email sent!'
                : cooldown > 0 ? `Resend email (${cooldown}s)`
                : 'Resend email'
              }
              variant="secondary"
              size="lg"
              fullWidth
              loading={resending}
              disabled={resending || cooldown > 0}
              onPress={handleResend}
            />
            <Pressable onPress={handleToggleOtp} style={styles.backLink}>
              <Text style={[text.bodySm, { color: colors.textSecondary }]}>
                Got the email on a different device?{' '}
                <Text style={{ color: colors.primary }}>Enter the code</Text>
              </Text>
            </Pressable>
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
          </>
        )}
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
    flex:          1,
    justifyContent: 'center',
    paddingBottom:  16,
  },
  illustration: {
    alignSelf: 'flex-start',
  },
  spinnerRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  otpWrap: {
    borderWidth:       1.5,
    height:            64,
    paddingHorizontal: 18,
    justifyContent:    'center',
  },
  otpInput: {
    height: '100%',
  },
  bottomActions: {
    gap:        16,
    alignItems: 'center',
    paddingTop: 8,
  },
  backLink: {
    paddingVertical: 4,
  },
});
