import React from 'react';
import { Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import type { GoalWithProgress } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal:   GoalWithProgress;
  size?:  'sm' | 'md';
  style?: ViewStyle;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GoalCard({ goal, size = 'md', style }: GoalCardProps) {
  const { colors, text, font, fontSize, radius, shadow } = useTheme();

  const percentage   = Math.round(goal.progress * 100);
  const accentColor  = goal.color ?? Palette.gold;
  const cardWidth    = size === 'sm' ? 160 : 180;
  const savedAmount  = Math.round(goal.targetAmount * goal.progress);

  return (
    <View
      style={[
        {
          width:           cardWidth,
          backgroundColor: colors.card,
          borderRadius:    radius.xl,
          borderWidth:     1,
          borderColor:     colors.border,
          padding:         16,
          gap:             12,
          ...shadow.sm,
        },
        style,
      ]}
    >
      {/* Top row: emoji + percentage badge */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 26, lineHeight: 30 }}>{goal.emoji ?? '🎯'}</Text>
        <View
          style={{
            backgroundColor:  accentColor + '1A',
            borderRadius:     100,
            paddingHorizontal: 8,
            paddingVertical:  3,
          }}
        >
          <Text
            style={{
              fontFamily:    font.sansSemiBold,
              fontSize:      fontSize.xs,
              color:         accentColor,
              letterSpacing: 0.2,
            }}
          >
            {percentage}%
          </Text>
        </View>
      </View>

      {/* Goal name */}
      <Text
        style={[text.bodyMedium, { color: colors.text, fontSize: fontSize.sm }]}
        numberOfLines={2}
      >
        {goal.name}
      </Text>

      {/* Linear progress bar + amounts */}
      <View style={{ gap: 6 }}>
        <View
          style={{
            height:       4,
            backgroundColor: colors.border,
            borderRadius: 2,
            overflow:     'hidden',
          }}
        >
          <View
            style={{
              height:          4,
              width:           `${Math.min(percentage, 100)}%`,
              backgroundColor: accentColor,
              borderRadius:    2,
            }}
          />
        </View>
        <Text style={[text.caption, { color: colors.textTertiary }]}>
          ₦{(savedAmount / 100).toLocaleString()} of ₦{(goal.targetAmount / 100).toLocaleString()}
        </Text>
      </View>
    </View>
  );
}
