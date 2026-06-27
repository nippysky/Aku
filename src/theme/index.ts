import { useColorScheme } from 'react-native';
import { DarkColors, LightColors, type ColorScheme } from './colors';
import { FontFamily, FontSize, LineHeight, LetterSpacing, TextStyle } from './typography';
import { Spacing, Radius, Shadow, Layout } from './spacing';
import { useUIStore } from '../store/ui.store';
import { IS_IOS } from '../lib/platform';

export { Palette } from './colors';
export { LightColors, DarkColors, type ColorScheme } from './colors';
export { FontFamily, FontSize, LineHeight, LetterSpacing, TextStyle } from './typography';
export { Spacing, Radius, Shadow, Layout } from './spacing';

// ─── useTheme Hook ─────────────────────────────────────────────────────────────
// Single hook that returns the complete themed token set.
// Usage: const { colors, spacing, text, radius } = useTheme();

export function useTheme() {
  const scheme = useColorScheme();
  const themeMode = useUIStore((s) => s.themeMode);

  const isDark =
    themeMode === 'dark'
      ? true
      : themeMode === 'light'
      ? false
      : scheme === 'dark';

  const colors = (isDark ? DarkColors : LightColors) as ColorScheme;

  const platform = {
    // Card style
    cardStyle: IS_IOS
      ? { borderRadius: 20, overflow: 'hidden' as const }
      : { borderRadius: 16, elevation: 2, overflow: 'hidden' as const },

    // Border width — iOS uses hairline, Android slightly thicker
    hairline: IS_IOS ? 0.5 : 1,

    // Blur intensity for iOS glass (0 = no blur, 100 = fully blurred)
    blurIntensity: isDark ? 70 : 60,

    // Ripple color for Android
    ripple: {
      color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      borderless: false,
    },

    // Android elevation levels
    elevation: { none: 0, xs: 1, sm: 2, md: 4, lg: 8 },
  } as const;

  return {
    colors,
    isDark,
    spacing:  Spacing,
    radius:   Radius,
    shadow:   Shadow,
    layout:   Layout,
    font:     FontFamily,
    fontSize: FontSize,
    text:     TextStyle,
    platform,
  } as const;
}

export type Theme = ReturnType<typeof useTheme>;
