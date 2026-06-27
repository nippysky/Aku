import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';

// ─── Animated SVG Circle ─────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProgressRingProps {
  /** 0 to 1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 10,
  color,
  backgroundColor,
  children,
  style,
}: ProgressRingProps) {
  const { colors } = useTheme();

  const resolvedColor = color ?? colors.primary;
  const resolvedBg = backgroundColor ?? colors.border;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    // Clamp progress to [0, 1]
    const clamped = Math.max(0, Math.min(1, progress));
    animatedProgress.value = withSpring(clamped, {
      damping: 22,
      stiffness: 120,
      mass: 1,
    });
  }, [progress, animatedProgress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        {/* Track ring */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={resolvedBg}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Progress ring — rotated so it starts at top */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={resolvedColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>

      {/* Center content */}
      {children && (
        <View style={[StyleSheet.absoluteFillObject, styles.center]}>
          {children}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
