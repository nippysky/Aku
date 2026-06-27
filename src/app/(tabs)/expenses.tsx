import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeOutUp,
} from 'react-native-reanimated';
import {
  Plus,
  Wallet,
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
  X,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { AddExpenseSheet } from '../../components/expenses/AddExpenseSheet';
import { EditExpenseSheet } from '../../components/expenses/EditExpenseSheet';
import { ExpenseRow } from '../../components/expenses/ExpenseRow';
import { useExpensesStore } from '../../store/expenses.store';
import { useBudgetsStore } from '../../store/budgets.store';
import { useAuthStore } from '../../store/auth.store';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type Expense } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryFilter = 'all' | ExpenseCategory;

interface MonthOption {
  label:  string; // 'Jun 2026'
  value:  string; // 'YYYY-MM'
}

interface DateGroup {
  dateKey:   string; // 'Today' | 'Yesterday' | 'Mon 23 Jun'
  dateValue: string; // YYYY-MM-DD
  items:     Expense[];
}

type ListItem =
  | { type: 'dateHeader'; dateKey: string }
  | { type: 'expense'; expense: Expense };

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMonthOptions(): MonthOption[] {
  const now = new Date();
  const options: MonthOption[] = [];
  const monthNames = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec',
  ];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const value = `${y}-${String(m + 1).padStart(2, '0')}`;
    options.push({ label: `${monthNames[m]} ${y}`, value });
  }
  return options;
}

function currentMonthLabel(): string {
  const now = new Date();
  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
}

