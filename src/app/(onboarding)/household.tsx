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
import { Button, Input, KeyboardWrapper, OnboardingHeader } from '../../components/ui';
import { useAuthStore, useCirclesStore } from '../../store';
import { useTheme } from '../../theme';

// ─── Screen ────────────────────────────────────────────────────────────────

export default function HouseholdScreen() {
  const { colors, spacing, text, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { user }   = useAuthStore();
  const { create } = useCirclesStore();

  const [householdName, setHouseholdName] = useState('');
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState('');

  const canContinue = householdName.trim().length > 0;

  function handleSkip() {
    router.push('/(onboarding)/first-bill');
  }

  async function handleContinue() {
    if (!canContinue || isLoading) return;
    if (!user?.id) {
      // Dev mode guard — silently skip if no user
      router.push('/(onboarding)/first-bill');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      await create(householdName.trim(), user.id);
      router.push('/(onboarding)/first-bill');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
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
          step={6}
          total={9}
          onBack={() => router.back()}
          dark={false}
        />

        {/* Content */}
        <View style={styles.content}>
          <Animated.View entering={FadeInDown.delay(60).duration(500)}>
            <Text style={[text.onboardingTitle, { color: colors.text }]}>
              Name your{'\n'}Circle
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(140).duration(500)}>
            <Text style={[text.body, { color: colors.textSecondary, marginTop: spacing[3] }]}>
              Give your Circle a name so members can find and join it. You can skip this and set it up later.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(220).duration(500)}
            style={{ marginTop: spacing[8] }}
          >
            <Input
              label="Circle name"
              placeholder="Your Circle name"
              value={householdName}
              onChangeText={(v) => {
                setHouseholdName(v);
                if (error) setError('');
              }}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              error={error || undefined}
              onSubmitEditing={handleContinue}
            />
          </Animated.View>

          {/* Hint */}
          <Animated.View entering={FadeInDown.delay(300).duration(500)}>
            <Text
              style={[
                text.caption,
                {
                  color:      colors.textTertiary,
                  marginTop:  spacing[2],
                  marginLeft: 2,
                },
              ]}
            >
              e.g. The Osegbes, The Johnsons
            </Text>
          </Animated.View>
        </View>

        {/* Continue + Skip */}
        <Animated.View entering={FadeInUp.delay(360).duration(500)}>
          <Button
            label="Continue"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canContinue}
            loading={isLoading}
            onPress={handleContinue}
          />
          <Button
            label="Skip for now"
            variant="ghost"
            size="lg"
            fullWidth
            onPress={handleSkip}
            style={{ marginTop: 12 }}
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
});
