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
import { useTheme } from '../../theme';
import { OnboardingStorage } from '../../lib/onboarding-storage';

// ─── Screen ────────────────────────────────────────────────────────────────

export default function NameScreen() {
  const { colors, spacing, text, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState('');

  const canContinue = name.trim().length > 0;

  function handleContinue() {
    OnboardingStorage.setName(name.trim());
    router.push('/(onboarding)/email');
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
        <OnboardingHeader step={1} total={9} dark={false} />

        {/* Content */}
        <View style={styles.content}>
          <Animated.View entering={FadeInDown.delay(80).duration(500)}>
            <Text style={[text.onboardingTitle, { color: colors.text }]}>
              What should{'\n'}we call you?
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(500)}>
            <Text style={[text.body, { color: colors.textSecondary, marginTop: spacing[3] }]}>
              We'll use this to personalise your experience.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(240).duration(500)}
            style={{ marginTop: spacing[8] }}
          >
            <Input
              label="First name"
              placeholder="Your first name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canContinue) handleContinue();
              }}
            />
          </Animated.View>
        </View>

        {/* Continue button */}
        <Animated.View entering={FadeInUp.delay(300).duration(500)}>
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
});
