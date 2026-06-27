import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { ArrowLeft, Calendar, Pencil, Trash2 } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme';
import { Button } from '../../components/ui/Button';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { AmountInput } from '../../components/ui/AmountInput';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { EditGoalSheet } from '../../components/goals/EditGoalSheet';
import { useGoalsStore } from '../../store/goals.store';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { Palette } from '../../theme/colors';
import type { GoalContribution } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNGN(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG')}`;
}

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'd MMM yyyy');
  } catch {
    return dateStr;
  }
}

function formatDateTime(isoStr: string): string {
  try {
    return format(parseISO(isoStr), 'd MMM yyyy');
  } catch {
    return isoStr;
  }
}

// ─── Confetti particle ───────────────────────────────────────────────────────

interface ParticleProps {
  color:  string;
  startX: number;
  startY: number;
  angle:  number;
  delay:  number;
}

function ConfettiParticle({ color, startX, startY, angle, delay }: ParticleProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity    = useSharedValue(0);
  const scale      = useSharedValue(0);

  useEffect(() => {
    const dist = 80 + Math.random() * 80;
    const dx   = Math.cos(angle) * dist;
    const dy   = Math.sin(angle) * dist;

    const timer = setTimeout(() => {
      opacity.value    = withTiming(1, { duration: 100 });
      scale.value      = withSpring(1, { damping: 12, stiffness: 300 });
      translateX.value = withTiming(dx, { duration: 600, easing: Easing.out(Easing.quad) });
      translateY.value = withTiming(dy, { duration: 600, easing: Easing.out(Easing.quad) });
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
      style={[
        styles.confettiDot,
        { backgroundColor: color, left: startX, top: startY },
        style,
      ]}
      pointerEvents="none"
    />
  );
}

// ─── Confetti burst ──────────────────────────────────────────────────────────

interface ConfettiBurstProps {
  visible: boolean;
}

const CONFETTI_COLORS = [
  Palette.forest, Palette.gold, Palette.forestMuted,
  Palette.goldLight, '#34C47A', Palette.goldMuted,
];

function ConfettiBurst({ visible }: ConfettiBurstProps) {
  if (!visible) return null;

  const particles = Array.from({ length: 18 }, (_, i) => ({
    id:     i,
    color:  CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    angle:  (i / 18) * Math.PI * 2,
    delay:  Math.floor(Math.random() * 120),
  }));

  return (
    <View style={styles.confettiContainer} pointerEvents="none">
      {particles.map((p) => (
        <ConfettiParticle
          key={p.id}
          color={p.color}
          startX={-6}
          startY={-6}
          angle={p.angle}
          delay={p.delay}
        />
      ))}
    </View>
  );
}

// ─── Quick stats row ─────────────────────────────────────────────────────────

interface StatPillProps {
  label: string;
  value: string;
}

function StatPill({ label, value }: StatPillProps) {
  const { colors, text, radius } = useTheme();
  return (
    <View
      style={[
        styles.statPill,
        { backgroundColor: colors.backgroundSecondary, borderRadius: radius.md },
      ]}
    >
      <Text style={[text.caption, { color: colors.textTertiary, textAlign: 'center' }]}>
        {label}
      </Text>
      <Text
        style={[
          text.bodyMedium,
          { color: colors.text, textAlign: 'center', marginTop: 4 },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Contribution row ─────────────────────────────────────────────────────────

interface ContribRowProps {
  contribution: GoalContribution;
  runningTotal: number;
  onDelete:     (id: string) => void;
}

function ContribRow({ contribution, runningTotal, onDelete }: ContribRowProps) {
  const { colors, text } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      style={[styles.contribRow, { borderBottomColor: colors.borderLight }]}
    >
      <View style={styles.contribIcon}>
        <Calendar size={16} color={colors.textTertiary} strokeWidth={1.8} />
      </View>
      <View style={styles.contribInfo}>
        <Text style={[text.bodyMedium, { color: colors.text }]}>
          Added {formatNGN(contribution.amount)}
        </Text>
        <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
          {formatDateTime(contribution.date)}
          {contribution.note ? ` · ${contribution.note}` : ''}
        </Text>
      </View>
      <View style={styles.contribRight}>
        <Text style={[text.amountSm, { color: colors.textSecondary }]}>
          {formatNGN(runningTotal)}
        </Text>
        <Pressable
          onPress={() => onDelete(contribution.id)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Delete contribution"
          style={styles.contribDelete}
        >
          <Trash2 size={14} color={colors.textTertiary} strokeWidth={1.8} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  visible:   boolean;
  title:     string;
  message:   string;
  onConfirm: () => void;
  onCancel:  () => void;
}

function DeleteConfirmSheet({
  visible, title, message, onConfirm, onCancel,
}: DeleteConfirmProps) {
  const { colors, text, font, fontSize, radius, shadow } = useTheme();

  if (!visible) return null;

  return (
    <View style={[styles.deleteOverlay, { backgroundColor: colors.overlay }]}>
      <Animated.View
        entering={FadeInDown.springify().damping(18)}
        style={[
          styles.deleteSheet,
          { backgroundColor: colors.card, borderRadius: radius['2xl'], ...shadow.lg },
        ]}
      >
        <Text
          style={[
            { fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text },
            styles.deleteTitle,
          ]}
        >
          {title}
        </Text>
        <Text style={[text.body, { color: colors.textSecondary, marginTop: 8 }]}>
          {message}
        </Text>
        <View style={styles.deleteActions}>
          <Pressable
            onPress={onCancel}
            style={[
              styles.deleteBtn,
              { backgroundColor: colors.backgroundSecondary, borderRadius: radius.full, flex: 1 },
            ]}
          >
            <Text style={[text.buttonLabel, { color: colors.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            style={[
              styles.deleteBtn,
              { backgroundColor: colors.danger, borderRadius: radius.full, flex: 1 },
            ]}
          >
            <Text style={[text.buttonLabel, { color: colors.textInverse }]}>Delete</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, text, font, fontSize, radius, shadow, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { goals, contributions, loadContributions, addContribution, removeContribution, remove } =
    useGoalsStore();
  const { user }      = useAuthStore();
  const { showToast } = useUIStore();

  const goal = goals.find((g) => g.id === id) ?? null;

  const [editOpen,        setEditOpen]        = useState(false);
  const [addAmount,       setAddAmount]       = useState(0);
  const [isAdding,        setIsAdding]        = useState(false);
  const [deleteGoalOpen,  setDeleteGoalOpen]  = useState(false);
  const [showConfetti,    setShowConfetti]    = useState(false);
  const prevCompleted = useRef(goal?.isCompleted ?? false);

  useEffect(() => {
    if (id) loadContributions(id);
  }, [id]);

  // Watch for goal completion transition
  useEffect(() => {
    if (!prevCompleted.current && goal?.isCompleted) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 1200);
      return () => clearTimeout(timer);
    }
    prevCompleted.current = goal?.isCompleted ?? false;
  }, [goal?.isCompleted]);

  const goalContribs = id ? (contributions[id] ?? []) : [];

  // Build running totals
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
      await addContribution(
        { goalId: goal.id, amount: addAmount, note: null, date: today },
        user.id,
      );
      setAddAmount(0);
      showToast('success', `Added ${formatNGN(addAmount)} to ${goal.name}`);
    } catch {
      showToast('error', 'Failed to add savings');
    } finally {
      setIsAdding(false);
    }
  }, [user, goal, addAmount, addContribution, showToast]);

  const handleDeleteContrib = useCallback(
    (contribId: string) => {
      if (!goal) return;
      const contrib = goalContribs.find((c) => c.id === contribId);
      if (!contrib) return;
      Alert.alert(
        'Remove contribution?',
        `${formatNGN(contrib.amount)} will be removed from your goal.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text:    'Remove',
            style:   'destructive',
            onPress: async () => {
              try {
                await removeContribution(contribId, goal.id, contrib.amount);
                showToast('success', 'Contribution removed');
              } catch {
                showToast('error', 'Failed to remove contribution');
              }
            },
          },
        ],
      );
    },
    [goal, goalContribs, removeContribution, showToast],
  );

  const handleDeleteGoal = useCallback(async () => {
    if (!goal) return;
    try {
      await remove(goal.id);
      showToast('success', 'Goal deleted');
      router.back();
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

  const percentage    = Math.round(goal.progress * 100);
  const ringColor     = goal.color ?? Palette.gold;
  const goalContribsSorted = [...contribsWithTotals].reverse();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={goal.name}
        leftAction={{
          icon:               ArrowLeft,
          onPress:            () => router.back(),
          accessibilityLabel: 'Back',
        }}
        rightAction={{
          icon:               Pencil,
          onPress:            () => setEditOpen(true),
          accessibilityLabel: 'Edit goal',
        }}
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        ListHeaderComponent={
          <View>
            {/* ── Hero ── */}
            <Animated.View
              entering={FadeInDown.delay(0).springify().damping(18)}
              style={styles.hero}
            >
              <Text style={styles.heroEmoji}>{goal.emoji ?? '🎯'}</Text>
              <Text
                style={[
                  styles.heroName,
                  {
                    fontFamily:    font.displayLight,
                    fontSize:      fontSize['2xl'],
                    color:         colors.text,
                    letterSpacing: -0.5,
                  },
                ]}
              >
                {goal.name}
              </Text>

              {/* Confetti container */}
              <View style={styles.ringWrap}>
                <ProgressRing
                  progress={goal.progress}
                  size={120}
                  strokeWidth={10}
                  color={goal.isCompleted ? colors.success : ringColor}
                  backgroundColor={colors.border}
                >
                  <View style={styles.ringCenter}>
                    <Text
                      style={[
                        {
                          fontFamily:         font.displayLight,
                          fontSize:           fontSize['2xl'],
                          color:              colors.text,
                          includeFontPadding: false,
                        } as object,
                      ]}
                    >
                      {percentage}%
                    </Text>
                  </View>
                </ProgressRing>
                <ConfettiBurst visible={showConfetti} />
              </View>

              <Text
                style={[
                  { fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.accent },
                  styles.heroTarget,
                ]}
              >
                {formatNGN(goal.targetAmount)}
              </Text>

              <Text style={[text.bodySm, { color: colors.textSecondary, marginTop: 4 }]}>
                {formatNGN(goal.savedAmount)} saved of {formatNGN(goal.targetAmount)}
              </Text>

              {goal.isCompleted && (
                <Text style={[text.body, { color: colors.success, marginTop: 8 }]}>
                  Goal reached! 🎉
                </Text>
              )}
            </Animated.View>

            {/* ── Quick stats ── */}
            <Animated.View
              entering={FadeInDown.delay(80).springify().damping(18)}
              style={styles.statsRow}
            >
              <StatPill
                label="Remaining"
                value={goal.isCompleted ? '₦0' : formatNGN(goal.remaining)}
              />
              <StatPill
                label="Monthly target"
                value={
                  goal.monthlyRequired && goal.monthlyRequired > 0
                    ? formatNGN(goal.monthlyRequired)
                    : '—'
                }
              />
              <StatPill
                label="Target date"
                value={goal.targetDate ? formatDate(goal.targetDate) : 'No deadline'}
              />
            </Animated.View>

            {/* ── Add savings card ── */}
            {!goal.isCompleted && (
              <Animated.View entering={FadeInDown.delay(160).springify().damping(18)}>
                <View
                  style={[
                    styles.addSavingsCard,
                    {
                      backgroundColor: colors.card,
                      borderColor:     colors.primary,
                      borderRadius:    radius.lg,
                      ...shadow.sm,
                    },
                  ]}
                >
                  <Text
                    style={[
                      {
                        fontFamily:    font.displayLight,
                        fontSize:      fontSize.lg,
                        color:         colors.text,
                        letterSpacing: -0.3,
                        marginBottom:  16,
                      },
                    ]}
                  >
                    Add savings
                  </Text>
                  <AmountInput
                    value={addAmount}
                    onChange={setAddAmount}
                    label="Amount"
                    size="lg"
                    style={styles.amountInput}
                  />
                  <Button
                    label={
                      addAmount > 0
                        ? `Add ${formatNGN(addAmount)} to goal`
                        : 'Add to goal'
                    }
                    onPress={handleAddContribution}
                    loading={isAdding}
                    disabled={addAmount <= 0}
                    size="lg"
                  />
                </View>
              </Animated.View>
            )}

            {/* ── History header ── */}
            {goalContribsSorted.length > 0 && (
              <Animated.View
                entering={FadeInDown.delay(240).springify().damping(18)}
                style={styles.historyHeader}
              >
                <Text
                  style={[
                    {
                      fontFamily:    font.sansSemiBold,
                      fontSize:      fontSize.sm,
                      color:         colors.textSecondary,
                      letterSpacing: 1.2,
                      textTransform: 'uppercase' as const,
                    },
                  ]}
                >
                  History
                </Text>
              </Animated.View>
            )}
          </View>
        }
        ListFooterComponent={
          <View>
            {goalContribsSorted.length === 0 && (
              <Animated.View
                entering={FadeInDown.delay(240).springify().damping(18)}
                style={styles.emptyHistory}
              >
                <Text style={[text.body, { color: colors.textTertiary, textAlign: 'center' }]}>
                  No contributions yet.{'\n'}Add your first savings above.
                </Text>
              </Animated.View>
            )}

            {/* ── Bottom actions ── */}
            <Animated.View
              entering={FadeInDown.delay(320).springify().damping(18)}
              style={styles.bottomActions}
            >
              <Button
                label="Edit goal"
                variant="ghost"
                size="md"
                onPress={() => setEditOpen(true)}
                iconLeft={Pencil}
              />
              <Button
                label="Delete goal"
                variant="ghost"
                size="md"
                onPress={() => setDeleteGoalOpen(true)}
                iconLeft={Trash2}
              />
            </Animated.View>
          </View>
        }
      />

      {/* ── Edit sheet ── */}
      <EditGoalSheet
        goal={editOpen ? goal : null}
        onClose={() => setEditOpen(false)}
        onSuccess={() => setEditOpen(false)}
      />

      {/* ── Delete goal confirm ── */}
      <DeleteConfirmSheet
        visible={deleteGoalOpen}
        title="Delete goal?"
        message={`"${goal.name}" and all its contributions will be permanently removed.`}
        onConfirm={() => {
          setDeleteGoalOpen(false);
          handleDeleteGoal();
        }}
        onCancel={() => setDeleteGoalOpen(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  notFound: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop:        8,
  },

  // Hero
  hero: {
    alignItems:     'center',
    paddingVertical: 20,
    gap:             8,
  },
  heroEmoji: {
    fontSize:   48,
    lineHeight: 56,
  },
  heroName: {
    textAlign: 'center',
  },
  ringWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  ringCenter: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  heroTarget: {
    letterSpacing: -0.5,
    marginTop:     4,
  },

  // Confetti
  confettiContainer: {
    position: 'absolute',
    top:      '50%',
    left:     '50%',
  },
  confettiDot: {
    position:     'absolute',
    width:         12,
    height:        12,
    borderRadius:  6,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap:           10,
    marginBottom:  16,
  },
  statPill: {
    flex:    1,
    padding: 12,
  },

  // Add savings card
  addSavingsCard: {
    borderWidth:  1.5,
    padding:      20,
    marginBottom: 20,
  },
  amountInput: {
    marginBottom: 16,
  },

  // History
  historyHeader: {
    marginBottom:  12,
    marginTop:     4,
  },
  emptyHistory: {
    paddingVertical: 32,
  },

  // Contribution rows
  contribRow: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingVertical:  14,
    borderBottomWidth: 1,
    gap:              12,
  },
  contribIcon: {
    width:          32,
    height:         32,
    alignItems:     'center',
    justifyContent: 'center',
  },
  contribInfo: {
    flex: 1,
  },
  contribRight: {
    alignItems: 'flex-end',
    gap:         4,
  },
  contribDelete: {
    padding: 4,
  },

  // Bottom actions
  bottomActions: {
    gap:       8,
    marginTop: 24,
    marginBottom: 16,
  },

  // Delete confirm
  deleteOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems:     'center',
    justifyContent: 'flex-end',
    zIndex:         999,
    paddingHorizontal: 24,
    paddingBottom:  40,
  },
  deleteSheet: {
    width:   '100%',
    padding: 28,
  },
  deleteTitle: {
    letterSpacing: -0.3,
  },
  deleteActions: {
    flexDirection: 'row',
    gap:           12,
    marginTop:     28,
  },
  deleteBtn: {
    height:         52,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
