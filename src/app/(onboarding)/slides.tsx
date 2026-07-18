/**
 * slides.tsx — Onboarding carousel (4 slides)
 *
 * Shown after the welcome splash, before name entry.
 * Four slides with SVG illustrations, Fraunces headlines,
 * subtle animated page dots, Skip + Next/Get Started controls.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  FadeIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Rect } from 'react-native-svg';
import { Palette } from '../../theme/colors';
import { FontFamily, FontSize } from '../../theme/typography';
import { Layout } from '../../theme/spacing';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Colour tokens (forest theme) ────────────────────────────────────────────

const C = {
  bg:          Palette.forest,
  gold:        Palette.gold,
  linen:       Palette.linen,
  textPrimary: Palette.linen,
  textSub:     'rgba(250,250,248,0.62)',
  dot:         'rgba(250,250,248,0.30)',
  dotActive:   Palette.linen,
  btnBg:       Palette.linen,
  btnLabel:    Palette.forest,
};

// ─── SVG Illustrations ────────────────────────────────────────────────────────

/** Slide 1: Track everything — stylised ledger + coins */
function IllustrationTrack() {
  return (
    <Svg width={220} height={200} viewBox="0 0 220 200" fill="none">
      {/* Receipt / card */}
      <Rect x={44} y={30} width={132} height={148} rx={14}
        fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
      {/* Title bar */}
      <Rect x={60} y={52} width={60} height={8} rx={4} fill="rgba(255,255,255,0.25)" />
      {/* Amount big */}
      <Rect x={60} y={70} width={100} height={14} rx={5} fill={C.gold} opacity={0.85} />
      {/* Row lines */}
      {[100, 118, 136, 154].map((y, i) => (
        <React.Fragment key={y}>
          <Rect x={60} y={y} width={36} height={6} rx={3}
            fill="rgba(255,255,255,0.20)" />
          <Rect x={120 + (i % 2 ? -8 : 0)} y={y} width={40} height={6} rx={3}
            fill="rgba(255,255,255,0.15)" />
        </React.Fragment>
      ))}
      {/* Coin stack top-right */}
      {[0, 5, 10].map((d) => (
        <Ellipse key={d} cx={168} cy={44 - d} rx={18} ry={7}
          fill={d === 10 ? C.gold : 'rgba(212,175,55,0.50)'}
          stroke={C.gold} strokeWidth={0.8} />
      ))}
      {/* Sparkle dots */}
      <Circle cx={30}  cy={90}  r={3} fill={C.gold} opacity={0.5} />
      <Circle cx={195} cy={130} r={4} fill={C.gold} opacity={0.4} />
      <Circle cx={55}  cy={188} r={2.5} fill={C.gold} opacity={0.35} />
    </Svg>
  );
}

