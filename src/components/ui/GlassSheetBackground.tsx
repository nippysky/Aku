import React from 'react';
import { StyleSheet, Platform, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme';

interface Props {
  style?: StyleProp<ViewStyle>;
  animatedIndex?: unknown;
  animatedPosition?: unknown;
}

export function GlassSheetBackground({ style }: Props) {
  const { isDark } = useTheme();

  if (Platform.OS !== 'ios') return null; // Android uses default solid background

  return (
    <BlurView
      intensity={isDark ? 75 : 60}
      tint={isDark ? 'dark' : 'light'}
      style={[StyleSheet.absoluteFill, style]}
    />
  );
}
