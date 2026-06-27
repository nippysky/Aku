import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Search } from 'lucide-react-native';
import { useTheme } from '../theme';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Divider } from '../components/ui/Divider';
import { useUIStore } from '../store/ui.store';
import { CURRENCIES } from '../lib/currencies';
import type { CurrencyOption } from '../lib/currencies';

export default function CurrencyScreen() {
  const { colors, text, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const currency    = useUIStore((s) => s.currency);
  const setCurrency = useUIStore((s) => s.setCurrency);

  const [query, setQuery] = useState('');

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

  function handleSelect(item: CurrencyOption) {
    setCurrency(item);
    router.back();
  }

  function renderItem({ item, index }: { item: CurrencyOption; index: number }) {
    const isFirst    = index === 0;
    const isLast     = index === filtered.length - 1;
    const isSelected = item.code === currency.code;

    return (
      <>
        <Pressable
          onPress={() => handleSelect(item)}
          android_ripple={{ color: colors.borderLight }}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.card,
              borderTopLeftRadius:     isFirst ? radius.lg : 0,
              borderTopRightRadius:    isFirst ? radius.lg : 0,
              borderBottomLeftRadius:  isLast  ? radius.lg : 0,
              borderBottomRightRadius: isLast  ? radius.lg : 0,
              opacity: pressed ? 0.7 : 1,
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
          {isSelected && (
            <Check size={17} color={colors.primary} strokeWidth={2.5} />
          )}
        </Pressable>
        {!isLast && (
          <View style={{ backgroundColor: colors.card }}>
            <Divider style={{ marginLeft: 56 }} />
          </View>
        )}
      </>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Currency"
        leftAction={{
          icon: ArrowLeft,
          onPress: () => router.back(),
          accessibilityLabel: 'Back',
        }}
        style={{ paddingTop: insets.top }}
      />

      {/* Search bar */}
      <View style={[styles.searchWrap, { paddingHorizontal: 16, paddingBottom: 12 }]}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: radius.md,
            },
          ]}
        >
          <Search size={16} color={colors.textTertiary} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search currency…"
            placeholderTextColor={colors.textTertiary}
            style={[text.bodySm, styles.searchInput, { color: colors.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={[
          styles.flatList,
          {
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            marginHorizontal: 16,
          },
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[text.bodySm, { color: colors.textTertiary }]}>
              No currencies match "{query}"
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  searchWrap: {},
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    padding: 0,
  },
  flatList: {},
  list: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
    minHeight: 60,
  },
  flag: {
    fontSize: 24,
    lineHeight: 30,
    width: 32,
    textAlign: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  empty: {
    paddingVertical: 32,
    alignItems: 'center',
  },
});
