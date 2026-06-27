/**
 * ExpandableFAB — radial floating action button.
 *
 * Press the main circle to expand a vertical fan of action buttons.
 * Press again (or tap the backdrop) to collapse. Apple-grade spring physics.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FABAction {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  tint:  string;   // background colour for the sub-button
  onPress: () => void;
}

interface ExpandableFABProps {
  /** Actions rendered bottom→top (index 0 = closest to FAB). */
  actions: FABAction[];
  /** Distance from the bottom of the screen (should sit above tab bar). */
  bottomInset: number;
}

// ─── Layout constants ──────────────────────────────────────────────────────

const FAB_SIZE       = 60;
const ACTION_SIZE    = 50;
const ACTION_GAP     = 14;   // vertical gap between action buttons
const ACTION_BOTTOM  = FAB_SIZE + 20; // distance from bottom of container to first action centre

// Spring config — snappy, controlled
const SPRING = { damping: 22, stiffness: 260, mass: 0.85 } as const;
// Stagger delay between each action (ms) — nearest to FAB opens first
const STAGGER = 35;

// ─── Single action button ──────────────────────────────────────────────────

interface ActionItemProps {
  action:   FABAction;
  index:    number;
  progress: { value: number };
  onPress:  () => void;
}

function ActionItem({ action, index, progress, onPress }: ActionItemProps) {
  const { colors, font, fontSize } = useTheme();
  const Icon = action.icon;

  // Each button's final bottom offset in the stack (index 0 = lowest = closest to FAB)
  const targetBottom = ACTION_BOTTOM + index * (ACTION_SIZE + ACTION_GAP);

  const containerStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [16, 0], Extrapolation.CLAMP) },
      { scale:      interpolate(progress.value, [0, 1], [0.88, 1], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Animated.View
      style={[styles.actionRow, { bottom: targetBottom }, containerStyle]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onPress}
        style={[
          styles.pill,
          {
            backgroundColor: colors.card,  // solid — clearly visible on backdrop
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 6,
          },
        ]}
        android_ripple={{ color: action.tint + '33', borderless: false }}
      >
        <View style={[styles.pillIcon, { backgroundColor: action.tint + '1A' }]}>
          <Icon size={18} color={action.tint} strokeWidth={2} />
        </View>
        <Text style={[{
          fontFamily: font.sansSemiBold,
          fontSize: fontSize.sm,
          color: action.tint,
          letterSpacing: 0.1,
        }]}>
          {action.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function ExpandableFAB({ actions, bottomInset }: ExpandableFABProps) {
  const [isOpen, setIsOpen] = useState(false);

  // One shared value drives the entire open/close animation
  const openProgress = useSharedValue(0);

  // Per-action progress values — declared individually so hooks are never
  // called inside a loop (Rules of Hooks). We support up to 5 actions;
  // only the first `actions.length` are used.
  const sv0 = useSharedValue(0);
  const sv1 = useSharedValue(0);
  const sv2 = useSharedValue(0);
  const sv3 = useSharedValue(0);
  const sv4 = useSharedValue(0);
  const ALL_SVS = [sv0, sv1, sv2, sv3, sv4];
  const actionProgress = ALL_SVS.slice(0, actions.length);

  const open = useCallback(() => {
    setIsOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    openProgress.value = withSpring(1, SPRING);
    actionProgress.forEach((ap, i) => {
      ap.value = withDelay(i * STAGGER, withSpring(1, SPRING));
    });
  }, [openProgress, sv0, sv1, sv2, sv3, sv4]);

  const close = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openProgress.value = withSpring(0, SPRING);
    const reversed = [...actionProgress].reverse();
    reversed.forEach((ap, i) => {
      ap.value = withDelay(i * STAGGER, withSpring(0, SPRING));
    });
    setTimeout(() => setIsOpen(false), actions.length * STAGGER + 200);
  }, [openProgress, sv0, sv1, sv2, sv3, sv4, actions.length]);

  const toggle = useCallback(() => {
    isOpen ? close() : open();
  }, [isOpen, open, close]);

  const handleActionPress = useCallback((action: FABAction) => {
    // Call onPress immediately so the sheet state updates before close animation
    // completes — this avoids a timing race where the sheet never gets to present.
    action.onPress();
    close();
  }, [close]);

  // Backdrop opacity — soft, not too heavy
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(openProgress.value, [0, 1], [0, 0.25], Extrapolation.CLAMP),
  }));

  // Main FAB icon rotation: 0° → 45° (+ becomes ×)
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{
      rotate: `${interpolate(openProgress.value, [0, 1], [0, 45], Extrapolation.CLAMP)}deg`,
    }],
  }));

  // Main FAB background scale — slight pulse on open
  const fabScaleStyle = useAnimatedStyle(() => ({
    transform: [{
      scale: interpolate(openProgress.value, [0, 0.5, 1], [1, 0.93, 1], Extrapolation.CLAMP),
    }],
  }));

  return (
    <>
      {/* Full-screen backdrop — tappable to dismiss */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        pointerEvents={isOpen ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      {/* FAB container — full-width so pill touches register correctly on Android */}
      <View
        style={[styles.container, { bottom: bottomInset }]}
        pointerEvents="box-none"
      >
        {/* Action pills — each absolutely positioned inside full-width container */}
        {actions.map((action, i) => (
          <ActionItem
            key={action.label}
            action={action}
            index={i}
            progress={actionProgress[i]}
            onPress={() => handleActionPress(action)}
          />
        ))}

        {/* Main FAB — pinned to right: 20 within the full-width container */}
        <Animated.View style={[styles.fab, fabScaleStyle]}>
          <Pressable
            onPress={toggle}
            style={styles.fabInner}
            hitSlop={4}
          >
            <Animated.View style={iconStyle}>
              <Plus size={26} color={Palette.gold} strokeWidth={2.2} />
            </Animated.View>
          </Pressable>
        </Animated.View>
      </View>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#0F1110',
    zIndex: 90,
  },
  // Full-width container — ensures pill touches register on Android
  container: {
    position:       'absolute',
    left:           0,
    right:          0,
    height:         600, // tall enough for all pills stacked above
    zIndex:         100,
    alignItems:     'flex-end',   // FAB stays right-aligned
    justifyContent: 'flex-end',
    paddingRight:   20,           // 20px gap from screen right edge
  },
  fab: {
    width:         FAB_SIZE,
    height:        FAB_SIZE,
    borderRadius:  FAB_SIZE / 2,
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius:  8,
    elevation:     8,
  },
  fabInner: {
    width:           FAB_SIZE,
    height:          FAB_SIZE,
    borderRadius:    FAB_SIZE / 2,
    backgroundColor: Palette.forest,
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Each pill row — right edge lines up with FAB (paddingRight: 20 on container)
  actionRow: {
    position:      'absolute',
    right:         20,            // mirrors container paddingRight
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderRadius:      100,
    // shadow applied inline above
  },
  pillIcon: {
    width:          30,
    height:         30,
    borderRadius:   15,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
