import React, { useState } from 'react';
import {
  Pressable,
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
import { Calendar } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button, Input, AmountInput, OnboardingHeader } from '../../components/ui';
import { AkuDatePicker } from '../../components/ui/AkuDatePicker';
import { useAuthStore, useGoalsStore } from '../../store';
import { OnboardingStorage } from '../../lib/onboarding-storage';
import { useTheme } from '../../theme';

// ─── Emoji options ─────────────────────────────────────────────────────────

const EMOJIS = ['✈️', '🏠', '🚗', '💍', '📚', '🎯', '💰', '🎁'];

// ─── Date display helper ────────────────────────────────────────────────────

function formatDisplay(iso: string): string {
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function FirstGoalScreen() {
  const { colors, spacing, text, layout, radius, font } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { user, unlock, markOnboardingComplete } = useAuthStore();
  const { add: addGoal } = useGoalsStore();

  async function finishOnboarding() {
    // markOnboardingComplete MUST come before unlock().
    // unlock() triggers the nav guard; if hasOnboarded is still false the
    // guard sends the user back to /(onboarding). Write the flag first.
    await markOnboardingComplete();
    unlock();
    OnboardingStorage.clear();
    router.replace('/(tabs)');
  }

  const [goalName, setGoalName]               = useState('');
  const [amount, setAmount]                   = useState(0);
  const [targetDate, setTargetDate]           = useState('');
  const [selectedEmoji, setEmoji]             = useState<string>('🎯');
  const [isLoading, setIsLoading]             = useState(false);
  const [error, setError]                     = useState('');
  const [showGoalDatePicker, setShowGoalDatePicker] = useState(false);

  const canCreate = goalName.trim().length > 0 && amount > 0;

  async function handleCreate() {
    if (!canCreate || isLoading) return;
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError('');
      await addGoal(
        {
          name:         goalName.trim(),
          targetAmount: amount,
          targetDate:   targetDate.length > 0 ? targetDate : null,
          notes:        null,
          emoji:        selectedEmoji,
          color:        null,
          householdId:  null,
          isShared:     false,
        },
        user.id,
      );
      await finishOnboarding();
    } catch {
      setError('Could not save goal. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleSkip() {
    void finishOnboarding();
  }

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop:        insets.top + spacing[2],
        paddingBottom:     Math.max(insets.bottom, spacing[6]) + spacing[4],
        paddingHorizontal: layout.screenPadding,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={20}
    >
      <View style={styles.container}>
        <OnboardingHeader
          step={9}
          total={9}
          onBack={() => router.back()}
          dark={false}
        />

        {/* Title */}
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <Text style={[text.onboardingTitle, { color: colors.text }]}>
            What are you{'\n'}saving for?
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(500)}>
          <Text
            style={[
              text.body,
              {
                color:        colors.textSecondary,
                marginTop:    spacing[3],
                marginBottom: spacing[8],
              },
            ]}
          >
            Create a goal and Akù will help you track your progress.
          </Text>
        </Animated.View>

        {/* Emoji picker */}
        <Animated.View entering={FadeInDown.delay(220).duration(500)} style={{ marginBottom: spacing[6] }}>
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: spacing[2] }]}>
            Choose an emoji
          </Text>
          <View style={styles.emojiRow}>
            {EMOJIS.map((emoji) => {
              const isSelected = selectedEmoji === emoji;
              return (
                <Pressable
                  key={emoji}
                  onPress={() => setEmoji(emoji)}
                  accessibilityRole="button"
                  style={[
                    styles.emojiBtn,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.backgroundSecondary,
                      borderColor:     isSelected ? colors.primary : colors.border,
                      borderRadius:    radius.md,
                    },
                  ]}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Goal name */}
        <Animated.View entering={FadeInDown.delay(300).duration(500)} style={{ marginBottom: spacing[5] }}>
          <Input
            label="Goal name"
            placeholder="e.g. Holiday to Paris, New car"
            value={goalName}
            onChangeText={setGoalName}
            autoCapitalize="sentences"
            returnKeyType="next"
          />
        </Animated.View>

        {/* Target amount */}
        <Animated.View entering={FadeInDown.delay(360).duration(500)} style={{ marginBottom: spacing[5] }}>
          <AmountInput
            label="Target amount"
            value={amount}
            onChange={setAmount}
            size="md"
          />
        </Animated.View>

        {/* Target date (optional) */}
        <Animated.View entering={FadeInDown.delay(420).duration(500)} style={{ marginBottom: spacing[8] }}>
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: spacing[2] }]}>
            Target date (optional)
          </Text>
          <Pressable
            onPress={() => setShowGoalDatePicker(true)}
            style={[
              styles.dateTrigger,
              {
                backgroundColor: colors.inputBackground,
                borderColor:     colors.inputBorder,
                borderRadius:    radius.md,
              },
            ]}
          >
            <Text
              style={[
                text.body,
                {
                  color: targetDate ? colors.text : colors.textTertiary,
                  flex:  1,
                },
              ]}
            >
              {targetDate ? formatDisplay(targetDate) : 'No deadline set'}
            </Text>
            <Calendar size={18} color={colors.textSecondary} strokeWidth={1.6} />
          </Pressable>
          <Text
            style={[
              text.caption,
              { color: colors.textTertiary, marginTop: spacing[1], marginLeft: 2 },
            ]}
          >
            Leave blank if you don't have a deadline in mind.
          </Text>
        </Animated.View>

        {error.length > 0 && (
          <Text style={[text.caption, { color: colors.danger, marginBottom: spacing[3] }]}>
            {error}
          </Text>
        )}

        {/* Buttons */}
        <Animated.View entering={FadeInUp.delay(480).duration(500)} style={styles.buttons}>
          <Button
            label="Create goal"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canCreate}
            loading={isLoading}
            onPress={handleCreate}
          />
          <Button
            label="Skip →"
            variant="ghost"
            size="lg"
            fullWidth
            onPress={handleSkip}
          />
        </Animated.View>
      </View>

      <AkuDatePicker
        isOpen={showGoalDatePicker}
        value={targetDate}
        onChange={setTargetDate}
        onClose={() => setShowGoalDatePicker(false)}
        title="Select target date"
      />
    </KeyboardAwareScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  emojiBtn: {
    width:          52,
    height:         52,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
  },
  emojiText: {
    fontSize: 24,
  },
  dateTrigger: {
    flexDirection:     'row',
    alignItems:        'center',
    borderWidth:       1,
    paddingHorizontal: 14,
    paddingVertical:   14,
    gap:               8,
  },
  buttons: {
    gap: 12,
  },
});
