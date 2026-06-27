import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DividerProps {
  style?: ViewStyle;
  color?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Divider({ style, color }: DividerProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.divider,
        { backgroundColor: color ?? colors.border },
        style,
      ]}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  divider: {
    height: 0.5,
    width: '100%',
  },
});
