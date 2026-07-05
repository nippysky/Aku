/**
 * currency-rates.tsx — Live exchange rates screen
 *
 * Shows the live rate of every currency in the app relative to the user's
 * selected display currency.  Rates are fetched from:
 *   https://api.exchangerate-api.com/v4/latest/USD
 * and cached for 1 h in ui.store.  A manual refresh button forces a re-fetch.
 *
 * Rate calculation:
 *   If the user's display currency is NGN and USD-base rates are:
 *     USD→NGN = 1500,  USD→GBP = 0.79
 *   Then 1 NGN = (1/1500) USD = (1/1500) × 0.79 GBP = 0.000527 GBP
 *   Equivalently: 1 NGN → GBP = rates['GBP'] / rates['NGN']
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, RefreshCw, Search, TrendingUp } from 'lucide-react-native';
import { useTheme } from '../theme';
import { useUIStore } from '../store/ui.store';
import { CURRENCIES, type CurrencyOption } from '../lib/currencies';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(ms: number | null): string {
  if (!ms) return 'Never';
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ', ' + d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/**
 * Compute 1 unit of `baseCurrency` expressed in `targetCode`.
 * Both rates are USD-based numbers from the API.
 * Returns null if rates are missing.
 */
function getRate(
  rates:      Record<string, number> | null,
  baseCode:   string,
  targetCode: string,
): number | null {
  if (!rates) return null;
  const baseUSD   = rates[baseCode];
  const targetUSD = rates[targetCode];
  if (!baseUSD || !targetUSD) return null;
  // 1 baseCode = (1/baseUSD) USD = targetUSD/baseUSD targetCode
  return targetUSD / baseUSD;
}

function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  if (rate <= 0)     return '0';
  if (rate >= 1000)  return rate.toLocaleString('en', { maximumFractionDigits: 2 });
  if (rate >= 1)     return rate.toFixed(4);
  if (rate >= 0.01)  return rate.toFixed(5);
  if (rate >= 0.001) return rate.toFixed(6);
  // Never use scientific notation — compute enough decimal places for 4 sig figs
  const places = Math.min(Math.ceil(-Math.log10(rate)) + 3, 12);
  return rate.toFixed(places);
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function RateRow({
  currency,
  rate,
  isBase,
  colors,
  text,
  font,
  fontSize,
  isLast,
}: {
  currency: CurrencyOption;
  rate:     number | null;
  isBase:   boolean;
  colors:   ReturnType<typeof useTheme>['colors'];
  text:     ReturnType<typeof useTheme>['text'];
  font:     ReturnType<typeof useTheme>['font'];
  fontSize: ReturnType<typeof useTheme>['fontSize'];
  isLast:   boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        {
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.borderLight,
        },
      ]}
    >
      {/* Flag + code + name */}
      <View style={styles.rowLeft}>
        <Text style={styles.flag}>{currency.flag}</Text>
        <View style={styles.rowLabels}>
          <Text style={[{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }]}>
            {currency.code}
          </Text>
          <Text style={[text.caption, { color: colors.textTertiary, marginTop: 1 }]} numberOfLines={1}>
            {currency.name}
          </Text>
        </View>
      </View>

      {/* Rate */}
      <View style={styles.rowRight}>
        {isBase ? (
          <Text style={[{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.primary }]}>
            Base
          </Text>
        ) : rate === null ? (
          <Text style={[text.caption, { color: colors.textTertiary }]}>—</Text>
        ) : (
          <>
            <Text style={[{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }]}>
              {currency.symbol}{formatRate(rate)}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CurrencyRatesScreen() {
  const { colors, text, font, fontSize, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const {
    currency,
    exchangeRates,
    ratesFetchedAt,
    fetchExchangeRates,
  } = useUIStore();

  const [search,      setSearch]      = useState('');
  const [refreshing,  setRefreshing]  = useState(false);

  // Fetch rates when the screen mounts (lazy — not on cold start)
  useEffect(() => { void fetchExchangeRates(); }, []);

  // The base code is the user's selected display currency
  const baseCode = currency.code;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Force re-fetch by clearing the timestamp in the store
    useUIStore.setState({ ratesFetchedAt: null });
    await fetchExchangeRates();
    setRefreshing(false);
  }, [fetchExchangeRates]);

  // Filter CURRENCIES by search term
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q),
    );
  }, [search]);

  // Build rows with pre-computed rates
  const rows = useMemo(
    () =>
      filtered.map((c) => ({
        ...c,
        rate:   getRate(exchangeRates, baseCode, c.code),
        isBase: c.code === baseCode,
      })),
    [filtered, exchangeRates, baseCode],
  );

  const noRates = !exchangeRates;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.borderLight }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <ArrowLeft size={22} color={colors.text} strokeWidth={1.8} />
        </Pressable>
        <Text style={[{ fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text }]}>
          Exchange Rates
        </Text>
        <Pressable onPress={handleRefresh} hitSlop={8} style={styles.headerBtn} disabled={refreshing}>
          {refreshing
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <RefreshCw size={20} color={colors.primary} strokeWidth={1.8} />}
        </Pressable>
      </View>

      {/* ── Banner ── */}
      <Animated.View
        entering={FadeInDown.delay(0).duration(280)}
        style={[styles.banner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '22' }]}
      >
        <TrendingUp size={18} color={colors.primary} strokeWidth={1.8} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.primary }]}>
            1 {currency.flag} {currency.code} = ?
          </Text>
          <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
            {noRates
              ? 'Rates unavailable — tap refresh to load'
              : `Updated ${formatTimestamp(ratesFetchedAt)} · Source: exchangerate-api.com`}
          </Text>
        </View>
      </Animated.View>

      {/* ── Search ── */}
      <Animated.View
        entering={FadeInDown.delay(60).duration(280)}
        style={[styles.searchWrap, { paddingHorizontal: layout.screenPadding }]}
      >
        <View style={[styles.searchBar, { backgroundColor: colors.inputBackground, borderColor: colors.border, borderRadius: radius.lg }]}>
          <Search size={16} color={colors.textTertiary} strokeWidth={1.8} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search currency or code…"
            placeholderTextColor={colors.inputPlaceholder}
            style={[styles.searchInput, { color: colors.text, fontFamily: font.sansRegular, fontSize: fontSize.sm }]}
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
        </View>
      </Animated.View>

      {/* ── List ── */}
      <FlatList
        data={rows}
        keyExtractor={(c) => c.code}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        renderItem={({ item, index }) => (
          <RateRow
            currency={item}
            rate={item.rate}
            isBase={item.isBase}
            colors={colors}
            text={text}
            font={font}
            fontSize={fontSize}
            isLast={index === rows.length - 1}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[text.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              No currencies match "{search}"
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingBottom:     12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },

  banner: {
    flexDirection:  'row',
    alignItems:     'center',
    marginHorizontal: 16,
    marginTop:      16,
    padding:        14,
    borderRadius:   14,
    borderWidth:    1,
  },

  searchWrap: {
    marginTop:    12,
    marginBottom: 8,
  },
  searchBar: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 12,
    paddingVertical:   10,
    borderWidth:    1,
    gap:            8,
  },
  searchInput: {
    flex:   1,
    height: 20,
    padding: 0,
  },

  listContent: {
    paddingHorizontal: 16,
  },

  row: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    flex:          1,
    gap:           12,
  },
  flag: {
    fontSize: 26,
    width:    32,
    textAlign: 'center',
  },
  rowLabels: {
    flex: 1,
  },
  rowRight: {
    alignItems:  'flex-end',
    minWidth:    90,
  },

  empty: {
    paddingTop:    60,
    alignItems:    'center',
  },
});
