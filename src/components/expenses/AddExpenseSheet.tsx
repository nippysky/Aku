import React, { useCallback, useState } from 'react';
import {
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
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../types';

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

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

interface AddExpenseSheetProps {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess?: () => void;
}

const CATEGORIES = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];

// ─── Component ────────────────────────────────────────────────────────────────

export function AddExpenseSheet({ isOpen, onClose, onSuccess }: AddExpenseSheetProps) {
  const { colors, text, font, fontSize, radius } = useTheme();

  const { add }       = useExpensesStore();
  const { user }      = useAuthStore();
  const { showToast } = useUIStore();
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
      date:        todayString(),
    },
  });

  const date = watch('date');

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const onSubmit = useCallback(
    async (data: FormData) => {
      if (!user) return;
      const validationErrors = validateForm(data);
      if (Object.keys(validationErrors).length > 0) {
        Object.entries(validationErrors).forEach(([k, v]) =>
          setError(k as keyof FormData, { message: v })
        );
        return;
      }
      try {
        await add(
          {
            amount:      data.amount,
            category:    data.category,
            description: data.description.trim() || null,
            date:        data.date,
            isShared:    false,
            householdId: null,
          },
          user.id,
        );
        showToast('success', 'Expense added');
        reset();
        handleClose();
        onSuccess?.();
      } catch {
        showToast('error', 'Failed to add expense');
      }
    },
    [user, add, showToast, reset, handleClose, onSuccess, setError],
  );

  return (
    <>
      <SheetModal visible={isOpen} onClose={handleClose}>
        {/* Title */}
        <Text
          style={[
            styles.title,
            { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text, marginBottom: 24 },
          ]}
        >
          Add Expense
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
            label="Add Expense"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            size="lg"
          />
        </View>
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
    flex: 1,
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
  // Tooltip modal
  tipOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent:  'center',
    alignItems:      'center',
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
    marginTop:      20,
    borderRadius:   100,
    paddingVertical: 12,
    alignItems:     'center',
  },
  submit: {
    marginTop: 28,
  },
});
