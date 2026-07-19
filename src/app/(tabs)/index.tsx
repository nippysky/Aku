import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Palette } from '../../theme/colors';
import { format, subDays } from 'date-fns';
import {
  Bell,
  Receipt,
  Target,
  TrendingUp,
  TrendingDown,
  BarChart2,
  PieChart,
  Lightbulb,
} from 'lucide-react-native';
import {
  UtensilsCrossed, Car, ShoppingBag, Tv, Home,
  Zap, Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { BannerAmount, CompactAmountDisplay } from '../../components/ui/CompactAmountDisplay';
import { SkeletonBanner, SkeletonCard, SkeletonGoalCard, SkeletonSummaryGrid } from '../../components/ui/Skeleton';
import { BillRow } from '../../components/home/BillRow';
import { GoalCard } from '../../components/home/GoalCard';
import { useAuthStore } from '../../store/auth.store';
import { useBillsStore } from '../../store/bills.store';
import { useExpensesStore } from '../../store/expenses.store';
import { useIncomeStore } from '../../store/income.store';
import { useGoalsStore } from '../../store/goals.store';
import { useSyncStore } from '../../store/sync.store';
import { useNotifHistoryStore } from '../../store/notif-history.store';
import { FirstTimeHint } from '../../components/ui/FirstTimeHint';
import { useFirstTimeHint } from '../../hooks/useFirstTimeHint';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { EXPENSE_CATEGORIES } from '../../types';
import type { Bill, ExpenseCategory } from '../../types';

// ─── Icon map for expenses ────────────────────────────────────────────────────

const EXPENSE_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap, Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
};

// ─── Smart Insight ────────────────────────────────────────────────────────────

interface Insight {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  iconColor: string;
  label: string;
  text: string;
}

function computeInsight(
  allExpenses: { date: string; amount: number; category: string }[],
  incRecords:  { date: string; amount: number }[],
  bills:       Bill[],
  goals:       { name: string; progress: number; isCompleted: boolean }[],
  fmt:         (kobo: number) => string,
): Insight | null {
  const now = new Date();
  const currentMonth = format(now, 'yyyy-MM');

  const incomeThisMonth  = incRecords.filter(r => r.date.startsWith(currentMonth)).reduce((s, r) => s + r.amount, 0);
  const expensesThisMonth = allExpenses.filter(e => e.date.startsWith(currentMonth)).reduce((s, e) => s + e.amount, 0);
  const unpaidBillsTotal = bills.filter(b => !(b as { isPaid?: boolean }).isPaid).reduce((s, b) => s + b.amount, 0);

  // 1. Income covers bills — feels like wealth
  if (incomeThisMonth > 0 && unpaidBillsTotal > 0) {
    const ratio = incomeThisMonth / unpaidBillsTotal;
    if (ratio >= 1.5) {
      const displayRatio = Math.min(ratio, 99.9);
      return {
        icon: TrendingUp, iconColor: '#16A85A', label: 'Cash flow',
        text: `Your income this month covers your bills ${displayRatio.toFixed(1)}× over.`,
      };
    }
  }

  // 2. Savings rate
  if (incomeThisMonth > 0 && expensesThisMonth > 0) {
    const net = incomeThisMonth - expensesThisMonth;
    const rate = net / incomeThisMonth;
    if (rate >= 0.2) {
      return {
        icon: PiggyBank, iconColor: '#16A85A', label: 'Savings rate',
        text: `You're keeping ${Math.round(rate * 100)}% of your income this month.`,
      };
    }
    if (rate < -0.05) {
      return {
        icon: TrendingDown, iconColor: '#D63B3B', label: 'Over budget',
        text: `Spending exceeded income by ${fmt(Math.abs(net))} this month. Time to review.`,
      };
    }
  }

  // 3. Top spending category this month
  const thisMonthExp = allExpenses.filter(e => e.date.startsWith(currentMonth));
  if (thisMonthExp.length >= 3) {
    const byCat: Record<string, number> = {};
    for (const e of thisMonthExp) { byCat[e.category] = (byCat[e.category] ?? 0) + e.amount; }
    const [topCat, topAmt] = Object.entries(byCat).sort(([,a],[,b]) => b - a)[0] ?? [];
    if (topCat && topAmt) {
      const total = thisMonthExp.reduce((s, e) => s + e.amount, 0);
      const pct   = Math.round(topAmt / total * 100);
      const meta  = EXPENSE_CATEGORIES[topCat as ExpenseCategory];
      return {
        icon: PieChart, iconColor: meta?.color ?? '#163A2F', label: 'Top category',
        text: `${meta?.label ?? topCat} is ${pct}% of your spending this month.`,
      };
    }
  }

  // 4. Nearest active goal
  const activeGoals = goals.filter(g => !g.isCompleted && g.progress > 0)
    .sort((a, b) => b.progress - a.progress);
  if (activeGoals[0]) {
    const g = activeGoals[0];
    const pct = Math.round(g.progress * 100);
    return {
      icon: Target, iconColor: '#C4A85A', label: 'Goal progress',
      text: `You're ${pct}% towards "${g.name}". Keep going!`,
    };
  }

  return null;
}

