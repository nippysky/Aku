import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, {
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { Button, AmountInput, OnboardingHeader } from '../../components/ui';
import { AkuDatePicker } from '../../components/ui/AkuDatePicker';
import { Input } from '../../components/ui/Input';
import { useAuthStore, useBillsStore } from '../../store';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import type { BillCategory, BillFrequency } from '../../types';

// ─── Category chips ────────────────────────────────────────────────────────

type CategoryOption = { label: string; value: BillCategory };

const CATEGORIES: CategoryOption[] = [
  { label: 'Housing',        value: 'housing'       },
  { label: 'Utilities',      value: 'utilities'     },
  { label: 'Transport',      value: 'transport'     },
  { label: 'Food',           value: 'food'          },
  { label: 'Health',         value: 'health'        },
  { label: 'Education',      value: 'education'     },
  { label: 'Subscriptions',  value: 'subscriptions' },
  { label: 'Insurance',      value: 'insurance'     },
  { label: 'Entertainment',  value: 'entertainment' },
  { label: 'Other',          value: 'other'         },
];

// ─── Frequency chips ───────────────────────────────────────────────────────

type FrequencyOption = { value: BillFrequency; label: string };

const FREQUENCIES: FrequencyOption[] = [
  { value: 'weekly',    label: 'Weekly'    },
  { value: 'monthly',   label: 'Monthly'   },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly'    },
  { value: 'one-time',  label: 'One-time'  },
];

// ─── Today's date helper ───────────────────────────────────────────────────

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function FirstBillScreen() {
  const { colors, spacing, text, layout, radius, font } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { user }         = useAuthStore();
  const { add: addBill } = useBillsStore();

  const [name, setName]               = useState('');
  const [amount, setAmount]           = useState(0);
  const [category, setCategory]       = useState<BillCategory>('housing');
  const [dueDate, setDueDate]         = useState(todayString());
  const [frequency, setFrequency]     = useState<BillFrequency>('monthly');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState('');

  const canAdd = name.trim().length > 0 && amount > 0;

  async function handleAdd() {
    if (!canAdd || isLoading) return;
    if (!user?.id) return;

    try {
      setIsLoading(true);
      setError('');
      await addBill(
        {
          name:        name.trim(),
          amount,
          category,
          dueDate,
          frequency,
          notes:       null,
          notify30:    false,
          notify14:    true,
          notify7:     true,
          notify3:     true,
          notify1:     true,
          notifyDay:   true,
        },
        user.id,
      );
      router.push('/(onboarding)/first-budget');
    } catch {
      setError('Could not save bill. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleSkip() {
    router.push('/(onboarding)/first-budget');
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
      <View
        style={styles.container}
      >
        <OnboardingHeader
          step={4}
          total={6}
          onBack={() => router.back()}
          dark={false}
        />

        {/* Title */}
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <Text style={[text.onboardingTitle, { color: colors.text }]}>
            Add your first bill
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(500)}>
          <Text style={[text.body, { color: colors.textSecondary, marginTop: spacing[3], marginBottom: spacing[8] }]}>
            Bills you add here will be tracked and you'll get reminders.
          </Text>
        </Animated.View>

        {/* Bill name */}
        <Animated.View entering={FadeInDown.delay(240).duration(500)} style={{ marginBottom: spacing[5] }}>
          <Input
            label="Bill name"
            placeholder="e.g. Rent, Netflix, DSTV"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </Animated.View>

        {/* Amount */}
        <Animated.View entering={FadeInDown.delay(300).duration(500)} style={{ marginBottom: spacing[5] }}>
          <AmountInput
            label="Amount"
            value={amount}
            onChange={setAmount}
            size="md"
          />
        </Animated.View>

        {/* Category chips */}
        <Animated.View entering={FadeInDown.delay(360).duration(500)} style={{ marginBottom: spacing[5] }}>
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: spacing[2] }]}>
            Category
          </Text>
          <View style={styles.chips}>
            {CATEGORIES.map((cat) => {
              const isActive = category === cat.value;
              return (
                <Pressable
                  key={cat.value}
                  onPress={() => setCategory(cat.value)}
                  accessibilityRole="button"
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isActive ? colors.primary : colors.backgroundSecondary,
                      borderColor:     isActive ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      text.bodySm,
                      {
                        color:      isActive ? colors.textOnForest : colors.textSecondary,
                        fontFamily: font.sansMedium,
                      },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* Due date — calendar picker */}
        <Animated.View entering={FadeInDown.delay(420).duration(500)} style={{ marginBottom: spacing[5] }}>
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: spacing[2] }]}>
            Due date
          </Text>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            style={[
              styles.dateTrigger,
              {
                backgroundColor: colors.backgroundSecondary,
                borderColor:     colors.border,
                borderRadius:    radius.md,
              },
            ]}
          >
            <Text
              style={[
                text.body,
                {
                  color: dueDate ? colors.text : colors.textTertiary,
                  flex:  1,
                },
              ]}
            >
              {dueDate ? formatDisplayDate(dueDate) : 'Select due date'}
            </Text>
            <Calendar size={20} color={colors.textSecondary} strokeWidth={1.6} />
          </Pressable>
        </Animated.View>

        {/* Frequency chips */}
        <Animated.View entering={FadeInDown.delay(480).duration(500)} style={{ marginBottom: spacing[8] }}>
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: spacing[2] }]}>
            Frequency
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.freqRow}
          >
            {FREQUENCIES.map((freq) => {
              const isActive = frequency === freq.value;
              return (
                <Pressable
                  key={freq.value}
                  onPress={() => setFrequency(freq.value)}
                  accessibilityRole="button"
                  style={[
                    styles.freqChip,
                    {
                      backgroundColor: isActive ? Palette.forest : colors.backgroundSecondary,
                      borderColor:     isActive ? Palette.forest : colors.border,
                      borderRadius:    999,
                    },
                  ]}
                >
                  <Text
                    style={[
                      text.bodySm,
                      {
                        color:      isActive ? Palette.linen : colors.text,
                        fontFamily: font.sansMedium,
                      },
                    ]}
                  >
                    {freq.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* Error */}
        {error.length > 0 && (
          <Text style={[text.caption, { color: colors.danger, marginBottom: spacing[3] }]}>
            {error}
          </Text>
        )}

        {/* Buttons */}
        <Animated.View entering={FadeInUp.delay(500).duration(500)} style={styles.buttons}>
          <Button
            label="Add bill"
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canAdd}
            loading={isLoading}
            onPress={handleAdd}
          />
          <Button
            label="Skip for now →"
            variant="ghost"
            size="lg"
            fullWidth
            onPress={handleSkip}
          />
        </Animated.View>
      </View>

      <AkuDatePicker
        isOpen={showDatePicker}
        value={dueDate}
        onChange={(d) => setDueDate(d)}
        onClose={() => setShowDatePicker(false)}
        minDate={todayString()}
        title="Select due date"
      />
    </KeyboardAwareScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical:   8,
    borderRadius:      999,
    borderWidth:       1,
  },
  dateTrigger: {
    height:            52,
    paddingHorizontal: 16,
    flexDirection:     'row',
    alignItems:        'center',
    borderWidth:       1,
  },
  freqRow: {
    flexDirection: 'row',
    gap:           8,
    paddingBottom: 4,
  },
  freqChip: {
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderWidth:       1,
  },
  buttons: {
    gap: 12,
  },
});
