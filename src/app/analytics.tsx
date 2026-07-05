/**
 * analytics.tsx — Spending Analytics
 *
 * Simple, minimal analytics:
 *  • Last 6 months bar chart (monthly totals)
 *  • Category breakdown for the current month
 *  • Month-over-month change insight
 */

import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react-native';
import { format, subMonths } from 'date-fns';
import { useTheme } from '../theme';
import { Card } from '../components/ui/Card';
import { useExpensesStore } from '../store/expenses.store';
import { useIncomeStore } from '../store/income.store';
import { useBillsStore } from '../store/bills.store';
import { useGoalsStore } from '../store/goals.store';
import { useCurrencyFormat } from '../hooks/useCurrencyFormat';
import { EXPENSE_CATEGORIES } from '../types';
import type { ExpenseCategory } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface MonthData {
  label:   string;   // e.g. 'Jan'
  month:   string;   // 'YYYY-MM'
  total:   number;   // in kobo
  income?: number;   // in kobo (optional, for cash flow chart)
}

function buildMonthlyData(
  records: { date: string; amount: number }[],
  count: number,
): MonthData[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d     = subMonths(now, count - 1 - i);
    const month = format(d, 'yyyy-MM');
    const label = format(d, 'MMM');
    const total = records
      .filter((e) => e.date.startsWith(month))
      .reduce((s, e) => s + e.amount, 0);
    return { label, month, total };
  });
}

interface CategoryTotal {
  category: ExpenseCategory;
  total:    number;
}

