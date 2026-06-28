/**
 * goals/[id].tsx — Goal detail screen.
 *
 * Award-winning UIUX: forest-green hero banner, unified stats strip,
 * clean add-savings card, elegant contribution history.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { ArrowLeft, Calendar, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme';
import { Button } from '../../components/ui/Button';
import { AmountInput } from '../../components/ui/AmountInput';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { EditGoalSheet } from '../../components/goals/EditGoalSheet';
import { useGoalsStore } from '../../store/goals.store';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { Palette } from '../../theme/colors';
import type { GoalContribution } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  try { return format(parseISO(dateStr), 'd MMM yyyy'); } catch { return dateStr; }
}

function fmtShortDate(isoStr: string): string {
  try { return format(parseISO(isoStr), 'd MMM'); } catch { return isoStr; }
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

interface ParticleProps {
  color: string; startX: number; startY: number; angle: number; delay: number;
}

function ConfettiParticle({ color, startX, startY, angle, delay }: ParticleProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity    = useSharedValue(0);
  const scale      = useSharedValue(0);

  useEffect(() => {
    const dist = 80 + Math.random() * 80;
    const timer = setTimeout(() => {
      opacity.value    = withTiming(1,                         { duration: 100 });
      scale.value      = withSpring(1, { damping: 12, stiffness: 300 });
      translateX.value = withTiming(Math.cos(angle) * dist,   { duration: 600, easing: Easing.out(Easing.quad) });
      translateY.value = withTiming(Math.sin(angle) * dist,   { duration: 600, easing: Easing.out(Easing.quad) });
      setTimeout(() => {
        opacity.value = withTiming(0, { duration: 300 });
        scale.value   = withTiming(0, { duration: 300 });
      }, 600);
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.confettiDot, { backgroundColor: color, left: startX, top: startY }, style]}
      pointerEvents="none"
    />
  );
}

const CONFETTI_COLORS = [
  Palette.forest, Palette.gold, Palette.forestMuted,
  Palette.goldLight, '#34C47A', Palette.goldMuted,
];

function ConfettiBurst({ visible }: { visible: boolean }) {
  if (!visible) return null;
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
    angle: (i / 18) * Math.PI * 2, delay: Math.floor(Math.random() * 120),
  }));
  return (
    <View style={styles.confettiContainer} pointerEvents="none">
      {particles.map((p) => (
        <ConfettiParticle key={p.id} {...p} startX={-6} startY={-6} />
      ))}
    </View>
  );
}

// ─── Hero banner ──────────────────────────────────────────────────────────────

interface HeroBannerProps {
  goal: {
    emoji?: string | null;
    name: string;
    progress: number;
    savedAmount: number;
    targetAmount: number;
    isCompleted: boolean;
    color?: string | null;
  };
  showConfetti: boolean;
}

function HeroBanner({ goal, showConfetti }: HeroBannerProps) {
  const { font, fontSize, text } = useTheme();
  const { fmt } = useCurrencyFormat();
  const barWidth = useSharedValue(0);
  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%` as `${number}%`,
  }));

  useEffect(() => {
    barWidth.value = withTiming(Math.min(goal.progress, 1), { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [goal.progress]);

  const pct         = Math.round(goal.progress * 100);
  const accentColor = goal.color ?? Palette.gold;
  const greenAccent = '#34C47A';

  return (
    <Animated.View entering={FadeInDown.delay(0).duration(240)} style={styles.heroBanner}>
      {Platform.OS === 'ios' && (
        <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: Platform.OS === 'ios' ? 'rgba(22,58,47,0.84)' : Palette.forest, borderRadius: 20 },
        ]}
      />

      <View style={styles.heroBannerContent}>
        {/* Emoji circle */}
        <View style={[styles.heroEmojiCircle, { backgroundColor: accentColor + '28' }]}>
          <Text style={styles.heroEmoji}>{goal.emoji ?? '🎯'}</Text>
        </View>

        {/* Name */}
        <Text style={[{ fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: Palette.linen, letterSpacing: -0.3, textAlign: 'center' }]}>
          {goal.name}
        </Text>

        {/* Amounts — big and clear */}
        <Text style={[{ fontFamily: font.displayLight, fontSize: fontSize['3xl'], color: Palette.linen, letterSpacing: -1, marginTop: 2 }]}>
          {fmt(goal.savedAmount)}
        </Text>
        <Text style={[text.caption, { color: 'rgba(250,250,248,0.5)', marginTop: 2 }]}>
          of {fmt(goal.targetAmount)}
        </Text>

        {/* Progress bar */}
        <View style={[styles.heroBar, { backgroundColor: 'rgba(250,250,248,0.12)', marginTop: 16 }]}>
          <Animated.View
            style={[
              styles.heroBarFill,
              { backgroundColor: goal.isCompleted ? greenAccent : accentColor },
              barStyle,
            ]}
          />
        </View>

        {/* % badge */}
        <View
          style={[
            styles.pctBadge,
            { backgroundColor: goal.isCompleted ? greenAccent + '30' : accentColor + '25', marginTop: 10 },
          ]}
        >
          <Text style={[{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: goal.isCompleted ? greenAccent : accentColor }]}>
            {goal.isCompleted ? '✓ Goal complete!' : `${pct}% saved`}
          </Text>
        </View>
      </View>

      <ConfettiBurst visible={showConfetti} />
    </Animated.View>
  );
}