/** Slide 2: Build goals — progress arc + target */
function IllustrationGoals() {
  // Arc: cx=110 cy=100 r=70, stroke-dasharray SVG trick
  const R       = 72;
  const CX      = 110;
  const CY      = 108;
  const CIRC    = 2 * Math.PI * R;
  const filled  = CIRC * 0.68;

  return (
    <Svg width={220} height={200} viewBox="0 0 220 200" fill="none">
      {/* Track */}
      <Circle cx={CX} cy={CY} r={R}
        stroke="rgba(255,255,255,0.12)" strokeWidth={10} fill="none"
        strokeLinecap="round" />
      {/* Progress arc */}
      <Circle cx={CX} cy={CY} r={R}
        stroke={C.gold} strokeWidth={10} fill="none"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${CIRC - filled}`}
        strokeDashoffset={CIRC * 0.25}  /* start from top */
      />
      {/* Centre label */}
      <Rect x={88} y={92} width={44} height={10} rx={5} fill={C.linen} opacity={0.9} />
      <Rect x={96} y={108} width={28} height={7} rx={3.5} fill="rgba(255,255,255,0.35)" />
      {/* Target flag pole */}
      <Line x1={168} y1={44} x2={168} y2={86} stroke="rgba(255,255,255,0.30)" strokeWidth={2} strokeLinecap="round" />
      <Polygon points="168,44 186,52 168,60" fill={C.gold} opacity={0.75} />
      {/* Accent dots */}
      <Circle cx={36}  cy={58}  r={3.5} fill={C.gold} opacity={0.4} />
      <Circle cx={188} cy={160} r={3}   fill={C.gold} opacity={0.35} />
    </Svg>
  );
}

/** Slide 4: Private by design — shield + lock */
function IllustrationPrivacy() {
  return (
    <Svg width={220} height={200} viewBox="0 0 220 200" fill="none">
      {/* Outer glow ring */}
      <Circle cx={110} cy={100} r={82}
        stroke="rgba(212,175,55,0.10)" strokeWidth={20} fill="none" />
      {/* Shield body */}
      <Path
        d="M110 28 L158 50 L158 102 Q158 144 110 172 Q62 144 62 102 L62 50 Z"
        fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.22)" strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* Inner shield glow */}
      <Path
        d="M110 42 L146 60 L146 100 Q146 132 110 154 Q74 132 74 100 L74 60 Z"
        fill="rgba(212,175,55,0.08)" stroke={C.gold} strokeWidth={1}
        strokeLinejoin="round" opacity={0.6}
      />
      {/* Lock body */}
      <Rect x={97} y={100} width={26} height={22} rx={5}
        fill={C.gold} opacity={0.85} />
      {/* Lock shackle */}
      <Path
        d="M101 100 L101 92 Q101 82 110 82 Q119 82 119 92 L119 100"
        stroke={C.gold} strokeWidth={3.5} fill="none"
        strokeLinecap="round" opacity={0.85}
      />
      {/* Keyhole */}
      <Circle cx={110} cy={109} r={3.5} fill={Palette.forest} opacity={0.6} />
      <Rect x={108.5} y={111} width={3} height={5} rx={1.5}
        fill={Palette.forest} opacity={0.6} />
      {/* Stars */}
      {[
        [44, 68],  [176, 60], [44, 148], [180, 150],
      ].map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={i % 2 === 0 ? 3 : 2}
          fill={C.gold} opacity={i % 2 === 0 ? 0.38 : 0.24} />
      ))}
    </Svg>
  );
}

// ─── Slide data ───────────────────────────────────────────────────────────────

interface Slide {
  key:         string;
  Illustration: () => React.ReactElement;
  headline:    string;
  body:        string;
}

const SLIDES: Slide[] = [
  {
    key:          'track',
    Illustration: IllustrationTrack,
    headline:     'Everything in one place',
    body:         'Log expenses, bills, and income in seconds. No spreadsheets. No guesswork. Just clarity.',
  },
  {
    key:          'goals',
    Illustration: IllustrationGoals,
    headline:     'Build goals that stick',
    body:         'Set a target, track your progress, and watch your savings grow — one contribution at a time.',
  },
  {
    key:          'private',
    Illustration: IllustrationPrivacy,
    headline:     'Private by design',
    body:         "Your data is encrypted end-to-end. No ads. No data selling. It’s your money — we just help you manage it.",
  },
];

// ─── Dot component ────────────────────────────────────────────────────────────

function Dot({ active }: { active: boolean }) {
  const width = useSharedValue(active ? 24 : 7);

  React.useEffect(() => {
    width.value = withSpring(active ? 24 : 7, { damping: 18, stiffness: 220 });
  }, [active, width]);

  const style = useAnimatedStyle(() => ({
    width:           width.value,
    height:          7,
    borderRadius:    4,
    backgroundColor: active ? C.dotActive : C.dot,
    marginHorizontal: 3,
  }));

  return <Animated.View style={style} />;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function SlidesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeIdx, setActiveIdx]   = useState(0);
  const flatRef = useRef<FlatList<Slide>>(null);

  const nextScale = useSharedValue(1);

  const onViewRef = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0] != null) {
      setActiveIdx(viewableItems[0].index ?? 0);
    }
  });
  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const handleNext = useCallback(() => {
    if (activeIdx < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: activeIdx + 1, animated: true });
    } else {
      router.push('/(onboarding)/name');
    }
  }, [activeIdx, router]);

  const handleSkip = useCallback(() => {
    router.push('/(onboarding)/name');
  }, [router]);

  const isLast = activeIdx === SLIDES.length - 1;

  const nextAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: nextScale.value }],
  }));

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) + 8 }]}>

        {/* Skip */}
        {!isLast && (
          <Animated.View entering={FadeIn.duration(400)} style={[styles.skipWrap, { top: insets.top + 14 }]}>
            <Pressable onPress={handleSkip} hitSlop={12} style={styles.skipBtn}>
              <Text style={styles.skipLabel}>Skip</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Slide list */}
        <FlatList<Slide>
          ref={flatRef}
          data={SLIDES}
          keyExtractor={(s) => s.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewRef.current}
          viewabilityConfig={viewConfigRef.current}
          renderItem={({ item, index }) => (
            <SlideItem slide={item} index={index} activeIndex={activeIdx} />
          )}
          style={styles.list}
        />

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Dot key={i} active={i === activeIdx} />
          ))}
        </View>

        {/* CTA */}
        <View style={[styles.footer, { paddingHorizontal: 24 }]}>
          <AnimatedPressable
            onPress={handleNext}
            onPressIn={() => { nextScale.value = withSpring(0.97, { damping: 20, stiffness: 400 }); }}
            onPressOut={() => { nextScale.value = withSpring(1, { damping: 20, stiffness: 400 }); }}
            accessibilityRole="button"
            style={[nextAnimStyle, styles.nextBtn]}
          >
            <Text style={styles.nextLabel}>
              {isLast ? 'Get started' : 'Next'}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    </>
  );
}

// ─── Slide item ───────────────────────────────────────────────────────────────

function SlideItem({ slide, index, activeIndex }: { slide: Slide; index: number; activeIndex: number }) {
  const opacity = useSharedValue(index === 0 ? 1 : 0.4);
  const ty      = useSharedValue(index === 0 ? 0 : 16);

  React.useEffect(() => {
    const isActive = index === activeIndex;
    opacity.value  = withTiming(isActive ? 1 : 0.4, { duration: 300 });
    ty.value       = withTiming(isActive ? 0 : 16,  { duration: 300 });
  }, [activeIndex, index, opacity, ty]);

  const animStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: ty.value }],
  }));

  const { Illustration, headline, body } = slide;

  return (
    <Animated.View style={[styles.slide, animStyle]}>
      {/* Illustration */}
      <View style={styles.illustrationWrap}>
        <Illustration />
      </View>

      {/* Text */}
      <View style={styles.textWrap}>
        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.bodyText}>{body}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex:            1,
    backgroundColor: C.bg,
    alignItems:      'center',
  },
  skipWrap: {
    position: 'absolute',
    right:    24,
    zIndex:   10,
  },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical:   8,
  },
  skipLabel: {
    fontFamily: FontFamily.sansRegular,
    fontSize:   FontSize.sm,
    color:      C.textSub,
  },
  list: {
    flex: 1,
  },
  slide: {
    width:          SCREEN_W,
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  illustrationWrap: {
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   40,
  },
  textWrap: {
    alignItems: 'center',
    gap:        16,
  },
  headline: {
    fontFamily:    FontFamily.displayLight,
    fontSize:      FontSize['3xl'],
    color:         C.textPrimary,
    textAlign:     'center',
    letterSpacing: -0.8,
    lineHeight:    FontSize['3xl'] * 1.18,
  },
  bodyText: {
    fontFamily:  FontFamily.sansRegular,
    fontSize:    FontSize.base,
    color:       C.textSub,
    textAlign:   'center',
    lineHeight:  FontSize.base * 1.65,
  },
  dots: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      28,
    marginBottom:   20,
  },
  footer: {
    width: '100%',
  },
  nextBtn: {
    height:          Layout.buttonHeightLg,
    backgroundColor: C.btnBg,
    borderRadius:    999,
    alignItems:      'center',
    justifyContent:  'center',
  },
  nextLabel: {
    fontFamily:    FontFamily.sansSemiBold,
    fontSize:      FontSize.base,
    color:         C.btnLabel,
    letterSpacing: 0,
  },
});
