import React, { useCallback } from 'react';
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
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { SheetModal } from '../ui/SheetModal';
import { AmountInput } from '../ui/AmountInput';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../store/auth.store';
import { useBudgetsStore } from '../../store/budgets.store';
import { useUIStore } from '../../store/ui.store';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type BudgetPeriod } from '../../types';

// ─── Icon map ─────────────────────────────────────────────────────────────────

const EXPENSE_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddBudgetSheetProps {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess?: () => void;
}

interface FormData {
  category: ExpenseCategory;
  amount:   number;
  period:   BudgetPeriod;
}

const CATEGORIES  = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];
const PERIODS: { key: BudgetPeriod; label: string }[] = [
  { key: 'weekly',  label: 'Weekly'  },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly',  label: 'Yearly'  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AddBudgetSheet({ isOpen, onClose, onSuccess }: AddBudgetSheetProps) {
  const { colors, text, font, fontSize, radius } = useTheme();

  const { user }       = useAuthStore();
  const { add }        = useBudgetsStore();
  const { showToast }  = useUIStore();

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      category: 'food',
      amount:   0,
      period:   'monthly',
    },
  });

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const onSubmit = useCallback(async (data: FormData) => {
    if (!user) return;

    if (!data.amount || data.amount <= 0) {
      setError('amount', { message: 'Amount must be greater than 0' });
      return;
    }

    try {
      await add(
        {
          category:    data.category,
          amount:      data.amount,
          period:      data.period,
        },
        user.id,
      );
      showToast('success', 'Budget added');
      reset();
      handleClose();
      onSuccess?.();
    } catch {
      showToast('error', 'Failed to add budget');
    }
  }, [user, add, showToast, reset, handleClose, onSuccess, setError]);

  return (
    <SheetModal visible={isOpen} onClose={handleClose}>
      {/* Title */}
      <Text
        style={[
          styles.title,
          { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
        ]}
      >
        Add Budget
      </Text>

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
              const meta     = EXPENSE_CATEGORIES[cat];
              const IconComp = EXPENSE_ICONS[meta.icon] ?? MoreHorizontal;
              const selected = field.value === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => field.onChange(cat)}
                  style={[
                    styles.categoryItem,
                    {
                      backgroundColor: selected ? meta.color + '25' : colors.backgroundSecondary,
                      borderColor:     selected ? meta.color        : colors.border,
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

      {/* Amount */}
      <Controller
        control={control}
        name="amount"
        render={({ field }) => (
          <AmountInput
            label="Budget limit"
            value={field.value}
            onChange={field.onChange}
            error={errors.amount?.message}
            style={styles.field}
            asBottomSheetInput
          />
        )}
      />

      {/* Period */}
      <Text style={[text.label, { color: colors.textSecondary, marginBottom: 10 }]}>
        Period
      </Text>
      <Controller
        control={control}
        name="period"
        render={({ field }) => (
          <View
            style={[
              styles.periodSegment,
              {
                backgroundColor: colors.backgroundSecondary,
                borderColor:     colors.border,
                borderRadius:    radius.full,
              },
            ]}
          >
            {PERIODS.map(({ key, label }) => {
              const selected = field.value === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => field.onChange(key)}
                  style={[
                    styles.periodSegmentBtn,
                    selected && {
                      backgroundColor: colors.primary,
                      borderRadius:    radius.full,
                    },
                  ]}
                >
                  <Text
                    style={[
                      text.buttonLabelSm,
                      {
                        color:      selected ? colors.textOnForest : colors.textSecondary,
                        fontFamily: selected ? font.sansSemiBold   : font.sansRegular,
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      />

      {/* Submit */}
      <View style={styles.submit}>
        <Button
          label="Add Budget"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          size="lg"
        />
      </View>
    </SheetModal>
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
    width:           '22%',
    flexGrow:        1,
    alignItems:      'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderWidth:     1.5,
  },
  categoryIcon: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  periodSegment: {
    flexDirection:   'row',
    borderWidth:     1,
    padding:         4,
    marginBottom:    24,
  },
  periodSegmentBtn: {
    flex:            1,
    paddingVertical: 10,
    alignItems:      'center',
    justifyContent:  'center',
  },
  submit: {
    marginTop: 8,
  },
});
