import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { GlassSheetBackground } from '../ui/GlassSheetBackground';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useForm, Controller } from 'react-hook-form';
import { Calendar } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme';
import { Input } from '../ui/Input';
import { AmountInput } from '../ui/AmountInput';
import { Button } from '../ui/Button';
import { AkuDatePicker } from '../ui/AkuDatePicker';
import { useGoalsStore } from '../../store/goals.store';
import { useUIStore } from '../../store/ui.store';
import type { GoalWithProgress } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditGoalSheetProps {
  goal:      GoalWithProgress | null;
  onClose:   () => void;
  onSuccess?: () => void;
}

interface FormData {
  name:       string;
  amount:     number;
  emoji:      string;
  hasDate:    boolean;
  targetDate: string;
  notes:      string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMOJI_OPTIONS = ['✈️', '🏠', '🚗', '💍', '📚', '🎯', '💰', '🌴'];
const SNAP_POINTS  = ['75%', '90%'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplay(iso: string): string {
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

// ─── Emoji button ─────────────────────────────────────────────────────────────

interface EmojiButtonProps {
  emoji:    string;
  selected: boolean;
  onPress:  () => void;
}

function EmojiButton({ emoji, selected, onPress }: EmojiButtonProps) {
  const { colors, radius } = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    scale.value = withSpring(1.1, { damping: 14, stiffness: 400 });
    setTimeout(() => {
      scale.value = withSpring(1, { damping: 14, stiffness: 400 });
    }, 120);
    onPress();
  }, [onPress, scale]);

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Select ${emoji} emoji`}
        style={[
          styles.emojiBtn,
          {
            borderColor:     selected ? colors.accent : colors.border,
            borderWidth:     selected ? 2 : 1,
            borderRadius:    radius.md,
            backgroundColor: selected ? colors.accent + '18' : colors.backgroundSecondary,
          },
        ]}
      >
        <Text style={styles.emojiBtnText}>{emoji}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EditGoalSheet({ goal, onClose, onSuccess }: EditGoalSheetProps) {
  const { colors, text, font, fontSize, radius } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const { update }    = useGoalsStore();
  const { showToast } = useUIStore();

  const [showDatePicker, setShowDatePicker] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      name:       '',
      amount:     0,
      emoji:      '🎯',
      hasDate:    false,
      targetDate: todayString(),
      notes:      '',
    },
  });

  const hasDate    = watch('hasDate');
  const targetDate = watch('targetDate');

  // Pre-fill form when goal changes
  useEffect(() => {
    if (goal) {
      reset({
        name:       goal.name,
        amount:     goal.targetAmount,
        emoji:      goal.emoji ?? '🎯',
        hasDate:    Boolean(goal.targetDate),
        targetDate: goal.targetDate ?? todayString(),
        notes:      goal.notes ?? '',
      });
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [goal, reset]);

  const handleClose = useCallback(() => {
    sheetRef.current?.dismiss();
    reset();
    onClose();
  }, [onClose, reset]);

  const onSubmit = useCallback(async (data: FormData) => {
    if (!goal) return;
    if (!data.name.trim()) return;
    if (!data.amount || data.amount <= 0) return;

    try {
      await update({
        id:           goal.id,
        name:         data.name.trim(),
        targetAmount: data.amount,
        targetDate:   data.hasDate ? data.targetDate : null,
        notes:        data.notes.trim() || null,
        emoji:        data.emoji || null,
        color:        goal.color,
        householdId:  goal.householdId,
        isShared:     goal.isShared,
      });
      showToast('success', 'Goal updated!');
      handleClose();
      onSuccess?.();
    } catch {
      showToast('error', 'Failed to update goal');
    }
  }, [goal, update, showToast, handleClose, onSuccess]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onDismiss={onClose}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backgroundComponent={Platform.OS === 'ios' ? GlassSheetBackground : undefined}
      backgroundStyle={Platform.OS !== 'ios' ? { backgroundColor: colors.card } : undefined}
      handleIndicatorStyle={{ backgroundColor: colors.border, width: 36 }}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 48 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <Text
          style={[
            styles.title,
            { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
          ]}
        >
          Edit Goal
        </Text>

        {/* Emoji picker */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 10 }]}>
          Choose an emoji
        </Text>
        <Controller
          control={control}
          name="emoji"
          render={({ field }) => (
            <View style={styles.emojiRow}>
              {EMOJI_OPTIONS.map((e) => (
                <EmojiButton
                  key={e}
                  emoji={e}
                  selected={field.value === e}
                  onPress={() => field.onChange(e)}
                />
              ))}
            </View>
          )}
        />

        {/* Goal name */}
        <Controller
          control={control}
          name="name"
          rules={{ required: 'Name is required' }}
          render={({ field }) => (
            <Input
              label="What are you saving for?"
              placeholder="e.g. Trip to Europe, New car…"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.name?.message}
              style={styles.field}
            />
          )}
        />

        {/* Target amount */}
        <Controller
          control={control}
          name="amount"
          rules={{ validate: (v) => v > 0 || 'Amount must be greater than 0' }}
          render={({ field }) => (
            <AmountInput
              label="Target amount"
              value={field.value}
              onChange={field.onChange}
              error={errors.amount?.message}
              style={styles.field}
            />
          )}
        />

        {/* Target date toggle */}
        <View style={styles.field}>
          <View style={styles.dateToggleRow}>
            <Text style={[text.label, { color: colors.textSecondary }]}>
              Target date
            </Text>
            <Controller
              control={control}
              name="hasDate"
              render={({ field }) => (
                <Pressable
                  onPress={() => field.onChange(!field.value)}
                  style={[
                    styles.toggleChip,
                    {
                      backgroundColor: field.value ? colors.primary : colors.backgroundSecondary,
                      borderColor:     field.value ? colors.primary : colors.border,
                      borderRadius:    radius.full,
                    },
                  ]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: field.value }}
                >
                  <Text
                    style={[
                      text.buttonLabelSm,
                      { color: field.value ? colors.textOnForest : colors.textSecondary },
                    ]}
                  >
                    {field.value ? 'Set date' : 'No deadline'}
                  </Text>
                </Pressable>
              )}
            />
          </View>

          {hasDate && (
            <Pressable
              onPress={() => setShowDatePicker(true)}
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
                {targetDate ? formatDisplay(targetDate) : 'Select date'}
              </Text>
              <Calendar size={18} color={colors.textSecondary} strokeWidth={1.6} />
            </Pressable>
          )}
        </View>

        {/* Notes */}
        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <Input
              label="Notes (optional)"
              placeholder="Add a note about this goal…"
              value={field.value}
              onChangeText={field.onChange}
              multiline
              numberOfLines={3}
              style={styles.field}
            />
          )}
        />

        {/* Submit */}
        <View style={styles.submit}>
          <Button
            label="Save Changes"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            size="lg"
          />
        </View>
      </BottomSheetScrollView>

      <AkuDatePicker
        isOpen={showDatePicker}
        value={targetDate}
        onChange={(iso) => setValue('targetDate', iso)}
        onClose={() => setShowDatePicker(false)}
        title="Select target date"
      />
    </BottomSheetModal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop:        8,
  },
  title: {
    marginBottom:  24,
    letterSpacing: -0.5,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap:      'nowrap',
    gap:            8,
    marginBottom:  20,
  },
  emojiBtn: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },
  emojiBtnText: {
    fontSize:   22,
    lineHeight: 28,
  },
  field: {
    marginBottom: 20,
  },
  dateToggleRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   12,
  },
  toggleChip: {
    paddingHorizontal: 14,
    paddingVertical:    8,
    borderWidth:       1.5,
  },
  dateTrigger: {
    flexDirection:     'row',
    alignItems:        'center',
    borderWidth:       1,
    paddingHorizontal: 14,
    paddingVertical:   14,
    gap:               8,
  },
  dateChip: {
    paddingHorizontal: 14,
    paddingVertical:    8,
    marginRight:        4,
  },
  submit: {
    marginTop: 8,
  },
});
