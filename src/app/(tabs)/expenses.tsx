import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
} from 'react-native-reanimated';
import {
  Plus,
  Wallet,
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import { BannerAmount } from '../../components/ui/CompactAmountDisplay';
import { SkeletonBanner, SkeletonExpenseRow } from '../../components/ui/Skeleton';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { AddExpenseSheet } from '../../components/expenses/AddExpenseSheet';
import { EditExpenseSheet } from '../../components/expenses/EditExpenseSheet';
import { ExpenseRow } from '../../components/expenses/ExpenseRow';
import { useExpensesStore } from '../../store/expenses.store';
import { useAuthStore } from '../../store/auth.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type Expense } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryFilter = 'all' | ExpenseCategory;

interface MonthOption {
  label: string;
  value: string;
}

interface DateGroup {
  dateKey:   string;
  dateValue: string;
  items:     Expense[];
}

// FlatList renders each item as one of these:
type ListItem = { type: 'dateGroup'; group: DateGroup };

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
  const opts: MonthOption[] = [];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    opts.push({
      label: `${monthNames[m]} ${y}`,
      value: `${y}-${String(m + 1).padStart(2, '0')}`,
    });
  }
  return opts;
}

function currentMonthLabel(): string {
  const now = new Date();
  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  return `${names[now.getMonth()]} ${now.getFullYear()}`;
}

