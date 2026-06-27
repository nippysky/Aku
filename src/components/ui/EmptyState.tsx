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

interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

interface EmptyStateProps {
  title: string;
  message: string;
  icon: LucideIcon;
  action?: EmptyStateAction;
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmptyState({
  title,
  message,
  icon: Icon,
  action,
  style,
}: EmptyStateProps) {
  const { colors, text, font, fontSize, spacing, radius } = useTheme();

  return (
    <View style={[styles.container, style]}>
      {/* Icon container */}
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: colors.backgroundSecondary,
            borderRadius: radius.xl,
            borderColor: colors.border,
          },
        ]}
      >
        <Icon size={36} color={colors.textTertiary} strokeWidth={1.5} />
      </View>

      {/* Title */}
      <Text
        style={[
          styles.title,
          {
            fontFamily: font.displayLight,
            fontSize: fontSize['2xl'],
            lineHeight: fontSize['2xl'] * 1.25,
            color: colors.text,
          },
        ]}
      >
        {title}
      </Text>

      {/* Message */}
      <Text
        style={[
          text.body,
          styles.message,
          { color: colors.textSecondary },
        ]}
      >
        {message}
      </Text>

      {/* Action */}
      {action && (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          style={[
            styles.actionButton,
            {
              backgroundColor: colors.primary,
              borderRadius: radius.full,
            },
          ]}
        >
          <Text
            style={[
              text.buttonLabel,
              { color: colors.textOnForest },
            ]}
          >
            {action.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 48,
  },
  iconContainer: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    borderWidth: 1,
  },
  title: {
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  message: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
  },
  actionButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
