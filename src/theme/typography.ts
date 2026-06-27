import { Platform } from 'react-native';

// ─── Akù Typography System ─────────────────────────────────────────────────
// Display: Fraunces (serif, elegant) — headings, greeting, large numbers
// Body: Plus Jakarta Sans — all body text, labels, data
// Mono: system mono — amounts, codes

export const FontFamily = {
  // Display serif — load these from assets/fonts/
  displayLight:       'Fraunces_300Light',
  displayRegular:     'Fraunces_400Regular',
  displayLightItalic: 'Fraunces_300Light_Italic',

  // Body sans — load these from assets/fonts/
  sansLight:          'PlusJakartaSans_300Light',
  sansRegular:        'PlusJakartaSans_400Regular',
  sansMedium:         'PlusJakartaSans_500Medium',
  sansSemiBold:       'PlusJakartaSans_600SemiBold',
  sansBold:           'PlusJakartaSans_700Bold',

  // System fallbacks
  systemSans: Platform.select({ ios: 'System', android: 'sans-serif' }) ?? 'System',
  systemMono: Platform.select({ ios: 'Menlo', android: 'monospace' }) ?? 'monospace',
} as const;

export const FontSize = {
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   19,
  xl:   22,
  '2xl': 26,
  '3xl': 32,
  '4xl': 40,
  '5xl': 52,
  '6xl': 64,
} as const;

export const LineHeight = {
  tight:   1.1,
  snug:    1.25,
  normal:  1.45,
  relaxed: 1.65,
} as const;

export const LetterSpacing = {
  tight:  -0.5,
  normal: 0,
  wide:   0.3,
  wider:  0.8,
  widest: 1.5,
} as const;

// ─── Text Presets ──────────────────────────────────────────────────────────
// Ready-to-use style objects — use with spread or StyleSheet
export const TextStyle = {
  // Display — Fraunces, for greeting + hero numbers
  greeting: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['3xl'],
    lineHeight:    FontSize['3xl'] * LineHeight.tight,
    letterSpacing: LetterSpacing.tight,
  },
  heroAmount: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['5xl'],
    lineHeight:    FontSize['5xl'] * LineHeight.tight,
    letterSpacing: LetterSpacing.tight,
  },
  heroAmountSm: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['3xl'],
    lineHeight:    FontSize['3xl'] * LineHeight.tight,
    letterSpacing: LetterSpacing.tight,
  },
  screenTitle: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['2xl'],
    lineHeight:    FontSize['2xl'] * LineHeight.snug,
    letterSpacing: LetterSpacing.tight,
  },
  onboardingTitle: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['4xl'],
    lineHeight:    FontSize['4xl'] * LineHeight.tight,
    letterSpacing: LetterSpacing.tight,
  },

  // Body — Plus Jakarta Sans
  labelCaps: {
    fontFamily:    FontFamily.sansSemiBold,
    fontSize:      FontSize.xs,
    lineHeight:    FontSize.xs * LineHeight.normal,
    letterSpacing: LetterSpacing.widest,
    textTransform: 'uppercase' as const,
  },
  label: {
    fontFamily:    FontFamily.sansMedium,
    fontSize:      FontSize.sm,
    lineHeight:    FontSize.sm * LineHeight.normal,
    letterSpacing: LetterSpacing.wide,
  },
  body: {
    fontFamily:    FontFamily.sansRegular,
    fontSize:      FontSize.base,
    lineHeight:    FontSize.base * LineHeight.relaxed,
    letterSpacing: LetterSpacing.normal,
  },
  bodyMedium: {
    fontFamily:    FontFamily.sansMedium,
    fontSize:      FontSize.base,
    lineHeight:    FontSize.base * LineHeight.normal,
    letterSpacing: LetterSpacing.normal,
  },
  bodySm: {
    fontFamily:    FontFamily.sansRegular,
    fontSize:      FontSize.sm,
    lineHeight:    FontSize.sm * LineHeight.relaxed,
    letterSpacing: LetterSpacing.normal,
  },
  caption: {
    fontFamily:    FontFamily.sansRegular,
    fontSize:      FontSize.xs,
    lineHeight:    FontSize.xs * LineHeight.relaxed,
    letterSpacing: LetterSpacing.normal,
  },
  buttonLabel: {
    fontFamily:    FontFamily.sansSemiBold,
    fontSize:      FontSize.base,
    lineHeight:    FontSize.base * LineHeight.tight,
    letterSpacing: LetterSpacing.normal,
  },
  buttonLabelSm: {
    fontFamily:    FontFamily.sansMedium,
    fontSize:      FontSize.sm,
    lineHeight:    FontSize.sm * LineHeight.tight,
    letterSpacing: LetterSpacing.normal,
  },

  // Numeric — tabular figures for money amounts
  amount: {
    fontFamily:    FontFamily.sansSemiBold,
    fontSize:      FontSize.md,
    lineHeight:    FontSize.md * LineHeight.tight,
    letterSpacing: LetterSpacing.tight,
  },
  amountLg: {
    fontFamily:    FontFamily.sansBold,
    fontSize:      FontSize.xl,
    lineHeight:    FontSize.xl * LineHeight.tight,
    letterSpacing: LetterSpacing.tight,
  },
  amountSm: {
    fontFamily:    FontFamily.sansMedium,
    fontSize:      FontSize.sm,
    lineHeight:    FontSize.sm * LineHeight.tight,
    letterSpacing: LetterSpacing.tight,
  },
  pinDigit: {
    fontFamily:    FontFamily.sansBold,
    fontSize:      FontSize['2xl'],
    lineHeight:    FontSize['2xl'] * LineHeight.tight,
    letterSpacing: FontSize.sm,
  },
} as const;
