import React, { useCallback } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type CardVariant = 'default' | 'elevated' | 'outlined';

interface CardProps {
  children:    React.ReactNode;
  variant?:    CardVariant;
  onPress?:    () => void;
  style?:      ViewStyle;
  contentStyle?: ViewStyle;
  testID?:     string;
  /** Force a solid (non-blurred) card on iOS — useful for inner cards or inputs */
  blurless?:   boolean;
}

// ─── Animated Pressable ───────────────────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── iOS glass border colour helper ──────────────────────────────────────────

function glassBorder(isDark: boolean, variant: CardVariant): string {
  if (variant === 'outlined') {
    return isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)';
  }
  return isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';
}

function glassOverlay(isDark: boolean): string {
  return isDark ? 'rgba(30,40,36,0.55)' : 'rgba(250,250,248,0.65)';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Card({
  children,
  variant = 'default',
  onPress,
  style,
  contentStyle,
  testID,
  blurless = false,
}: CardProps) {
  const { colors, radius, shadow, isDark, platform } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (onPress) {
      scale.value = withSpring(0.98, { damping: 20, stiffness: 400 });
    }
  }, [onPress, scale]);

  const handlePressOut = useCallback(() => {
    if (onPress) {
      scale.value = withSpring(1, { damping: 20, stiffness: 400 });
    }
  }, [onPress, scale]);

  // ── Android / blurless solid card styles ──────────────────────────────────

  const variantStyle = (() => {
    switch (variant) {
      case 'default':
        return {
          backgroundColor: colors.card,
          borderWidth: 0,
          borderColor: 'transparent' as const,
          ...shadow.none,
        };
      case 'elevated':
        return {
          backgroundColor: colors.cardElevated,
          borderWidth: 0,
          borderColor: 'transparent' as const,
          ...shadow.md,
        };
      case 'outlined':
        return {
          backgroundColor: 'transparent' as const,
          borderWidth: 1,
          borderColor: colors.border,
          ...shadow.none,
        };
    }
  })();

  const solidCardStyle: ViewStyle = {
    borderRadius: Platform.OS === 'ios' ? 20 : 16,
    overflow: 'hidden',
    ...(Platform.OS === 'android'
      ? {
          elevation:     1,
          shadowColor:   '#000',
          shadowOffset:  { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius:  4,
        }
      : {}),
    ...variantStyle,
  };

  // ── iOS glass path ─────────────────────────────────────────────────────────

  if (Platform.OS === 'ios' && !blurless) {
    const blurIntensity = variant === 'elevated'
      ? (isDark ? 80 : 65)
      : platform.blurIntensity;

    const borderWidth = platform.hairline;
    const borderColor = glassBorder(isDark, variant);

    if (onPress) {
      return (
        <Animated.View style={[animatedStyle, style]} testID={testID}>
          <Pressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            accessibilityRole="button"
            style={{ borderRadius: 20, overflow: 'hidden' }}
          >
            <BlurView
              intensity={blurIntensity}
              tint={isDark ? 'dark' : 'light'}
              style={[
                styles.glassBase,
                { borderWidth, borderColor, borderRadius: 20 },
              ]}
            >
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: glassOverlay(isDark), borderRadius: 20 },
                ]}
              />
              <View style={contentStyle}>{children}</View>
            </BlurView>
          </Pressable>
        </Animated.View>
      );
    }

    return (
      <BlurView
        intensity={blurIntensity}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.glassBase,
          { borderWidth, borderColor, borderRadius: 20 },
          style,
        ]}
        testID={testID}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: glassOverlay(isDark), borderRadius: 20 },
          ]}
        />
        <View style={contentStyle}>{children}</View>
      </BlurView>
    );
  }

  // ── Android / blurless path ────────────────────────────────────────────────

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        testID={testID}
        android_ripple={platform.ripple}
        style={[animatedStyle, solidCardStyle, style]}
      >
        <View style={contentStyle}>{children}</View>
      </AnimatedPressable>
    );
  }

  return (
    <View testID={testID} style={[solidCardStyle, style]}>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  glassBase: {
    overflow: 'hidden',
  },
});
