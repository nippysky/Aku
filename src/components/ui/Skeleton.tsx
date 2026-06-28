/**
 * Skeleton — animated shimmer placeholders for loading states.
 *
 * Usage:
 *   <Skeleton width={200} height={20} />
 *   <Skeleton width="100%" height={120} borderRadius={16} />
 *   <SkeletonBanner />         — green-banner-sized block
 *   <SkeletonCard rows={3} />  — card with N row stubs
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';

// ─── Base shimmer block ────────────────────────────────────────────────────────

interface SkeletonProps {
  width?:        DimensionValue;
  height?:       number;
  borderRadius?: number;
  style?:        ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(1,    { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.backgroundSecondary,
        },
        animStyle,
        style,
      ]}
    />
  );
}

// ─── Full-width banner skeleton (forest-green banner placeholder) ──────────────

export function SkeletonBanner({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[skeletonStyles.banner, { backgroundColor: colors.backgroundSecondary }, style]}>
      <Skeleton width={80}  height={12} borderRadius={6} style={{ marginBottom: 10 }} />
      <Skeleton width={160} height={36} borderRadius={8} style={{ marginBottom: 14 }} />
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ gap: 6 }}>
          <Skeleton width={60} height={10} borderRadius={5} />
          <Skeleton width={50} height={14} borderRadius={6} />
        </View>
        <View style={{ gap: 6 }}>
          <Skeleton width={60} height={10} borderRadius={5} />
          <Skeleton width={50} height={14} borderRadius={6} />
        </View>
        <View style={{ gap: 6 }}>
          <Skeleton width={60} height={10} borderRadius={5} />
          <Skeleton width={50} height={14} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

// ─── Card skeleton (N rows of label + value) ──────────────────────────────────

export function SkeletonCard({
  rows = 3,
  style,
}: {
  rows?:  number;
  style?: ViewStyle;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        skeletonStyles.card,
        { backgroundColor: colors.card, borderRadius: radius.xl },
        style,
      ]}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={[
            skeletonStyles.cardRow,
            i < rows - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
          ]}
        >
          {/* Icon stub */}
          <Skeleton width={40} height={40} borderRadius={10} />
          {/* Text stubs */}
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="40%" height={10} borderRadius={5} />
            <Skeleton width="65%" height={14} borderRadius={6} />
          </View>
          {/* Value stub */}
          <Skeleton width={60} height={14} borderRadius={6} />
        </View>
      ))}
    </View>
  );
}

// ─── Summary grid skeleton (2 × 2 stat cards) ────────────────────────────────

export function SkeletonSummaryGrid({ style }: { style?: ViewStyle }) {
  const { colors, radius } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, style]}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            flex:            1,
            minWidth:        '45%',
            backgroundColor: colors.card,
            borderRadius:    radius.xl,
            padding:         16,
            gap:             10,
          }}
        >
          <Skeleton width={32} height={32} borderRadius={8} />
          <Skeleton width="50%" height={10} borderRadius={5} />
          <Skeleton width="70%" height={18} borderRadius={6} />
        </View>
      ))}
    </View>
  );
}

// ─── Goal card skeleton ────────────────────────────────────────────────────────

export function SkeletonGoalCard({ style }: { style?: ViewStyle }) {
  const { colors, radius } = useTheme();
  return (
    <View style={[{ backgroundColor: colors.card, borderRadius: radius.xl, padding: 20, gap: 12 }, style]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width="50%" height={16} borderRadius={6} />
        <Skeleton width={60} height={20} borderRadius={10} />
      </View>
      <Skeleton width="100%" height={6} borderRadius={3} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Skeleton width="30%" height={12} borderRadius={5} />
        <Skeleton width="30%" height={12} borderRadius={5} />
      </View>
    </View>
  );
}

// ─── Expense row skeleton ──────────────────────────────────────────────────────

export function SkeletonExpenseRow({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }, style]}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="55%" height={13} borderRadius={5} />
        <Skeleton width="35%" height={10} borderRadius={5} />
      </View>
      <Skeleton width={70} height={14} borderRadius={6} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const skeletonStyles = StyleSheet.create({
  banner: {
    borderRadius: 20,
    padding:      20,
    marginTop:    16,
  },
  card: {
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               12,
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
});
