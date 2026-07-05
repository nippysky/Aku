/**
 * FirstTimeHint — a slim, dismissible contextual hint banner.
 *
 * Slides up from the bottom of the screen and dismisses on tap.
 * Shown once per key via useFirstTimeHint hook.
 *
 * Props:
 *   visible  — controlled by useFirstTimeHint
 *   onDismiss — call dismiss() from the hook
 *   text     — the hint message
 *   icon     — optional Lucide icon component
 *   bottomOffset — extra offset above tab bar (default 80)
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { useTheme } from '../../theme';

type LucideIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

interface Props {
  visible:       boolean;
  onDismiss:     () => void;
  text:          string;
  icon?:         LucideIcon;
  bottomOffset?: number;
}

export function FirstTimeHint({
  visible,
  onDismiss,
  text,
  icon: Icon,
  bottomOffset = 80,
}: Props) {
  const { colors, font, fontSize, radius } = useTheme();

  const translateY = useSharedValue(80);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 260 });
      opacity.value    = withTiming(1, { duration: 220 });
    } else {
      translateY.value = withTiming(60, { duration: 180 });
      opacity.value    = withTiming(0, { duration: 180 });
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity:   opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        animStyle,
        {
          bottom:          bottomOffset,
          backgroundColor: colors.primary,
          borderRadius:    radius.xl,
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onDismiss}
        style={styles.inner}
        accessibilityRole="button"
        accessibilityLabel="Dismiss hint"
      >
        {Icon && (
          <View style={styles.iconWrap}>
            <Icon size={18} color="#fff" strokeWidth={1.8} />
          </View>
        )}
        <Text
          style={[
            styles.text,
            { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: '#fff' },
          ]}
        >
          {text}
        </Text>
        <View style={styles.closeBtn}>
          <X size={14} color="rgba(255,255,255,0.7)" strokeWidth={2} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position:          'absolute',
    left:              20,
    right:             20,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 4 },
    shadowOpacity:     0.18,
    shadowRadius:      12,
    elevation:         8,
    zIndex:            900,
  },
  inner: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   14,
    paddingHorizontal: 16,
    gap:               10,
  },
  iconWrap: {
    flexShrink: 0,
  },
  text: {
    flex:       1,
    lineHeight: 20,
  },
  closeBtn: {
    flexShrink:   0,
    padding:      2,
  },
});
