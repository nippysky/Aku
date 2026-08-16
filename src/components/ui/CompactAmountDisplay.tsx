/**
 * CompactAmountDisplay
 *
 * Shows the full-precision amount as the headline figure — matching Ụgwọ's
 * plain, no-abbreviation style. (Previously showed a compact figure like
 * ₦1.2M with the precise amount in small subtext below; simplified to show
 * the real number up front, full stop.)
 *
 * Props
 * ─────
 * kobo        — raw minor-unit amount (already converted to display currency)
 * textStyle   — style override for the main figure
 * align       — 'center' (default) | 'left' | 'right'
 */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle, TextStyle, StyleProp, FlexAlignType } from 'react-native';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';

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
  align = 'center',
  style,
}: CompactAmountDisplayProps) {
  const { fmt } = useCurrencyFormat();

  return (
    <View style={[{ alignItems: toFlexAlign(align) }, style]}>
      <Text
        style={[styles.main, { fontVariant: ['tabular-nums'] }, textStyle]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {fmt(kobo)}
      </Text>
    </View>
  );
}

// ─── Variant for banners (linen-coloured, for forest-green backgrounds) ────────

interface BannerAmountProps {
  kobo:       number;
  textStyle?: StyleProp<TextStyle>;
  align?:     AlignShorthand;
  /** Optional literal prefix (e.g. '+' / '−') for signed figures — pass the
   *  absolute value as `kobo` and the sign here, rather than a negative kobo,
   *  so the currency symbol still reads naturally (₦500, not ₦-500). */
  prefix?:    string;
}

export function BannerAmount({ kobo, textStyle, align = 'left', prefix = '' }: BannerAmountProps) {
  const { fmt } = useCurrencyFormat();

  return (
    <View style={{ alignItems: toFlexAlign(align) }}>
      <Text
        style={[styles.bannerMain, { fontVariant: ['tabular-nums'] }, textStyle]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {prefix}{fmt(kobo)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  main: {
    // Caller provides font/size via textStyle — this is just a fallback
    fontSize: 28,
  },
  bannerMain: {
    // Styled by caller for different banner sizes
  },
});
