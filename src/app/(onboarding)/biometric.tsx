import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { OnboardingHeader } from '../../components/ui';
import { useAuthStore } from '../../store';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Spacing, Layout } from '../../theme/spacing';

// ─── Biometric Phone Illustration ──────────────────────────────────────────

function BiometricIllustration() {
  return (
    <Svg width={120} height={160} viewBox="0 0 120 160" fill="none">
      {/* Phone outline */}
      <Rect
        x={24}
        y={8}
        width={72}
        height={144}
        rx={14}
        stroke={Palette.goldLight}
        strokeWidth={2.5}
        fill="none"
      />
      {/* Home indicator */}
      <Path
        d="M50 136 L70 136"
        stroke={Palette.goldLight}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {/* Camera notch */}
      <Circle cx={60} cy={22} r={3} stroke={Palette.goldLight} strokeWidth={1.5} fill="none" />

      {/* Biometric face-scan arcs */}
      <Path
        d="M38 62 Q38 46 60 46 Q82 46 82 62"
        stroke={Palette.gold}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M38 108 Q38 124 60 124 Q82 124 82 108"
        stroke={Palette.gold}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      {/* Side verticals */}
      <Path d="M38 62 L38 76" stroke={Palette.gold} strokeWidth={2} strokeLinecap="round" />
      <Path d="M38 94 L38 108" stroke={Palette.gold} strokeWidth={2} strokeLinecap="round" />
      <Path d="M82 62 L82 76" stroke={Palette.gold} strokeWidth={2} strokeLinecap="round" />
      <Path d="M82 94 L82 108" stroke={Palette.gold} strokeWidth={2} strokeLinecap="round" />

      {/* Inner face scan details */}
      <Path
        d="M50 80 Q55 76 60 80 Q65 76 70 80"
        stroke={Palette.goldLight}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M50 95 Q60 102 70 95"
        stroke={Palette.goldLight}
        strokeWidth={1.5}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={51} cy={86} r={2} fill={Palette.goldLight} />
      <Circle cx={69} cy={86} r={2} fill={Palette.goldLight} />
    </Svg>
  );
}

// ─── Gold animated button ───────────────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function GoldButton({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 20, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 20, stiffness: 400 });
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.goldButton, animStyle]}
    >
      <Text style={styles.goldButtonLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.ghostButton}
    >
      <Text style={styles.ghostButtonLabel}>{label}</Text>
    </Pressable>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function BiometricScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { setupBiometric, biometric } = useAuthStore();

  // Detect available biometric type before setup so we can show the right label
  const [detectedFaceId, setDetectedFaceId] = useState(false);

  useEffect(() => {
    LocalAuthentication.supportedAuthenticationTypesAsync().then((types) => {
      const hasFace = types.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      );
      setDetectedFaceId(hasFace);
    }).catch(() => {
      // Default to face ID label if detection fails
      setDetectedFaceId(true);
    });
  }, []);

  // After setupBiometric runs, defer to the stored type; before that, use detected value
  const resolvedType =
    biometric.type !== 'none'
      ? biometric.type
      : detectedFaceId
      ? 'faceId'
      : 'fingerprint';

  const biometricLabel =
    resolvedType === 'faceId'
      ? 'Enable Face ID'
      : 'Enable Touch ID';

  const handleEnable = useCallback(async () => {
    await setupBiometric();
    // Navigate regardless — if biometric fails it just stays disabled
    router.push('/(onboarding)/household');
  }, [setupBiometric, router]);

  const handleSkip = useCallback(() => {
    router.push('/(onboarding)/household');
  }, [router]);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop:        insets.top + 8,
          paddingBottom:     Math.max(insets.bottom, Spacing[6]) + Spacing[4],
          paddingHorizontal: Layout.screenPadding,
        },
      ]}
    >
      <OnboardingHeader
        step={5}
        total={9}
        onBack={() => router.back()}
        dark={true}
      />

      {/* Center illustration + text */}
      <View style={styles.center}>
        <Animated.View entering={FadeInDown.delay(80).duration(600)} style={styles.illustration}>
          <BiometricIllustration />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.title}>Unlock instantly</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(280).duration(500)}>
          <Text style={styles.subtitle}>
            Use {resolvedType === 'faceId' ? 'Face ID' : 'Touch ID'} so you never have to type
            your passcode. Quick and secure.
          </Text>
        </Animated.View>
      </View>

      {/* Bottom buttons */}
      <Animated.View entering={FadeInUp.delay(380).duration(500)} style={styles.buttons}>
        <GoldButton label={biometricLabel} onPress={handleEnable} />
        <GhostButton label="Skip for now" onPress={handleSkip} />
      </Animated.View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: Palette.obsidian,
    justifyContent:  'space-between',
  },
  center: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing[6],
  },
  illustration: {
    marginBottom: Spacing[4],
  },
  title: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['3xl'],
    color:         Palette.linen,
    textAlign:     'center',
    letterSpacing: -0.5,
    lineHeight:    FontSize['3xl'] * 1.1,
  },
  subtitle: {
    fontFamily:        FontFamily.sansRegular,
    fontSize:          FontSize.base,
    color:             'rgba(250,250,248,0.55)',
    textAlign:         'center',
    lineHeight:        FontSize.base * 1.55,
    paddingHorizontal: Spacing[6],
  },
  buttons: {
    gap: Spacing[3],
  },
  goldButton: {
    height:          Layout.buttonHeightLg,
    backgroundColor: Palette.gold,
    borderRadius:    999,
    alignItems:      'center',
    justifyContent:  'center',
  },
  goldButtonLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize:   FontSize.base,
    color:      Palette.forest,
  },
  ghostButton: {
    height:         Layout.buttonHeightLg,
    alignItems:     'center',
    justifyContent: 'center',
  },
  ghostButtonLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.base,
    color:      'rgba(250,250,248,0.60)',
  },
});
