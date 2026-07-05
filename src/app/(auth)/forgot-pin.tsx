/**
 * Forgot Passcode screen
 *
 * Flow:
 *   1. User enters email → we send a magic link + write a SecureStore reset flag.
 *   2. User taps the link → auth-callback reads the flag → clears PIN + ONBOARDED
 *      → routes to pin-setup?returning=1 (regardless of hasOnboarded).
 *   3. User sets a new passcode in pin-setup → setupPin() fetches the same DEK
 *      from the server → all financial data is fully intact.
 *
 * Security model (Option B):
 *   The DEK is a random key stored server-side (encrypted at rest). The passcode
 *   is a screen-lock only — resetting it does NOT change the DEK, so data is
 *   always recoverable after re-authenticating via email.
 */
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import Svg, { Path } from 'react-native-svg';
import { Button, Input, KeyboardWrapper } from '../../components/ui';
import { useAuthStore } from '../../store';
import { requestMagicLink } from '../../lib/api-client';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';

// ─── SecureStore key checked by auth-callback to override routing ─────────────
export const PIN_RESET_PENDING_KEY = 'aku_pin_reset_pending';

// ─── Email validation ──────────────────────────────────────────────────────────

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ─── Envelope illustration ────────────────────────────────────────────────────

function EnvelopeSentIllustration() {
  return (
    <Svg width={100} height={84} viewBox="0 0 120 100" fill="none">
      <Path
        d="M10 30 L10 80 Q10 88 18 88 L102 88 Q110 88 110 80 L110 30 Q110 22 102 22 L18 22 Q10 22 10 30 Z"
        stroke={Palette.forest}
        strokeWidth={2.5}
        fill="none"
        strokeLinejoin="round"
      />
      <Path
        d="M10 30 L60 58 L110 30"
        stroke={Palette.forest}
        strokeWidth={2.5}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Path
        d="M90 8 L100 20 L75 26 L90 8 Z"
        stroke={Palette.forest}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="round"
      />
      <Path
        d="M90 8 L82 22"
        stroke={Palette.forest}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type ScreenState = 'form' | 'success';

export default function ForgotPinScreen() {
  const { colors, spacing, text, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { user } = useAuthStore();

  const [email, setEmail]         = useState(user?.email ?? '');
  const [error, setError]         = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [screenState, setScreen]  = useState<ScreenState>('form');

  async function handleSend() {
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      // 1. Send magic link via the real API
      await requestMagicLink(email);

      // 2. Mark that the next auth-callback should route to pin-setup
      //    (bypassing the normal hasOnboarded routing)
      await SecureStore.setItemAsync(PIN_RESET_PENDING_KEY, 'true');

      setScreen('success');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // ── Success state ────────────────────────────────────────────────────────────

  if (screenState === 'success') {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor:   colors.background,
            paddingTop:        insets.top + spacing[8],
            paddingBottom:     Math.max(insets.bottom, spacing[6]) + spacing[4],
            paddingHorizontal: layout.screenPadding,
          },
        ]}
      >
        <View style={styles.successContent}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.illustration}>
            <EnvelopeSentIllustration />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(500)}>
            <Text style={[text.onboardingTitle, { color: colors.text, marginTop: spacing[8] }]}>
              Check your email
              {user?.name ? `, ${user.name.split(' ')[0]}.` : '.'}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(300).duration(500)}>
            <Text style={[text.body, { color: colors.textSecondary, marginTop: spacing[3] }]}>
              We sent a sign-in link to{' '}
              <Text style={{ color: colors.primary, fontFamily: FontFamily.sansMedium }}>
                {email}
              </Text>
              .{'\n\n'}
              Tap it to set a new passcode. Your expenses, bills and goals will all be waiting for you.
            </Text>
          </Animated.View>

          {/* Reassurance — data is safe */}
          <Animated.View
            entering={FadeInDown.delay(420).duration(500)}
            style={[styles.infoBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.borderLight }]}
          >
            <Text style={[styles.infoTitle, { color: colors.text }]}>
              Your data is safe
            </Text>
            <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
              Your passcode is a screen-lock only — your financial records are encrypted with a separate key stored securely on our servers. Resetting your passcode doesn't touch your data.
            </Text>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInUp.delay(500).duration(500)}>
          <Button
            label="Back to sign in"
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.replace('/sign-in')}
          />
        </Animated.View>
      </View>
    );
  }

  // ── Form state ───────────────────────────────────────────────────────────────

  return (
    <KeyboardWrapper style={{ backgroundColor: colors.background }}>
      <View
        style={[
          styles.container,
          {
            paddingTop:        insets.top + spacing[4],
            paddingBottom:     Math.max(insets.bottom, spacing[6]) + spacing[4],
            paddingHorizontal: layout.screenPadding,
          },
        ]}
      >
        {/* Content */}
        <View style={styles.content}>
          <Animated.View entering={FadeInDown.delay(60).duration(500)}>
            <Text style={[text.onboardingTitle, { color: colors.text }]}>
              Reset your{'\n'}passcode
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(140).duration(500)}>
            <Text style={[text.body, { color: colors.textSecondary, marginTop: spacing[3] }]}>
              Enter your email and we'll send a sign-in link to set a new passcode. Your financial records will be fully restored.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(220).duration(500)}
            style={{ marginTop: spacing[6] }}
          >
            <Input
              label="Email address"
              placeholder="you@example.com"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (error) setError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="done"
              error={error || undefined}
              onSubmitEditing={handleSend}
            />
          </Animated.View>
        </View>

        {/* Buttons */}
        <Animated.View entering={FadeInUp.delay(300).duration(500)} style={styles.buttons}>
          <Button
            label="Send reset link"
            variant="primary"
            size="lg"
            fullWidth
            loading={isLoading}
            disabled={!isValidEmail(email) || isLoading}
            onPress={handleSend}
          />
          <Button
            label="Back"
            variant="ghost"
            size="lg"
            fullWidth
            onPress={() => router.back()}
          />
        </Animated.View>
      </View>
    </KeyboardWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  successContent: {
    flex:           1,
    justifyContent: 'center',
    paddingBottom:  24,
  },
  illustration: {
    alignSelf: 'flex-start',
  },
  infoBox: {
    borderRadius:  12,
    borderWidth:   1,
    padding:       16,
    gap:           6,
    marginTop:     20,
  },
  infoTitle: {
    fontFamily: FontFamily.sansMedium,
    fontSize:   FontSize.sm,
  },
  infoBody: {
    fontFamily:  FontFamily.sansRegular,
    fontSize:    FontSize.sm,
    lineHeight:  FontSize.sm * 1.6,
  },
  buttons: {
    gap: 12,
  },
});
