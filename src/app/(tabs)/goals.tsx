import React, { useState, useCallback, useEffect } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Plus, Target } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import { EmptyState } from '../../components/ui/EmptyState';
import { AddGoalSheet } from '../../components/goals/AddGoalSheet';
import { AddContributionSheet } from '../../components/goals/AddContributionSheet';
import { useGoalsStore } from '../../store/goals.store';
import { useAuthStore } from '../../store/auth.store';
import { useSyncStore } from '../../store/sync.store';
import { SkeletonBanner, SkeletonGoalCard } from '../../components/ui/Skeleton';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import type { GoalWithProgress } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'active' | 'completed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'active',    label: 'Active'    },
  { key: 'completed', label: 'Completed' },
];

// ─── Filter chips ─────────────────────────────────────────────────────────────

function FilterChips({
  selected,
  onChange,
}: {
  selected: FilterKey;
  onChange: (k: FilterKey) => void;
}) {
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

// ─── Summary banner (forest-tinted, matches home screen) ─────────────────────

function SummaryBanner({ goals }: { goals: GoalWithProgress[] }) {
  const { colors, text, font, fontSize } = useTheme();
  const { fmt } = useCurrencyFormat();

  const totalSaved     = goals.reduce((s, g) => s + g.savedAmount, 0);
  const totalTarget    = goals.reduce((s, g) => s + g.targetAmount, 0);
  const completedCount = goals.filter((g) => g.isCompleted).length;
  const activeCount    = goals.filter((g) => !g.isCompleted).length;
  const overallPct     = totalTarget > 0
    ? Math.round((totalSaved / totalTarget) * 100)
    : 0;

  return (
    <View style={styles.bannerWrap}>
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
      {/* Content */}
      <View style={{ position: 'relative' }}>
        <Text style={[text.caption, { color: 'rgba(250,250,248,0.65)', letterSpacing: 1 }]}>
          TOTAL SAVED
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
          {fmt(totalSaved)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
          <View>
            <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Active</Text>
            <Text style={[text.bodyMedium, { color: Palette.gold, marginTop: 2 }]}>
              {activeCount} {activeCount === 1 ? 'goal' : 'goals'}
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
          <View>
            <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Completed</Text>
            <Text style={[text.bodyMedium, { color: Palette.linen, marginTop: 2 }]}>
              {completedCount} {completedCount === 1 ? 'goal' : 'goals'}
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
          <View>
            <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Overall</Text>
            <Text style={[text.bodyMedium, { color: Palette.linen, marginTop: 2 }]}>
              {overallPct}%
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Goal card (list version) ─────────────────────────────────────────────────

interface GoalCardLargeProps {
  goal:         GoalWithProgress;
  onPress:      () => void;
  onAddSavings: () => void;
}

function GoalCardLarge({ goal, onPress, onAddSavings }: GoalCardLargeProps) {
  const { colors, text, font, fontSize, radius, shadow } = useTheme();
  const { fmt, fmtCompact } = useCurrencyFormat();

  const percentage = Math.min(Math.round(goal.progress * 100), 100);
  const barWidth   = useSharedValue(0);

  useEffect(() => {
    barWidth.value = withTiming(goal.progress, { duration: 700 });
  }, [goal.progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.min(barWidth.value * 100, 100)}%` as `${number}%`,
  }));

  // Bar color
  const barColor = goal.isCompleted
    ? colors.success
    : (goal.color ?? colors.accent);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}, ${percentage}% complete`}
    >
      <Animated.View
        style={[
          styles.goalCard,
          {
            backgroundColor: colors.card,
            borderColor:     colors.border,
            borderRadius:    radius.xl,
            ...shadow.sm,
          },
        ]}
      >
        {/* ── Top row: emoji + name + percentage badge ── */}
        <View style={styles.goalTop}>
          {/* Emoji circle */}
          <View
            style={[
              styles.emojiCircle,
              { backgroundColor: (goal.color ?? colors.accent) + '15', borderRadius: radius.md },
            ]}
          >
            <Text style={styles.goalEmoji}>{goal.emoji ?? '🎯'}</Text>
          </View>

          {/* Name + status */}
          <View style={styles.goalNameWrap}>
            <Text
              style={[
                { fontFamily: font.displayLight, fontSize: fontSize.lg, color: colors.text, letterSpacing: -0.3 },
              ]}
              numberOfLines={2}
            >
              {goal.name}
            </Text>
            {goal.isCompleted ? (
              <Text style={[text.caption, { color: colors.success, marginTop: 2 }]}>
                ✓ Goal reached
              </Text>
            ) : goal.targetDate ? (
              <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                by {formatShortDate(goal.targetDate)}
              </Text>
            ) : null}
          </View>

          {/* Percentage badge */}
          <View
            style={[
              styles.pctBadge,
              {
                backgroundColor: (goal.color ?? colors.accent) + '15',
                borderRadius:    radius.full,
              },
            ]}
          >
            <Text
              style={{
                fontFamily:    font.sansSemiBold,
                fontSize:      fontSize.sm,
                color:         goal.color ?? colors.accent,
                letterSpacing: 0.2,
              }}
            >
              {percentage}%
            </Text>
          </View>
        </View>

        {/* ── Progress bar ── */}
        <View
          style={[
            styles.progressTrack,
            { backgroundColor: colors.backgroundSecondary, borderRadius: radius.full },
          ]}
        >
          <Animated.View
            style={[
              styles.progressFill,
              barStyle,
              { backgroundColor: barColor, borderRadius: radius.full },
            ]}
          />
        </View>

        {/* ── Amounts row ── */}
        <View style={styles.amountsRow}>
          <Text style={[text.amountSm, { color: colors.text }]}>
            {fmtCompact(goal.savedAmount)}
            <Text style={[text.amountSm, { color: colors.textTertiary }]}>
              {' '}/ {fmt(goal.targetAmount)}
            </Text>
          </Text>

          {!goal.isCompleted && (
            <Text style={[text.caption, { color: colors.textTertiary }]}>
              {fmtCompact(goal.remaining)} to go
            </Text>
          )}
        </View>

        {/* ── Action row ── */}
        <View style={[styles.actionRow, { borderTopColor: colors.borderLight }]}>
          {!goal.isCompleted && (
            <Pressable
              onPress={(e) => { e.stopPropagation(); onAddSavings(); }}
              style={[
                styles.addSavingsBtn,
                {
                  backgroundColor: colors.primary + '12',
                  borderColor:     colors.primary + '30',
                  borderRadius:    radius.full,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add savings"
            >
              <Text style={[text.buttonLabelSm, { color: colors.primary }]}>
                + Add savings
              </Text>
            </Pressable>
          )}
          {!goal.isCompleted && goal.monthlyRequired && goal.monthlyRequired > 0 ? (
            <Text style={[text.caption, { color: colors.textTertiary }]}>
              {fmtCompact(goal.monthlyRequired)}/mo needed
            </Text>
          ) : goal.isCompleted ? (
            <Text style={[text.caption, { color: colors.success }]}>
              🎉 Well done!
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const { colors, text, font, fontSize, layout } = useTheme();
  const insets   = useSafeAreaInsets();
  const router   = useRouter();

  const { goals, load, isLoading } = useGoalsStore();
  const { user }                   = useAuthStore();
  const syncVersion                = useSyncStore((s) => s.syncVersion);

  const [filter,      setFilter]      = useState<FilterKey>('all');
  const [addOpen,     setAddOpen]     = useState(false);
  const [contribGoal, setContribGoal] = useState<{ id: string; name: string } | null>(null);
  const [refreshing,  setRefreshing]  = useState(false);

  useEffect(() => {
    if (user) load(user.id);
  }, [user]);

  // ── Sync version watcher — reload silently when server pull lands ─────────
  useEffect(() => {
    if (!user || syncVersion === 0) return;
    load(user.id);
  }, [syncVersion]);

  const onRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    await load(user.id);
    setRefreshing(false);
  }, [user, load]);

  const filtered = goals.filter((g) => {
    if (filter === 'active')    return !g.isCompleted;
    if (filter === 'completed') return g.isCompleted;
    return true;
  });

  const handleAddSavings = useCallback((goal: GoalWithProgress) => {
    setContribGoal({ id: goal.id, name: goal.name });
  }, []);

  const handleReload = useCallback(() => {
    if (user) load(user.id);
  }, [user, load]);

  const renderItem = useCallback(
    ({ item }: { item: GoalWithProgress }) => (
      <GoalCardLarge
        goal={item}
        onPress={() => router.push(`/goals/${item.id}` as never)}
        onAddSavings={() => handleAddSavings(item)}
      />
    ),
    [router, handleAddSavings],
  );

  const ListHeader = useCallback(
    () => (
      <View>
        {/* Summary banner — only shown when there are goals */}
        {isLoading ? (
          <SkeletonBanner />
        ) : goals.length > 0 ? (
          <SummaryBanner goals={goals} />
        ) : null}

        {/* Filter chips */}
        <Animated.View
          entering={FadeInDown.delay(60).duration(280)}
          style={styles.filterWrap}
        >
          <FilterChips selected={filter} onChange={setFilter} />
        </Animated.View>
      </View>
    ),
    [goals, filter, isLoading],
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
        data={isLoading ? [] : filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={{ flex: 1 }}
        ListHeaderComponent={ListHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + layout.tabBarHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: 16, paddingTop: 8 }}>
              {[0, 1, 2].map((i) => <SkeletonGoalCard key={i} />)}
            </View>
          ) : (
            <EmptyState
              icon={Target}
              title="Set your first goal"
              message="Start saving toward something meaningful."
              action={{
                label:   'Add Goal',
                onPress: () => setAddOpen(true),
              }}
            />
          )
        }
      />

      {/* ── Add Goal Sheet ── */}
      <AddGoalSheet
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={handleReload}
      />

      {/* ── Add Contribution Sheet ── */}
      {contribGoal && (
        <AddContributionSheet
          goalId={contribGoal.id}
          goalName={contribGoal.name}
          isOpen={!!contribGoal}
          onClose={() => setContribGoal(null)}
          onSuccess={handleReload}
        />
      )}
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
  headerIconBtn: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Banner
  bannerWrap: {
    marginTop:    16,
    borderRadius: 20,
    padding:      20,
    overflow:     'hidden',
  },

  // Filters
  filterWrap: { paddingTop: 12, paddingBottom: 4 },
  filterRow: {
    flexDirection: 'row',
    gap:           8,
    paddingBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical:   9,
    borderWidth:       1.5,
  },

  // List
  listContent: {
    paddingTop:        8,
    gap:               14,
    paddingHorizontal: 24,
  },

  // Goal card
  goalCard: {
    borderWidth: 1,
    padding:     18,
    gap:         14,
  },
  goalTop: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           12,
  },
  emojiCircle: {
    width:          48,
    height:         48,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  goalEmoji: {
    fontSize:   24,
    lineHeight: 30,
  },
  goalNameWrap: {
    flex: 1,
  },
  pctBadge: {
    paddingHorizontal: 10,
    paddingVertical:   5,
    flexShrink:        0,
  },
  progressTrack: {
    height:   6,
    width:    '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
  },
  amountsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  actionRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop:     12,
    marginTop:      -2,
  },
  addSavingsBtn: {
    borderWidth:       1,
    paddingHorizontal: 14,
    paddingVertical:   8,
  },
});
