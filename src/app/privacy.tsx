import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ExternalLink } from 'lucide-react-native';
import { useTheme } from '../theme';
import { ScreenHeader } from '../components/ui/ScreenHeader';

const PRIVACY_URL = 'https://nippysky.com/ventures/aku/privacy';

export default function PrivacyScreen() {
  const { colors, text, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  function handleOpenBrowser() {
    Linking.openURL(PRIVACY_URL).catch(() => {
      // silently fail — URL is well-formed
    });
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Privacy Policy"
        leftAction={{
          icon: ArrowLeft,
          onPress: () => router.back(),
          accessibilityLabel: 'Back',
        }}
        style={{ paddingTop: insets.top }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[text.bodySm, styles.description, { color: colors.textSecondary }]}>
          Our full Privacy Policy explains how Akù collects, uses, and protects your personal data.
        </Text>

        <Pressable
          onPress={handleOpenBrowser}
          style={[
            styles.openBtn,
            {
              backgroundColor: colors.primary,
              borderRadius: 999,
            },
          ]}
        >
          <ExternalLink size={16} color={colors.textOnForest} strokeWidth={2} />
          <Text style={[text.buttonLabel, { color: colors.textOnForest, marginLeft: 8 }]}>
            Read Privacy Policy
          </Text>
        </Pressable>

        <Text style={[text.caption, styles.urlText, { color: colors.textTertiary }]}>
          {PRIVACY_URL}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: 'center',
    gap: 20,
  },
  description: {
    textAlign: 'center',
    lineHeight: 22,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  urlText: {
    textAlign: 'center',
  },
});
