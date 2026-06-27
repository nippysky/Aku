import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';
import { IS_IOS } from '../../lib/platform';

// ─── Types ────────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'lg' | 'md' | 'sm';

interface LucideIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

type LucideIcon = React.ComponentType<LucideIconProps>;

interface ButtonProps {
  onPress: () => void;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  fullWidth?: boolean;
  style?: import('react-native').ViewStyle;
}

// ─── AnimatedPressable ────────────────────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Platform-specific border radius ─────────────────────────────────────────

function buttonRadius(_variant: ButtonVariant): number {
  return 100; // Full pill on all platforms and all variants
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Button({
  onPress,
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  iconLeft: IconLeft,
  iconRight: IconRight,
  fullWidth = true,
  style,
}: ButtonProps) {
  const { colors, layout, text, font, fontSize, platform } = useTheme();
  const scale = useSharedValue(1);

  // Scale animation — iOS only (Android uses ripple)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (IS_IOS) {
      scale.value = withSpring(0.97, { damping: 20, stiffness: 400 });
    }
  }, [scale]);

  const handlePressOut = useCallback(() => {
    if (IS_IOS) {
      scale.value = withSpring(1, { damping: 20, stiffness: 400 });
    }
  }, [scale]);

  const isDisabled = disabled || loading;

  // ── Height ──
  const height =
    size === 'lg' ? layout.buttonHeightLg
    : size === 'sm' ? layout.buttonHeightSm
    : layout.buttonHeightMd;

  // ── Colors per variant ──
  const containerStyle = (() => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: isDisabled ? colors.borderStrong : colors.primary,
          borderWidth: 0,
          borderColor: 'transparent' as const,
        };
      case 'secondary':
        return {
          backgroundColor: 'transparent' as const,
          borderWidth: 1.5,
          borderColor: isDisabled ? colors.border : colors.primary,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent' as const,
          borderWidth: 0,
          borderColor: 'transparent' as const,
        };
      case 'danger':
        return {
          backgroundColor: isDisabled ? colors.borderStrong : colors.danger,
          borderWidth: 0,
          borderColor: 'transparent' as const,
        };
    }
  })();

  const labelColor = (() => {
    if (isDisabled) {
      return variant === 'primary' || variant === 'danger'
        ? colors.textSecondary
        : colors.textTertiary;
    }
    switch (variant) {
      case 'primary':   return colors.textOnForest;
      case 'secondary': return colors.primary;
      case 'ghost':     return colors.primary;
      case 'danger':    return colors.textInverse;
    }
  })();

  const iconColor = labelColor;
  const iconSize =
    size === 'lg' ? layout.iconLg
    : size === 'sm' ? layout.iconSm
    : layout.iconMd;

  const labelStyle = size === 'sm' ? text.buttonLabelSm : text.buttonLabel;
  const paddingHorizontal = size === 'sm' ? 16 : size === 'lg' ? 28 : 22;
  const borderRadius = buttonRadius(variant);

  // Android ripple — only on filled variants (primary/danger)
  const androidRippleConfig =
    Platform.OS === 'android' && !isDisabled
      ? {
          color:
            variant === 'primary' || variant === 'danger'
              ? 'rgba(255,255,255,0.15)'
              : platform.ripple.color,
          borderless: false,
        }
      : undefined;

  return (
    <AnimatedPressable
      onPress={isDisabled ? undefined : onPress}
      onPressIn={isDisabled ? undefined : handlePressIn}
      onPressOut={isDisabled ? undefined : handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      android_ripple={androidRippleConfig}
      style={[
        animatedStyle,
        styles.base,
        {
          height,
          paddingHorizontal,
          borderRadius,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          ...containerStyle,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={labelColor}
        />
      ) : (
        <View style={styles.inner}>
          {IconLeft && (
            <View style={styles.iconLeft}>
              <IconLeft size={iconSize} color={iconColor} strokeWidth={2} />
            </View>
          )}
          <Text
            style={[
              labelStyle,
              { color: labelColor },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {IconRight && (
            <View style={styles.iconRight}>
              <IconRight size={iconSize} color={iconColor} strokeWidth={2} />
            </View>
          )}
        </View>
      )}
    </AnimatedPressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});
