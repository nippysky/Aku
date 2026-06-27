import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useTheme } from '../theme';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { APP_ICON_VARIANTS, type AppIconVariant } from '../lib/app-icons';

// ─── Types ────────────────────────────────────────────────────────────────────

type SetAlternateIconFn = (iconName: string | null) => Promise<void>;
type GetAlternateIconFn = () => Promise<string | null>;

// ─── Conditional import ───────────────────────────────────────────────────────
// expo-alternate-app-icons is only available on iOS native builds.

let setAlternateAppIconAsync: SetAlternateIconFn | null = null;
let getAlternateAppIconAsync: GetAlternateIconFn | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-alternate-app-icons') as {
    setAlternateAppIconAsync: SetAlternateIconFn;
    getAlternateAppIconAsync: GetAlternateIconFn;
  };
  setAlternateAppIconAsync = mod.setAlternateAppIconAsync;
  getAlternateAppIconAsync = mod.getAlternateAppIconAsync;
} catch {
  // Not installed or not on iOS — handled gracefully at call-sites
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppIconScreen() {
  const { colors, font, fontSize, text, radius, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeId, setActiveId] = useState<string>('default');
  const [loading,  setLoading]  = useState<string | null>(null);

  // Load current icon on mount
  useEffect(() => {
    if (Platform.OS === 'ios' && getAlternateAppIconAsync) {
      getAlternateAppIconAsync()
        .then((name) => { setActiveId(name ?? 'default'); })
        .catch(() => {});
    }
  }, []);

  const handleSelect = useCallback(async (variant: AppIconVariant) => {
    if (variant.id === activeId) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (Platform.OS !== 'ios') {
      Alert.alert(
        'iOS Only',
        'Custom app icons are only available on iPhone. Your icon will be updated when you install the app on iOS.',
      );
      return;
    }

    if (!setAlternateAppIconAsync) {
      Alert.alert(
        'Build Required',
        'App icon switching requires a native build. Run `eas build` to enable this feature.',
      );
      return;
    }

    try {
      setLoading(variant.id);
      const iconName = variant.isDefault ? null : variant.id;
      await setAlternateAppIconAsync(iconName);
      setActiveId(variant.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Failed', 'Could not change app icon. Please try again.');
    } finally {
      setLoading(null);
    }
  }, [activeId]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="App Icon"
        leftAction={{ icon: ArrowLeft, onPress: () => router.back() }}
        style={{ paddingTop: insets.top }}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Subheading */}
        <Text style={[text.body, { color: colors.textSecondary, marginBottom: 28 }]}>
          Choose the Akù icon that feels like you.
        </Text>

        {/* Icon grid — 2 columns */}
        <View style={styles.grid}>
          {APP_ICON_VARIANTS.map((variant) => {
            const isActive  = variant.id === activeId;
            const isLoading = loading === variant.id;

            return (
              <Pressable
                key={variant.id}
                onPress={() => { void handleSelect(variant); }}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor:     isActive ? variant.accent : colors.border,
                    borderRadius:    radius.xl,
                    borderWidth:     isActive ? 2 : 1,
                    ...shadow.sm,
                  },
                ]}
              >
                {/* Icon preview swatch */}
                <View
                  style={[
                    styles.iconPreview,
                    { backgroundColor: variant.bg, borderRadius: 22 },
                  ]}
                >
                  <Text style={[styles.iconText, { color: variant.accent }]}>
                    Akù
                  </Text>
                  {isLoading && (
                    <ActivityIndicator
                      size="small"
                      color={variant.accent}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                </View>

                {/* Name + description */}
                <View style={styles.cardInfo}>
                  <View style={styles.cardNameRow}>
                    <Text
                      style={[{
                        fontFamily: font.sansSemiBold,
                        fontSize:   fontSize.sm,
                        color:      colors.text,
                      }]}
                    >
                      {variant.label}
                    </Text>
                    {isActive && (
                      <View
                        style={[
                          styles.checkBadge,
                          {
                            backgroundColor: variant.accent + '22',
                            borderRadius:    100,
                          },
                        ]}
                      >
                        <Check size={11} color={variant.accent} strokeWidth={2.5} />
                      </View>
                    )}
                  </View>
                  <Text
                    style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}
                    numberOfLines={2}
                  >
                    {variant.description}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* iOS-only note */}
        {Platform.OS !== 'ios' && (
          <View
            style={[
              styles.note,
              { backgroundColor: colors.backgroundSecondary, borderRadius: radius.lg },
            ]}
          >
            <Text
              style={[text.caption, { color: colors.textSecondary, textAlign: 'center', lineHeight: 18 }]}
            >
              Custom app icons are an iOS feature. Your selection will apply when you install Akù on iPhone.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           14,
  },
  card: {
    width:   '47%',
    padding: 14,
    gap:     12,
  },
  iconPreview: {
    width:          '100%',
    aspectRatio:    1,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
    maxHeight:      130,
  },
  iconText: {
    fontSize:      28,
    fontFamily:    'Fraunces_300Light',
    letterSpacing: -1,
  },
  cardInfo: {
    gap: 2,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  checkBadge: {
    width:          18,
    height:         18,
    alignItems:     'center',
    justifyContent: 'center',
  },
  note: {
    marginTop: 24,
    padding:   16,
  },
});