function formatDateHeader(dateStr: string): string {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yStr)     return 'Yesterday';

  const [, m, d] = dateStr.split('-');
  const date = new Date(dateStr + 'T00:00:00');
  const dayNames   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dayNames[date.getDay()]} ${parseInt(d, 10)} ${monthNames[parseInt(m, 10) - 1]}`;
}

function groupExpensesByDate(expenses: Expense[]): DateGroup[] {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    const arr = map.get(e.date) ?? [];
    arr.push(e);
    map.set(e.date, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateValue, items]) => ({
      dateKey:   formatDateHeader(dateValue),
      dateValue,
      items,
    }));
}

function getTop3(byCategory: Record<ExpenseCategory, number>) {
  return (Object.entries(byCategory) as Array<[ExpenseCategory, number]>)
    .filter(([, amt]) => amt > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat, amount]) => ({ cat, amount }));
}

// ─── Date group card ──────────────────────────────────────────────────────────

function DateGroupCard({ group, onPressExpense, onLongPressExpense }: {
  group:               DateGroup;
  onPressExpense:      (id: string) => void;
  onLongPressExpense:  (exp: Expense) => void;
}) {
  const { colors, text, font, fontSize, radius } = useTheme();

  return (
    <View>
      {/* Date label */}
      <Text style={[styles.dateLabel, text.labelCaps, { color: colors.textSecondary }]}>
        {group.dateKey}
      </Text>

      {/* Card per date group */}
      <Card style={styles.dateCard}>
        {group.items.map((exp, idx) => (
          <View
            key={exp.id}
            style={[
              idx < group.items.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: colors.borderLight,
              },
            ]}
          >
            <ExpenseRow
              expense={exp}
              onPress={() => onPressExpense(exp.id)}
              onLongPress={() => onLongPressExpense(exp)}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}

const EXPENSE_CATEGORIES_KEYS = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const { colors, text, font, fontSize, radius, layout } = useTheme();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();

  const {
    expenses, allExpenses, summary, selectedMonth, isLoading,
    load, loadAll, loadMonth, setMonth,
  } = useExpensesStore();

  const { user } = useAuthStore();
  const { fmt, fmtCompact } = useCurrencyFormat();

  // viewMode: 'all' shows all-time; 'month' filters by selectedMonth
  const [viewMode,       setViewMode]       = useState<'all' | 'month'>('all');
  const [addOpen,        setAddOpen]        = useState(false);
  const [editExpense,    setEditExpense]     = useState<Expense | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const monthOptions = useMemo(() => buildMonthOptions(), []);

  // On mount and whenever user changes, load all expenses
  useEffect(() => {
    if (!user) return;
    if (viewMode === 'all') {
      loadAll(user.id);
    } else {
      load(user.id);
    }
  }, [user, viewMode]);

  const handleMonthSelect = useCallback((monthValue: string) => {
    if (!user) return;
    setViewMode('month');
    setMonth(monthValue);
    loadMonth(user.id, monthValue);
    setCategoryFilter('all');
  }, [user, setMonth, loadMonth]);

  const handleViewAll = useCallback(() => {
    if (!user) return;
    setViewMode('all');
    setCategoryFilter('all');
    loadAll(user.id);
  }, [user, loadAll]);

  const handleSuccess = useCallback(() => {
    if (!user) return;
    if (viewMode === 'all') loadAll(user.id);
    else load(user.id);
  }, [user, viewMode, load, loadAll]);

  // Source: all-time in 'all' mode, month-filtered otherwise
  const sourceExpenses = viewMode === 'all' ? allExpenses : expenses;

  const filteredExpenses = useMemo(() => {
    if (categoryFilter === 'all') return sourceExpenses;
    return sourceExpenses.filter((e) => e.category === categoryFilter);
  }, [sourceExpenses, categoryFilter]);

  // "Recently added" = expenses with createdAt within last 48h, by creation time
  const recentlyAdded = useMemo(() => {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    return [...allExpenses]
      .filter((e) => new Date(e.createdAt).getTime() > cutoff)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
  }, [allExpenses]);

  const dateGroups = useMemo(
    () => groupExpensesByDate(filteredExpenses),
    [filteredExpenses],
  );

  const top3       = useMemo(() => (summary ? getTop3(summary.byCategory) : []), [summary]);
  const totalSpent = summary?.totalAmount ?? 0;
  const txCount    = sourceExpenses.length;

  // FlatList data: one item per date group
  const listData = useMemo((): ListItem[] => {
    return [
      ...dateGroups.map((group): ListItem => ({ type: 'dateGroup', group })),
    ];
  }, [dateGroups]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => (
      <DateGroupCard
        group={item.group}
        onPressExpense={(id) => router.push(`/expenses/${id}` as never)}
        onLongPressExpense={(exp) => setEditExpense(exp)}
      />
    ),
    [router],
  );

  const keyExtractor = useCallback((item: ListItem): string => {
    return `group-${item.group.dateValue}`;
  }, []);

  // Header is a function so FlatList instantiates it correctly
  const ListHeader = useCallback(
    () => (
      <>
        {/* Summary banner — skeleton while loading */}
        {isLoading && <SkeletonBanner style={{ marginBottom: 8 }} />}

        {/* Summary banner — forest-green, matches bills + goals */}
        {!isLoading && <View style={styles.summaryBanner}>
          {Platform.OS === 'ios' && (
            <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFill} />
          )}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor:
                  Platform.OS === 'ios' ? 'rgba(22,58,47,0.82)' : colors.primary,
                borderRadius: 20,
              },
            ]}
          />
          <View style={{ position: 'relative' }}>
            <Text style={[text.caption, { color: 'rgba(250,250,248,0.65)', letterSpacing: 1 }]}>
              {viewMode === 'all' ? 'ALL TIME SPENT' : 'TOTAL SPENT'}
            </Text>
            <BannerAmount
              kobo={totalSpent}
              textStyle={{
                fontFamily:    font.displayLight,
                fontSize:      fontSize['3xl'],
                color:         Palette.linen,
                letterSpacing: -1,
                marginTop:     4,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
              <View>
                <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Transactions</Text>
                <Text style={[text.bodyMedium, { color: Palette.linen, marginTop: 2 }]}>
                  {txCount} {txCount === 1 ? 'entry' : 'entries'}
                </Text>
              </View>
              {top3[0] && (
                <>
                  <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
                  <View>
                    <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Top category</Text>
                    <Text style={[text.bodyMedium, { color: Palette.gold, marginTop: 2 }]}>
                      {EXPENSE_CATEGORIES[top3[0].cat].label}
                    </Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
                  <View>
                    <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Amount</Text>
                    <Text style={[text.bodyMedium, { color: Palette.linen, marginTop: 2 }]}>
                      {fmtCompact(top3[0].amount)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>}

        {/* Category filter pills */}
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
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

        {/* Recently added — expenses created in last 48h */}
        {recentlyAdded.length > 0 && (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={[text.labelCaps, { color: colors.textSecondary }]}>Recently Added</Text>
            </View>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentRow}
            >
              {recentlyAdded.map((exp) => {
                const meta = EXPENSE_CATEGORIES[exp.category];
                return (
                  <Pressable
                    key={exp.id}
                    onPress={() => router.push(`/expenses/${exp.id}` as never)}
                    style={[styles.recentCard, { backgroundColor: colors.card, borderRadius: radius.lg }]}
                  >
                    <View style={[styles.recentDot, { backgroundColor: meta.color }]} />
                    <Text
                      style={{ fontFamily: font.sansMedium, fontSize: 12, color: colors.text, lineHeight: 16 }}
                      numberOfLines={1}
                    >
                      {exp.description ?? meta.label}
                    </Text>
                    <Text style={{ fontFamily: font.sansSemiBold, fontSize: 11, color: colors.textSecondary, marginTop: 3 }} numberOfLines={1}>
                      {fmtCompact(exp.amount)}
                    </Text>
                    <Text style={{ fontFamily: font.sansRegular, fontSize: 10, color: colors.textTertiary, marginTop: 4 }}>
                      {exp.date}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </>
    ),
    [top3, txCount, totalSpent, categoryFilter, recentlyAdded, viewMode, isLoading, colors, text, font, fontSize, radius, fmt, fmtCompact, router],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, borderBottomColor: colors.borderLight },
        ]}
      >
        <Text
          style={[
            styles.headerTitle,
            { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
          ]}
        >
          Expenses
        </Text>
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
      <View style={[styles.monthScrollWrap, { borderBottomColor: colors.borderLight }]}>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthRow}
        >
          {/* "All" pill — default, shows everything */}
          <Pressable
            onPress={handleViewAll}
            style={[
              styles.monthChip,
              {
                backgroundColor: viewMode === 'all' ? colors.primary : colors.backgroundSecondary,
                borderColor:     viewMode === 'all' ? colors.primary : colors.border,
                borderRadius:    100,
              },
            ]}
          >
            <Text
              style={[
                text.buttonLabelSm,
                { color: viewMode === 'all' ? colors.textOnForest : colors.textSecondary },
              ]}
            >
              All time
            </Text>
          </Pressable>

          {monthOptions.map((opt) => {
            const selected = viewMode === 'month' && selectedMonth === opt.value;
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
          isLoading ? (
            <View style={{ gap: 0 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <SkeletonExpenseRow
                  key={i}
                  style={{
                    paddingHorizontal: 0,
                    borderBottomWidth: i < 4 ? 1 : 0,
                    borderBottomColor: 'rgba(0,0,0,0.06)',
                  }}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon={Wallet}
              title="No expenses yet"
              message="Tap + to add your first expense"
              action={{ label: 'Add Expense', onPress: () => setAddOpen(true) }}
              style={{ marginTop: 24 }}
            />
          )
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
  screen: { flex: 1 },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    paddingBottom:     12,
    borderBottomWidth: 1,
  },
  headerTitle:   { letterSpacing: -0.5 },
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
  monthScrollWrap: {
    borderBottomWidth: 1,
    flexShrink:        0,
    overflow:          'visible',
  },
  monthRow: {
    flexDirection: 'row',
    gap:           8,
    paddingLeft:   24,
    paddingRight:  24,
    paddingTop:    14,
    paddingBottom: 14,
  },
  monthChip: {
    paddingHorizontal: 16,
    paddingVertical:   8,
    borderWidth:       1.5,
  },

  // Summary banner — forest-green, matches bills + goals
  summaryBanner: {
    marginTop:    16,
    marginBottom: 8,
    borderRadius: 20,
    padding:      20,
    overflow:     'hidden',
  },

  // Category filter pills
  filterScroll: {
    marginTop: 4,
    flexShrink: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap:           8,
    paddingVertical: 10,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical:   8,
    borderWidth:       1.5,
  },

  // Recently added section
  recentSection: {
    marginTop:    16,
    marginBottom: 4,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginBottom:  10,
  },
  recentRow: {
    flexDirection: 'row',
    gap:           10,
  },
  recentCard: {
    padding:   12,
    minWidth:  130,
    maxWidth:  170,
  },
  recentDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
    marginBottom: 6,
  },

  // List
  listContent: {
    paddingTop:        8,
    paddingHorizontal: 24,
    gap:               16,
  },
  dateLabel: {
    fontSize:     12,
    marginBottom: 8,
    marginTop:    4,
  },
  dateCard: {
    paddingHorizontal: 16,
    paddingVertical:   8,
  },
});
