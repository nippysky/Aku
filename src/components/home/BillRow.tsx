import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme';
import { StatusBadge } from '../ui/StatusBadge';
import { BILL_CATEGORIES } from '../../types';
import type { Bill } from '../../types';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';

// ─── Dynamic lucide icon renderer ────────────────────────────────────────────

import {
  Home,
  Zap,
  Car,
  UtensilsCrossed,
  Heart,
  BookOpen,
  Tv,
  ShoppingBag,
  Users,
  PiggyBank,
  RefreshCw,
  Shield,
  MoreHorizontal,
} from 'lucide-react-native';

const BILL_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  Home,
  Zap,
  Car,
  UtensilsCrossed,
  Heart,
  BookOpen,
  Tv,
  ShoppingBag,
  Users,
  PiggyBank,
  RefreshCw,
  Shield,
  MoreHorizontal,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillRowProps {
  bill:         Bill;
  onPress:      () => void;
  onLongPress?: () => void;
  showStatus?:  boolean;
  style?:       ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDueDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BillRow({ bill, onPress, onLongPress, showStatus = true, style }: BillRowProps) {
  const { colors, text, font, fontSize, spacing, radius } = useTheme();
  const { fmt } = useCurrencyFormat();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const meta = BILL_CATEGORIES[bill.category];
  const IconComp = BILL_ICONS[meta.icon] ?? MoreHorizontal;

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => { scale.value = withSpring(0.98, { damping: 20, stiffness: 400 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 20, stiffness: 400 }); }}
      accessibilityRole="button"
      style={[animStyle, styles.row, { borderBottomColor: colors.borderLight }, style]}
    >
      {/* Category icon */}
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: meta.color + '20', borderRadius: radius.full },
        ]}
      >
        <IconComp size={20} color={meta.color} strokeWidth={1.8} />
      </View>

      {/* Center info */}
      <View style={styles.center}>
        <Text
          style={[text.bodyMedium, { color: colors.text }]}
          numberOfLines={1}
        >
          {bill.name}
        </Text>
        <Text
          style={[text.caption, { color: colors.textSecondary, marginTop: 2 }]}
          numberOfLines={1}
        >
          {formatDueDate(bill.dueDate)}
        </Text>
      </View>

      {/* Right: amount + badge */}
      <View style={styles.right}>
        <Text style={[text.amount, { color: colors.text }]}>
          {fmt(bill.amount)}
        </Text>
        {showStatus && (
          <StatusBadge status={bill.status} style={styles.badge} />
        )}
      </View>
    </AnimatedPressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  iconCircle: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    12,
    flexShrink:     0,
  },
  center: {
    flex:     1,
    marginRight: 10,
  },
  right: {
    alignItems:  'flex-end',
    flexShrink:  0,
    gap:         4,
  },
  badge: {
    alignSelf: 'flex-end',
  },
});
