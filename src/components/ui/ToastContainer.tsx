import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIStore, Toast } from '../../store/ui.store';
import { useTheme } from '../../theme';

// ─── Single Toast Item ────────────────────────────────────────────────────────

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const { colors, text, font, radius, spacing } = useTheme();
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);

  // Slide in on mount
  useEffect(() => {
    translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
    opacity.value = withTiming(1, { duration: 200 });
  }, [opacity, translateY]);

  const dismiss = () => {
    translateY.value = withTiming(-80, { duration: 250 });
    opacity.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(onDismiss)(toast.id);
      }
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  // Colors per type
  const { bg, border: borderColor, textColor, dotColor } = (() => {
    switch (toast.type) {
      case 'success':
        return {
          bg:        colors.successBg,
          border:    colors.success,
          textColor: colors.success,
          dotColor:  colors.success,
        };
      case 'error':
        return {
          bg:        colors.dangerBg,
          border:    colors.danger,
          textColor: colors.danger,
          dotColor:  colors.danger,
        };
      case 'warning':
        return {
          bg:        colors.warningBg,
          border:    colors.warning,
          textColor: colors.warning,
          dotColor:  colors.warning,
        };
      case 'info':
        return {
          bg:        colors.backgroundSecondary,
          border:    colors.primary,
          textColor: colors.text,
          dotColor:  colors.primary,
        };
    }
  })();

  return (
    <Animated.View
      style={[
        styles.toast,
        animatedStyle,
        {
          backgroundColor: bg,
          borderColor,
          borderRadius: radius.md,
        },
      ]}
    >
      <Pressable
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notification"
        style={styles.toastPressable}
      >
        {/* Accent bar */}
        <View style={[styles.accentBar, { backgroundColor: dotColor }]} />

        {/* Message */}
        <Text
          style={[
            text.bodyMedium,
            styles.message,
            { color: textColor },
          ]}
          numberOfLines={3}
        >
          {toast.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        { top: insets.top + 8 },
      ]}
      pointerEvents="box-none"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={removeToast}
        />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    width: '100%',
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  toastPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    paddingLeft: 0,
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 12,
    marginLeft: 0,
    minHeight: 20,
  },
  message: {
    flex: 1,
    lineHeight: 20,
  },
});
