import React, { useState, useCallback, useEffect } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Wallet,
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { useBudgetsStore } from '../../store/budgets.store';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { AddBudgetSheet } from '../../components/budgets/AddBudgetSheet';
import { EditBudgetSheet } from '../../components/budgets/EditBudgetSheet';
import { EXPENSE_CATEGORIES } from '../../types';
import type { BudgetWithSpent, BudgetStatus } from '../../types';

// ─── Icon map ─────────────────────────────────────────────────────────────────

const EXPENSE_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function formatMonth(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG')}`;
}

function overallStatus(budgets: BudgetWithSpent[]): BudgetStatus {
  if (budgets.some((b) => b.status === 'exceeded'))   return 'exceeded';
  if (budgets.some((b) => b.status === 'near-limit')) return 'near-limit';
  return 'healthy';
}

// ─── FAB ─────────────────────────────────────────────────────────────────────

function FAB({ onPress }: { onPress: () => void }) {
  const { colors, shadow } = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.fab, animStyle, shadow.lg]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.94, { damping: 20, stiffness: 400 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 20, stiffness: 400 }); }}
        style={[styles.fabInner, { backgroundColor: colors.primary }]}
      >
        <Plus size={24} color={colors.accent} strokeWidth={2} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
  progress: number; // 0–1
  status:   BudgetStatus;
  height?:  number;
}

function ProgressBar({ progress, status, height = 8 }: ProgressBarProps) {
  const { colors, radius } = useTheme();

  const fillColor = (() => {
    switch (status) {
      case 'exceeded':   return colors.budgetExceeded;
      case 'near-limit': return colors.budgetNearLimit;
      default:           return colors.budgetHealthy;
    }
  })();

  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  return (
    <View
      style={[
        styles.progressTrack,
        {
          height,
          backgroundColor: colors.backgroundSecondary,
          borderRadius:    radius.full,
        },
      ]}
    >
      <View
        style={[
          styles.progressFill,
          {
            width:           `${clampedProgress * 100}%`,
            backgroundColor: fillColor,
            borderRadius:    radius.full,
          },
        ]}
      />
    </View>
  );
}

// ─── Budget card ─────────────────────────────────────────────────────────────

interface BudgetCardProps {
  budget:  BudgetWithSpent;
  onPress: () => void;
}

function BudgetCard({ budget, onPress }: BudgetCardProps) {
  const { colors, text, font, radius } = useTheme();

  const meta     = EXPENSE_CATEGORIES[budget.category];
  const IconComp = EXPENSE_ICONS[meta?.icon ?? 'MoreHorizontal'] ?? MoreHorizontal;

  const periodLabel = (() => {
    switch (budget.period) {
      case 'weekly':  return 'Weekly';
      case 'monthly': return 'Monthly';
      case 'yearly':  return 'Yearly';
    }
  })();

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)}>
      <Card onPress={onPress} style={styles.budgetCard}>
        <View style={styles.budgetCardInner}>
          {/* Row 1: icon + name + period badge + status badge */}
          <View style={styles.budgetCardRow}>
            <View
              style={[
                styles.budgetIcon,
                {
                  backgroundColor: (meta?.color ?? '#888885') + '20',
                  borderRadius:    radius.md,
                },
              ]}
            >
              <IconComp size={20} color={meta?.color ?? '#888885'} strokeWidth={1.8} />
            </View>

            <View style={styles.budgetCardMeta}>
              <Text
                style={[text.bodyMedium, { color: colors.text }]}
                numberOfLines={1}
              >
                {meta?.label ?? budget.category}
              </Text>
              <Text style={[text.caption, { color: colors.textTertiary }]}>
                {periodLabel}
              </Text>
            </View>

            <StatusBadge status={budget.status} />
          </View>

          {/* Progress bar */}
          <View style={styles.budgetCardProgress}>
            <ProgressBar
              progress={budget.progress}
              status={budget.status}
              height={10}
            />

            {/* Amount labels */}
            <View style={styles.budgetAmountRow}>
              <Text style={[text.amountSm, { color: colors.textSecondary }]}>
                {formatNaira(budget.spent)} spent
              </Text>
              <Text style={[text.amountSm, { color: colors.textTertiary }]}>
                of {formatNaira(budget.amount)}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  budgets: BudgetWithSpent[];
}

