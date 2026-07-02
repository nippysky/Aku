/**
 * Auth Callback Screen
 *
 * This route handles the deep link that arrives after the user taps the magic
 * link in their email. The server verifies the token and redirects to:
 *
 *   aku://auth-callback?token=JWT&user=BASE64_ENCODED_JSON
 *
 * Expo Router intercepts the deep link and renders this screen.
 * We extract the JWT + user, persist them, then route to pin-setup or tabs.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { useAuthStore } from '../store/auth.store';
import type { UserProfile } from '../lib/api-client';

export default function AuthCallbackScreen() {
  const { colors, text } = useTheme();
  const router           = useRouter();
  const { token, user: userParam } = useLocalSearchParams<{ token?: string; user?: string }>();

  const { handleAuthCallback, hasOnboarded } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      if (!token || !userParam) {
        setErrorMsg('Invalid sign-in link. Please request a new one.');
        setStatus('error');
        return;
      }

      let profile: UserProfile;
      try {
        profile = JSON.parse(atob(decodeURIComponent(userParam))) as UserProfile;
      } catch {
        setErrorMsg('Malformed sign-in link. Please request a new one.');
        setStatus('error');
        return;
      }

      try {
        await handleAuthCallback(decodeURIComponent(token), profile);
      } catch {
        setErrorMsg('Failed to complete sign-in. Please try again.');
        setStatus('error');
        return;
      }

      // Route to PIN setup for new users, or straight to lock screen for returning users
      if (hasOnboarded) {
        // Returning user — nav guard will show the lock screen
        router.replace('/(auth)');
      } else {
        // New user — continue onboarding (PIN setup)
        router.replace('/(onboarding)/pin-setup');
      }
    })();
  }, [token, userParam]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {status === 'loading' ? (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[text.body, { color: colors.textSecondary, marginTop: 16, textAlign: 'center' }]}>
            Signing you in…
          </Text>
        </>
      ) : (
        <>
          <Text style={[text.bodyMedium, { color: colors.text, textAlign: 'center', marginBottom: 8 }]}>
            Sign-in failed
          </Text>
          <Text style={[text.bodySm, { color: colors.textSecondary, textAlign: 'center' }]}>
            {errorMsg}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    padding:        32,
  },
});
