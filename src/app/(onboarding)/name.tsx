import React from 'react';
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
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button, Input, OnboardingHeader } from '../../components/ui';
import { useTheme } from '../../theme';
import { OnboardingStorage } from '../../lib/onboarding-storage';

// ─── Schema ────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z
    .string()
    .min(1, 'Please enter your name.')
    .min(2, 'Name must be at least 2 characters.')
    .max(50, 'Name must be 50 characters or fewer.')
    .regex(/^[\p{L}\p{M}'\- ]+$/u, 'Name can only contain letters, spaces, hyphens, and apostrophes.'),
});

type FormValues = z.infer<typeof schema>;

// ─── Screen ────────────────────────────────────────────────────────────────

export default function NameScreen() {
  const { colors, spacing, text, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver:      zodResolver(schema),
    defaultValues: { name: '' },
    mode:          'onChange',
  });

  function onSubmit({ name }: FormValues) {
    OnboardingStorage.setName(name.trim());
    router.push('/(onboarding)/currency');
  }

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
        <OnboardingHeader step={1} total={6} dark={false} />

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
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="First name"
                  placeholder="Your first name"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  error={errors.name?.message}
                  onSubmitEditing={handleSubmit(onSubmit)}
                />
              )}
            />
          </Animated.View>
        </View>
      </KeyboardAwareScrollView>

      {/* Fixed footer — never pushed up by keyboard */}
      <Animated.View
        entering={FadeInUp.delay(300).duration(500)}
        style={[
          styles.footer,
          {
            paddingHorizontal: layout.screenPadding,
            paddingBottom:     Math.max(insets.bottom, spacing[6]) + spacing[4],
          },
        ]}
      >
        <Button
          label="Continue"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!isValid}
          onPress={handleSubmit(onSubmit)}
        />
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
  footer: {
    paddingTop: 8,
  },
});