function formatDateHeader(dateStr: string): string {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';

  const [, m, d] = dateStr.split('-');
  const date = new Date(dateStr + 'T00:00:00');
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dayNames[date.getDay()]} ${parseInt(d, 10)} ${monthNames[parseInt(m, 10) - 1]}`;
}

function groupExpensesByDate(expenses: Expense[]): DateGroup[] {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    const existing = map.get(e.date) ?? [];
    existing.push(e);
    map.set(e.date, existing);
  }

  const sorted = Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  return sorted.map(([dateValue, items]) => ({
    dateKey:   formatDateHeader(dateValue),
    dateValue,
    items,
  }));
}

function getTop3Categories(
  byCategory: Record<ExpenseCategory, number>
): Array<{ cat: ExpenseCategory; amount: number }> {
  return (Object.entries(byCategory) as Array<[ExpenseCategory, number]>)
    .filter(([, amt]) => amt > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat, amount]) => ({ cat, amount }));
}

// ─── Budget alert banner ──────────────────────────────────────────────────────

interface BudgetBannerProps {
  category: ExpenseCategory;
  onDismiss: () => void;
}

function BudgetBanner({ category, onDismiss }: BudgetBannerProps) {
  const { colors, text } = useTheme();
  const meta = EXPENSE_CATEGORIES[category];

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOutUp.springify()}
      style={[styles.banner, { backgroundColor: colors.warningBg, borderColor: colors.warning }]}
    >
      <Text style={[text.bodySm, styles.bannerText, { color: colors.warning }]}>
        You&apos;ve exceeded your <Text style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}>{meta.label}</Text> budget this month.
      </Text>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
        <X size={16} color={colors.warning} strokeWidth={2} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES_KEYS = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const { colors, text, font, fontSize, radius, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router  = useRouter();

  const {
    expenses,
    summary,
    selectedMonth,
    isLoading,
    load,
    loadMonth,
    setMonth,
  } = useExpensesStore();

  const { budgets } = useBudgetsStore();
  const { user }    = useAuthStore();

  const [addOpen,          setAddOpen]          = useState(false);
  const [editExpense,      setEditExpense]       = useState<Expense | null>(null);
  const [categoryFilter,   setCategoryFilter]    = useState<CategoryFilter>('all');
  const [dismissedBudgets, setDismissedBudgets] = useState<Set<string>>(new Set());

  const monthOptions = useMemo(() => buildMonthOptions(), []);

  // Load on mount and when selectedMonth changes
  useEffect(() => {
    if (user) load(user.id);
  }, [user, selectedMonth]);

  const handleMonthSelect = useCallback(
    (monthValue: string) => {
      if (!user) return;
      setMonth(monthValue);
      loadMonth(user.id, monthValue);
      setCategoryFilter('all');
    },
    [user, setMonth, loadMonth],
  );

  const handleSuccess = useCallback(() => {
    if (user) load(user.id);
  }, [user, load]);

  // Exceeded budgets not yet dismissed
  const exceededBudgets = useMemo(
    () => budgets.filter((b) => b.status === 'exceeded' && !dismissedBudgets.has(b.id)),
    [budgets, dismissedBudgets],
  );

  const dismissBudget = useCallback((id: string) => {
    setDismissedBudgets((prev) => new Set(prev).add(id));
  }, []);

  // Filtered + grouped expenses
  const filteredExpenses = useMemo(() => {
    if (categoryFilter === 'all') return expenses;
    return expenses.filter((e) => e.category === categoryFilter);
  }, [expenses, categoryFilter]);

  const dateGroups = useMemo(
    () => groupExpensesByDate(filteredExpenses),
    [filteredExpenses],
  );

  const top3 = useMemo(
    () => (summary ? getTop3Categories(summary.byCategory) : []),
    [summary],
  );

  const totalSpent  = summary?.totalAmount ?? 0;
  const txCount     = expenses.length;

  // FlatList data: flatten groups into header + row items
  const listData = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    for (const group of dateGroups) {
      items.push({ type: 'dateHeader', dateKey: group.dateKey });
      for (const exp of group.items) {
        items.push({ type: 'expense', expense: exp });
      }
    }
    return items;
  }, [dateGroups]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === 'dateHeader') {
        return (
          <Text
            style={[
              text.labelCaps,
              styles.dateHeader,
              { color: colors.textSecondary },
            ]}
          >
            {item.dateKey}
          </Text>
        );
      }
      return (
        <ExpenseRow
          expense={item.expense}
          onPress={() => router.push(`/expenses/${item.expense.id}` as never)}
          onLongPress={() => setEditExpense(item.expense)}
          style={styles.expenseRow}
        />
      );
    },
    [colors, text, router, setEditExpense],
  );

  const keyExtractor = useCallback((item: ListItem, index: number): string => {
    if (item.type === 'dateHeader') return `header-${item.dateKey}-${index}`;
    return `expense-${item.expense.id}`;
  }, []);

  // ── Header component for FlatList ──
  // Must be a function (not a JSX element) so FlatList instantiates it
  // correctly and horizontal ScrollViews inside receive proper touch events.
  const ListHeader = useCallback(
    () => (
      <>
        {/* Budget alert banners */}
        {exceededBudgets.slice(0, 1).map((b) => (
          <BudgetBanner
            key={b.id}
            category={b.category}
            onDismiss={() => dismissBudget(b.id)}
          />
        ))}

        {/* Summary card */}
        <Card style={styles.summaryCard}>
          <View style={styles.summaryInner}>
            {/* Total spent */}
            <Text
              style={[
                styles.totalLabel,
                text.labelCaps,
                { color: colors.textSecondary },
              ]}
            >
              Total spent
            </Text>
            <Text
              style={[
                styles.totalAmount,
                {
                  fontFamily: font.displayLight,
                  fontSize:   fontSize['4xl'],
                  color:      colors.accent,
                  letterSpacing: -1,
                },
              ]}
            >
              ₦{(totalSpent / 100).toLocaleString('en-NG')}
            </Text>
            <Text style={[text.bodySm, { color: colors.textSecondary, marginTop: 4 }]}>
              {txCount} {txCount === 1 ? 'transaction' : 'transactions'}
            </Text>

            {/* Top 3 categories */}
            {top3.length > 0 && (
              <View style={styles.top3Row}>
                {top3.map(({ cat, amount }) => {
                  const meta = EXPENSE_CATEGORIES[cat];
                  const IconComp = EXPENSE_ICONS[cat] ?? MoreHorizontal;
                  return (
                    <View key={cat} style={styles.top3Item}>
                      <View
                        style={[
                          styles.top3Icon,
                          { backgroundColor: meta.color + '22', borderRadius: radius.full },
                        ]}
                      >
                        <IconComp size={16} color={meta.color} strokeWidth={1.8} />
                      </View>
                      <Text style={[text.caption, { color: colors.textSecondary, marginTop: 4 }]} numberOfLines={1}>
                        {meta.label}
                      </Text>
                      <Text
                        style={[
                          text.amountSm,
                          { color: colors.text },
                        ]}
                        numberOfLines={1}
                      >
                        ₦{(amount / 100).toLocaleString('en-NG')}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </Card>

        {/* Category filter pills */}
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {/* "All" pill */}
          <Pressable
            onPress={() => setCategoryFilter('all')}
            style={[
              styles.filterPill,
              {
                backgroundColor: categoryFilter === 'all' ? colors.primary : colors.backgroundSecondary,
                borderColor:     categoryFilter === 'all' ? colors.primary : colors.border,
                borderRadius:    radius.full,
              },
            ]}
          >
            <Text
              style={[
                text.buttonLabelSm,
                { color: categoryFilter === 'all' ? colors.textOnForest : colors.textSecondary },
              ]}
            >
              All
            </Text>
          </Pressable>

          {EXPENSE_CATEGORIES_KEYS.map((cat) => {
            const meta     = EXPENSE_CATEGORIES[cat];
            const selected = categoryFilter === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategoryFilter(cat)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: selected ? colors.primary : colors.backgroundSecondary,
                    borderColor:     selected ? colors.primary : colors.border,
                    borderRadius:    radius.full,
                  },
                ]}
              >
                <Text
                  style={[
                    text.buttonLabelSm,
                    { color: selected ? colors.textOnForest : colors.textSecondary },
                  ]}
                >
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exceededBudgets, top3, txCount, totalSpent, categoryFilter, colors, text, font, fontSize, radius, dismissBudget],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {/* ── Header ── */}
        <View
          style={[
            styles.header,
            {
              paddingTop:      insets.top + 12,
              borderBottomColor: colors.borderLight,
            },
          ]}
        >
          {/* Left: title */}
          <Text
            style={[
              styles.headerTitle,
              {
                fontFamily: font.displayLight,
                fontSize:   fontSize['2xl'],
                color:      colors.text,
              },
            ]}
          >
            Expenses
          </Text>

          {/* Right: month label + add button */}
          <View style={styles.headerRight}>
            <Text style={[text.bodySm, { color: colors.textSecondary }]}>
              {currentMonthLabel()}
            </Text>
            <Pressable
              onPress={() => setAddOpen(true)}
              style={[styles.headerIconBtn, { backgroundColor: colors.backgroundSecondary }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Add expense"
            >
              <Plus size={20} color={colors.text} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        {/* ── Month chips ── */}
        {/* Outer View owns the bottom border so the ScrollView is unconstrained
            vertically — prevents Android from clipping the pill borders. */}
        <View style={[styles.monthScrollWrap, { borderBottomColor: colors.borderLight }]}>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthRow}
        >
          {monthOptions.map((opt) => {
            const selected = selectedMonth === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => handleMonthSelect(opt.value)}
                style={[
                  styles.monthChip,
                  {
                    backgroundColor: selected ? colors.primary : colors.backgroundSecondary,
                    borderColor:     selected ? colors.primary : colors.border,
                    borderRadius:    100,
                  },
                ]}
              >
                <Text
                  style={[
                    text.buttonLabelSm,
                    { color: selected ? colors.textOnForest : colors.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        </View>

        {/* ── List ── */}
        <FlatList
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          style={{ flex: 1 }}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <EmptyState
              icon={Wallet}
              title="No expenses yet"
              message="Tap + to add your first expense"
              action={{ label: 'Add Expense', onPress: () => setAddOpen(true) }}
              style={{ marginTop: 24 }}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + layout.tabBarHeight + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        />

        {/* ── Sheets ── */}
        <AddExpenseSheet
          isOpen={addOpen}
          onClose={() => setAddOpen(false)}
          onSuccess={handleSuccess}
        />
        <EditExpenseSheet
          expense={editExpense}
          onClose={() => setEditExpense(null)}
          onSuccess={handleSuccess}
        />
      </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    paddingBottom:     12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  headerIconBtn: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Month chips
  // Outer View owns the border so ScrollView height is unconstrained (no clipping)
  monthScrollWrap: {
    borderBottomWidth: 1,
    flexShrink:        0,     // don't compress in flex parent
    overflow:          'visible', // never clip pill borders
  },
  monthRow: {
    flexDirection: 'row',
    gap:           8,
    paddingLeft:   16,
    paddingRight:  24,
    paddingTop:    14,   // extra top room so pill border isn't clipped on Android
    paddingBottom: 14,
  },
  monthChip: {
    paddingHorizontal: 16,
    paddingVertical:   8,
    borderWidth:       1.5,
  },

  // Banner
  banner: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    marginHorizontal:  16,
    marginTop:         12,
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:      10,
    borderWidth:       1,
    gap:               8,
  },
  bannerText: {
    flex: 1,
  },

  // Summary card
  summaryCard: {
    marginHorizontal: 16,
    marginTop:        16,
    marginBottom:     8,
  },
  summaryInner: {
    padding: 20,
  },
  totalLabel: {
    marginBottom: 4,
  },
  totalAmount: {
    includeFontPadding: false,
  } as object,
  top3Row: {
    flexDirection:  'row',
    gap:            12,
    marginTop:      16,
    paddingTop:     16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  top3Item: {
    flex:       1,
    alignItems: 'center',
    gap:        2,
  },
  top3Icon: {
    width:          32,
    height:         32,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Filter pills
  filterScroll: {
    marginTop: 4,
  },
  filterRow: {
    flexDirection:     'row',
    gap:               8,
    paddingHorizontal: 16,
    paddingVertical:   10,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical:   8,
    borderWidth:       1.5,
  },

  // List
  listContent: {
    paddingTop: 4,
  },
  dateHeader: {
    marginTop:         16,
    marginBottom:      4,
    paddingHorizontal: 16,
    fontSize:          13,
  },
  expenseRow: {
    paddingHorizontal: 16,
  },

});
