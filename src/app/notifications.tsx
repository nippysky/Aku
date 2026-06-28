/**
 * notifications.tsx — Akù Notification Center
 *
 * Live, smart alert feed derived from bills, budgets and goals stores.
 * No external service needed — alerts are computed from existing data.
 *
 * Sections:
 *   1. "Needs Attention"  — overdue bills, blown budgets
 *   2. "Updates"          — upcoming bills, budget warnings, goal milestones
 *   3. "Preferences"      — push notification toggles
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  AlertCircle,
  Clock,
  Calendar,
  Trophy,
  Target,
  CheckCircle2,
  ChevronRight,
  Settings2,
} from 'lucide-react-native';
import { differenceInDays, parseISO } from 'date-fns';
import { useTheme } from '../theme';
import { Palette } from '../theme/colors';
import { Divider } from '../components/ui/Divider';
import { useBillsStore } from '../store/bills.store';
import { useGoalsStore } from '../store/goals.store';
import { useUIStore } from '../store/ui.store';
import { formatAmount } from '../lib/format';

// ─── Types ────────────────────────────────────────────────────────────────────

type LucideIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type Priority = 'high' | 'normal';

interface AlertItem {
  id:       string;
  priority: Priority;
  title:    string;
  body:     string;
  accent:   string;
  icon:     LucideIcon;
  href:     string;
}


// ─── Smart alert derivation ───────────────────────────────────────────────────

function useAlerts(
  symbol: string,
  dangerColor: string,
  warningColor: string,
  primaryColor: string,
): AlertItem[] {
  const { bills } = useBillsStore();
  const { goals } = useGoalsStore();

  return useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];
    const today = new Date();

    // ── Bills ──────────────────────────────────────────────────────────
    for (const bill of bills) {
      if (bill.isPaid) continue;
      const daysUntil = differenceInDays(parseISO(bill.dueDate), today);

      if (bill.status === 'overdue') {
        const ago = Math.abs(daysUntil);
        items.push({
          id:       `bill-overdue-${bill.id}`,
          priority: 'high',
          title:    `${bill.name} is overdue`,
          body:     `${formatAmount(bill.amount, symbol)} was due ${ago === 1 ? 'yesterday' : `${ago} days ago`}`,
          accent:   dangerColor,
          icon:     AlertCircle,
          href:     `/bills/${bill.id}`,
        });
      } else if (bill.status === 'due-today') {
        items.push({
          id:       `bill-today-${bill.id}`,
          priority: 'high',
          title:    `${bill.name} is due today`,
          body:     `${formatAmount(bill.amount, symbol)} — don't let it slip`,
          accent:   warningColor,
          icon:     Clock,
          href:     `/bills/${bill.id}`,
        });
      } else if (daysUntil > 0 && daysUntil <= 3) {
        items.push({
          id:       `bill-soon-${bill.id}`,
          priority: 'normal',
          title:    `${bill.name} due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
          body:     `${formatAmount(bill.amount, symbol)} — heads up`,
          accent:   primaryColor,
          icon:     Calendar,
          href:     `/bills/${bill.id}`,
        });
      }
    }

    // ── Goals ──────────────────────────────────────────────────────────
    for (const g of goals) {
      if (g.progress >= 1 || g.isCompleted) {
        items.push({
          id:       `goal-complete-${g.id}`,
          priority: 'normal',
          title:    `${g.emoji ? g.emoji + ' ' : ''}${g.name} complete!`,
          body:     `You hit your target of ${formatAmount(g.targetAmount, symbol)} 🎉`,
          accent:   Palette.gold,
          icon:     Trophy,
          href:     `/goals/${g.id}`,
        });
      } else if (g.progress >= 0.75) {
        const pct = Math.round(g.progress * 100);
        items.push({
          id:       `goal-75-${g.id}`,
          priority: 'normal',
          title:    `${g.emoji ? g.emoji + ' ' : ''}${g.name} at ${pct}%`,
          body:     `${formatAmount(g.remaining, symbol)} to go — almost there!`,
          accent:   g.color ?? primaryColor,
          icon:     Target,
          href:     `/goals/${g.id}`,
        });
      } else if (g.progress >= 0.5) {
        items.push({
          id:       `goal-50-${g.id}`,
          priority: 'normal',
          title:    `${g.emoji ? g.emoji + ' ' : ''}Halfway to ${g.name}`,
          body:     `50% saved — keep the momentum going`,
          accent:   g.color ?? primaryColor,
          icon:     Target,
          href:     `/goals/${g.id}`,
        });
      }
    }

    // High priority first, then normal
    return items.sort((a, b) =>
      a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1
    );
  }, [bills, goals, symbol, dangerColor, warningColor, primaryColor]);
}

// ─── Alert row ────────────────────────────────────────────────────────────────

function AlertRow({
  item,
  isRead,
  isFirst,
  isLast,
  onPress,
  onRead,
}: {
  item:    AlertItem;
  isRead:  boolean;
  isFirst: boolean;
  isLast:  boolean;
  onPress: () => void;
  onRead:  (id: string) => void;
}) {
  const { colors, text, font, fontSize, radius } = useTheme();

  return (
    <>
      <Pressable
        onPress={() => { onRead(item.id); onPress(); }}
        style={({ pressed }) => [
          styles.alertRow,
          {
            backgroundColor:         colors.card,
            borderTopLeftRadius:     isFirst ? radius.lg : 0,
            borderTopRightRadius:    isFirst ? radius.lg : 0,
            borderBottomLeftRadius:  isLast  ? radius.lg : 0,
            borderBottomRightRadius: isLast  ? radius.lg : 0,
            opacity:                 pressed ? 0.82 : 1,
          },
        ]}
      >
        {/* Icon circle */}
        <View
          style={[
            styles.alertIconWrap,
            { backgroundColor: item.accent + '1A', borderRadius: radius.full },
          ]}
        >
          <item.icon size={18} color={item.accent} strokeWidth={1.8} />
        </View>

        {/* Text block */}
        <View style={styles.alertBody}>
          <View style={styles.alertTitleRow}>
            <Text
              style={[
                styles.alertTitle,
                { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.text },
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {!isRead && (
              <View style={[styles.unreadDot, { backgroundColor: item.accent }]} />
            )}
          </View>
          <Text
            style={[text.caption, { color: colors.textSecondary, marginTop: 2 }]}
            numberOfLines={2}
          >
            {item.body}
          </Text>
        </View>

        <ChevronRight size={16} color={colors.textTertiary} strokeWidth={1.6} />
      </Pressable>

      {!isLast && (
        <View style={{ backgroundColor: colors.card }}>
          <Divider style={{ marginLeft: 56 }} />
        </View>
      )}
    </>
  );
}


// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { colors, text, font, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { currency } = useUIStore();
  const symbol = currency.symbol;

  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const alerts   = useAlerts(symbol, colors.danger, colors.warning, colors.primary);
  const critical = alerts.filter((a) => a.priority === 'high');
  const updates  = alerts.filter((a) => a.priority === 'normal');
  const unreadCount = alerts.filter((a) => !readIds.has(a.id)).length;

  // ── Read state ──────────────────────────────────────────────────────────
  const markRead = useCallback((id: string) => {
    setReadIds((prev) => new Set([...prev, id]));
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds(new Set(alerts.map((a) => a.id)));
  }, [alerts]);

  const navigate = useCallback(
    (href: string) => router.push(href as never),
    [router],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>

      {/* ── Forest-green header ── */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                Platform.OS === 'ios' ? 'rgba(22,58,47,0.88)' : colors.primary,
            },
          ]}
        />

        {/* Header row — sits above overlays */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.headerBackBtn}
          >
            <ArrowLeft size={22} color={Palette.linen} strokeWidth={1.8} />
          </Pressable>

          <View style={styles.headerCenter}>
            <Text
              style={[
                { fontFamily: font.displayLight, fontSize: fontSize.xl, color: Palette.linen },
              ]}
            >
              Notifications
            </Text>
            {unreadCount > 0 && (
              <View style={[styles.countBadge, { backgroundColor: Palette.gold }]}>
                <Text
                  style={[
                    {
                      fontFamily:  font.sansSemiBold,
                      fontSize:    10,
                      color:       Palette.forest,
                      lineHeight:  14,
                    },
                  ]}
                >
                  {unreadCount}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.headerRight}>
            {unreadCount > 0 && (
              <Pressable onPress={markAllRead} hitSlop={12} style={{ marginRight: 8 }}>
                <Text
                  style={[
                    { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: Palette.gold },
                  ]}
                >
                  Mark read
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push('/notification-settings' as never)}
              hitSlop={12}
            >
              <Settings2 size={20} color={Palette.linen} strokeWidth={1.8} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Content ── */}
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Empty state */}
        {alerts.length === 0 && (
          <Animated.View
            entering={FadeInDown.delay(60).duration(200)}
            style={styles.emptyWrap}
          >
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: colors.backgroundSecondary, borderRadius: radius.full },
              ]}
            >
              <CheckCircle2 size={40} color={colors.primary} strokeWidth={1.4} />
            </View>
            <Text
              style={[
                {
                  fontFamily:   font.displayLight,
                  fontSize:     fontSize.xl,
                  color:        colors.text,
                  marginTop:    20,
                  textAlign:    'center',
                },
              ]}
            >
              You're all caught up
            </Text>
            <Text
              style={[
                text.body,
                {
                  color:     colors.textSecondary,
                  marginTop: 8,
                  textAlign: 'center',
                  maxWidth:  260,
                },
              ]}
            >
              No overdue bills, budgets on track, goals progressing well.
            </Text>
          </Animated.View>
        )}

        {/* Critical — Needs Attention */}
        {critical.length > 0 && (
          <Animated.View entering={FadeInDown.delay(40).duration(200)}>
            <Text
              style={[
                text.labelCaps,
                styles.sectionLabel,
                { color: colors.danger },
              ]}
            >
              Needs Attention
            </Text>
            <View
              style={[
                styles.group,
                {
                  borderRadius: radius.lg,
                  overflow:     'hidden',
                  borderWidth:  1,
                  borderColor:  colors.danger + '30',
                },
              ]}
            >
              {critical.map((item, idx) => (
                <AlertRow
                  key={item.id}
                  item={item}
                  isRead={readIds.has(item.id)}
                  isFirst={idx === 0}
                  isLast={idx === critical.length - 1}
                  onPress={() => navigate(item.href)}
                  onRead={markRead}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* Normal — Updates */}
        {updates.length > 0 && (
          <Animated.View entering={FadeInDown.delay(80).duration(200)}>
            <Text
              style={[
                text.labelCaps,
                styles.sectionLabel,
                { color: colors.textTertiary },
              ]}
            >
              Updates
            </Text>
            <View
              style={[
                styles.group,
                {
                  borderRadius: radius.lg,
                  overflow:     'hidden',
                  borderWidth:  1,
                  borderColor:  colors.border,
                },
              ]}
            >
              {updates.map((item, idx) => (
                <AlertRow
                  key={item.id}
                  item={item}
                  isRead={readIds.has(item.id)}
                  isFirst={idx === 0}
                  isLast={idx === updates.length - 1}
                  onPress={() => navigate(item.href)}
                  onRead={markRead}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* Settings link */}
        <Animated.View entering={FadeInDown.delay(120).duration(200)}>
          <Pressable
            onPress={() => router.push('/notification-settings' as never)}
            style={[
              styles.settingsLink,
              {
                backgroundColor: colors.card,
                borderRadius:    radius.lg,
                borderWidth:     1,
                borderColor:     colors.border,
              },
            ]}
          >
            <View style={[styles.settingsLinkIcon, { backgroundColor: colors.backgroundSecondary }]}>
              <Settings2 size={17} color={colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={[text.bodyMedium, { color: colors.text, flex: 1 }]}>
              Notification settings
            </Text>
            <ChevronRight size={16} color={colors.textTertiary} strokeWidth={1.8} />
          </Pressable>
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

  // ── Header ──
  header: {
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 20,
    paddingVertical:   14,
    position:         'relative',
  },
  headerBackBtn: {
    width:           36,
    height:          36,
    alignItems:      'center',
    justifyContent:  'center',
  },
  headerCenter: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
  },
  headerRight: {
    width:          80,
    alignItems:     'flex-end',
  },
  countBadge: {
    borderRadius:      999,
    paddingHorizontal: 7,
    paddingVertical:   2,
    minWidth:          20,
    alignItems:        'center',
  },

  // ── Scroll content ──
  content: {
    paddingHorizontal: 20,
    paddingTop:        20,
    gap:               4,
  },

  // ── Permission banner ──
  permBanner: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    padding:        14,
    gap:            10,
    marginBottom:   16,
  },
  permBody: {
    flex: 1,
  },

  // ── Empty state ──
  emptyWrap: {
    alignItems:     'center',
    paddingVertical: 64,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width:          88,
    height:         88,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // ── Section ──
  sectionLabel: {
    marginTop:    20,
    marginBottom: 8,
    marginLeft:   2,
    letterSpacing: 1,
  },
  group: {},

  // ── Alert row ──
  alertRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical:   14,
    paddingHorizontal: 14,
    gap:            12,
    minHeight:      64,
  },
  alertIconWrap: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  alertBody: {
    flex: 1,
    gap:   0,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  alertTitle: {
    flex: 1,
  },
  unreadDot: {
    width:        7,
    height:       7,
    borderRadius: 999,
    flexShrink:   0,
  },

  // ── Settings link ──
  settingsLink: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   14,
    paddingHorizontal: 14,
    gap:               12,
    marginTop:         20,
    minHeight:         52,
  },
  settingsLinkIcon: {
    width:          32,
    height:         32,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