// ── InsightCard component ──────────────────────────────────────────────────────

function InsightCard({ insight, onPress }: { insight: Insight; onPress: () => void }) {
  const { colors, text, font, fontSize, radius } = useTheme();
  const Icon = insight.icon;
  return (
    <Pressable onPress={onPress}>
      <Card style={[styles.insightCard, { borderRadius: radius.lg }]}>
        <View style={[styles.insightIconWrap, { backgroundColor: insight.iconColor + '18', borderRadius: radius.sm }]}>
          <Icon size={18} color={insight.iconColor} strokeWidth={1.8} />
        </View>
        <View style={styles.insightBody}>
          <View style={styles.insightLabelRow}>
            <Lightbulb size={11} color={colors.textTertiary} strokeWidth={1.8} />
            <Text style={[text.caption, { color: colors.textTertiary, marginLeft: 4, letterSpacing: 0.6, textTransform: 'uppercase', fontSize: 9 }]}>
              {insight.label}
            </Text>
          </View>
          <Text style={[{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: colors.text, marginTop: 3, lineHeight: 20 }]}>
            {insight.text}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(): string {
  return format(new Date(), 'EEEE, d MMMM yyyy');
}

function billsDueThisWeek(bills: Bill[]): number {
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return bills
    .filter((b) => !b.isPaid && new Date(b.dueDate) <= weekEnd)
    .reduce((sum, b) => sum + b.amount, 0);
}

function totalUnpaidBills(bills: Bill[]): number {
  return bills.filter((b) => !b.isPaid).reduce((sum, b) => sum + b.amount, 0);
}

function todaySpend(expenses: { date: string; amount: number }[]): number {
  const today = format(new Date(), 'yyyy-MM-dd');
  return expenses.filter((e) => e.date === today).reduce((sum, e) => sum + e.amount, 0);
}

/** Last 7 days spending per day (index 0 = 6 days ago, index 6 = today) */
function last7DaysSpending(expenses: { date: string; amount: number }[]): number[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = format(subDays(today, 6 - i), 'yyyy-MM-dd');
    return expenses.filter((e) => e.date === d).reduce((s, e) => s + e.amount, 0);
  });
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  icon:       React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  iconColor:  string;
  label:      string;
  value:      string | React.ReactNode;
  onPress:    () => void;
  entering:   typeof FadeInDown;
  delay:      number;
}

function SummaryCard({ icon: Icon, iconColor, label, value, onPress, delay }: SummaryCardProps) {
  const { colors, radius, text, font, fontSize } = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    // Outer: handles the enter animation only (no transform here)
    <Animated.View
      entering={FadeInDown.delay(delay).duration(280)}
      style={styles.summaryCard}
    >
      {/* Inner: holds the scale transform driven by useAnimatedStyle */}
      <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96, { damping: 20, stiffness: 400 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 20, stiffness: 400 }); }}
        style={[
          styles.summaryCardInner,
          {
            backgroundColor: iconColor + '0F',
            // No border, no shadow/elevation on Android — tinted bg is enough
            borderColor:     Platform.OS === 'ios' ? iconColor + '25' : 'transparent',
            borderRadius:    radius.lg,
            // iOS only: subtle shadow
            ...(Platform.OS === 'ios' ? {
              shadowColor:   '#000',
              shadowOffset:  { width: 0, height: 1 },
              shadowOpacity: 0.04,
              shadowRadius:  3,
            } : {}),
          },
        ]}
      >
        <View
          style={[
            styles.summaryIcon,
            { backgroundColor: iconColor + '18', borderRadius: radius.sm },
          ]}
        >
          <Icon size={20} color={iconColor} strokeWidth={1.8} />
        </View>
        <Text style={[text.caption, { color: colors.textSecondary, marginTop: 10 }]}>
          {label}
        </Text>
        {typeof value === 'string' ? (
          <Text
            style={[
              { fontFamily: font.sansSemiBold, fontSize: fontSize.md, color: colors.text, marginTop: 4 },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {value}
          </Text>
        ) : (
          <View style={{ marginTop: 4 }}>{value}</View>
        )}
      </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  onSeeAll,
}: { title: string; onSeeAll?: () => void }) {
  const { colors, text, font, fontSize } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text }]}>
        {title}
      </Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
          <Text style={[text.bodySm, { color: colors.accent }]}>See all</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── 7-day Sparkline ─────────────────────────────────────────────────────────

