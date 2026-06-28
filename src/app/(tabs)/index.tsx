import React, { useCallback, useEffect } from 'react';
import {
  Platform,
  Pressable,
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
import { format } from 'date-fns';
import {
  Bell,
  Receipt,
  Target,
  TrendingUp,
  BarChart2,
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
import { useGoalsStore } from '../../store/goals.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { EXPENSE_CATEGORIES } from '../../types';
import type { Bill } from '../../types';

// ─── Icon map for expenses ────────────────────────────────────────────────────

const EXPENSE_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap, Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
};

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

// ─── Main component ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { colors, text, font, fontSize, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const { bills, upcoming, overdue, dueToday, load: loadBills, isLoading: billsLoading } = useBillsStore();
  const { expenses, load: loadExpenses, isLoading: expensesLoading } = useExpensesStore();
  const { goals, load: loadGoals, isLoading: goalsLoading } = useGoalsStore();

  const isLoading = billsLoading || expensesLoading || goalsLoading;
  const { fmt, fmtCompact } = useCurrencyFormat();

  useEffect(() => {
    if (user) {
      loadBills(user.id);
      loadExpenses(user.id);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadGoals(user.id);
  }, [user]);

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const greeting  = getGreeting();

  // Computed values
  const dueSoonTotal    = billsDueThisWeek(bills);
  const allUnpaidTotal  = totalUnpaidBills(bills);
  const spentToday      = todaySpend(expenses);
  const avgGoalProgress = goals.length > 0
    ? goals.reduce((s, g) => s + g.progress, 0) / goals.length
    : 0;

  const upcomingBills   = [...upcoming, ...dueToday, ...overdue]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);

  const recentExpenses = [...expenses].slice(0, 5);
  const displayGoals   = goals.filter((g) => !g.isCompleted).slice(0, 3);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Status bar shield is now global in _layout.tsx */}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: layout.tabBarHeight + insets.bottom + 80 },
        ]}
        showsVerticalScrollIndicator={false}
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
            iconColor={colors.success}
            label="Spent today"
            value={<CompactAmountDisplay kobo={spentToday} textStyle={{ fontFamily: font.sansSemiBold, fontSize: fontSize.md, color: colors.text }} align="left" />}
            onPress={() => router.push('/(tabs)/expenses' as never)}
            entering={FadeInDown}
            delay={130}
          />
        </View>}

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

});