// ─── Stats strip ──────────────────────────────────────────────────────────────

interface StatItem { label: string; value: string }

function StatsStrip({ items }: { items: StatItem[] }) {
  const { colors, text, font, fontSize, radius } = useTheme();
  return (
    <View style={[styles.statsStrip, { backgroundColor: colors.card, borderRadius: radius.xl }]}>
      {items.map((item, idx) => (
        <React.Fragment key={item.label}>
          {idx > 0 && <View style={[styles.statDivider, { backgroundColor: colors.borderLight }]} />}
          <View style={styles.statCell}>
            <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 5, textAlign: 'center' }]}>
              {item.label}
            </Text>
            <Text
              style={[{ fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.text, textAlign: 'center' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {item.value}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Add savings card ─────────────────────────────────────────────────────────

function AddSavingsCard({
  addAmount,
  setAddAmount,
  isAdding,
  goalName,
  onAdd,
}: {
  addAmount: number;
  setAddAmount: (v: number) => void;
  isAdding: boolean;
  goalName: string;
  onAdd: () => void;
}) {
  const { colors, font, fontSize, radius, shadow } = useTheme();
  const { fmt } = useCurrencyFormat();
  return (
    <View style={[styles.addSavingsCard, { backgroundColor: colors.card, borderRadius: radius.xl, ...shadow.sm }]}>
      {/* Accent bar */}
      <View style={[styles.addSavingsAccent, { backgroundColor: Palette.forest, borderRadius: 999 }]} />

      <View style={styles.addSavingsInner}>
        <View style={styles.addSavingsHeader}>
          <View style={[styles.addSavingsIconWrap, { backgroundColor: Palette.forest + '18', borderRadius: radius.md }]}>
            <Plus size={18} color={Palette.forest} strokeWidth={2} />
          </View>
          <Text style={[{ fontFamily: font.displayLight, fontSize: fontSize.lg, color: colors.text, letterSpacing: -0.3 }]}>
            Add savings
          </Text>
        </View>

        <AmountInput
          value={addAmount}
          onChange={setAddAmount}
          label="Amount"
          size="lg"
          style={styles.amountInput}
        />

        <Button
          label={addAmount > 0 ? `Add ${fmt(addAmount)}` : 'Add to goal'}
          onPress={onAdd}
          loading={isAdding}
          disabled={addAmount <= 0}
          size="lg"
        />
      </View>
    </View>
  );
}

// ─── Contribution row ─────────────────────────────────────────────────────────

function ContribRow({
  contribution,
  runningTotal,
  onDelete,
}: {
  contribution: GoalContribution;
  runningTotal: number;
  onDelete: (id: string) => void;
}) {
  const { colors, text, font, fontSize, radius } = useTheme();
  const { fmt, fmtCompact } = useCurrencyFormat();
  return (
    <View style={[styles.contribRow, { borderBottomColor: colors.borderLight }]}>
      {/* Date badge */}
      <View style={[styles.contribDateBadge, { backgroundColor: colors.backgroundSecondary, borderRadius: radius.md }]}>
        <Calendar size={14} color={colors.textTertiary} strokeWidth={1.8} />
        <Text style={[{ fontFamily: font.sansMedium, fontSize: fontSize.xs, color: colors.textSecondary }]}>
          {fmtShortDate(contribution.date)}
        </Text>
      </View>

      {/* Info */}
      <View style={styles.contribInfo}>
        <Text style={[{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }]}>
          {fmt(contribution.amount)}
        </Text>
        {contribution.note ? (
          <Text style={[text.caption, { color: colors.textTertiary, marginTop: 1 }]} numberOfLines={1}>
            {contribution.note}
          </Text>
        ) : (
          <Text style={[text.caption, { color: colors.textTertiary, marginTop: 1 }]}>
            Running total: {fmtCompact(runningTotal)}
          </Text>
        )}
      </View>

      {/* Delete */}
      <Pressable onPress={() => onDelete(contribution.id)} hitSlop={12} style={styles.contribDelete}>
        <Trash2 size={15} color={colors.textTertiary} strokeWidth={1.6} />
      </Pressable>
    </View>
  );
}

// ─── Delete confirm sheet ─────────────────────────────────────────────────────

function DeleteConfirmSheet({ visible, title, message, onConfirm, onCancel }: {
  visible: boolean; title: string; message: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const { colors, text, font, fontSize, radius, shadow } = useTheme();
  if (!visible) return null;
  return (
    <View style={[styles.deleteOverlay, { backgroundColor: colors.overlay }]}>
      <Animated.View
        entering={FadeInDown.duration(200)}
        style={[styles.deleteSheet, { backgroundColor: colors.card, borderRadius: radius['2xl'], ...shadow.lg }]}
      >
        <Text style={[{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text, letterSpacing: -0.3 }]}>
          {title}
        </Text>
        <Text style={[text.body, { color: colors.textSecondary, marginTop: 8 }]}>{message}</Text>
        <View style={styles.deleteActions}>
          <Pressable
            onPress={onCancel}
            style={[styles.deleteBtn, { backgroundColor: colors.backgroundSecondary, borderRadius: radius.full, flex: 1 }]}
          >
            <Text style={[text.buttonLabel, { color: colors.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            style={[styles.deleteBtn, { backgroundColor: colors.danger, borderRadius: radius.full, flex: 1 }]}
          >
            <Text style={[text.buttonLabel, { color: colors.textInverse }]}>Delete</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, text, font, fontSize, radius, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router  = useRouter();

  const { goals, contributions, loadContributions, addContribution, removeContribution, remove } =
    useGoalsStore();
  const { user }               = useAuthStore();
  const { showToast } = useUIStore();
  const { fmt, fmtCompact } = useCurrencyFormat();

  const goal = goals.find((g) => g.id === id) ?? null;

  const [editOpen,       setEditOpen]       = useState(false);
  const [addAmount,      setAddAmount]      = useState(0);
  const [isAdding,       setIsAdding]       = useState(false);
  const [deleteGoalOpen, setDeleteGoalOpen] = useState(false);
  const [showConfetti,   setShowConfetti]   = useState(false);
  const prevCompleted = useRef(goal?.isCompleted ?? false);

  useEffect(() => {
    if (id) loadContributions(id);
  }, [id]);

  useEffect(() => {
    if (!prevCompleted.current && goal?.isCompleted) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 1200);
      return () => clearTimeout(t);
    }
    prevCompleted.current = goal?.isCompleted ?? false;
  }, [goal?.isCompleted]);

  const goalContribs = id ? (contributions[id] ?? []) : [];

  const contribsWithTotals = goalContribs.reduce<
    { contribution: GoalContribution; runningTotal: number }[]
  >((acc, c) => {
    const prev = acc.length > 0 ? (acc[acc.length - 1]?.runningTotal ?? 0) : 0;
    acc.push({ contribution: c, runningTotal: prev + c.amount });
    return acc;
  }, []);

  const handleAddContribution = useCallback(async () => {
    if (!user || !goal || addAmount <= 0) return;
    setIsAdding(true);
    try {
      const today = new Date().toISOString().split('T')[0] ?? new Date().toISOString();
      await addContribution({ goalId: goal.id, amount: addAmount, note: null, date: today }, user.id);
      setAddAmount(0);
      showToast('success', `Added ${fmt(addAmount)} to ${goal.name}`);
    } catch {
      showToast('error', 'Failed to add savings');
    } finally {
      setIsAdding(false);
    }
  }, [user, goal, addAmount, addContribution, showToast, fmt]);

  const handleDeleteContrib = useCallback(
    (contribId: string) => {
      if (!goal) return;
      const contrib = goalContribs.find((c) => c.id === contribId);
      if (!contrib) return;
      Alert.alert(
        'Remove contribution?',
        `${fmt(contrib.amount)} will be removed.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove', style: 'destructive',
            onPress: async () => {
              try {
                await removeContribution(contribId, goal.id, contrib.amount);
                showToast('success', 'Contribution removed');
              } catch {
                showToast('error', 'Failed to remove');
              }
            },
          },
        ],
      );
    },
    [goal, goalContribs, removeContribution, showToast, fmt],
  );

  const handleDeleteGoal = useCallback(async () => {
    if (!goal) return;
    router.back();
    try {
      await remove(goal.id);
      showToast('success', 'Goal deleted');
    } catch {
      showToast('error', 'Failed to delete goal');
    }
  }, [goal, remove, showToast, router]);

  if (!goal) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title="Goal"
          leftAction={{ icon: ArrowLeft, onPress: () => router.back(), accessibilityLabel: 'Back' }}
          style={{ paddingTop: insets.top + 4 }}
        />
        <View style={styles.notFound}>
          <Text style={[text.body, { color: colors.textSecondary }]}>Goal not found.</Text>
        </View>
      </View>
    );
  }

  const goalContribsSorted = [...contribsWithTotals].reverse();

  const statsItems: StatItem[] = [
    {
      label: 'Remaining',
      value: goal.isCompleted ? '—' : fmtCompact(goal.remaining),
    },
    {
      label: 'Monthly target',
      value: goal.monthlyRequired && goal.monthlyRequired > 0
        ? fmtCompact(goal.monthlyRequired) : '—',
    },
    {
      label: 'Target date',
      value: goal.targetDate ? fmtDate(goal.targetDate) : 'No deadline',
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={goal.name}
        leftAction={{ icon: ArrowLeft, onPress: () => router.back(), accessibilityLabel: 'Back' }}
        rightAction={{ icon: Pencil, onPress: () => setEditOpen(true), accessibilityLabel: 'Edit goal' }}
        style={{ paddingTop: insets.top + 4 }}
      />

      <FlatList
        data={goalContribsSorted}
        keyExtractor={(item) => item.contribution.id}
        renderItem={({ item }) => (
          <ContribRow
            contribution={item.contribution}
            runningTotal={item.runningTotal}
            onDelete={handleDeleteContrib}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            {/* Hero */}
            <HeroBanner goal={goal} showConfetti={showConfetti} />

            {/* Stats strip */}
            <Animated.View entering={FadeInDown.delay(80).duration(240)}>
              <StatsStrip items={statsItems} />
            </Animated.View>

            {/* Add savings */}
            {!goal.isCompleted && (
              <Animated.View entering={FadeInDown.delay(140).duration(240)}>
                <AddSavingsCard
                  addAmount={addAmount}
                  setAddAmount={setAddAmount}
                  isAdding={isAdding}
                  goalName={goal.name}
                  onAdd={handleAddContribution}
                />
              </Animated.View>
            )}

            {/* History header */}
            {goalContribsSorted.length > 0 && (
              <Animated.View entering={FadeInDown.delay(180).duration(240)}>
                <View style={styles.historyHeader}>
                  <Text style={[{ fontFamily: font.sansSemiBold, fontSize: fontSize.xs, color: colors.textTertiary, letterSpacing: 1.2, textTransform: 'uppercase' as const }]}>
                    Savings history · {goalContribsSorted.length}
                  </Text>
                </View>
              </Animated.View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyHistory}>
            <Text style={[text.body, { color: colors.textTertiary, textAlign: 'center' }]}>
              No contributions yet.{'\n'}Add your first savings above.
            </Text>
          </View>
        }
        ListFooterComponent={
          <Animated.View entering={FadeInDown.delay(220).duration(240)} style={styles.bottomActions}>
            <Button
              label="Edit goal"
              variant="ghost"
              size="md"
              onPress={() => setEditOpen(true)}
              iconLeft={Pencil}
            />
            <Button
              label="Delete goal"
              variant="dangerGhost"
              size="md"
              onPress={() => setDeleteGoalOpen(true)}
              iconLeft={Trash2}
            />
          </Animated.View>
        }
      />

      <EditGoalSheet
        goal={editOpen ? goal : null}
        onClose={() => setEditOpen(false)}
        onSuccess={() => setEditOpen(false)}
      />

      <DeleteConfirmSheet
        visible={deleteGoalOpen}
        title="Delete goal?"
        message={`"${goal.name}" and all its contributions will be permanently removed.`}
        onConfirm={() => { setDeleteGoalOpen(false); handleDeleteGoal(); }}
        onCancel={() => setDeleteGoalOpen(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:   { flex: 1 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  headerContent: {
    gap: 14,
    paddingBottom: 4,
  },

  // Hero banner
  heroBanner: {
    borderRadius: 20,
    overflow:     'hidden',
  },
  heroBannerContent: {
    position:   'relative',
    alignItems: 'center',
    padding:    24,
    gap:        4,
  },
  heroEmojiCircle: {
    width:          72,
    height:         72,
    borderRadius:   36,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   8,
  },
  heroEmoji: {
    fontSize:   36,
    lineHeight: 44,
  },
  heroBar: {
    width:        '100%',
    maxWidth:     280,
    height:       5,
    borderRadius: 999,
    overflow:     'hidden',
  },
  heroBarFill: {
    height:       5,
    borderRadius: 999,
  },
  pctBadge: {
    paddingHorizontal: 14,
    paddingVertical:   5,
    borderRadius:      999,
  },

  // Confetti
  confettiContainer: {
    position: 'absolute',
    top:      '50%',
    left:     '50%',
  },
  confettiDot: {
    position:     'absolute',
    width:        12,
    height:       12,
    borderRadius: 6,
  },

  // Stats strip
  statsStrip: {
    flexDirection:  'row',
    alignItems:     'stretch',
    paddingVertical: 16,
  },
  statCell: {
    flex:    1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  statDivider: {
    width: 1,
    marginVertical: 4,
  },

  // Add savings
  addSavingsCard: {
    flexDirection: 'row',
    overflow:      'hidden',
  },
  addSavingsAccent: {
    width:   4,
    alignSelf: 'stretch',
  },
  addSavingsInner: {
    flex:    1,
    padding: 20,
    gap:     14,
  },
  addSavingsHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  addSavingsIconWrap: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  amountInput: {},

  // Contribution rows
  contribRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap:               12,
  },
  contribDateBadge: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            5,
    paddingHorizontal: 8,
    paddingVertical:   6,
    flexShrink:     0,
  },
  contribInfo: {
    flex: 1,
  },
  contribDelete: {
    padding:   4,
    flexShrink: 0,
  },

  // History
  historyHeader: {
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  emptyHistory: {
    paddingVertical:   40,
    paddingHorizontal: 20,
  },

  // Bottom actions
  bottomActions: {
    marginTop:    16,
    marginBottom: 8,
    gap:          4,
  },

  // Delete confirm
  deleteOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'flex-end',
    zIndex: 999, paddingHorizontal: 24, paddingBottom: 40,
  },
  deleteSheet:   { width: '100%', padding: 28 },
  deleteActions: { flexDirection: 'row', gap: 12, marginTop: 28 },
  deleteBtn:     { height: 52, alignItems: 'center', justifyContent: 'center' },
});
