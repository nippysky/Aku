import React, { useCallback, useEffect, useRef } from 'react';
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
import { formatCompact } from '../../lib/format';
import {
  Bell,
  Receipt,
  Wallet,
  Target,
  TrendingUp,
  Plus,
  ChevronRight,
} from 'lucide-react-native';
import {
  UtensilsCrossed, Car, ShoppingBag, Tv, Home,
  Zap, Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { BillRow } from '../../components/home/BillRow';
import { BudgetBar } from '../../components/home/BudgetBar';
import { GoalCard } from '../../components/home/GoalCard';
import { AddBillSheet } from '../../components/bills/AddBillSheet';
import { AddExpenseSheet } from '../../components/expenses/AddExpenseSheet';
import { AddGoalSheet } from '../../components/goals/AddGoalSheet';
import { ExpandableFAB } from '../../components/ui/ExpandableFAB';
import { useAuthStore } from '../../store/auth.store';
import { useBillsStore } from '../../store/bills.store';
import { useExpensesStore } from '../../store/expenses.store';
import { useBudgetsStore } from '../../store/budgets.store';
import { useGoalsStore } from '../../store/goals.store';
import { useUIStore } from '../../store/ui.store';
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

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG')}`;
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

function todaySpend(expenses: { date: string; amount: number }[]): number {
  const today = format(new Date(), 'yyyy-MM-dd');
  return expenses.filter((e) => e.date === today).reduce((sum, e) => sum + e.amount, 0);
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  icon:       React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  iconColor:  string;
  label:      string;
  value:      string;
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
        <Text
          style={[
            { fontFamily: font.sansSemiBold, fontSize: fontSize.md, color: colors.text, marginTop: 4 },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
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

// ─── Tour overlay ─────────────────────────────────────────────────────────────

function TourOverlay() {
  const { colors, text, font, fontSize, radius, shadow } = useTheme();
  const { isTourActive, tourStep, tourSteps, nextStep, skipTour } = useUIStore();

  if (!isTourActive) return null;

  const step = tourSteps[tourStep];
  if (!step) return null;

  const isLast = tourStep === tourSteps.length - 1;

  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      style={[styles.tourOverlay, { backgroundColor: colors.overlay }]}
    >
      <View
        style={[
          styles.tourTooltip,
          {
            backgroundColor: colors.card,
            borderRadius:    radius.xl,
            ...shadow.lg,
          },
        ]}
      >
        <Text
          style={[
            { fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text },
            styles.tourTitle,
          ]}
        >
          {step.title}
        </Text>
        <Text style={[text.body, { color: colors.textSecondary, marginTop: 8 }]}>
          {step.body}
        </Text>
        <View style={styles.tourActions}>
          <TouchableOpacity onPress={skipTour} hitSlop={8}>
            <Text style={[text.buttonLabel, { color: colors.textTertiary }]}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={nextStep}
            style={[
              styles.tourNextBtn,
              { backgroundColor: colors.primary, borderRadius: radius.full },
            ]}
          >
            <Text style={[text.buttonLabel, { color: colors.textOnForest }]}>
              {isLast ? 'Done' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
        {/* Step dots */}
        <View style={styles.tourDots}>
          {tourSteps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.tourDot,
                {
                  backgroundColor: i === tourStep ? colors.primary : colors.border,
                  width: i === tourStep ? 16 : 6,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { colors, text, font, fontSize, spacing, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { user } = useAuthStore();
  const { bills, upcoming, overdue, dueToday, load: loadBills } = useBillsStore();
  const { expenses, summary, load: loadExpenses } = useExpensesStore();
  const { budgets, load: loadBudgets } = useBudgetsStore();
  const { goals, load: loadGoals } = useGoalsStore();
  const { isTourActive } = useUIStore();

  const [addBillOpen,    setAddBillOpen]    = React.useState(false);
  const [addExpenseOpen, setAddExpenseOpen] = React.useState(false);
  const [addGoalOpen,    setAddGoalOpen]    = React.useState(false);

  useEffect(() => {
    if (user) {
      loadBills(user.id);
      loadExpenses(user.id);
    }
  }, [user]);

  // Load goals
  useEffect(() => {
    if (user) loadGoals(user.id);
  }, [user]);

  // Load budgets when summary ready
  useEffect(() => {
    if (user && summary) {
      loadBudgets(user.id, summary.byCategory as Record<string, number>);
    }
  }, [user, summary]);

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const greeting  = getGreeting();

  // Computed values
  const dueSoonTotal    = billsDueThisWeek(bills);
  const spentToday      = todaySpend(expenses);
  const budgetRemaining = budgets.reduce((s, b) => s + b.remaining, 0);
  const avgGoalProgress = goals.length > 0
    ? goals.reduce((s, g) => s + g.progress, 0) / goals.length
    : 0;

  const upcomingBills   = [...upcoming, ...dueToday, ...overdue]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);

  const recentExpenses = [...expenses].slice(0, 5);
  const displayBudgets = budgets.slice(0, 3);
  const displayGoals   = goals.filter((g) => !g.isCompleted).slice(0, 3);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
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
        <Animated.View
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
              TOTAL BUDGET REMAINING
            </Text>
            <Text
              style={[
                {
                  fontFamily:    font.displayLight,
                  fontSize:      fontSize['3xl'],
                  color:         Palette.linen,
                  letterSpacing: -1,
                  marginTop:     4,
                },
              ]}
            >
              {formatNaira(budgetRemaining)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
              <View>
                <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Bills due</Text>
                <Text style={[text.bodyMedium, { color: Palette.gold, marginTop: 2 }]}>
                  {formatNaira(dueSoonTotal)}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
              <View>
                <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Spent today</Text>
                <Text style={[text.bodyMedium, { color: Palette.linen, marginTop: 2 }]}>
                  {formatNaira(spentToday)}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ── SECTION 2: Quick Summary Cards ── */}
        <View style={styles.summaryGrid}>
          <SummaryCard
            icon={Receipt}
            iconColor={colors.statusDueToday}
            label="Due this week"
            value={formatCompact(dueSoonTotal)}
            onPress={() => router.push('/(tabs)/bills' as never)}
            entering={FadeInDown}
            delay={40}
          />
          <SummaryCard
            icon={Wallet}
            iconColor={colors.primary}
            label="Budget left"
            value={formatCompact(budgetRemaining)}
            onPress={() => router.push('/(tabs)/expenses' as never)}
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
            value={formatCompact(spentToday)}
            onPress={() => router.push('/(tabs)/expenses' as never)}
            entering={FadeInDown}
            delay={130}
          />
        </View>

        {/* ── SECTION 3: Upcoming Bills ── */}
        <Animated.View entering={FadeInDown.delay(120).duration(280)}>
          <SectionHeader
            title="Upcoming"
            onSeeAll={() => router.push('/(tabs)/bills' as never)}
          />
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
        </Animated.View>

        {/* ── SECTION 4: Budget Overview ── */}
        <Animated.View entering={FadeInDown.delay(150).duration(280)}>
          <SectionHeader
            title="Budget"
            onSeeAll={() => router.push('/(tabs)/expenses' as never)}
          />
          <Card style={[styles.sectionCard, { paddingBottom: 4, borderRadius: 16 }]}>
            {displayBudgets.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={[text.bodySm, { color: colors.textSecondary, textAlign: 'center' }]}>
                  No budgets set
                </Text>
              </View>
            ) : (
              displayBudgets.map((b) => (
                <BudgetBar
                  key={b.id}
                  category={b.category}
                  spent={b.spent}
                  total={b.amount}
                  status={b.status}
                />
              ))
            )}
          </Card>
        </Animated.View>

        {/* ── SECTION 5: Savings Goals ── */}
        <Animated.View entering={FadeInDown.delay(180).duration(280)}>
          <SectionHeader
            title="Goals"
            onSeeAll={() => router.push('/(tabs)/goals' as never)}
          />
          {displayGoals.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={[text.bodySm, { color: colors.textSecondary, textAlign: 'center' }]}>
                No active goals
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.goalsRow}
            >
              {displayGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} size="md" />
              ))}
            </ScrollView>
          )}
        </Animated.View>

        {/* ── SECTION 6: Recent Activity ── */}
        <Animated.View entering={FadeInDown.delay(220).duration(280)}>
          <SectionHeader title="Recent" />
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
                      {formatNaira(exp.amount)}
                    </Text>
                  </View>
                );
              })
            )}
          </Card>
        </Animated.View>
      </ScrollView>

      {/* ── Expandable FAB ── */}
      <ExpandableFAB
        bottomInset={insets.bottom + layout.tabBarHeight + 16}
        actions={[
          {
            icon:    Target,
            label:   'Goal',
            tint:    '#C9A96A',
            onPress: () => setAddGoalOpen(true),
          },
          {
            icon:    Wallet,
            label:   'Expense',
            tint:    '#4A90D9',
            onPress: () => setAddExpenseOpen(true),
          },
          {
            icon:    Receipt,
            label:   'Bill',
            tint:    '#E8734A',
            onPress: () => setAddBillOpen(true),
          },
        ]}
      />

      {/* Sheets */}
      <AddBillSheet
        isOpen={addBillOpen}
        onClose={() => setAddBillOpen(false)}
        onSuccess={() => user && loadBills(user.id)}
      />
      <AddExpenseSheet
        isOpen={addExpenseOpen}
        onClose={() => setAddExpenseOpen(false)}
        onSuccess={() => user && loadExpenses(user.id)}
      />
      <AddGoalSheet
        isOpen={addGoalOpen}
        onClose={() => setAddGoalOpen(false)}
        onSuccess={() => user && loadGoals(user.id)}
      />

      {/* Tour overlay */}
      <TourOverlay />
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

  // Goals
  goalsRow: {
    gap:           12,
    paddingBottom: 4,
  },

  // Tour
  tourOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'flex-end',
    paddingBottom:  120,
    paddingHorizontal: 24,
    zIndex:         999,
  },
  tourTooltip: {
    width:   '100%',
    padding: 24,
  },
  tourTitle: {
    letterSpacing: -0.3,
  },
  tourActions: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginTop:       24,
  },
  tourNextBtn: {
    paddingHorizontal: 24,
    paddingVertical:   12,
  },
  tourDots: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      20,
    gap:            6,
  },
  tourDot: {
    height:       6,
    borderRadius: 3,
  },
});
