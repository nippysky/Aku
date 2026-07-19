import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type BadgeStatus =
  | 'upcoming'
  | 'due-today'
  | 'paid'
  | 'overdue';

interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string;
  style?: ViewStyle;
}

// ─── Default Labels ───────────────────────────────────────────────────────────

const DEFAULT_LABELS: Record<BadgeStatus, string> = {
  upcoming:    'Upcoming',
  'due-today': 'Due Today',
  paid:        'Paid',
  overdue:     'Overdue',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function StatusBadge({ status, label, style }: StatusBadgeProps) {
  const { colors, text, font, fontSize } = useTheme();

  const displayLabel = label ?? DEFAULT_LABELS[status];

  // Resolve colors from theme semantic tokens
  const { dotColor, bgColor, textColor } = (() => {
    switch (status) {
      case 'upcoming':
        return {
          dotColor:  colors.statusUpcoming,
          bgColor:   colors.statusUpcomingBg,
          textColor: colors.statusUpcoming,
        };
      case 'due-today':
        return {
          dotColor:  colors.statusDueToday,
          bgColor:   colors.statusDueTodayBg,
          textColor: colors.statusDueToday,
        };
      case 'paid':
        return {
          dotColor:  colors.statusPaid,
          bgColor:   colors.statusPaidBg,
          textColor: colors.statusPaid,
        };
      case 'overdue':
        return {
          dotColor:  colors.statusOverdue,
          bgColor:   colors.statusOverdueBg,
          textColor: colors.statusOverdue,
        };
    }
  })();

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bgColor },
        style,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text
        style={[
          text.caption,
          styles.label,
          {
            color: textColor,
            fontFamily: font.sansMedium,
          },
        ]}
        numberOfLines={1}
      >
        {displayLabel}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  label: {
    includeFontPadding: false,
  } as object,
});