function SummaryCard({ budgets }: SummaryCardProps) {
  const { colors, text, font, fontSize, radius } = useTheme();

  if (budgets.length === 0) return null;

  const totalBudget = budgets.reduce((acc, b) => acc + b.amount, 0);
  const totalSpent  = budgets.reduce((acc, b) => acc + b.spent,  0);
  const progress    = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const status      = overallStatus(budgets);

  return (
    <Card style={styles.summaryCard} variant="elevated">
      <View style={styles.summaryInner}>
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 4 }]}>
          Total Budget
        </Text>
        <Text
          style={[
            styles.summaryAmount,
            { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
          ]}
        >
          {formatNaira(totalSpent)}{' '}
          <Text style={[{ color: colors.textTertiary, fontSize: fontSize.md }]}>
            of {formatNaira(totalBudget)}
          </Text>
        </Text>

        <View style={styles.summaryProgressWrap}>
          <ProgressBar progress={progress} status={status} height={12} />
        </View>

        <View style={styles.summaryStatusRow}>
          <StatusBadge status={status} />
          <Text style={[text.caption, { color: colors.textTertiary }]}>
            {budgets.length} budget{budgets.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BudgetsScreen() {
  const { colors, font, fontSize, text, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { user }                           = useAuthStore();
  const { budgets, isLoading, load }       = useBudgetsStore();

  const [currentDate,   setCurrentDate]   = useState(() => new Date());
  const [addOpen,       setAddOpen]       = useState(false);
  const [editBudget,    setEditBudget]    = useState<BudgetWithSpent | null>(null);

  const reload = useCallback(() => {
    if (!user) return;
    // Build spent-by-category for current month (no real filtering here — store handles it)
    load(user.id, {});
  }, [user, load]);

  useEffect(() => {
    reload();
  }, [reload]);

  const prevMonth = useCallback(() => {
    setCurrentDate((d) => {
      const n = new Date(d);
      n.setMonth(n.getMonth() - 1);
      return n;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setCurrentDate((d) => {
      const n = new Date(d);
      n.setMonth(n.getMonth() + 1);
      return n;
    });
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>

      {/* ── Custom header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop:    insets.top + 12,
            borderBottomColor: colors.borderLight,
          },
        ]}
      >
        {/* Back */}
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.headerIconBtn}
        >
          <ChevronLeft size={22} color={colors.text} strokeWidth={1.8} />
        </Pressable>

        {/* Title */}
        <Text
          style={[
            styles.headerTitle,
            { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
          ]}
        >
          Budgets
        </Text>

        {/* Add */}
        <Pressable
          onPress={() => setAddOpen(true)}
          hitSlop={8}
          style={[styles.headerIconBtn, { backgroundColor: colors.backgroundSecondary }]}
        >
          <Plus size={20} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>

      {/* ── Month navigator ── */}
      <View
        style={[
          styles.monthNav,
          { borderBottomColor: colors.borderLight },
        ]}
      >
        <Pressable onPress={prevMonth} hitSlop={12}>
          <ChevronLeft size={20} color={colors.textSecondary} strokeWidth={1.8} />
        </Pressable>
        <Text style={[text.bodyMedium, { color: colors.text }]}>
          {formatMonth(currentDate)}
        </Text>
        <Pressable onPress={nextMonth} hitSlop={12}>
          <ChevronRight size={20} color={colors.textSecondary} strokeWidth={1.8} />
        </Pressable>
      </View>

      {/* ── List ── */}
      <FlatList
        data={budgets}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BudgetCard
            budget={item}
            onPress={() => setEditBudget(item)}
          />
        )}
        ListHeaderComponent={<SummaryCard budgets={budgets} />}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon={Wallet}
              title="No budgets yet"
              message="Set limits to stay on track with your spending."
              action={{ label: 'Add Budget', onPress: () => setAddOpen(true) }}
            />
          )
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {/* ── FAB ── */}
      <FAB onPress={() => setAddOpen(true)} />

      {/* ── Sheets ── */}
      <AddBudgetSheet
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={reload}
      />
      <EditBudgetSheet
        budget={editBudget}
        onClose={() => setEditBudget(null)}
        onSuccess={reload}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingBottom:     12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    letterSpacing: -0.5,
    flex:          1,
    textAlign:     'center',
  },
  headerIconBtn: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
  },
  monthNav: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    paddingVertical:   14,
    borderBottomWidth: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               12,
  },
  summaryCard: {
    marginBottom: 4,
  },
  summaryInner: {
    padding: 16,
  },
  summaryAmount: {
    letterSpacing: -0.5,
    marginBottom:  12,
  },
  summaryProgressWrap: {
    marginBottom: 12,
  },
  summaryStatusRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  budgetCard: {
    marginBottom: 0,
  },
  budgetCardInner: {
    padding: 16,
    gap:     14,
  },
  budgetCardRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  budgetIcon: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
  },
  budgetCardMeta: {
    flex: 1,
    gap:  2,
  },
  budgetCardProgress: {
    gap: 8,
  },
  budgetAmountRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  progressTrack: {
    width:    '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  fab: {
    position:     'absolute',
    bottom:       32,
    right:        24,
    borderRadius: 28,
    overflow:     'visible',
  },
  fabInner: {
    width:          56,
    height:         56,
    borderRadius:   28,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
