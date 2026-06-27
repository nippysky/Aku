import React, { useState, useCallback, useEffect } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
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
  withTiming,
} from 'react-native-reanimated';
import { Plus, Target } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { EmptyState } from '../../components/ui/EmptyState';
import { AddGoalSheet } from '../../components/goals/AddGoalSheet';
import { useGoalsStore } from '../../store/goals.store';
import { useAuthStore } from '../../store/auth.store';
import type { GoalWithProgress } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNGN(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG')}`;
}

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[parseInt(m) - 1]} ${y}`;
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'active' | 'completed';

interface FilterOption {
  key:   FilterKey;
  label: string;
}

const FILTERS: FilterOption[] = [
  { key: 'all',       label: 'All'       },
  { key: 'active',    label: 'Active'    },
  { key: 'completed', label: 'Completed' },
];

// ─── Filter chips ─────────────────────────────────────────────────────────────

interface FilterChipsProps {
  selected: FilterKey;
  onChange:  (key: FilterKey) => void;
}

function FilterChips({ selected, onChange }: FilterChipsProps) {
  const { colors, text, font, radius } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {FILTERS.map((f) => {
        const active = selected === f.key;
        return (
          <Pressable
            key={f.key}
            onPress={() => onChange(f.key)}
            style={[
              styles.filterChip,
              {
                backgroundColor: active ? colors.primary : colors.backgroundSecondary,
                borderColor:     active ? colors.primary : colors.border,
                borderRadius:    radius.full,
              },
            ]}
          >
            <Text
              style={[
                text.buttonLabelSm,
                {
                  color:      active ? colors.textOnForest : colors.textSecondary,
                  fontFamily: active ? font.sansSemiBold : font.sansRegular,
                },
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  goals: GoalWithProgress[];
}

function SummaryCard({ goals }: SummaryCardProps) {
  const { colors, text, font, fontSize, radius } = useTheme();

  const totalSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const completedCount = goals.filter((g) => g.isCompleted).length;
  const totalCount = goals.length;
  const completedRatio = totalCount > 0 ? completedCount / totalCount : 0;

  return (
    <Card style={styles.summaryCard} contentStyle={styles.summaryContent}>
      <Text
        style={[
          styles.summaryAmount,
          {
            fontFamily:    font.displayLight,
            fontSize:      fontSize['3xl'],
            color:         colors.accent,
            letterSpacing: -0.5,
          },
        ]}
      >
        {formatNGN(totalSaved)}
      </Text>
      <Text style={[text.bodySm, { color: colors.textSecondary, marginTop: 4 }]}>
        across {totalCount} {totalCount === 1 ? 'goal' : 'goals'}
      </Text>

      {/* Mini progress bar */}
      <View style={styles.summaryBarWrap}>
        <View
          style={[
            styles.summaryBarTrack,
            { backgroundColor: colors.border, borderRadius: radius.full },
          ]}
        >
          <Animated.View
            style={[
              styles.summaryBarFill,
              {
                backgroundColor: colors.success,
                borderRadius:    radius.full,
                width:           `${Math.round(completedRatio * 100)}%`,
              },
            ]}
          />
        </View>
        <Text style={[text.caption, { color: colors.textSecondary, marginTop: 6 }]}>
          {completedCount} of {totalCount} goals completed
        </Text>
      </View>
    </Card>
  );
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
        accessibilityRole="button"
        accessibilityLabel="Add goal"
      >
        <Plus size={24} color={colors.accent} strokeWidth={2} />
      </Pressable>
    </Animated.View>
  );
}

// ─── GoalCard (large list version) ──────────────────────────────────────────

interface GoalCardLargeProps {
  goal:    GoalWithProgress;
  onPress: () => void;
  onAddSavings: () => void;
}

function GoalCardLarge({ goal, onPress, onAddSavings }: GoalCardLargeProps) {
  const { colors, text, font, fontSize, radius, shadow } = useTheme();

  const percentage = Math.round(goal.progress * 100);
  const ringColor  = goal.color ?? colors.accent;
  const remaining  = goal.remaining;

  // Animated progress bar width
  const barProgress = useSharedValue(0);
  useEffect(() => {
    barProgress.value = withTiming(goal.progress, { duration: 800 });
  }, [goal.progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.min(barProgress.value * 100, 100)}%` as `${number}%`,
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${goal.name} goal, ${percentage}% complete`}
    >
      <Animated.View
        entering={FadeInDown.springify().damping(18)}
        style={[
          styles.goalCard,
          {
            backgroundColor: colors.card,
            borderColor:     colors.border,
            borderRadius:    radius.lg,
            ...shadow.sm,
          },
        ]}
      >
        {/* Top row: emoji + name + ring */}
        <View style={styles.goalCardTop}>
          <View style={styles.goalCardLeft}>
            <Text style={styles.goalEmoji}>{goal.emoji ?? '🎯'}</Text>
            <View style={styles.goalNameWrap}>
              <Text
                style={[
                  {
                    fontFamily:    font.displayLight,
                    fontSize:      fontSize.lg,
                    color:         colors.text,
                    letterSpacing: -0.3,
                  },
                ]}
                numberOfLines={2}
              >
                {goal.name}
              </Text>
              {goal.isCompleted && (
                <Text style={[text.caption, { color: colors.success, marginTop: 2 }]}>
                  ✓ Completed
                </Text>
              )}
            </View>
          </View>
          <ProgressRing
            progress={goal.progress}
            size={80}
            strokeWidth={7}
            color={ringColor}
            backgroundColor={colors.border}
          >
            <Text
              style={[
                {
                  fontFamily:         font.sansBold,
                  fontSize:           fontSize.sm,
                  color:              colors.text,
                  includeFontPadding: false,
                } as object,
              ]}
            >
              {percentage}%
            </Text>
          </ProgressRing>
        </View>

        {/* Amounts */}
        <View style={styles.goalAmounts}>
          <Text style={[text.amountSm, { color: colors.textSecondary }]}>
            {formatNGN(goal.savedAmount)}{' '}
            <Text style={{ color: colors.textTertiary }}>
              of {formatNGN(goal.targetAmount)}
            </Text>
          </Text>
          {goal.isCompleted ? (
            <Text style={[text.bodySm, { color: colors.success }]}>
              Goal reached! 🎉
            </Text>
          ) : (
            <Text style={[text.bodySm, { color: colors.textTertiary }]}>
              {formatNGN(remaining)} to go
            </Text>
          )}
        </View>

        {/* Progress bar */}
        <View
          style={[
            styles.progressTrack,
            { backgroundColor: colors.border, borderRadius: radius.full },
          ]}
        >
          <Animated.View
            style={[
              styles.progressFill,
              barStyle,
              {
                backgroundColor: goal.isCompleted ? colors.success : ringColor,
                borderRadius:    radius.full,
              },
            ]}
          />
        </View>

        {/* Date pill + monthly required */}
        <View style={styles.goalMeta}>
          {goal.targetDate && (
            <View
              style={[
                styles.datePill,
                { backgroundColor: colors.backgroundSecondary, borderRadius: radius.full },
              ]}
            >
              <Text style={[text.caption, { color: colors.textSecondary }]}>
                by {formatShortDate(goal.targetDate)}
              </Text>
            </View>
          )}
          {!goal.isCompleted && goal.monthlyRequired && goal.monthlyRequired > 0 && (
            <Text style={[text.caption, { color: colors.textTertiary, flex: 1, textAlign: 'right' }]}>
              Save {formatNGN(goal.monthlyRequired)}/month
            </Text>
          )}
        </View>

        {/* Action row */}
        <View style={[styles.goalActions, { borderTopColor: colors.borderLight }]}>
          <Pressable
            onPress={(e) => { e.stopPropagation(); onAddSavings(); }}
            style={[
              styles.ghostBtn,
              { borderColor: colors.border, borderRadius: radius.full },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add savings"
          >
            <Text style={[text.buttonLabelSm, { color: colors.primary }]}>
              Add savings →
            </Text>
          </Pressable>
          <Pressable
            onPress={onPress}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="View goal details"
          >
            <Text style={[text.buttonLabelSm, { color: colors.textTertiary }]}>
              View details →
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const { colors, text, font, fontSize, layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { goals, load } = useGoalsStore();
  const { user }        = useAuthStore();

  const [filter,      setFilter]      = useState<FilterKey>('all');
  const [addOpen,     setAddOpen]     = useState(false);
  const [contribGoal, setContribGoal] = useState<string | null>(null);

  useEffect(() => {
    if (user) load(user.id);
  }, [user]);

  const filtered = goals.filter((g) => {
    if (filter === 'active')    return !g.isCompleted;
    if (filter === 'completed') return g.isCompleted;
    return true;
  });

  const handleAddSavings = useCallback((goalId: string) => {
    router.push(`/goals/${goalId}` as never);
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: GoalWithProgress }) => (
      <GoalCardLarge
        goal={item}
        onPress={() => router.push(`/goals/${item.id}` as never)}
        onAddSavings={() => handleAddSavings(item.id)}
      />
    ),
    [router, handleAddSavings],
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
          Goals
        </Text>
        <Pressable
          onPress={() => setAddOpen(true)}
          style={[styles.headerIconBtn, { backgroundColor: colors.backgroundSecondary }]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Add goal"
        >
          <Plus size={20} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + layout.tabBarHeight + 80 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Summary card */}
            {goals.length > 0 && (
              <Animated.View entering={FadeInDown.delay(0).springify().damping(18)}>
                <SummaryCard goals={goals} />
              </Animated.View>
            )}

            {/* Filter chips */}
            <Animated.View
              entering={FadeInDown.delay(60).springify().damping(18)}
              style={styles.filterWrap}
            >
              <FilterChips selected={filter} onChange={setFilter} />
            </Animated.View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={Target}
            title="Set your first goal"
            message="Start saving toward something meaningful."
            action={{
              label:   'Add Goal',
              onPress: () => setAddOpen(true),
            }}
          />
        }
      />

      {/* ── FAB ── */}
      <FAB onPress={() => setAddOpen(true)} />

      {/* ── Add Goal Sheet ── */}
      <AddGoalSheet
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => { if (user) load(user.id); }}
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
  headerIconBtn: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Summary card
  summaryCard: {
    marginHorizontal: 24,
    marginTop:        16,
    marginBottom:     4,
  },
  summaryContent: {
    padding: 20,
  },
  summaryAmount: {
    lineHeight: 40,
  },
  summaryBarWrap: {
    marginTop: 16,
  },
  summaryBarTrack: {
    height:   6,
    width:    '100%',
    overflow: 'hidden',
  },
  summaryBarFill: {
    height: 6,
  },

  // Filters
  filterWrap: {
    paddingTop:    12,
    paddingBottom: 4,
  },
  filterRow: {
    flexDirection:    'row',
    paddingHorizontal: 24,
    gap:              8,
    paddingBottom:    8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical:   9,
    borderWidth:       1.5,
  },

  // List
  listContent: {
    paddingTop: 4,
    gap:        16,
    paddingHorizontal: 24,
  },

  // Goal card (large)
  goalCard: {
    borderWidth: 1,
    padding:     16,
    gap:         12,
  },
  goalCardTop: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    gap:            12,
  },
  goalCardLeft: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    flex:          1,
    gap:           10,
  },
  goalEmoji: {
    fontSize:   24,
    lineHeight: 30,
    marginTop:  2,
  },
  goalNameWrap: {
    flex: 1,
  },
  goalAmounts: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  progressTrack: {
    height:   5,
    width:    '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: 5,
  },
  goalMeta: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  datePill: {
    paddingHorizontal: 10,
    paddingVertical:    4,
  },
  goalActions: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    borderTopWidth:  1,
    paddingTop:      12,
    marginTop:       0,
  },
  ghostBtn: {
    borderWidth:       1,
    paddingHorizontal: 14,
    paddingVertical:    8,
  },

  // FAB
  fab: {
    position:     'absolute',
    bottom:       100,
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
