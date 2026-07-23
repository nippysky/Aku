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
  Briefcase, Zap, Building2, TrendingUp,
  Home, ArrowLeftRight, RotateCcw, HandCoins, MoreHorizontal,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { INCOME_CATEGORIES, type IncomeCategory } from '../../types';
import type { Income } from '../../types';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';

// ─── Icon map ─────────────────────────────────────────────────────────────────

const INCOME_ICONS: Record<
  IncomeCategory,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = {
  salary:     Briefcase,
  freelance:  Zap,
  business:   Building2,
  investment: TrendingUp,
  rental:     Home,
  transfer:   ArrowLeftRight,
  refund:     RotateCcw,
  loans:      HandCoins,
  other:      MoreHorizontal,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface IncomeRowProps {
  record:       Income;
  onPress:      () => void;
  onLongPress?: () => void;
  style?:       ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function IncomeRow({ record, onPress, onLongPress, style }: IncomeRowProps) {
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

  const meta     = INCOME_CATEGORIES[record.category];
  const IconComp = INCOME_ICONS[record.category] ?? MoreHorizontal;

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
            backgroundColor: meta.color + '22',
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
          {record.description ?? meta.label}
        </Text>
        <Text
          style={[text.bodySm, styles.categoryLabel, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {meta.label}
        </Text>
      </View>

      {/* Right: amount — green for income */}
      <Text
        style={[
          styles.amount,
          {
            fontFamily: font.sansSemiBold,
            fontSize:   fontSize.base,
            color:      colors.success,
          },
        ]}
      >
        +{fmt(record.amount)}
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
    flex: 1,
    gap:  2,
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
