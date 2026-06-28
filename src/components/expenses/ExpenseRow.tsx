import React, { useCallback } from 'react';
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
import {
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../../types';
import type { Expense } from '../../types';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';

// ─── Icon map ─────────────────────────────────────────────────────────────────

const EXPENSE_ICONS: Record<
  ExpenseCategory,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = {
  food:          UtensilsCrossed,
  transport:     Car,
  shopping:      ShoppingBag,
  entertainment: Tv,
  housing:       Home,
  utilities:     Zap,
  health:        Heart,
  family:        Users,
  education:     BookOpen,
  savings:       PiggyBank,
  gifts:         Gift,
  other:         MoreHorizontal,
};

// ─── Category icon bg colors (slightly lighter alpha than raw color) ──────────

function iconBgColor(hex: string): string {
  return hex + '22';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExpenseRowProps {
  expense:      Expense;
  onPress:      () => void;
  onLongPress?: () => void;
  style?:       ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ExpenseRow({ expense, onPress, onLongPress, style }: ExpenseRowProps) {
  const { colors, text, font, fontSize, radius } = useTheme();
  const { fmt } = useCurrencyFormat();

  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, { damping: 20, stiffness: 400 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 20, stiffness: 400 });
  }, [scale]);

  const meta = EXPENSE_CATEGORIES[expense.category];
  const IconComp = EXPENSE_ICONS[expense.category] ?? MoreHorizontal;
  const displayAmount = `−${fmt(expense.amount)}`;

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      style={[animStyle, styles.row, style]}
    >
      {/* Category icon circle */}
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: iconBgColor(meta.color),
            borderRadius:    radius.full,
          },
        ]}
      >
        <IconComp size={20} color={meta.color} strokeWidth={1.8} />
      </View>

      {/* Center: description + category label */}
      <View style={styles.center}>
        <Text
          style={[
            styles.description,
            {
              fontFamily: font.sansSemiBold,
              fontSize:   fontSize.base,
              color:      colors.text,
            },
          ]}
          numberOfLines={1}
        >
          {expense.description ?? meta.label}
        </Text>
        <Text
          style={[
            text.bodySm,
            styles.categoryLabel,
            { color: colors.textSecondary },
          ]}
          numberOfLines={1}
        >
          {meta.label}
        </Text>
      </View>

      {/* Right: amount */}
      <Text
        style={[
          styles.amount,
          {
            fontFamily: font.sansSemiBold,
            fontSize:   fontSize.base,
            color:      colors.danger,
          },
        ]}
      >
        {displayAmount}
      </Text>
    </AnimatedPressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: 12,
    gap:             12,
  },
  iconCircle: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  center: {
    flex:    1,
    gap:     2,
  },
  description: {
    includeFontPadding: false,
  } as object,
  categoryLabel: {
    includeFontPadding: false,
  } as object,
  amount: {
    includeFontPadding: false,
    flexShrink:         0,
  } as object,
});
