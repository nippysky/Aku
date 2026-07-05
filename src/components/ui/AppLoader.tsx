/**
 * AppLoader — Akù branded full-screen loading screen.
 *
 * Used during app initialisation (fonts + auth) and anywhere a full-page
 * loading state is needed with brand consistency.
 *
 * Two variants:
 *   <AppLoader />              — dark forest green (default, matches onboarding)
 *   <AppLoader light />        — light linen (matches authenticated tabs)
 *   <AppLoader message="…" />  — optional label below the logo
 *   <LoadingScreen message="…" subtitle="…" /> — full page for data-load moments
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';

// ─── Animated dot ─────────────────────────────────────────────────────────────

function PulseDot({ delay, size = 8 }: { delay: number; size?: number }) {
  const scale   = useSharedValue(0.6);
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1,   { duration: 500, easing: Easing.out(Easing.ease) }),
          withTiming(0.6, { duration: 500, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1,   { duration: 500, easing: Easing.out(Easing.ease) }),
          withTiming(0.3, { duration: 500, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width:        size,
          height:       size,
          borderRadius: size / 2,
          backgroundColor: Palette.gold,
        },
        animStyle,
      ]}
    />
  );
}

// ─── AppLoader ────────────────────────────────────────────────────────────────

interface AppLoaderProps {
  /** Use the light linen background (for tab-screen contexts). Default: dark forest. */
  light?:   boolean;
  /** Optional label shown below the logo dots. */
  message?: string;
}

export function AppLoader({ light = false, message }: AppLoaderProps) {
  const bg        = light ? Palette.linen    : Palette.forest;
  const wordColor = light ? Palette.forest   : Palette.linen;
  const msgColor  = light ? Palette.gray500  : Palette.goldLight;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {/* Wordmark */}
      <View style={styles.logoRow}>
        <Text style={[styles.wordmark, { color: wordColor }]}>Akù</Text>
      </View>

      {/* Three gold dots */}
      <View style={styles.dots}>
        <PulseDot delay={0}   />
        <PulseDot delay={160} />
        <PulseDot delay={320} />
      </View>

      {message ? (
        <Text style={[styles.message, { color: msgColor }]}>{message}</Text>
      ) : null}
    </View>
  );
}

// ─── LoadingScreen ────────────────────────────────────────────────────────────
// Richer variant used for async operations (sync restore, data pull, etc.)

interface LoadingScreenProps {
  title?:    string;
  subtitle?: string;
  light?:    boolean;
}

export function LoadingScreen({
  title    = 'Loading…',
  subtitle,
  light    = false,
}: LoadingScreenProps) {
  const bg       = light ? Palette.linen   : Palette.forest;
  const titleCol = light ? Palette.forest  : Palette.linen;
  const subCol   = light ? Palette.gray500 : Palette.goldLight;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.logoRow}>
        <Text style={[styles.wordmark, { color: titleCol, opacity: 0.15 }]}>Akù</Text>
      </View>

      <View style={styles.textGroup}>
        <Text style={[styles.loadTitle, { color: titleCol }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.loadSubtitle, { color: subCol }]}>{subtitle}</Text>
        ) : null}
      </View>

      <View style={styles.dots}>
        <PulseDot delay={0}   />
        <PulseDot delay={160} />
        <PulseDot delay={320} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:             24,
  },
  logoRow: {
    alignItems: 'center',
  },
  wordmark: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['4xl'],
    letterSpacing: -1,
  },
  dots: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  message: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.sm,
    letterSpacing: 0.2,
  },
  textGroup: {
    alignItems: 'center',
    gap:        8,
  },
  loadTitle: {
    fontFamily:    FontFamily.sansMedium,
    fontSize:      FontSize.md,
    letterSpacing: 0,
  },
  loadSubtitle: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.sm,
    opacity:    0.85,
  },
});
