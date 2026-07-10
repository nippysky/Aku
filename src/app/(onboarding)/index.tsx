import React, { useCallback, useEffect } from 'react';
import {
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path, Ellipse } from 'react-native-svg';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Layout } from '../../theme/spacing';

// ─── Akù "A" Monogram SVG ──────────────────────────────────────────────────

function AkuMonogram() {
  return (
    <Svg width={140} height={140} viewBox="0 0 140 140" fill="none">
      {/* Left leg — very thick, bold */}
      <Path
        d="M70 20 L18 122"
        stroke={Palette.gold}
        strokeWidth={14}
        strokeLinecap="round"
      />
      {/* Right leg */}
      <Path
        d="M70 20 L122 122"
        stroke={Palette.gold}
        strokeWidth={14}
        strokeLinecap="round"
      />
      {/* Straight crossbar */}
      <Path
        d="M38 83 L102 83"
        stroke={Palette.gold}
        strokeWidth={11}
        strokeLinecap="round"
      />
      {/* Apostrophe — filled teardrop above apex, right side */}
      <Ellipse
        cx={86}
        cy={13}
        rx={6.5}
        ry={10}
        fill={Palette.gold}
        transform="rotate(-8, 86, 13)"
      />
    </Svg>
  );
}

// ─── Animated Pressable ────────────────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Screen ────────────────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scale  = useSharedValue(1);

  // Entrance animations
  const logoOpacity      = useSharedValue(0);
  const logoScale        = useSharedValue(0.72);
  const textTranslateY   = useSharedValue(32);
  const textOpacity      = useSharedValue(0);
  const buttonOpacity    = useSharedValue(0);
  const buttonTranslateY = useSharedValue(20);

  useEffect(() => {
    logoOpacity.value      = withDelay(120, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    logoScale.value        = withDelay(120, withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.08)) }));
    textTranslateY.value   = withDelay(520, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
    textOpacity.value      = withDelay(520, withTiming(1, { duration: 600 }));
    buttonOpacity.value    = withDelay(820, withTiming(1, { duration: 500 }));
    buttonTranslateY.value = withDelay(820, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  const logoAnimStyle = useAnimatedStyle(() => ({
    opacity:   logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const textAnimStyle = useAnimatedStyle(() => ({
    opacity:   textOpacity.value,
    transform: [{ translateY: textTranslateY.value }],
  }));

  const buttonContainerStyle = useAnimatedStyle(() => ({
    opacity:   buttonOpacity.value,
    transform: [{ translateY: buttonTranslateY.value }],
  }));

  const buttonScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.97, { damping: 20, stiffness: 400 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 20, stiffness: 400 });
  }, [scale]);

  return (
    <>
      <StatusBar barStyle="light-content" />
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) + 16 },
      ]}
    >
      {/* Center block */}
      <View style={styles.center}>
        <Animated.View style={logoAnimStyle}>
          <AkuMonogram />
        </Animated.View>

        <Animated.View style={[styles.textGroup, textAnimStyle]}>
          <Text style={styles.wordmark}>Akù</Text>
          <Text style={styles.tagline}>
            Plan your money.{'\n'}Own your future.
          </Text>
        </Animated.View>
      </View>

      {/* Bottom CTA */}
      <Animated.View style={[styles.bottomSection, buttonContainerStyle]}>
        <Animated.View style={buttonScaleStyle}>
          <AnimatedPressable
            onPress={() => router.push('/(onboarding)/slides' as never)}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            accessibilityRole="button"
            accessibilityLabel="Get started"
            style={styles.ctaButton}
          >
            <Text style={styles.ctaLabel}>Get started</Text>
          </AnimatedPressable>
        </Animated.View>

        <Pressable
          onPress={() => router.push('/sign-in')}
          accessibilityRole="button"
          accessibilityLabel="Sign in to existing account"
          style={styles.signInLink}
        >
          <Text style={styles.signInText}>
            Already have an account?{' '}
            <Text style={styles.signInTextBold}>Sign in</Text>
          </Text>
        </Pressable>
      </Animated.View>
    </View>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.forest,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },
  textGroup: {
    alignItems: 'center',
    gap: 14,
  },
  wordmark: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['4xl'],
    color:         Palette.gold,
    letterSpacing: -1,
  },
  tagline: {
    fontFamily:  FontFamily.sansRegular,
    fontSize:    FontSize.md,
    color:       'rgba(250,250,248,0.60)',
    textAlign:   'center',
    lineHeight:  FontSize.md * 1.55,
  },
  bottomSection: {
    width: '100%',
    paddingHorizontal: 24,
  },
  ctaButton: {
    height:          Layout.buttonHeightLg,
    backgroundColor: Palette.linen,
    borderRadius:    999,
    alignItems:      'center',
    justifyContent:  'center',
  },
  ctaLabel: {
    fontFamily:    FontFamily.sansSemiBold,
    fontSize:      FontSize.base,
    color:         Palette.forest,
    letterSpacing: 0,
  },
  signInLink: {
    alignItems:    'center',
    paddingTop:    20,
    paddingBottom: 4,
  },
  signInText: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.sm,
    color:      'rgba(250,250,248,0.50)',
  },
  signInTextBold: {
    fontFamily: FontFamily.sansSemiBold,
    color:      'rgba(250,250,248,0.80)',
  },
});
