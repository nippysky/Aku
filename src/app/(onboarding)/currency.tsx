import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  FlatList,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, Check } from 'lucide-react-native';
import { Button, OnboardingHeader } from '../../components/ui';
import { useTheme } from '../../theme';
import { useUIStore } from '../../store/ui.store';
import { CURRENCIES } from '../../lib/currencies';
import type { CurrencyOption } from '../../lib/currencies';

// ─── Screen ────────────────────────────────────────────────────────────────

export default function OnboardingCurrencyScreen() {
  const { colors, spacing, text, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const currency    = useUIStore((s) => s.currency);
  const setCurrency = useUIStore((s) => s.setCurrency);

  const [selected, setSelected] = useState<CurrencyOption>(currency);
  const [query, setQuery]       = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q),
    );
  }, [query]);

  function onContinue() {
    setCurrency(selected);
    router.push('/(onboarding)/email');
  }

  function renderItem({ item }: { item: CurrencyOption }) {
    const isSelected = item.code === selected.code;
    return (
      <Pressable
        onPress={() => setSelected(item)}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: isSelected ? colors.primary + '12' : colors.card,
            borderColor:     isSelected ? colors.primary : colors.border,
            borderRadius:    radius.md,
            opacity:         pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={styles.flag}>{item.flag}</Text>
        <View style={styles.rowText}>
          <Text style={[text.bodyMedium, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[text.caption, { color: colors.textTertiary }]}>
            {item.code} · {item.symbol}
          </Text>
        </View>
        {isSelected && <Check size={17} color={colors.primary} strokeWidth={2.5} />}
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[
          styles.content,
          {
            paddingTop:        insets.top + spacing[2],
            paddingHorizontal: layout.screenPadding,
          },
        ]}
      >
        <OnboardingHeader step={2} total={6} dark={false} />

        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <Text style={[text.onboardingTitle, { color: colors.text }]}>
            What's your{'\n'}currency?
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(500)}>
          <Text style={[text.body, { color: colors.textSecondary, marginTop: spacing[3] }]}>
            Every amount in Akù will use this. You can always change it later in Settings.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(220).duration(500)}
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.inputBackground,
              borderColor:     colors.inputBorder,
              borderRadius:    radius.md,
              marginTop:       spacing[6],
            },
          ]}
        >
          <Search size={16} color={colors.textTertiary} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search currency…"
            placeholderTextColor={colors.inputPlaceholder}
            style={[text.bodySm, styles.searchInput, { color: colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </Animated.View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: spacing[3], paddingBottom: 12, gap: 8 }}
          style={{ flex: 1, marginTop: 4 }}
        />
      </View>

      <Animated.View
        entering={FadeInUp.delay(300).duration(500)}
        style={[
          styles.footer,
          {
            paddingHorizontal: layout.screenPadding,
            paddingBottom:     Math.max(insets.bottom, spacing[6]) + spacing[4],
          },
        ]}
      >
        <Button
          label={`Continue with ${selected.code}`}
          variant="primary"
          size="lg"
          fullWidth
          onPress={onContinue}
        />
      </Animated.View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  searchBar: {
    flexDirection:     'row',
    alignItems:        'center',
    borderWidth:        1,
    paddingHorizontal:  12,
    paddingVertical:    10,
    gap:                8,
  },
  searchInput: {
    flex:    1,
    padding: 0,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   12,
    paddingHorizontal: 14,
    gap:               12,
    borderWidth:       1,
    minHeight:         56,
  },
  flag: {
    fontSize:   22,
    lineHeight: 28,
    width:      30,
    textAlign:  'center',
  },
  rowText: {
    flex: 1,
    gap:  2,
  },
  footer: {
    paddingTop: 8,
  },
});
