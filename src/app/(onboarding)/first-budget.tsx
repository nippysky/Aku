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
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button, AmountInput, OnboardingHeader } from '../../components/ui';
import { useAuthStore, useBudgetsStore } from '../../store';
import { useTheme } from '../../theme';
import type { BudgetPeriod, ExpenseCategory } from '../../types';

// ─── Category grid ─────────────────────────────────────────────────────────

type CategoryOption = { label: string; emoji: string; value: ExpenseCategory };

const CATEGORIES: CategoryOption[] = [
  { label: 'Food',          emoji: '🍽️', value: 'food'          },
  { label: 'Transport',     emoji: '🚗', value: 'transport'     },
  { label: 'Shopping',      emoji: '🛍️', value: 'shopping'      },
  { label: 'Entertainment', emoji: '🎬', value: 'entertainment' },
  { label: 'Housing',       emoji: '🏠', value: 'housing'       },
  { label: 'Utilities',     emoji: '⚡', value: 'utilities'     },
  { label: 'Health',        emoji: '❤️', value: 'health'        },
  { label: 'Family',        emoji: '👨‍👩‍👦', value: 'family'        },
  { label: 'Education',     emoji: '📚', value: 'education'     },
  { label: 'Savings',       emoji: '🐷', value: 'savings'       },
  { label: 'Gifts',         emoji: '🎁', value: 'gifts'         },
  { label: 'Other',         emoji: '•••', value: 'other'        },
];

// ─── Period tabs ────────────────────────────────────────────────────────────

const PERIODS: { label: string; value: BudgetPeriod }[] = [
  { label: 'Weekly',  value: 'weekly'  },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly',  value: 'yearly'  },
];

// ─── Screen ────────────────────────────────────────────────────────────────

export default function FirstBudgetScreen() {
  const { colors, spacing, text, layout, radius, font } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { user }           = useAuthStore();

  const { add: addBudget } = useBudgetsStore();

  const [category, setCategory]   = useState<ExpenseCategory>('food');
  const [amount, setAmount]       = useState(0);
  const [period, setPeriod]       = useState<BudgetPeriod>('monthly');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState('');

  const canSet = amount > 0;

  async function handleSet() {
    if (!canSet || isLoading) return;
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError('');
      await addBudget(
        {
          category,
          amount,
          period,
          householdId: null,
          isShared:    false,
        },
        user.id,
      );
      router.push('/(onboarding)/first-goal');
    } catch {
      setError('Could not save budget. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleSkip() {
    router.push('/(onboarding)/first-goal');
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
          step={7}
          total={8}
          onBack={() => router.back()}
          dark={false}
        />

        {/* Title */}
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <Text style={[text.onboardingTitle, { color: colors.text }]}>
            Set a spending{'\n'}budget
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(500)}>
          <Text
            style={[
              text.body,
              { color: colors.textSecondary, marginTop: spacing[3], marginBottom: spacing[8] },
            ]}
          >
            Akù will alert you when you're close to the limit.
          </Text>
        </Animated.View>

        {/* Category grid */}
        <Animated.View entering={FadeInDown.delay(240).duration(500)} style={{ marginBottom: spacing[6] }}>
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: spacing[3] }]}>
            Category
          </Text>
          <View style={styles.grid}>
            {CATEGORIES.map((cat) => {
              const isActive = category === cat.value;
              return (
                <Pressable
                  key={cat.value}
                  onPress={() => setCategory(cat.value)}
                  accessibilityRole="button"
                  style={[
                    styles.categoryCard,
                    {
                      backgroundColor: isActive ? colors.primary : colors.backgroundSecondary,
                      borderColor:     isActive ? colors.primary : colors.border,
                      borderRadius:    radius.md,
                    },
                  ]}
                >
                  <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                  <Text
                    style={[
                      text.caption,
                      {
                        color:      isActive ? colors.textOnForest : colors.textSecondary,
                        fontFamily: font.sansMedium,
                        marginTop:  4,
                        textAlign:  'center',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Amount */}
        <Animated.View entering={FadeInDown.delay(320).duration(500)} style={{ marginBottom: spacing[6] }}>
          <AmountInput
            label="Budget amount"
            value={amount}
            onChange={setAmount}
            size="md"
          />
        </Animated.View>

        {/* Period tabs */}
        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={{ marginBottom: spacing[8] }}>
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: spacing[2] }]}>
            Period
          </Text>
          <View
            style={[
              styles.periodRow,
              {
                backgroundColor: colors.backgroundSecondary,
                borderRadius:    radius.md,
                borderColor:     colors.border,
              },
            ]}
          >
            {PERIODS.map((p) => {
              const isActive = period === p.value;
              return (
                <Pressable
                  key={p.value}
                  onPress={() => setPeriod(p.value)}
                  accessibilityRole="button"
                  style={[
                    styles.periodTab,
                    {
                      backgroundColor: isActive ? colors.card : 'transparent',
                      borderRadius:    radius.sm,
                      ...(isActive && {
                        shadowColor:   '#000',
                        shadowOffset:  { width: 0, height: 1 },
                        shadowOpacity: 0.06,
                        shadowRadius:  4,
                        elevation:     1,
                      }),
                    },
                  ]}
                >
                  <Text
                    style={[
                      text.bodySm,
                      {
                        color:      isActive ? colors.primary : colors.textSecondary,
                        fontFamily: isActive ? font.sansSemiBold : font.sansRegular,
                      },
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {error.length > 0 && (
          <Text style={[text.caption, { color: colors.danger, marginBottom: spacing[3] }]}>
            {error}
          </Text>
        )}

        {/* Buttons */}
        <Animated.View entering={FadeInUp.delay(480).duration(500)} style={styles.buttons}>
          <Button
            label="Set budget"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canSet}
            loading={isLoading}
            onPress={handleSet}
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
    </KeyboardAwareScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
  },
  categoryCard: {
    width:           '30%',
    paddingVertical: 12,
    alignItems:      'center',
    borderWidth:     1,
  },
  categoryEmoji: {
    fontSize: 22,
  },
  periodRow: {
    flexDirection: 'row',
    padding:       4,
    borderWidth:   1,
  },
  periodTab: {
    flex:            1,
    paddingVertical: 10,
    alignItems:      'center',
  },
  buttons: {
    gap: 12,
  },
});
