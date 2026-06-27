/**
 * OnboardingHeader — unified step indicator + back button for all 9 onboarding steps.
 *
 * Renders in the normal layout flow (not absolute) so it never overlaps content.
 * Supports a `dark` prop for screens with a dark background (pin-setup, biometric).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { Palette } from '../../theme/colors';

// ─── Types ─────────────────────────────────────────────────────────────────

interface OnboardingHeaderProps {
  /** 1-based current step number. */
  step:    number;
  /** Total number of steps (always 9 for the full onboarding flow). */
  total:   number;
  /** Back handler. If omitted, the back button slot is an empty spacer. */
  onBack?: () => void;
  /** True for screens with a dark (forest green / obsidian) background. */
  dark?:   boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function OnboardingHeader({
  step,
  total,
  onBack,
  dark = false,
}: OnboardingHeaderProps) {
  const iconColor   = dark ? 'rgba(250,250,248,0.85)' : Palette.gray600;
  const activeFill  = dark ? '#FAFAF8'                : Palette.forest;
  const inactiveFill = dark ? 'rgba(250,250,248,0.22)' : Palette.gray100;

  return (
    <View style={styles.row}>
      {/* Back button / spacer */}
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={22} color={iconColor} strokeWidth={1.8} />
        </Pressable>
      ) : (
        <View style={styles.backBtn} />
      )}

      {/* Segment bar */}
      <View style={styles.segments}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: i < step ? activeFill : inactiveFill },
            ]}
          />
        ))}
      </View>

      {/* Right spacer (mirrors back button for symmetry) */}
      <View style={styles.spacer} />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    marginBottom:  24,
  },
  backBtn: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  segments: {
    flex:          1,
    flexDirection: 'row',
    gap:           4,
  },
  segment: {
    flex:         1,
    height:       3,
    borderRadius: 2,
  },
  spacer: {
    width: 36,
  },
});
