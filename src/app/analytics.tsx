/**
 * analytics.tsx — Money Analytics
 *
 * The mathematics behind your money:
 *  • Range selector — 1M · 3M · 6M · 1Y
 *  • Range totals (earned / spent / net) + financial health score
 *  • Cash flow paired bar chart (income vs expenses per bucket)
 *  • Category donut chart + breakdown for the selected range
 *  • Savings-rate trend — how much of your income you kept, per month
 */

import React, { useMemo, useState } from 'react';
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
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import {
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react-native';
import { format, subMonths, subDays } from 'date-fns';
import { useTheme } from '../theme';
import { Card } from '../components/ui/Card';
import { useExpensesStore } from '../store/expenses.store';
import { useIncomeStore } from '../store/income.store';
import { useBillsStore } from '../store/bills.store';
import { useGoalsStore } from '../store/goals.store';
import { useCurrencyFormat } from '../hooks/useCurrencyFormat';
import { EXPENSE_CATEGORIES } from '../types';
import type { ExpenseCategory } from '../types';

// ─── Ranges ───────────────────────────────────────────────────────────────────

type RangeKey = '1M' | '3M' | '6M' | '1Y';

const RANGES: { key: RangeKey; label: string; months: number }[] = [
  { key: '1M', label: '1M', months: 1 },
  { key: '3M', label: '3M', months: 3 },
  { key: '6M', label: '6M', months: 6 },
  { key: '1Y', label: '1Y', months: 12 },
];

/** Earliest date (YYYY-MM-DD) included in a range. */
function rangeStart(range: RangeKey): string {
  const now = new Date();
  if (range === '1M') return format(subDays(now, 27), 'yyyy-MM-dd');
  const months = RANGES.find((r) => r.key === range)!.months;
  return format(subMonths(now, months - 1), 'yyyy-MM') + '-01';
}

// ─── Bucketed chart data ──────────────────────────────────────────────────────

interface Bucket {
  key:     string;
  label:   string;
  income:  number;  // kobo
  expense: number;  // kobo
}

/**
 * 1M → 4 weekly buckets; 3M/6M/1Y → one bucket per month.
 */
function buildBuckets(
  expenses: { date: string; amount: number }[],
  income:   { date: string; amount: number }[],
  range:    RangeKey,
): Bucket[] {
  const now = new Date();

  if (range === '1M') {
    return Array.from({ length: 4 }, (_, i) => {
      const start = subDays(now, (3 - i) * 7 + 6);
      const end   = subDays(now, (3 - i) * 7);
      const s     = format(start, 'yyyy-MM-dd');
      const e     = format(end,   'yyyy-MM-dd');
      const within = (d: string) => d >= s && d <= e;
      return {
        key:     s,
        label:   format(start, 'd MMM'),
        income:  income.filter((r)   => within(r.date)).reduce((t, r) => t + r.amount, 0),
        expense: expenses.filter((r) => within(r.date)).reduce((t, r) => t + r.amount, 0),
      };
    });
  }

  const months = RANGES.find((r) => r.key === range)!.months;
  return Array.from({ length: months }, (_, i) => {
    const d     = subMonths(now, months - 1 - i);
    const month = format(d, 'yyyy-MM');
    return {
      key:     month,
      label:   format(d, months >= 12 ? 'MMMMM' : 'MMM'), // 1Y → single letter
      income:  income.filter((r)   => r.date.startsWith(month)).reduce((t, r) => t + r.amount, 0),
      expense: expenses.filter((r) => r.date.startsWith(month)).reduce((t, r) => t + r.amount, 0),
    };
  });
}

// ─── Category data ────────────────────────────────────────────────────────────

interface CategoryTotal {
  category: ExpenseCategory;
  total:    number;
}

function buildCategoryData(
  expenses: { date: string; amount: number; category: string }[],
  start: string,
): CategoryTotal[] {
  const map = new Map<string, number>();
  expenses
    .filter((e) => e.date >= start)
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

  const segments = 10;
  const filledSegments = Math.round(score / (100 / segments));

  return (
    <Card style={styles.healthCard}>
      <Text style={[text.caption, { color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.5 }]}>
        FINANCIAL HEALTH SCORE
      </Text>
      <View style={styles.healthRow}>
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

// ─── Range selector ───────────────────────────────────────────────────────────

function RangeSelector({
  value,
  onChange,
}: {
  value:    RangeKey;
  onChange: (r: RangeKey) => void;
}) {
  const { colors, text, font, radius } = useTheme();
  return (
    <View style={[styles.rangeWrap, { backgroundColor: colors.backgroundSecondary, borderRadius: radius.full }]}>
      {RANGES.map((r) => {
        const active = r.key === value;
        return (
          <Pressable
            key={r.key}
            onPress={() => onChange(r.key)}
            style={[
              styles.rangeChip,
              {
                backgroundColor: active ? colors.primary : 'transparent',
                borderRadius:    radius.full,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[
                text.caption,
                {
                  color:      active ? colors.textOnForest ?? '#F5F2EC' : colors.textSecondary,
                  fontFamily: active ? font.sansSemiBold : font.sansMedium,
                },
              ]}
            >
              {r.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Cash flow paired bar ─────────────────────────────────────────────────────

function CashFlowBar({
  label,
  incomeTotal,
  expenseTotal,
  maxVal,
  isCurrent,
}: {
  label:        string;
  incomeTotal:  number;
  expenseTotal: number;
  maxVal:       number;
  isCurrent:    boolean;
}) {
  const { colors, text, radius } = useTheme();
  const incPct = maxVal > 0 && incomeTotal > 0
    ? Math.max(incomeTotal / maxVal, 0.05) : 0;
  const expPct = maxVal > 0 && expenseTotal > 0
    ? Math.max(expenseTotal / maxVal, 0.05) : 0;

  return (
    <View style={styles.barWrap}>
      <View style={[styles.pairedBarBg]}>
        <View style={[styles.pairedBarTrack, { borderRadius: radius.sm }]}>
          <View
            style={[
              styles.barFill,
              {
                height:          `${incPct * 100}%`,
                backgroundColor: incomeTotal === 0
                  ? colors.backgroundSecondary
                  : isCurrent ? colors.success : colors.success + '55',
                borderRadius:    radius.sm,
              },
            ]}
          />
        </View>
        <View style={[styles.pairedBarTrack, { borderRadius: radius.sm }]}>
          <View
            style={[
              styles.barFill,
              {
                height:          `${expPct * 100}%`,
                backgroundColor: expenseTotal === 0
                  ? colors.backgroundSecondary
                  : isCurrent ? colors.primary : colors.primary + '55',
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
            color:      isCurrent ? colors.text : colors.textTertiary,
            fontWeight: isCurrent ? '700' : '400',
            marginTop:  4,
            fontSize:   9,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Category donut chart ─────────────────────────────────────────────────────

const DONUT_SIZE   = 148;
const DONUT_STROKE = 18;

function CategoryDonut({
  data,
  totalSpend,
  centerLabel,
}: {
  data:        CategoryTotal[];
  totalSpend:  number;
  centerLabel: string;
}) {
  const { colors, text, font, fontSize } = useTheme();

  const r    = (DONUT_SIZE - DONUT_STROKE) / 2;
  const c    = 2 * Math.PI * r;
  const cx   = DONUT_SIZE / 2;

  // Build segments: [startFraction, fraction, color]
  let acc = 0;
  const segments = data.map((d) => {
    const frac  = totalSpend > 0 ? d.total / totalSpend : 0;
    const start = acc;
    acc += frac;
    return {
      key:   d.category,
      color: EXPENSE_CATEGORIES[d.category]?.color ?? colors.primary,
      start,
      frac,
    };
  });

  return (
    <View style={styles.donutWrap}>
      <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
        {/* Track */}
        <SvgCircle
          cx={cx} cy={cx} r={r}
          stroke={colors.backgroundSecondary}
          strokeWidth={DONUT_STROKE}
          fill="none"
        />
        {segments.map((s) => (
          <SvgCircle
            key={s.key}
            cx={cx} cy={cx} r={r}
            stroke={s.color}
            strokeWidth={DONUT_STROKE}
            fill="none"
            strokeLinecap="butt"
            // Draw only this segment's arc, rotated to its start position
            strokeDasharray={`${Math.max(s.frac * c - 2, 0)} ${c}`}
            transform={`rotate(${s.start * 360 - 90} ${cx} ${cx})`}
          />
        ))}
      </Svg>
      {/* Center label */}
      <View style={styles.donutCenter} pointerEvents="none">
        <Text style={[text.caption, { color: colors.textTertiary, fontSize: 9, letterSpacing: 0.6 }]}>
          SPENT
        </Text>
        <Text
          style={[
            { fontFamily: font.sansSemiBold, fontSize: fontSize.md, color: colors.text, textAlign: 'center' },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {centerLabel}
        </Text>
      </View>
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

// ─── Savings-rate trend row ───────────────────────────────────────────────────
// Horizontal ± bar per bucket: how much of that period's income was kept.

function SavingsTrendRow({ bucket }: { bucket: Bucket }) {
  const { colors, text, font, radius } = useTheme();

  const hasIncome = bucket.income > 0;
  const rate = hasIncome
    ? Math.round(((bucket.income - bucket.expense) / bucket.income) * 100)
    : null;

  const clamped  = rate === null ? 0 : Math.max(-100, Math.min(100, rate));
  const positive = (rate ?? 0) >= 0;
  const barColor = rate === null
    ? colors.backgroundSecondary
    : positive ? colors.success : colors.danger;

  return (
    <View style={styles.trendRow}>
      <Text style={[text.caption, { color: colors.textTertiary, width: 44 }]} numberOfLines={1}>
        {bucket.label}
      </Text>

      {/* Center-anchored ± bar */}
      <View style={styles.trendTrack}>
        <View style={[styles.trendHalf, { alignItems: 'flex-end' }]}>
          {!positive && rate !== null && (
            <View
              style={[
                styles.trendFill,
                { width: `${Math.abs(clamped)}%`, backgroundColor: barColor, borderRadius: radius.full },
              ]}
            />
          )}
        </View>
        <View style={[styles.trendAxis, { backgroundColor: colors.borderLight }]} />
        <View style={styles.trendHalf}>
          {positive && rate !== null && (
            <View
              style={[
                styles.trendFill,
                { width: `${clamped}%`, backgroundColor: barColor, borderRadius: radius.full },
              ]}
            />
          )}
        </View>
      </View>

      <Text
        style={[
          text.caption,
          {
            color:      rate === null ? colors.textTertiary : positive ? colors.success : colors.danger,
            fontFamily: font.sansSemiBold,
            width:      48,
            textAlign:  'right',
          },
        ]}
      >
        {rate === null ? '—' : `${rate > 0 ? '+' : ''}${rate}%`}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { colors, text, font, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { fmt, fmtCompact } = useCurrencyFormat();

  const { allExpenses } = useExpensesStore();
  const { allRecords: allIncome } = useIncomeStore();
  const { bills } = useBillsStore();
  const { goals } = useGoalsStore();

  const [range, setRange] = useState<RangeKey>('6M');

  const currentMonth = format(new Date(), 'yyyy-MM');
  const start        = useMemo(() => rangeStart(range), [range]);

  const buckets = useMemo(
    () => buildBuckets(allExpenses, allIncome, range),
    [allExpenses, allIncome, range],
  );
  const categoryData = useMemo(
    () => buildCategoryData(allExpenses, start),
    [allExpenses, start],
  );

  // Range totals
  const rangeIncome  = useMemo(() => allIncome.filter((r)   => r.date >= start).reduce((s, r) => s + r.amount, 0), [allIncome, start]);
  const rangeExpense = useMemo(() => allExpenses.filter((r) => r.date >= start).reduce((s, r) => s + r.amount, 0), [allExpenses, start]);
  const rangeNet     = rangeIncome - rangeExpense;

  // Previous window comparison (same length immediately before `start`)
  const prevExpense = useMemo(() => {
    const startD  = new Date(start);
    const nowD    = new Date();
    const spanMs  = nowD.getTime() - startD.getTime();
    const prevS   = format(new Date(startD.getTime() - spanMs), 'yyyy-MM-dd');
    return allExpenses
      .filter((e) => e.date >= prevS && e.date < start)
      .reduce((s, e) => s + e.amount, 0);
  }, [allExpenses, start]);

  const categorySpend = categoryData.reduce((s, c) => s + c.total, 0);
  const maxCategory   = Math.max(...categoryData.map((d) => d.total), 1);
  const maxCashFlow   = Math.max(...buckets.map((b) => Math.max(b.income, b.expense)), 1);

  // Health score — always based on the current month
  const thisMonthIncome  = useMemo(() => allIncome.filter((r)  => r.date.startsWith(currentMonth)).reduce((s, r) => s + r.amount, 0), [allIncome, currentMonth]);
  const thisMonthExpense = useMemo(() => allExpenses.filter((r) => r.date.startsWith(currentMonth)).reduce((s, r) => s + r.amount, 0), [allExpenses, currentMonth]);

  const billsThisMonth = useMemo(() => bills.filter((b) => b.dueDate.startsWith(currentMonth)), [bills, currentMonth]);
  const paidBillsCount = useMemo(() => billsThisMonth.filter((b) => b.isPaid).length, [billsThisMonth]);
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

  const diffPct = prevExpense > 0
    ? Math.round(((rangeExpense - prevExpense) / prevExpense) * 100)
    : 0;
  const isUp   = diffPct > 0;
  const isFlat = diffPct === 0;

  const TrendIcon  = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  const trendColor = isFlat
    ? colors.textSecondary
    : isUp
      ? colors.danger
      : colors.success;

  const netPositive = rangeNet >= 0;
  const netColor    = netPositive ? colors.success : colors.danger;

  const rangeLabel = RANGES.find((r) => r.key === range)!.label;

  // Savings rate for the range (for the trend section footer)
  const rangeSavingsRate = rangeIncome > 0
    ? Math.round((rangeNet / rangeIncome) * 100)
    : null;

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

        {/* ── Range selector ── */}
        <Animated.View entering={FadeInDown.delay(0).duration(220)}>
          <RangeSelector value={range} onChange={setRange} />
        </Animated.View>

        {/* ── Range totals card ── */}
        <Animated.View entering={FadeInDown.delay(20).duration(250)}>
          <Card style={styles.insightCard}>
            <Text style={[text.caption, { color: colors.textSecondary, marginBottom: 4 }]}>
              Last {rangeLabel} · Net
            </Text>
            <Text
              style={[
                { fontFamily: font.displayLight, fontSize: fontSize['3xl'], color: netColor, letterSpacing: -0.5 },
              ]}
            >
              {netPositive ? '+' : '−'}{fmt(Math.abs(rangeNet))}
            </Text>

            <View style={styles.insightRow}>
              <View style={styles.insightStat}>
                <Text style={[text.caption, { color: colors.textTertiary }]}>Earned</Text>
                <Text style={[text.bodySm, { color: colors.success, fontFamily: font.sansSemiBold }]}>
                  +{fmtCompact(rangeIncome)}
                </Text>
              </View>
              <View style={[styles.insightDivider, { backgroundColor: colors.borderLight }]} />
              <View style={styles.insightStat}>
                <Text style={[text.caption, { color: colors.textTertiary }]}>Spent</Text>
                <Text style={[text.bodySm, { color: colors.text, fontFamily: font.sansSemiBold }]}>
                  {fmtCompact(rangeExpense)}
                </Text>
              </View>
              {prevExpense > 0 && (
                <>
                  <View style={[styles.insightDivider, { backgroundColor: colors.borderLight }]} />
                  <View style={styles.insightStat}>
                    <Text style={[text.caption, { color: colors.textTertiary }]}>vs Prev</Text>
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
            Cash Flow · {rangeLabel}
          </Text>
          <Card style={styles.chartCard}>
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
              {buckets.map((b, i) => (
                <CashFlowBar
                  key={b.key}
                  label={b.label}
                  incomeTotal={b.income}
                  expenseTotal={b.expense}
                  maxVal={maxCashFlow}
                  isCurrent={i === buckets.length - 1}
                />
              ))}
            </View>
          </Card>
        </Animated.View>

        {/* ── Category donut + breakdown ── */}
        <Animated.View entering={FadeInDown.delay(100).duration(250)}>
          <Text style={[text.labelCaps, styles.sectionLabel, { color: colors.textTertiary }]}>
            Where It Went · {rangeLabel}
          </Text>
          <Card style={styles.categoriesCard}>
            {categoryData.length === 0 ? (
              <View style={styles.emptyCategories}>
                <Text style={[text.bodySm, { color: colors.textSecondary }]}>
                  No expenses recorded in this range
                </Text>
              </View>
            ) : (
              <>
                <CategoryDonut
                  data={categoryData}
                  totalSpend={categorySpend}
                  centerLabel={fmtCompact(categorySpend)}
                />
                <View style={{ marginTop: 16 }}>
                  {categoryData.map((item, idx) => (
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
                  ))}
                </View>
              </>
            )}
          </Card>
        </Animated.View>

        {/* ── Savings-rate trend ── */}
        <Animated.View entering={FadeInDown.delay(140).duration(250)}>
          <Text style={[text.labelCaps, styles.sectionLabel, { color: colors.textTertiary }]}>
            Savings Rate · {rangeLabel}
          </Text>
          <Card style={styles.trendCard}>
            <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 12 }]}>
              How much of your income you kept each {range === '1M' ? 'week' : 'month'}
            </Text>
            {buckets.map((b) => (
              <SavingsTrendRow key={b.key} bucket={b} />
            ))}
            {rangeSavingsRate !== null && (
              <View style={[styles.trendFooter, { borderTopColor: colors.borderLight }]}>
                <Text style={[text.bodySm, { color: colors.textSecondary }]}>
                  Overall you kept{' '}
                  <Text style={{ color: rangeSavingsRate >= 0 ? colors.success : colors.danger, fontFamily: font.sansSemiBold }}>
                    {rangeSavingsRate}%
                  </Text>
                  {' '}of what you earned{rangeSavingsRate >= 20 ? ' — excellent discipline! 🏆' : rangeSavingsRate >= 0 ? '. Aim for 20%+.' : '. Spending exceeded income.'}
                </Text>
              </View>
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

  // Range selector
  rangeWrap: {
    flexDirection: 'row',
    padding:       4,
    gap:           4,
  },
  rangeChip: {
    flex:            1,
    paddingVertical: 8,
    alignItems:      'center',
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
    height:        84,
    gap:           4,
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

  // Donut
  donutWrap: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position:       'absolute',
    alignItems:     'center',
    justifyContent: 'center',
    width:          DONUT_SIZE - DONUT_STROKE * 2 - 16,
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

  // Savings trend
  trendCard: {
    padding: 16,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    marginBottom:  10,
  },
  trendTrack: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    height:        8,
  },
  trendHalf: {
    flex:           1,
    height:         '100%',
    justifyContent: 'center',
  },
  trendAxis: {
    width:  1,
    height: 14,
  },
  trendFill: {
    height: 8,
  },
  trendFooter: {
    marginTop:      6,
    paddingTop:     12,
    borderTopWidth: 1,
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
