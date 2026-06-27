import React, { useCallback, useRef, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { GlassSheetBackground } from '../ui/GlassSheetBackground';
import { useForm, Controller } from 'react-hook-form';
import {
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
  Calendar,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme';
import { Input } from '../ui/Input';
import { AmountInput } from '../ui/AmountInput';
import { Button } from '../ui/Button';
import { AkuDatePicker } from '../ui/AkuDatePicker';
import { useExpensesStore } from '../../store/expenses.store';
import { useUIStore } from '../../store/ui.store';
import { useHouseholdStore } from '../../store/household.store';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type Expense } from '../../types';

// ─── Icon map ─────────────────────────────────────────────────────────────────

const EXPENSE_ICONS: Record<
  ExpenseCategory,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = {
  food:          UtensilsCrossed,
  transport:     Car,
  shopping:      ShoppingBag,
  entertainment: Tv,
  housing:       Home,
  utilities:     Zap,
  health:        Heart,
  family:        Users,
  education:     BookOpen,
  savings:       PiggyBank,
  gifts:         Gift,
  other:         MoreHorizontal,
};

// ─── Form ─────────────────────────────────────────────────────────────────────

interface FormData {
  amount:      number;
  description: string;
  category:    ExpenseCategory;
  date:        string;
  isShared:    boolean;
}

function formatDisplay(iso: string): string {
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

function validateForm(data: FormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.amount || data.amount <= 0) errors.amount = 'Amount must be greater than 0';
  if (!data.date) errors.date = 'Date is required';
  return errors;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditExpenseSheetProps {
  expense:    Expense | null;
  onClose:    () => void;
  onSuccess?: () => void;
}

const SNAP_POINTS = ['65%', '90%'];
const CATEGORIES = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];

// ─── Component ────────────────────────────────────────────────────────────────

export function EditExpenseSheet({ expense, onClose, onSuccess }: EditExpenseSheetProps) {
  const { colors, text, font, fontSize, radius } = useTheme();
  const sheetRef = useRef<BottomSheetModal>(null);

  const { update, remove } = useExpensesStore();
  const { showToast }      = useUIStore();
  const { household }      = useHouseholdStore();

  const [showDatePicker, setShowDatePicker] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      amount:      0,
      description: '',
      category:    'food',
      date:        '',
      isShared:    false,
    },
  });

  const date = watch('date');

  // Populate form when expense changes
  useEffect(() => {
    if (expense) {
      reset({
        amount:      expense.amount,
        description: expense.description ?? '',
        category:    expense.category,
        date:        expense.date,
        isShared:    expense.isShared,
      });
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [expense, reset]);

  const handleClose = useCallback(() => {
    sheetRef.current?.dismiss();
    onClose();
  }, [onClose]);

  const onSubmit = useCallback(
    async (data: FormData) => {
      if (!expense) return;
      const validationErrors = validateForm(data);
      if (Object.keys(validationErrors).length > 0) {
        Object.entries(validationErrors).forEach(([k, v]) =>
          setError(k as keyof FormData, { message: v })
        );
        return;
      }
      try {
        await update({
          id:          expense.id,
          amount:      data.amount,
          category:    data.category,
          description: data.description.trim() || null,
          date:        data.date,
          isShared:    data.isShared,
          householdId: data.isShared && household ? household.id : null,
        });
        showToast('success', 'Expense updated');
        handleClose();
        onSuccess?.();
      } catch {
        showToast('error', 'Failed to update expense');
      }
    },
    [expense, update, household, showToast, handleClose, onSuccess, setError],
  );

  const handleDelete = useCallback(() => {
    if (!expense) return;
    Alert.alert(
      'Delete expense',
      'This will permanently remove this expense. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove(expense.id);
              showToast('success', 'Expense deleted');
              handleClose();
              onSuccess?.();
            } catch {
              showToast('error', 'Failed to delete expense');
            }
          },
        },
      ],
    );
  }, [expense, remove, showToast, handleClose, onSuccess]);

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
          Edit Expense
        </Text>

        {/* Amount */}
        <Controller
          control={control}
          name="amount"
          render={({ field }) => (
            <AmountInput
              label="Amount"
              value={field.value}
              onChange={field.onChange}
              size="lg"
              error={errors.amount?.message}
              style={styles.field}
            />
          )}
        />

        {/* Description */}
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Input
              label="Description"
              placeholder="What was this for?"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.description?.message}
              style={styles.field}
            />
          )}
        />

        {/* Category grid */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 10 }]}>
          Category
        </Text>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => {
                const meta = EXPENSE_CATEGORIES[cat];
                const IconComp = EXPENSE_ICONS[cat] ?? MoreHorizontal;
                const selected = field.value === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => field.onChange(cat)}
                    style={[
                      styles.categoryItem,
                      {
                        backgroundColor: selected ? meta.color + '25' : colors.backgroundSecondary,
                        borderColor:     selected ? meta.color : colors.border,
                        borderRadius:    radius.md,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.categoryIcon,
                        { backgroundColor: meta.color + '20', borderRadius: radius.full },
                      ]}
                    >
                      <IconComp size={18} color={meta.color} strokeWidth={1.8} />
                    </View>
                    <Text
                      style={[
                        text.caption,
                        {
                          color:      selected ? meta.color : colors.textSecondary,
                          fontFamily: selected ? font.sansSemiBold : font.sansRegular,
                          marginTop:  4,
                          textAlign:  'center',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        />

        {/* Date picker */}
        <View style={styles.field}>
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>
            Date
          </Text>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={[
              styles.dateTrigger,
              {
                backgroundColor: colors.inputBackground,
                borderColor:     errors.date ? colors.danger : colors.inputBorder,
                borderRadius:    radius.md,
              },
            ]}
          >
            <Text
              style={[
                text.body,
                {
                  color: date ? colors.text : colors.textTertiary,
                  flex:  1,
                },
              ]}
            >
              {date ? formatDisplay(date) : 'Select date'}
            </Text>
            <Calendar size={18} color={colors.textSecondary} strokeWidth={1.6} />
          </Pressable>
          {errors.date && (
            <Text style={[text.caption, { color: colors.danger, marginTop: 4 }]}>
              {errors.date.message}
            </Text>
          )}
        </View>

        {/* Shared toggle — only when household exists */}
        {household ? (
          <Controller
            control={control}
            name="isShared"
            render={({ field }) => (
              <View style={[styles.toggleRow, { borderColor: colors.border }]}>
                <View style={styles.toggleText}>
                  <Text style={[text.bodyMedium, { color: colors.text }]}>
                    Split with household
                  </Text>
                  <Text style={[text.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                    Visible to {household.name}
                  </Text>
                </View>
                <Switch
                  value={field.value}
                  onValueChange={field.onChange}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.card}
                />
              </View>
            )}
          />
        ) : null}

        {/* Submit */}
        <View style={styles.submit}>
          <Button
            label="Save Changes"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            size="lg"
          />
        </View>

        {/* Delete danger button */}
        <Pressable
          onPress={handleDelete}
          style={styles.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel="Delete expense"
        >
          <Text style={[text.buttonLabel, { color: colors.danger }]}>
            Delete expense
          </Text>
        </Pressable>
      </BottomSheetScrollView>

      <AkuDatePicker
        isOpen={showDatePicker}
        value={date}
        onChange={(iso) => setValue('date', iso)}
        onClose={() => setShowDatePicker(false)}
        minDate="2020-01-01"
        title="Select expense date"
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
  field: {
    marginBottom: 20,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
    marginBottom:  20,
  },
  categoryItem: {
    width:             '22%',
    flexGrow:          1,
    alignItems:        'center',
    paddingVertical:   12,
    paddingHorizontal: 8,
    borderWidth:       1.5,
  },
  categoryIcon: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  dateTrigger: {
    flexDirection:     'row',
    alignItems:        'center',
    borderWidth:       1,
    paddingHorizontal: 14,
    paddingVertical:   14,
    gap:               8,
  },
  toggleRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingVertical:   14,
    borderBottomWidth: 1,
    marginBottom:      16,
  },
  toggleText: {
    flex:        1,
    marginRight: 12,
  },
  submit: {
    marginTop: 28,
  },
  deleteBtn: {
    alignItems:      'center',
    paddingVertical: 16,
    marginTop:       8,
  },
});
