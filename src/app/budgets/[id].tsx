/**
 * budgets/[id].tsx — Budget detail screen.
 *
 * Shows budget category, period, spent vs limit, progress, and all linked
 * expenses in this category for the current selected month.
 * Edit via EditBudgetSheet, delete with Alert confirmation.
 */
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { EditBudgetSheet } from '../../components/budgets/EditBudgetSheet';
import { useBudgetsStore } from '../../store/budgets.store';
import { useExpensesStore } from '../../store/expenses.store';
import { useUIStore } from '../../store/ui.store';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type BudgetWithSpent } from '../../types';
import { formatAmount } from '../../lib/format';

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

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  progress,
  color,
}: {
  progress: number;
  color: string;
}) {
  const { colors, radius } = useTheme();
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <View style={[styles.trackOuter, { backgroundColor: colors.border, borderRadius: radius.full }]}>
      <View
        style={[
          styles.trackFill,
          {
            width:           `${clamped * 100}%`,
            backgroundColor: clamped >= 1 ? '#D95B5B' : color,
            borderRadius:    100,
          },
        ]}
      />
    </View>
  );
}

// ─── Expense row ──────────────────────────────────────────────────────────────

function LinkedExpenseRow({ date, description, amount, category }: {
  date: string;
  description: string | null;
  amount: number;
  category: ExpenseCategory;
}) {
  const { colors, text, font, fontSize, radius } = useTheme();
  const meta     = EXPENSE_CATEGORIES[category];
  const IconComp = EXPENSE_ICONS[category] ?? MoreHorizontal;

  function formatShort(iso: string) {
    try { return format(parseISO(iso), 'd MMM'); }
    catch { return iso; }
  }

  return (
    <View style={[styles.expRow, { borderBottomColor: colors.borderLight }]}>
      <View style={[styles.expIcon, { backgroundColor: meta.color + '18', borderRadius: radius.md }]}>
        <IconComp size={16} color={meta.color} strokeWidth={1.6} />
      </View>
      <View style={styles.expCenter}>
        <Text style={[{ fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.text }]} numberOfLines={1}>
          {description ?? meta.label}
        </Text>
        <Text style={[text.caption, { color: colors.textTertiary }]}>{formatShort(date)}</Text>
      </View>
      <Text style={[{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }]}>
        {formatAmount(amount)}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BudgetDetailScreen() {
  const { colors, text, font, fontSize, spacing, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router  = useRouter();
  const { id }  = useLocalSearchParams<{ id: string }>();

  const { budgets, remove } = useBudgetsStore();
  const { expenses }        = useExpensesStore();
  const { showToast }       = useUIStore();

  const [editBudget, setEditBudget] = useState<BudgetWithSpent | null>(null);

  const budget = budgets.find((b) => b.id === id);

  // Expenses in this category
  const linkedExpenses = budget
    ? expenses.filter((e) => e.category === budget.category)
    : [];

  const handleDelete = useCallback(() => {
    if (!budget) return;
    Alert.alert(
      'Delete Budget',
      `Remove your ${EXPENSE_CATEGORIES[budget.category].label} budget?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Delete',
          style:   'destructive',
          onPress: async () => {
            router.back();
            try {
              await remove(budget.id);
              showToast('success', 'Budget deleted');
            } catch {
              showToast('error', 'Could not delete budget');
            }
          },
        },
      ],
    );
  }, [budget, remove, showToast, router]);

  // ── Not found ──────────────────────────────────────────────────────────

  if (!budget) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title="Budget"
          leftAction={{ icon: ArrowLeft, onPress: () => router.back(), accessibilityLabel: 'Back' }}
          style={{ paddingTop: insets.top + 4 }}
        />
        <View style={styles.notFound}>
          <Text style={[text.body, { color: colors.textSecondary }]}>Budget not found.</Text>
        </View>
      </View>
    );
  }

  const meta     = EXPENSE_CATEGORIES[budget.category];
  const IconComp = EXPENSE_ICONS[budget.category] ?? MoreHorizontal;
  const pct      = Math.round(budget.progress * 100);

  const periodLabel = budget.period === 'monthly' ? 'Monthly'
                    : budget.period === 'weekly'  ? 'Weekly'
                    : budget.period === 'yearly'  ? 'Yearly'
                    : budget.period;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Budget detail"
        leftAction={{
          icon:               ArrowLeft,
          onPress:            () => router.back(),
          accessibilityLabel: 'Back',
        }}
        rightAction={{
          icon:               Pencil,
          onPress:            () => setEditBudget(budget),
          accessibilityLabel: 'Edit budget',
        }}
        style={{ paddingTop: insets.top + 4 }}
      />

      <FlatList
        data={linkedExpenses}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          { paddingHorizontal: layout.screenPadding, paddingBottom: insets.bottom + 40 },
        ]}
        ListHeaderComponent={
          <View>
            {/* ── Hero ── */}
            <Animated.View
              entering={FadeInDown.delay(0).duration(200)}
              style={styles.hero}
            >
              <View
                style={[
                  styles.categoryCircle,
                  { backgroundColor: meta.color + '1A', borderRadius: radius.full },
                ]}
              >
                <IconComp size={40} color={meta.color} strokeWidth={1.5} />
              </View>

              <Text
                style={[
                  { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text, letterSpacing: -0.4 },
                ]}
              >
                {meta.label}
              </Text>

              <View style={[styles.periodPill, { backgroundColor: colors.backgroundSecondary, borderRadius: radius.full }]}>
                <Text style={[text.caption, { color: colors.textSecondary }]}>{periodLabel}</Text>
              </View>
            </Animated.View>

            {/* ── Progress card ── */}
            <Animated.View
              entering={FadeInDown.delay(80).duration(200)}
              style={[styles.progressCard, { backgroundColor: colors.card, borderRadius: radius.xl }]}
            >
              {/* Spent / limit row */}
              <View style={styles.amountRow}>
                <View>
                  <Text style={[text.caption, { color: colors.textTertiary }]}>Spent</Text>
                  <Text style={[{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text }]}>
                    {formatAmount(budget.spent)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[text.caption, { color: colors.textTertiary }]}>Budget</Text>
                  <Text style={[{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text }]}>
                    {formatAmount(budget.amount)}
                  </Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={{ marginVertical: 12 }}>
                <ProgressBar progress={budget.progress} color={meta.color} />
              </View>

              {/* Stats row */}
              <View style={styles.statsRow}>
                <Text style={[text.caption, { color: colors.textTertiary }]}>
                  {pct}% used
                </Text>
                <StatusBadge status={budget.status} />
                <Text style={[text.caption, { color: budget.remaining < 0 ? '#D95B5B' : colors.textTertiary }]}>
                  {budget.remaining < 0
                    ? `${formatAmount(Math.abs(budget.remaining))} over`
                    : `${formatAmount(budget.remaining)} left`}
                </Text>
              </View>
            </Animated.View>

            {/* ── Delete button ── */}
            <Animated.View
              entering={FadeInDown.delay(160).duration(200)}
              style={{ marginTop: spacing[4] }}
            >
              <Pressable
                onPress={handleDelete}
                style={[
                  styles.deleteBtn,
                  { backgroundColor: colors.danger + '12', borderRadius: radius.full },
                ]}
              >
                <Trash2 size={16} color={colors.danger} strokeWidth={1.8} />
                <Text style={[{ fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.danger }]}>
                  Delete budget
                </Text>
              </Pressable>
            </Animated.View>

            {/* ── Transactions header ── */}
            {linkedExpenses.length > 0 && (
              <Animated.View
                entering={FadeInDown.delay(200).duration(200)}
                style={{ marginTop: spacing[6], marginBottom: spacing[2] }}
              >
                <Text style={[text.label, { color: colors.textSecondary }]}>
                  Expenses this period ({linkedExpenses.length})
                </Text>
              </Animated.View>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(220 + index * 40).duration(200)}>
            <LinkedExpenseRow
              date={item.date}
              description={item.description}
              amount={item.amount}
              category={item.category}
            />
          </Animated.View>
        )}
        ListEmptyComponent={
          <Animated.View entering={FadeInDown.delay(200).duration(200)}>
            <EmptyState
              icon={IconComp}
              title="No expenses yet"
              message={`No ${meta.label.toLowerCase()} expenses recorded this period.`}
            />
          </Animated.View>
        }
      />

      {/* Edit sheet */}
      <EditBudgetSheet
        budget={editBudget}
        onClose={() => setEditBudget(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  notFound: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Hero
  hero: {
    alignItems:     'center',
    paddingVertical: 28,
    gap:             10,
  },
  categoryCircle: {
    width:          80,
    height:         80,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   4,
  },
  periodPill: {
    paddingHorizontal: 12,
    paddingVertical:   4,
  },

  // Progress card
  progressCard: {
    padding: 20,
  },
  amountRow: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'flex-end',
  },
  trackOuter: {
    height:   10,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
  },
  statsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },

  // Delete
  deleteBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    paddingVertical: 14,
  },

  // Linked expenses
  expRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   12,
    gap:               12,
    borderBottomWidth: 1,
  },
  expIcon: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  expCenter: {
    flex: 1,
    gap:  2,
  },
});
