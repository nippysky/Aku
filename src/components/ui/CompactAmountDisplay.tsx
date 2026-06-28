/**
 * CompactAmountDisplay
 *
 * Shows a compact amount (₦10K / ₦1.2M / ₦3.4B) as the headline figure
 * and, when the value is actually abbreviated, shows the full precise amount
 * in a small muted subtext beneath it.
 *
 * This gives users the at-a-glance readability of compact notation while
 * ensuring they can always see every cent / kobo.
 *
 * Props
 * ─────
 * kobo        — raw minor-unit amount (already converted to display currency)
 * textStyle   — style override for the main compact figure
 * subStyle    — style override for the subtext
 * align       — 'center' (default) | 'left' | 'right'
 * showSub     — force show/hide sub-label (default: auto — shows when compact ≠ full)
 */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle, TextStyle, StyleProp, FlexAlignType } from 'react-native';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { useTheme } from '../../theme';

type AlignShorthand = 'center' | 'left' | 'right';

function toFlexAlign(a: AlignShorthand): FlexAlignType {
  if (a === 'left')  return 'flex-start';
  if (a === 'right') return 'flex-end';
  return 'center';
}

interface CompactAmountDisplayProps {
  kobo:       number;
  textStyle?: StyleProp<TextStyle>;
  subStyle?:  StyleProp<TextStyle>;
  align?:     AlignShorthand;
  showSub?:   boolean;
  style?:     ViewStyle;
}

export function CompactAmountDisplay({
  kobo,
  textStyle,
  subStyle,
  align = 'center',
  showSub,
  style,
}: CompactAmountDisplayProps) {
  const { fmt, fmtCompact } = useCurrencyFormat();
  const { colors, text, fontSize, font } = useTheme();

  const compact  = fmtCompact(kobo);
  const full     = fmt(kobo);
  const isAbbrev = compact !== full;

  // showSub prop overrides; otherwise auto-detect
  const displaySub = showSub !== undefined ? showSub : isAbbrev;

  return (
    <View style={[{ alignItems: toFlexAlign(align) }, style]}>
      <Text style={[styles.main, textStyle]}>{compact}</Text>
      {displaySub && (
        <Text
          style={[
            {
              fontFamily: font.sansRegular,
              fontSize:   fontSize.xs,
              color:      colors.textTertiary,
              marginTop:  2,
              letterSpacing: 0.2,
            },
            subStyle,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {full}
        </Text>
      )}
    </View>
  );
}

// ─── Variant for banners (linen-coloured, for forest-green backgrounds) ────────

interface BannerAmountProps {
  kobo:       number;
  textStyle?: StyleProp<TextStyle>;
  align?:     AlignShorthand;
}

export function BannerAmount({ kobo, textStyle, align = 'left' }: BannerAmountProps) {
  const { fmt, fmtCompact } = useCurrencyFormat();

  const compact  = fmtCompact(kobo);
  const full     = fmt(kobo);
  const isAbbrev = compact !== full;

  return (
    <View style={{ alignItems: toFlexAlign(align) }}>
      <Text style={[styles.bannerMain, textStyle]}>{compact}</Text>
      {isAbbrev && (
        <Text style={styles.bannerSub} numberOfLines={1} adjustsFontSizeToFit>
          {full}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  main: {
    // Caller provides font/size via textStyle — this is just a fallback
    fontSize: 28,
  },
  bannerMain: {
    // Styled by caller for different banner sizes; sub inherits linen-ish colour
  },
  bannerSub: {
    fontSize:      11,
    color:         'rgba(250,250,248,0.55)',
    marginTop:     2,
    letterSpacing: 0.2,
    fontFamily:    'PlusJakartaSans_400Regular',
  },
});