const DAY_LABELS = ['6d', '5d', '4d', '3d', '2d', '1d', 'T'] as const;

interface SparklineProps {
  data:    number[];
  onPress: () => void;
}

function SpendingSparkline({ data, onPress }: SparklineProps) {
  const { colors, text, radius } = useTheme();
  const { fmt } = useCurrencyFormat();

  const maxVal = Math.max(...data, 1);
  const total  = data.reduce((s, v) => s + v, 0);

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.sparklineCard}>
        <View style={styles.sparklineHeader}>
          <Text style={[text.bodyMedium, { color: colors.text }]}>
            Last 7 days
          </Text>
          <Text style={[text.bodySm, { color: colors.primary, fontWeight: '600' }]}>
            {fmt(total)}
          </Text>
        </View>

        {/* Bar chart */}
        <View style={styles.sparklineBars}>
          {data.map((val, i) => {
            const heightPct = val > 0 ? Math.max(val / maxVal, 0.04) : 0.04;
            const isToday   = i === 6;
            const barColor  = isToday ? colors.primary : colors.primary + '50';
            return (
              <View key={i} style={styles.sparklineBarWrap}>
                <View style={[styles.sparklineBarBg, { borderRadius: radius.sm }]}>
                  <View
                    style={[
                      styles.sparklineBarFill,
                      {
                        height:          `${heightPct * 100}%`,
                        backgroundColor: val === 0 ? colors.backgroundSecondary : barColor,
                        borderRadius:    radius.sm,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    text.caption,
                    {
                      color:      isToday ? colors.primary : colors.textTertiary,
                      fontWeight: isToday ? '700' : '400',
                      marginTop:  4,
                      fontSize:   10,
                    },
                  ]}
                >
                  {DAY_LABELS[i]}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>
    </Pressable>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { colors, text, font, fontSize, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const { bills, upcoming, overdue, dueToday, load: loadBills, isLoading: billsLoading } = useBillsStore();
  const { expenses, allExpenses, loadAll: loadExpenses, isLoading: expensesLoading } = useExpensesStore();
  const { allRecords: incRecords, loadAll: loadAllInc } = useIncomeStore();
  const { goals, load: loadGoals, isLoading: goalsLoading } = useGoalsStore();
  const notifUnread = useNotifHistoryStore((s) => s.unreadCount);
  const syncVersion = useSyncStore((s) => s.syncVersion);
  const hintBell = useFirstTimeHint('hint_home_bell');

  const isLoading = billsLoading || expensesLoading || goalsLoading;
  const [refreshing, setRefreshing] = useState(false);
  const { fmt, fmtCompact } = useCurrencyFormat();

  // Initial load on mount / user change
  useEffect(() => {
    if (user) {
      loadBills(user.id);
      loadExpenses(user.id);
      loadAllInc(user.id);
      loadGoals(user.id);
    }
  }, [user]);

  // ── Sync version watcher — reload silently when server pull lands ─────────
  useEffect(() => {
    if (!user || syncVersion === 0) return;
    loadBills(user.id);
    loadExpenses(user.id);
    loadAllInc(user.id);
    loadGoals(user.id);
  }, [syncVersion]);

  // Pull-to-refresh — uses a separate `refreshing` state so no skeleton flash
  const onRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    await Promise.all([
      loadBills(user.id),
      loadExpenses(user.id),
      loadAllInc(user.id),
      loadGoals(user.id),
    ]);
    setRefreshing(false);
  }, [user, loadBills, loadExpenses, loadAllInc, loadGoals]);

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const greeting  = getGreeting();

  // Computed values
  const dueSoonTotal    = billsDueThisWeek(bills);
  const allUnpaidTotal  = totalUnpaidBills(bills);
  const spentToday      = todaySpend(expenses);
  const avgGoalProgress = goals.length > 0
    ? goals.reduce((s, g) => s + g.progress, 0) / goals.length
    : 0;

  // Income vs expenses this month
  const currentMonthStr = format(new Date(), 'yyyy-MM');
  const incomeThisMonth = useMemo(
    () => incRecords.filter((r) => r.date.startsWith(currentMonthStr)).reduce((s, r) => s + r.amount, 0),
    [incRecords, currentMonthStr],
  );
  const spentThisMonth = useMemo(
    () => allExpenses.filter((e) => e.date.startsWith(currentMonthStr)).reduce((s, e) => s + e.amount, 0),
    [allExpenses, currentMonthStr],
  );
  const netThisMonth = incomeThisMonth - spentThisMonth;

  const upcomingBills   = [...upcoming, ...dueToday, ...overdue]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);

  const recentExpenses = [...expenses].slice(0, 5);
  const displayGoals   = goals.filter((g) => !g.isCompleted).slice(0, 3);

  // Sparkline: use allExpenses (all-time) for 7-day data
  const sparklineData  = useMemo(
    () => last7DaysSpending(allExpenses.length > 0 ? allExpenses : expenses),
    [allExpenses, expenses],
  );
  const insight = useMemo(
    () => !isLoading
      ? computeInsight(allExpenses, incRecords, bills, goals, fmt)
      : null,
    [allExpenses, incRecords, bills, goals, fmt, isLoading],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Status bar shield is now global in _layout.tsx */}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: layout.tabBarHeight + insets.bottom + 80 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* ── SECTION 1: Greeting ── */}
        <Animated.View
          entering={FadeInDown.delay(0).duration(280)}
          style={styles.greetingRow}
        >
          <View style={styles.greetingLeft}>
            <Text
              style={[
                { fontFamily: font.displayLight, fontSize: fontSize['3xl'], color: colors.text },
                styles.greetingText,
              ]}
            >
              {greeting},{'\n'}{firstName}
            </Text>
            <Text style={[text.bodySm, { color: colors.textSecondary, marginTop: 4 }]}>
              {formatDate()}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/notifications' as never)}
            style={[styles.bellBtn, { backgroundColor: colors.backgroundSecondary, borderRadius: 999 }]}
            hitSlop={4}
          >
            <Bell size={20} color={colors.text} strokeWidth={1.8} />
            {notifUnread > 0 && (
              <View style={[styles.bellBadge, { backgroundColor: colors.danger }]}>
                <Text style={{ fontFamily: font.sansSemiBold, fontSize: 9, color: '#fff', lineHeight: 13 }}>
                  {notifUnread > 9 ? '9+' : String(notifUnread)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* ── Wealth Snapshot Banner ── */}
        {isLoading && <SkeletonBanner style={{ marginBottom: 0 }} />}
        {!isLoading && <Animated.View
          entering={FadeIn.duration(300)}
          style={[styles.snapshotBanner, { borderRadius: 20, overflow: 'hidden' }]}
        >
          {Platform.OS === 'ios' ? (
            // iOS: frosted glass forest banner
            <BlurView
              intensity={85}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {/* Colour overlay — forest green tint on iOS, solid on Android */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor:
                  Platform.OS === 'ios'
                    ? 'rgba(22,58,47,0.82)'
                    : colors.primary,
                borderRadius: 20,
              },
            ]}
          />
          {/* Content — sits above the overlay */}
          <View style={{ position: 'relative' }}>
            <Text style={[text.caption, { color: 'rgba(250,250,248,0.65)', letterSpacing: 1 }]}>
              BILLS OUTSTANDING
            </Text>
            <BannerAmount
              kobo={allUnpaidTotal}
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
                <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Due this week</Text>
                <BannerAmount kobo={dueSoonTotal} textStyle={[text.bodyMedium, { color: Palette.gold }]} />
              </View>
              <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
              <View>
                <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Spent today</Text>
                <BannerAmount kobo={spentToday} textStyle={[text.bodyMedium, { color: Palette.linen }]} />
              </View>
              <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
              <Pressable
                onPress={() => router.push({ pathname: '/(tabs)/expenses', params: { segment: 'income' } } as never)}
                hitSlop={8}
              >
                <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Earned · Month</Text>
                <BannerAmount kobo={incomeThisMonth} textStyle={[text.bodyMedium, { color: '#A5F3C0' }]} />
              </Pressable>
            </View>
          </View>
        </Animated.View>}

        {/* ── SECTION 2: Quick Summary Cards ── */}
        {isLoading && <SkeletonSummaryGrid style={{ marginTop: 16 }} />}
        {!isLoading && <View style={styles.summaryGrid}>
          <SummaryCard
            icon={Receipt}
            iconColor={colors.statusDueToday}
            label="Due this week"
            value={<CompactAmountDisplay kobo={dueSoonTotal} textStyle={{ fontFamily: font.sansSemiBold, fontSize: fontSize.md, color: colors.text }} align="left" />}
            onPress={() => router.push('/(tabs)/bills' as never)}
            entering={FadeInDown}
            delay={40}
          />
          <SummaryCard
            icon={BarChart2}
            iconColor={colors.primary}
            label="All bills"
            value={<CompactAmountDisplay kobo={allUnpaidTotal} textStyle={{ fontFamily: font.sansSemiBold, fontSize: fontSize.md, color: colors.text }} align="left" />}
            onPress={() => router.push('/(tabs)/bills' as never)}
            entering={FadeInDown}
            delay={70}
          />
          <SummaryCard
            icon={Target}
            iconColor={colors.accent}
            label="Goals"
            value={`${Math.round(avgGoalProgress * 100)}%`}
            onPress={() => router.push('/(tabs)/goals' as never)}
            entering={FadeInDown}
            delay={100}
          />
          <SummaryCard
            icon={TrendingUp}
            iconColor={netThisMonth >= 0 ? colors.success : colors.danger}
            label="Net · Month"
            value={
              <Text
                style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.md, color: netThisMonth >= 0 ? colors.success : colors.danger }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {netThisMonth >= 0 ? '+' : '−'}{fmtCompact(Math.abs(netThisMonth))}
              </Text>
            }
            onPress={() => router.push('/analytics' as never)}
            entering={FadeInDown}
            delay={130}
          />
        </View>}

        {/* ── SECTION 2.5: 7-day Spending Sparkline ── */}
        {!isLoading && (
          <Animated.View entering={FadeInDown.delay(150).duration(280)}>
            <SpendingSparkline
              data={sparklineData}
              onPress={() => router.push('/analytics' as never)}
            />
          </Animated.View>
        )}

        {/* ── SECTION 2.6: Smart Financial Insight ── */}
        {!isLoading && insight && (
          <Animated.View entering={FadeInDown.delay(155).duration(280)}>
            <InsightCard
              insight={insight}
              onPress={() => router.push('/analytics' as never)}
            />
          </Animated.View>
        )}

        {/* ── SECTION 3: Upcoming Bills ── */}
        <Animated.View entering={FadeInDown.delay(120).duration(280)}>
          <SectionHeader
            title="Upcoming"
            onSeeAll={() => router.push('/(tabs)/bills' as never)}
          />
          {isLoading ? (
            <SkeletonCard rows={3} />
          ) : (
            <Card style={[styles.sectionCard, { borderRadius: 16 }]}>
              {upcomingBills.length === 0 ? (
                <View style={styles.emptySection}>
                  <Text style={[text.bodySm, { color: colors.textSecondary, textAlign: 'center' }]}>
                    No upcoming bills
                  </Text>
                </View>
              ) : (
                upcomingBills.map((bill, idx) => (
                  <BillRow
                    key={bill.id}
                    bill={bill}
                    onPress={() => router.push(`/bills/${bill.id}` as never)}
                    showStatus
                    style={idx === upcomingBills.length - 1 ? { borderBottomWidth: 0 } : undefined}
                  />
                ))
              )}
            </Card>
          )}
        </Animated.View>

        {/* ── SECTION 4: Savings Goals ── */}
        <Animated.View entering={FadeInDown.delay(160).duration(280)}>
          <SectionHeader
            title="Goals"
            onSeeAll={() => router.push('/(tabs)/goals' as never)}
          />
          {isLoading ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.goalsScroll}
              contentContainerStyle={styles.goalsRow}
            >
              {[0, 1].map((i) => <SkeletonGoalCard key={i} style={{ width: 200 }} />)}
            </ScrollView>
          ) : displayGoals.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={[text.bodySm, { color: colors.textSecondary, textAlign: 'center' }]}>
                No active goals
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.goalsScroll}
              contentContainerStyle={styles.goalsRow}
            >
              {displayGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  size="md"
                  onPress={() => router.push(`/goals/${goal.id}` as never)}
                />
              ))}
            </ScrollView>
          )}
        </Animated.View>

        {/* ── SECTION 5: Recent Activity ── */}
        <Animated.View entering={FadeInDown.delay(220).duration(280)}>
          <SectionHeader title="Recent" />
          {isLoading ? (
            <SkeletonCard rows={4} />
          ) : (
          <Card style={[styles.sectionCard, { borderRadius: 16 }]}>
            {recentExpenses.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={[text.bodySm, { color: colors.textSecondary, textAlign: 'center' }]}>
                  No recent expenses
                </Text>
              </View>
            ) : (
              recentExpenses.map((exp, idx) => {
                const meta = EXPENSE_CATEGORIES[exp.category];
                const IconComp = EXPENSE_ICONS[meta.icon] ?? MoreHorizontal;
                return (
                  <View
                    key={exp.id}
                    style={[
                      styles.expenseRow,
                      {
                        borderBottomColor: colors.borderLight,
                        borderBottomWidth: idx < recentExpenses.length - 1 ? 1 : 0,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.expenseIcon,
                        { backgroundColor: meta.color + '18', borderRadius: 999 },
                      ]}
                    >
                      <IconComp size={18} color={meta.color} strokeWidth={1.8} />
                    </View>
                    <View style={styles.expenseCenter}>
                      <Text style={[text.bodyMedium, { color: colors.text }]} numberOfLines={1}>
                        {exp.description ?? meta.label}
                      </Text>
                      <Text style={[text.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                        {exp.date}
                      </Text>
                    </View>
                    <Text style={[text.amount, { color: colors.text }]}>
                      {fmt(exp.amount)}
                    </Text>
                  </View>
                );
              })
            )}
          </Card>
          )}
        </Animated.View>
      </ScrollView>

      {/* First-time hint — shown once, slides up from bottom */}
      <FirstTimeHint
        visible={hintBell.visible}
        onDismiss={hintBell.dismiss}
        text="Tap the bell to see your financial alerts and notification history."
        icon={Bell}
        bottomOffset={layout.tabBarHeight + 16}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap:               24,
  },

  // Greeting
  greetingRow: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    justifyContent:  'space-between',
  },
  greetingLeft: {
    flex: 1,
    marginRight: 16,
  },
  greetingText: {
    letterSpacing: -0.5,
    lineHeight:    38,
  },
  bellBtn: {
    width:           44,
    height:          44,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       4,
  },
  bellBadge: {
    position:         'absolute',
    top:              6,
    right:            6,
    minWidth:         16,
    height:           16,
    borderRadius:     8,
    alignItems:       'center',
    justifyContent:   'center',
    paddingHorizontal: 3,
  },

  // Snapshot banner
  snapshotBanner: {
    borderRadius: 20,
    padding:      20,
  },

  // Summary
  summaryGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            12,
  },
  summaryCard: {
    width: '47%',
    flexGrow: 1,
  },
  summaryCardInner: {
    padding:     18,
    borderWidth: Platform.OS === 'ios' ? 1 : 0,
    minHeight:   110,
  },
  summaryIcon: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Sections
  sectionHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginBottom:    12,
  },
  sectionCard: {
    paddingHorizontal: 16,
    paddingVertical:   8,
  },
  emptySection: {
    paddingVertical: 20,
    alignItems:      'center',
  },

  // Expense rows
  expenseRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: 13,
  },
  expenseIcon: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    12,
    flexShrink:     0,
  },
  expenseCenter: {
    flex:        1,
    marginRight: 10,
  },

  // Goals — bleed carousel to screen edge
  goalsScroll: {
    marginHorizontal: -24,  // escape parent scrollContent paddingHorizontal:24
  },
  goalsRow: {
    gap:           12,
    paddingLeft:   24,   // re-align first card with screen padding
    paddingRight:  16,   // small trail so last card shows it's scrollable
    paddingBottom: 4,
  },

  // Insight card
  insightCard: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    padding:       14,
    gap:           12,
    marginBottom:  0,
  },
  insightIconWrap: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  insightBody: {
    flex: 1,
  },
  insightLabelRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },

  // Sparkline
  sparklineCard: {
    padding: 16,
  },
  sparklineHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   14,
  },
  sparklineBars: {
    flexDirection:  'row',
    alignItems:     'flex-end',
    gap:            6,
    height:         60,
  },
  sparklineBarWrap: {
    flex:           1,
    alignItems:     'center',
  },
  sparklineBarBg: {
    width:    '100%',
    height:   48,
    justifyContent: 'flex-end',
  },
  sparklineBarFill: {
    width: '100%',
  },
});
