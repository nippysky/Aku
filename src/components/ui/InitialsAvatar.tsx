/**
 * InitialsAvatar
 *
 * A simple, elegant circular avatar that renders the user's initials.
 * No image loading, no network dependency — always renders instantly.
 *
 * The background color is derived consistently from the name so the same
 * person always gets the same color across sessions.
 */
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

// ─── Palette ──────────────────────────────────────────────────────────────────
// Earthy, on-brand colors that all read clearly with white text.

const COLORS = [
  '#163A2F', // forest (primary)
  '#2D6A4F', // deep green
  '#1B4332', // darkest green
  '#40916C', // mid green
  '#4A7C59', // sage
  '#5C6B73', // slate
  '#6D4C41', // warm brown
  '#4E6B5E', // muted teal
  '#3D5A4E', // deep sage
  '#2C4A3E', // pine
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getColor(name: string): string {
  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface InitialsAvatarProps {
  name:   string;
  size?:  number;
  style?: ViewStyle;
}

export function InitialsAvatar({ name, size = 48, style }: InitialsAvatarProps) {
  const initials  = getInitials(name);
  const bg        = getColor(name);
  const fontSize  = Math.round(size * 0.36);
  const radius    = size / 2;

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: radius, backgroundColor: bg },
        style,
      ]}
      accessibilityLabel={`${name} avatar`}
    >
      <Text
        style={[styles.text, { fontSize, lineHeight: size }]}
        numberOfLines={1}
      >
        {initials}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  circle: {
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
  },
  text: {
    color:          '#F5F2EC',  // Palette.linen
    fontFamily:     'PlusJakartaSans_500Medium',
    letterSpacing:  0.5,
    textAlign:      'center',
    includeFontPadding: false,
  },
});
