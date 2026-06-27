import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';
import { EXPENSE_CATEGORIES } from '../../types';
import type { ExpenseCategory, BudgetStatus } from '../../types';

import {
  UtensilsCrossed,
  Car,
  ShoppingBag,
  Tv,
  Home,
  Zap,
  Heart,
  Users,
  BookOpen,
  PiggyBank,
  Gift,
  MoreHorizontal,
} from 'lucide-react-native';

const EXPENSE_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  UtensilsCrossed,
  Car,
  ShoppingBag,
  Tv,
  Home,
  Zap,
  Heart,
  Users,
  BookOpen,
  PiggyBank,
  Gift,
  MoreHorizontal,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface BudgetBarProps {
  category: ExpenseCategory;
  spent:    number;  // kobo
  total:    number;  // kobo
  status:   BudgetStatus;
  onPress?: () => void;
  style?:   ViewStyle;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAmount(kobo: number): string {
  const naira = kobo / 100;
  return `₦${naira.toLocaleString('en-NG')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BudgetBar({ category, spent, total, status, onPress, style }: BudgetBarProps) {
  const { colors, text, font, radius } = useTheme();

  const meta = EXPENSE_CATEGORIES[category];
  const IconComp = EXPENSE_ICONS[meta.icon] ?? MoreHorizontal;

  const progress = total > 0 ? Math.min(spent / total, 1) : 0;
  const animWidth = useSharedValue(0);

  useEffect(() => {
    animWidth.value = withSpring(progress, { damping: 20, stiffness: 120 });
  }, [progress, animWidth]);

  const barColor = (() => {
    switch (status) {
      case 'exceeded':   return colors.budgetExceeded;
      case 'near-limit': return colors.budgetNearLimit;
      default:           return colors.budgetHealthy;
    }
  })();

  const animBarStyle = useAnimatedStyle(() => ({
    width: `${animWidth.value * 100}%` as `${number}%`,
  }));

  const inner = (
    <View style={[styles.container, style]}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: meta.color + '20', borderRadius: radius.full },
            ]}
          >
            <IconComp size={16} color={meta.color} strokeWidth={1.8} />
          </View>
          <Text style={[text.bodyMedium, { color: colors.text }]}>
            {meta.label}
          </Text>
        </View>
        <Text style={[text.amountSm, { color: colors.textSecondary }]}>
          {formatAmount(spent)}
          <Text style={{ color: colors.textTertiary }}> / {formatAmount(total)}</Text>
        </Text>
      </View>

      {/* Progress track */}
      <View
        style={[
          styles.track,
          { backgroundColor: colors.border, borderRadius: radius.full },
        ]}
      >
        <Animated.View
          style={[
            styles.bar,
            animBarStyle,
            { backgroundColor: barColor, borderRadius: radius.full },
          ]}
        />
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
        accessibilityRole="button"
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 16,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  iconCircle: {
    width:          28,
    height:         28,
    alignItems:     'center',
    justifyContent: 'center',
  },
  track: {
    height:   6,
    width:    '100%',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
  },
});