function buildCategoryData(
  expenses: { date: string; amount: number; category: string }[],
  month: string,
): CategoryTotal[] {
  const map = new Map<string, number>();
  expenses
    .filter((e) => e.date.startsWith(month))
    .forEach((e) => {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    });

  return Array.from(map.entries())
    .map(([category, total]) => ({ category: category as ExpenseCategory, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
}

// ─── Health score helpers ────────────────────────────────────────────────────

function computeHealthScore({
  incomeKobo,
  expenseKobo,
  totalBills,
  paidBills,
  goalProgresses,
}: {
  incomeKobo:     number;
  expenseKobo:    number;
  totalBills:     number;
  paidBills:      number;
  goalProgresses: number[];  // 0–1
}): number {
  // Savings component (40 pts): target ≥ 20% savings rate
  const savingsRate = incomeKobo > 0 ? (incomeKobo - expenseKobo) / incomeKobo : 0;
  const savingsScore = Math.min(40, Math.max(0, (savingsRate / 0.20) * 40));

  // Bill payment component (20 pts)
  const billScore = totalBills > 0 ? (paidBills / totalBills) * 20 : 20;

  // Goal progress component (20 pts)
  const avgGoalProgress = goalProgresses.length > 0
    ? goalProgresses.reduce((s, p) => s + p, 0) / goalProgresses.length
    : 1; // no goals → full score
  const goalScore = avgGoalProgress * 20;

  // Income coverage component (20 pts): income ≥ expenses
  const coverageRatio = incomeKobo > 0
    ? Math.min(1, incomeKobo / Math.max(expenseKobo, 1))
    : expenseKobo === 0 ? 1 : 0;
  const coverageScore = coverageRatio * 20;

  return Math.round(savingsScore + billScore + goalScore + coverageScore);
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs work';
}

function HealthScoreCard({ score }: { score: number }) {
  const { colors, text, font, fontSize, radius } = useTheme();

  const scoreColor = score >= 80 ? colors.success
    : score >= 65 ? colors.warning ?? '#F5A623'
    : score >= 50 ? '#F5A623'
    : colors.danger;

  const label = scoreLabel(score);

  // Simple arc indicator: just a horizontal segmented bar
  const segments = 10;
  const filledSegments = Math.round(score / (100 / segments));

  return (
    <Card style={styles.healthCard}>
      <Text style={[text.caption, { color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.5 }]}>
        FINANCIAL HEALTH SCORE
      </Text>
      <View style={styles.healthRow}>
        {/* Score number */}
        <View>
          <Text
            style={[
              {
                fontFamily:    font.displayLight,
                fontSize:      fontSize['4xl'] ?? 48,
                color:         scoreColor,
                letterSpacing: -1,
                lineHeight:    52,
              },
            ]}
          >
            {score}
          </Text>
          <Text style={[text.caption, { color: scoreColor, fontFamily: font.sansSemiBold }]}>
            {label}
          </Text>
        </View>

        {/* Segmented bar */}
        <View style={styles.healthBarWrap}>
          <View style={styles.healthSegments}>
            {Array.from({ length: segments }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.healthSegment,
                  {
                    backgroundColor: i < filledSegments ? scoreColor : colors.backgroundSecondary,
                    borderRadius:    radius.sm,
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.healthLabelsRow}>
            <Text style={[text.caption, { color: colors.textTertiary, fontSize: 9 }]}>0</Text>
            <Text style={[text.caption, { color: colors.textTertiary, fontSize: 9 }]}>100</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

// ─── Cash flow paired bar ─────────────────────────────────────────────────────

function CashFlowBar({
  label,
  incomeTotal,
  expenseTotal,
  maxVal,
  isCurrentMonth,
}: {
  label:          string;
  incomeTotal:    number;
  expenseTotal:   number;
  maxVal:         number;
  isCurrentMonth: boolean;
}) {
  const { colors, text, radius } = useTheme();
  const incPct = maxVal > 0 && incomeTotal > 0
    ? Math.max(incomeTotal / maxVal, 0.05) : 0;
  const expPct = maxVal > 0 && expenseTotal > 0
    ? Math.max(expenseTotal / maxVal, 0.05) : 0;

  return (
    <View style={styles.barWrap}>
      {/* Paired bars side-by-side */}
      <View style={[styles.pairedBarBg]}>
        {/* Income bar */}
        <View style={[styles.pairedBarTrack, { borderRadius: radius.sm }]}>
          <View
            style={[
              styles.barFill,
              {
                height:          `${incPct * 100}%`,
                backgroundColor: incomeTotal === 0
                  ? colors.backgroundSecondary
                  : isCurrentMonth ? colors.success : colors.success + '55',
                borderRadius:    radius.sm,
              },
            ]}
          />
        </View>
        {/* Expense bar */}
        <View style={[styles.pairedBarTrack, { borderRadius: radius.sm }]}>
          <View
            style={[
              styles.barFill,
              {
                height:          `${expPct * 100}%`,
                backgroundColor: expenseTotal === 0
                  ? colors.backgroundSecondary
                  : isCurrentMonth ? colors.primary : colors.primary + '55',
                borderRadius:    radius.sm,
              },
            ]}
          />
        </View>
      </View>
      <Text
        style={[
          text.caption,
          {
            color:      isCurrentMonth ? colors.text : colors.textTertiary,
            fontWeight: isCurrentMonth ? '700' : '400',
            marginTop:  4,
            fontSize:   10,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({
  item,
  maxTotal,
  totalSpend,
}: {
  item:       CategoryTotal;
  maxTotal:   number;
  totalSpend: number;
}) {
  const { colors, text, radius } = useTheme();
  const { fmt } = useCurrencyFormat();

  const meta    = EXPENSE_CATEGORIES[item.category];
  const pct     = maxTotal > 0 ? item.total / maxTotal : 0;
  const sharePct = totalSpend > 0 ? Math.round((item.total / totalSpend) * 100) : 0;

  return (
    <View style={styles.catRow}>
      <View
        style={[
          styles.catDot,
          { backgroundColor: meta?.color ?? colors.textTertiary },
        ]}
      />
      <Text style={[text.bodySm, { color: colors.text, flex: 1 }]} numberOfLines={1}>
        {meta?.label ?? item.category}
      </Text>
      <Text style={[text.caption, { color: colors.textTertiary, marginRight: 8 }]}>
        {sharePct}%
      </Text>
      <View style={[styles.catTrack, { backgroundColor: colors.backgroundSecondary, borderRadius: radius.full }]}>
        <View
          style={[
            styles.catFill,
            {
              width:           `${pct * 100}%`,
              backgroundColor: meta?.color ?? colors.primary,
              borderRadius:    radius.full,
            },
          ]}
        />
      </View>
      <Text style={[text.caption, { color: colors.textSecondary, marginLeft: 8, minWidth: 60, textAlign: 'right' }]}>
        {fmt(item.total)}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { colors, text, font, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { fmt } = useCurrencyFormat();

  const { allExpenses } = useExpensesStore();
  const { allRecords: allIncome } = useIncomeStore();
  const { bills } = useBillsStore();
  const { goals } = useGoalsStore();

  const currentMonth = format(new Date(), 'yyyy-MM');

  const expenseMonthly = useMemo(() => buildMonthlyData(allExpenses, 6), [allExpenses]);
  const incomeMonthly  = useMemo(() => buildMonthlyData(allIncome, 6),   [allIncome]);
  const categoryData   = useMemo(() => buildCategoryData(allExpenses, currentMonth), [allExpenses, currentMonth]);

  const thisMonthExpense = expenseMonthly[expenseMonthly.length - 1]?.total ?? 0;
  const prevMonthExpense = expenseMonthly[expenseMonthly.length - 2]?.total ?? 0;
  const thisMonthIncome  = incomeMonthly[incomeMonthly.length - 1]?.total ?? 0;
  const netThisMonth     = thisMonthIncome - thisMonthExpense;
  const categorySpend    = categoryData.reduce((s, c) => s + c.total, 0);
  const maxCategory      = Math.max(...categoryData.map((d) => d.total), 1);

  // Cash flow chart max — across both income and expense
  const maxCashFlow = Math.max(
    ...expenseMonthly.map((d) => d.total),
    ...incomeMonthly.map((d)  => d.total),
    1,
  );

  // Bills: bills that are due this month
  const billsThisMonth = useMemo(() => bills.filter((b) => b.dueDate.startsWith(currentMonth)), [bills, currentMonth]);
  const paidBillsCount = useMemo(() => billsThisMonth.filter((b) => b.isPaid).length, [billsThisMonth]);

  // Goals: progress of active (non-completed) goals
  const goalProgresses = useMemo(() =>
    goals.filter((g) => !g.isCompleted).map((g) => g.progress ?? 0),
    [goals],
  );

  const healthScore = useMemo(() => computeHealthScore({
    incomeKobo:     thisMonthIncome,
    expenseKobo:    thisMonthExpense,
    totalBills:     billsThisMonth.length,
    paidBills:      paidBillsCount,
    goalProgresses,
  }), [thisMonthIncome, thisMonthExpense, billsThisMonth.length, paidBillsCount, goalProgresses]);

  const diffPct = prevMonthExpense > 0
    ? Math.round(((thisMonthExpense - prevMonthExpense) / prevMonthExpense) * 100)
    : 0;
  const isUp   = diffPct > 0;
  const isFlat = diffPct === 0;

  const TrendIcon  = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  const trendColor = isFlat
    ? colors.textSecondary
    : isUp
      ? colors.danger
      : colors.success;

  const netPositive = netThisMonth >= 0;
  const netColor    = netPositive ? colors.success : colors.danger;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop:        insets.top + 12,
            borderBottomColor: colors.borderLight,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={1.8} />
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
          ]}
        >
          Analytics
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Insight card ── */}
        <Animated.View entering={FadeInDown.delay(0).duration(250)}>
          <Card style={styles.insightCard}>
            <Text style={[text.caption, { color: colors.textSecondary, marginBottom: 4 }]}>
              {format(new Date(), 'MMMM yyyy')} · Net
            </Text>
            <Text
              style={[
                { fontFamily: font.displayLight, fontSize: fontSize['3xl'], color: netColor, letterSpacing: -0.5 },
              ]}
            >
              {netPositive ? '+' : '−'}{fmt(Math.abs(netThisMonth))}
            </Text>

            {/* Earned vs Spent row */}
            <View style={styles.insightRow}>
              <View style={styles.insightStat}>
                <Text style={[text.caption, { color: colors.textTertiary }]}>Earned</Text>
                <Text style={[text.bodySm, { color: colors.success, fontFamily: font.sansSemiBold }]}>
                  +{fmt(thisMonthIncome)}
                </Text>
              </View>
              <View style={[styles.insightDivider, { backgroundColor: colors.borderLight }]} />
              <View style={styles.insightStat}>
                <Text style={[text.caption, { color: colors.textTertiary }]}>Spent</Text>
                <Text style={[text.bodySm, { color: colors.text, fontFamily: font.sansSemiBold }]}>
                  {fmt(thisMonthExpense)}
                </Text>
              </View>
              {prevMonthExpense > 0 && (
                <>
                  <View style={[styles.insightDivider, { backgroundColor: colors.borderLight }]} />
                  <View style={styles.insightStat}>
                    <Text style={[text.caption, { color: colors.textTertiary }]}>vs Last</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <TrendIcon size={12} color={trendColor} strokeWidth={2} />
                      <Text style={[text.bodySm, { color: trendColor, fontFamily: font.sansSemiBold }]}>
                        {isFlat ? '—' : `${Math.abs(diffPct)}%`}
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </Card>
        </Animated.View>

        {/* ── Health score ── */}
        <Animated.View entering={FadeInDown.delay(40).duration(250)}>
          <HealthScoreCard score={healthScore} />
        </Animated.View>

        {/* ── Cash flow chart ── */}
        <Animated.View entering={FadeInDown.delay(60).duration(250)}>
          <Text style={[text.labelCaps, styles.sectionLabel, { color: colors.textTertiary }]}>
            Cash Flow · 6 months
          </Text>
          <Card style={styles.chartCard}>
            {/* Legend */}
            <View style={styles.cashLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                <Text style={[text.caption, { color: colors.textTertiary }]}>Income</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={[text.caption, { color: colors.textTertiary }]}>Expenses</Text>
              </View>
            </View>
            <View style={styles.bars}>
              {expenseMonthly.map((d, i) => (
                <CashFlowBar
                  key={d.month}
                  label={d.label}
                  incomeTotal={incomeMonthly[i]?.total ?? 0}
                  expenseTotal={d.total}
                  maxVal={maxCashFlow}
                  isCurrentMonth={d.month === currentMonth}
                />
              ))}
            </View>
          </Card>
        </Animated.View>

        {/* ── Category breakdown ── */}
        <Animated.View entering={FadeInDown.delay(120).duration(250)}>
          <Text style={[text.labelCaps, styles.sectionLabel, { color: colors.textTertiary }]}>
            Top Categories · {format(new Date(), 'MMM')}
          </Text>
          <Card style={styles.categoriesCard}>
            {categoryData.length === 0 ? (
              <View style={styles.emptyCategories}>
                <Text style={[text.bodySm, { color: colors.textSecondary }]}>
                  No expenses recorded this month
                </Text>
              </View>
            ) : (
              categoryData.map((item, idx) => (
                <View
                  key={item.category}
                  style={[
                    idx < categoryData.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.borderLight,
                      paddingBottom:     10,
                      marginBottom:      10,
                    },
                  ]}
                >
                  <CategoryRow
                    item={item}
                    maxTotal={maxCategory}
                    totalSpend={categorySpend}
                  />
                </View>
              ))
            )}
          </Card>
        </Animated.View>

      </ScrollView>
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
  backBtn: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex:          1,
    textAlign:     'center',
    letterSpacing: -0.5,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop:        20,
    gap:               16,
  },
  sectionLabel: {
    letterSpacing: 1,
    marginBottom:  8,
    marginLeft:    2,
  },

  // Insight
  insightCard: {
    padding: 20,
  },
  insightRow: {
    flexDirection:  'row',
    alignItems:     'center',
    marginTop:      14,
    gap:            0,
  },
  insightStat: {
    flex:       1,
    alignItems: 'center',
    gap:        3,
  },
  insightDivider: {
    width:  1,
    height: 28,
  },

  // Cash flow chart
  chartCard: {
    padding: 16,
  },
  cashLegend: {
    flexDirection: 'row',
    gap:           16,
    marginBottom:  12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },
  legendDot: {
    width:        7,
    height:       7,
    borderRadius: 4,
  },
  bars: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    height:        80,
    gap:           6,
  },
  barWrap: {
    flex:       1,
    alignItems: 'center',
  },
  pairedBarBg: {
    width:          '100%',
    height:         64,
    flexDirection:  'row',
    alignItems:     'flex-end',
    gap:            2,
  },
  pairedBarTrack: {
    flex:           1,
    height:         '100%',
    justifyContent: 'flex-end',
    overflow:       'hidden',
  },
  barFill: {
    width: '100%',
  },

  // Categories
  categoriesCard: {
    padding: 16,
  },
  catRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  catDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  catTrack: {
    width:    80,
    height:   5,
    overflow: 'hidden',
  },
  catFill: {
    height: '100%',
  },
  emptyCategories: {
    paddingVertical: 20,
    alignItems:      'center',
  },

  // Health score
  healthCard: {
    padding: 20,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           20,
  },
  healthBarWrap: {
    flex: 1,
  },
  healthSegments: {
    flexDirection: 'row',
    gap:           4,
    height:        28,
  },
  healthSegment: {
    flex:   1,
    height: '100%',
  },
  healthLabelsRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginTop:      4,
  },
});
