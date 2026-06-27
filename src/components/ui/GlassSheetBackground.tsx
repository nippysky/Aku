import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated from 'react-native-reanimated';
import { useTheme } from '../../theme';

interface Props {
  style?: object;
  animatedIndex?: Animated.SharedValue<number>;
  animatedPosition?: Animated.SharedValue<number>;
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
