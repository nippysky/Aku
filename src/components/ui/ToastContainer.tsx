import React, { useEffect } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIStore, type Toast } from '../../store/ui.store';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';

// ─── Config per type ──────────────────────────────────────────────────────────

type ToastConfig = {
  icon:       React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  bg:         string;
  blur:       boolean;
  iconColor:  string;
  textColor:  string;
  borderColor: string;
};

function getConfig(type: Toast['type'], colors: ReturnType<typeof useTheme>['colors']): ToastConfig {
  switch (type) {
    case 'success':
      return {
        icon:        CheckCircle,
        bg:          Palette.forest,
        blur:        false,
        iconColor:   Palette.gold,
        textColor:   Palette.linen,
        borderColor: 'rgba(201,169,106,0.3)',
      };
    case 'error':
      return {
        icon:        AlertCircle,
        bg:          colors.danger,
        blur:        false,
        iconColor:   '#fff',
        textColor:   '#fff',
        borderColor: 'rgba(255,255,255,0.15)',
      };
    case 'warning':
      return {
        icon:        AlertTriangle,
        bg:          Platform.OS === 'ios' ? 'rgba(255,248,230,0.92)' : colors.warningBg,
        blur:        Platform.OS === 'ios',
        iconColor:   colors.warning,
        textColor:   colors.warning,
        borderColor: colors.warning + '40',
      };
    case 'info':
      return {
        icon:        Info,
        bg:          Platform.OS === 'ios' ? 'rgba(22,58,47,0.88)' : colors.primary,
        blur:        Platform.OS === 'ios',
        iconColor:   Palette.gold,
        textColor:   Palette.linen,
        borderColor: 'rgba(201,169,106,0.2)',
      };
  }
}

// ─── Single toast ─────────────────────────────────────────────────────────────

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const { text, font, fontSize } = useTheme();
  const { colors }  = useTheme();
  const cfg         = getConfig(toast.type, colors);
  const IconComp    = cfg.icon;

  const translateY = useSharedValue(-20);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(0,   { duration: 280, easing: Easing.out(Easing.cubic) });
    opacity.value    = withTiming(1,   { duration: 220 });
  }, []);

  const dismiss = () => {
    translateY.value = withTiming(-16, { duration: 200, easing: Easing.in(Easing.cubic) });
    opacity.value    = withTiming(0,   { duration: 180 }, (done) => {
      if (done) runOnJS(onDismiss)(toast.id);
    });
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity:   opacity.value,
  }));

  const inner = (
    <Pressable
      onPress={dismiss}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel="Dismiss"
    >
      <IconComp size={20} color={cfg.iconColor} strokeWidth={2} />
      <Text
        style={[
          styles.msg,
          { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: cfg.textColor },
        ]}
        numberOfLines={3}
      >
        {toast.message}
      </Text>
      <X size={16} color={cfg.textColor} strokeWidth={2} style={{ opacity: 0.6 }} />
    </Pressable>
  );

  return (
    <Animated.View
      style={[
        styles.toast,
        animStyle,
        {
          borderColor:  cfg.borderColor,
          overflow:     'hidden',
          borderRadius: 999,
        },
      ]}
    >
      {cfg.blur && Platform.OS === 'ios' ? (
        <BlurView intensity={70} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: cfg.bg, borderRadius: 999 },
        ]}
      />
      <View style={{ position: 'relative' }}>
        {inner}
      </View>
    </Animated.View>
  );
}

// ─── Container ────────────────────────────────────────────────────────────────

export function ToastContainer() {
  const toasts     = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);
  const insets     = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      style={[styles.container, { top: insets.top + 12 }]}
      pointerEvents="box-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left:     20,
    right:    20,
    zIndex:   9999,
    gap:      8,
    alignItems: 'stretch',
  },
  toast: {
    width:       '100%',
    borderWidth: 1,
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius:  16,
    elevation:     10,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    paddingHorizontal: 18,
    paddingVertical:   13,
  },
  msg: {
    flex:       1,
    lineHeight: 20,
  },
});
