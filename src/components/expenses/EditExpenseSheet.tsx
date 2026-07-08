import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import {
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
  Calendar,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme';
import { SheetModal } from '../ui/SheetModal';
import { Input } from '../ui/Input';
import { AmountInput } from '../ui/AmountInput';
import { Button } from '../ui/Button';
import { AkuDatePicker } from '../ui/AkuDatePicker';
import { useExpensesStore } from '../../store/expenses.store';
import { useUIStore } from '../../store/ui.store';
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
}

function formatDisplay(iso: string): string {
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

const CATEGORIES = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];

// ─── Component ────────────────────────────────────────────────────────────────

export function EditExpenseSheet({ expense, onClose, onSuccess }: EditExpenseSheetProps) {
  const { colors, text, font, fontSize, radius } = useTheme();

  const { update, remove } = useExpensesStore();
  const { showToast }      = useUIStore();
  const [showDatePicker,  setShowDatePicker]  = useState(false);
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
      });
    }
  }, [expense, reset]);

  const handleClose = useCallback(() => {
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
          isShared:    false,
          householdId: null,
        });
        showToast('success', 'Expense updated');
        handleClose();
        onSuccess?.();
      } catch {
        showToast('error', 'Failed to update expense');
      }
    },
    [expense, update, showToast, handleClose, onSuccess, setError],
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
    <>
      <SheetModal visible={!!expense} onClose={handleClose}>
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
              asBottomSheetInput
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
              asBottomSheetInput
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

        {/* Date */}
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
              style={[text.body, { color: date ? colors.text : colors.textTertiary, flex: 1 }]}
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


        {/* Submit */}
        <View style={styles.submit}>
          <Button
            label="Save Changes"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            size="lg"
          />
        </View>

        {/* Delete */}
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
      </SheetModal>

      <AkuDatePicker
        isOpen={showDatePicker}
        value={date}
        onChange={(iso) => { setValue('date', iso); setShowDatePicker(false); }}
        onClose={() => setShowDatePicker(false)}
        minDate="2020-01-01"
        maxDate={todayString()}
        title="Select expense date"
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
  toggleLabelRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  infoBtn: {
    padding: 2,
  },
  tipOverlay: {
    flex:              1,
    backgroundColor:   'rgba(0,0,0,0.45)',
    justifyContent:    'center',
    alignItems:        'center',
    paddingHorizontal: 24,
  },
  tipCard: {
    width:        '100%',
    borderRadius: 20,
    borderWidth:  1,
    padding:      20,
  },
  tipHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  tipIconWrap: {
    width:          40,
    height:         40,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
  },
  tipClose: {
    marginTop:       20,
    borderRadius:    100,
    paddingVertical: 12,
    alignItems:      'center',
  },
  submit: {
    marginTop: 28,
  },
  deleteBtn: {
    alignItems:      'center',
    paddingVertical: 16,
    marginTop:        8,
  },
});
