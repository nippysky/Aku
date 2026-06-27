import React, { useCallback, useImperativeHandle, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Delete } from 'lucide-react-native';
import { useTheme } from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PinPadRef {
  triggerError: () => void;
}

interface PinPadProps {
  onComplete: (pin: string) => void;
  title:      string;
  subtitle?:  string;
  pinLength?: number;
  darkMode?:  boolean;
}

// ─── PIN Dot ──────────────────────────────────────────────────────────────────

interface PinDotProps {
  filled:    boolean;
  darkMode?: boolean;
}

function PinDot({ filled, darkMode = false }: PinDotProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (filled) {
      scale.value = withSequence(
        withSpring(1.3, { damping: 10, stiffness: 600 }),
        withSpring(1, { damping: 15, stiffness: 300 }),
      );
    }
  }, [filled, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const emptyBorder = darkMode ? 'rgba(250,250,248,0.4)' : colors.borderStrong;

  return (
    <Animated.View
      style={[
        styles.dot,
        animStyle,
        {
          backgroundColor: filled ? '#C9A96A' : 'transparent',
          borderColor:     filled ? '#C9A96A' : emptyBorder,
        },
      ]}
    />
  );
}

// ─── Key ──────────────────────────────────────────────────────────────────────

interface KeyProps {
  label:       string | React.ReactNode;
  onPress:     () => void;
  disabled?:   boolean;
  isBackspace?: boolean;
  isSpecial?:  boolean;
  darkMode?:   boolean;
}

function Key({ label, onPress, disabled = false, isBackspace = false, isSpecial = false, darkMode = false }: KeyProps) {
  const { colors, font, fontSize } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.92, { damping: 20, stiffness: 500 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 20, stiffness: 400 });
  }, [scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const keyBg     = darkMode ? 'rgba(255,255,255,0.08)' : colors.backgroundSecondary;
  const keyBorder = darkMode ? 'rgba(255,255,255,0.12)' : colors.border;
  const labelColor = darkMode ? '#FAFAF8' : colors.text;
  const deleteColor = darkMode ? '#FAFAF8' : colors.text;

  return (
    <Animated.View style={[styles.keyWrapper, animStyle]}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={disabled ? undefined : handlePressIn}
        onPressOut={disabled ? undefined : handlePressOut}
        accessibilityRole="button"
        style={[
          styles.key,
          {
            backgroundColor: isSpecial || isBackspace ? 'transparent' : keyBg,
            borderColor:     isSpecial || isBackspace ? 'transparent' : keyBorder,
          },
        ]}
      >
        {isBackspace ? (
          <Delete size={22} color={deleteColor} strokeWidth={1.8} />
        ) : (
          <Text
            style={[
              styles.keyLabel,
              {
                fontFamily: font.sansRegular,
                fontSize:   fontSize.xl,
                color:      isSpecial ? (darkMode ? 'rgba(250,250,248,0.4)' : colors.textTertiary) : labelColor,
              },
            ]}
          >
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const PIN_LENGTH = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', 'del'];

export const PinPad = React.forwardRef<PinPadRef, PinPadProps>(
  function PinPad({ onComplete, title, subtitle, pinLength = PIN_LENGTH, darkMode = false }, ref) {
    const { colors, text, font, fontSize, spacing } = useTheme();
    const [pin, setPin] = useState<string[]>([]);
    const dotsX = useSharedValue(0);

    const titleColor    = darkMode ? '#FAFAF8' : colors.text;
    const subtitleColor = darkMode ? 'rgba(250,250,248,0.6)' : colors.textSecondary;

    // Expose triggerError via ref
    useImperativeHandle(ref, () => ({
      triggerError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        // Shake: left-right oscillation
        dotsX.value = withSequence(
          withTiming(-10, { duration: 60 }),
          withTiming(10, { duration: 60 }),
          withTiming(-8, { duration: 55 }),
          withTiming(8, { duration: 55 }),
          withTiming(-4, { duration: 50 }),
          withTiming(0, { duration: 50 }),
        );
        // Clear pin after error
        setTimeout(() => setPin([]), 400);
      },
    }));

    const dotsAnimStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: dotsX.value }],
    }));

    const handleKey = useCallback(
      (key: string) => {
        if (key === 'del') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setPin((prev) => prev.slice(0, -1));
          return;
        }

        if (key === '*') return; // special key, no action

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        setPin((prev) => {
          const next = [...prev, key];
          if (next.length === pinLength) {
            // Defer so state updates first
            setTimeout(() => onComplete(next.join('')), 50);
            return next;
          }
          return next;
        });
      },
      [onComplete, pinLength],
    );

    return (
      <View style={styles.container}>
        {/* Title */}
        <View style={styles.header}>
          <Text
            style={[
              text.screenTitle,
              { color: titleColor, textAlign: 'center' },
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                text.bodySm,
                styles.subtitle,
                { color: subtitleColor },
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* PIN dots */}
        <Animated.View style={[styles.dotsRow, dotsAnimStyle]}>
          {Array.from({ length: pinLength }).map((_, i) => (
            <PinDot key={i} filled={i < pin.length} darkMode={darkMode} />
          ))}
        </Animated.View>

        {/* Number grid */}
        <View style={styles.grid}>
          {KEYS.map((key) => (
            <Key
              key={key}
              label={key}
              onPress={() => handleKey(key)}
              isBackspace={key === 'del'}
              isSpecial={key === '*'}
              darkMode={darkMode}
              disabled={
                key !== 'del' && key !== '*' && pin.length >= pinLength
              }
            />
          ))}
        </View>
      </View>
    );
  },
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 48,
    gap: 16,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 300,
    gap: 12,
    justifyContent: 'center',
  },
  keyWrapper: {
    width: 88,
    height: 88,
  },
  key: {
    flex: 1,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  keyLabel: {
    includeFontPadding: false,
  } as object,
});
