import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LucideIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

type LucideIcon = React.ComponentType<LucideIconProps>;

interface HeaderAction {
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel?: string;
}

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  leftAction?: HeaderAction;
  rightAction?: HeaderAction;
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScreenHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
  style,
}: ScreenHeaderProps) {
  const { colors, font, fontSize, text, spacing, layout } = useTheme();

  return (
    <View style={[styles.container, style]}>
      {/* Left action — always reserve space */}
      <View style={styles.side}>
        {leftAction && (
          <Pressable
            onPress={leftAction.onPress}
            accessibilityRole="button"
            accessibilityLabel={leftAction.accessibilityLabel ?? 'Back'}
            hitSlop={8}
            style={styles.touchTarget}
          >
            <leftAction.icon
              size={layout.iconMd}
              color={colors.text}
              strokeWidth={1.8}
            />
          </Pressable>
        )}
      </View>

      {/* Center title block */}
      <View style={styles.center}>
        <Text
          style={[
            styles.title,
            {
              fontFamily: font.displayLight,
              fontSize: fontSize['2xl'],
              lineHeight: fontSize['2xl'] * 1.25,
              color: colors.text,
              letterSpacing: -0.5,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={[
              text.caption,
              styles.subtitle,
              {
                color: colors.textSecondary,
                fontSize: 13,
              },
            ]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {/* Right action — always reserve space */}
      <View style={[styles.side, styles.sideRight]}>
        {rightAction && (
          <Pressable
            onPress={rightAction.onPress}
            accessibilityRole="button"
            accessibilityLabel={rightAction.accessibilityLabel ?? 'Action'}
            hitSlop={8}
            style={styles.touchTarget}
          >
            <rightAction.icon
              size={layout.iconMd}
              color={colors.text}
              strokeWidth={1.8}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  side: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 2,
    textAlign: 'center',
  },
  touchTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
