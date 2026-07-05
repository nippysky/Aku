import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  FadeOutUp,
} from 'react-native-reanimated';
import { Plus, Search, X, Receipt } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import { BannerAmount } from '../../components/ui/CompactAmountDisplay';
import { SkeletonBanner, SkeletonCard } from '../../components/ui/Skeleton';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { BillRow } from '../../components/home/BillRow';
import { AddBillSheet } from '../../components/bills/AddBillSheet';
import { EditBillSheet } from '../../components/bills/EditBillSheet';
import { useBillsStore } from '../../store/bills.store';
import { useAuthStore } from '../../store/auth.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { FirstTimeHint } from '../../components/ui/FirstTimeHint';
import { useFirstTimeHint } from '../../hooks/useFirstTimeHint';
import type { Bill } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type SegmentKey = 'all' | 'upcoming' | 'due-today' | 'overdue' | 'paid';

const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'upcoming',  label: 'Upcoming'  },
  { key: 'due-today', label: 'Due Today' },
  { key: 'overdue',   label: 'Overdue'   },
  { key: 'paid',      label: 'Paid'      },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function filterBills(bills: Bill[], segment: SegmentKey, query: string): Bill[] {
  let filtered = bills;
  if (segment !== 'all') {
    filtered = filtered.filter((b) => b.status === segment);
  }
  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = filtered.filter(
      (b) => b.name.toLowerCase().includes(q) || b.category.toLowerCase().includes(q),
    );
  }
  return filtered.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ─── Snapshot banner (matches home screen style exactly) ─────────────────────

function SnapshotBanner({ bills }: { bills: Bill[] }) {
  const { colors, text, font, fontSize } = useTheme();
  const { fmt } = useCurrencyFormat();

  const unpaid        = bills.filter((b) => b.status !== 'paid');
  const totalUnpaid   = unpaid.reduce((s, b) => s + b.amount, 0);
  const overdueCount  = bills.filter((b) => b.status === 'overdue').length;
  const dueTodayCount = bills.filter((b) => b.status === 'due-today').length;

  if (bills.length === 0) return null;

  return (
    <Animated.View
      entering={FadeInDown.delay(0).duration(280)}
      style={styles.bannerWrap}
    >
      {Platform.OS === 'ios' && (
        <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor:
              Platform.OS === 'ios' ? 'rgba(22,58,47,0.82)' : colors.primary,
            borderRadius: 20,
          },
        ]}
      />
      <View style={{ position: 'relative' }}>
        <Text style={[text.caption, { color: 'rgba(250,250,248,0.65)', letterSpacing: 1 }]}>
          TOTAL OUTSTANDING
        </Text>
        <BannerAmount
          kobo={totalUnpaid}
          textStyle={{
            fontFamily:    font.displayLight,
            fontSize:      fontSize['3xl'],
            color:         Palette.linen,
            letterSpacing: -1,
            marginTop:     4,
          }}
        />
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
          <View>
            <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Overdue</Text>
            <Text
              style={[
                text.bodyMedium,
                {
                  color:     overdueCount > 0 ? Palette.gold : 'rgba(250,250,248,0.6)',
                  marginTop: 2,
                },
              ]}
            >
              {overdueCount} {overdueCount === 1 ? 'bill' : 'bills'}
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
          <View>
            <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Due today</Text>
            <Text style={[text.bodyMedium, { color: Palette.linen, marginTop: 2 }]}>
              {dueTodayCount} {dueTodayCount === 1 ? 'bill' : 'bills'}
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
          <View>
            <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Total</Text>
            <Text style={[text.bodyMedium, { color: Palette.linen, marginTop: 2 }]}>
              {unpaid.length} unpaid
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Pill segmented control ───────────────────────────────────────────────────

function SegmentPills({
  selected,
  onChange,
}: {
  selected: SegmentKey;
  onChange:  (key: SegmentKey) => void;
}) {
  const { colors, text, font, radius } = useTheme();

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.segmentRow}
      style={styles.segmentScroll}
    >
      {SEGMENTS.map((seg) => {
        const active = selected === seg.key;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onChange(seg.key)}
            style={[
              styles.segmentPill,
              {
                backgroundColor: active ? colors.primary : colors.backgroundSecondary,
                borderColor:     active ? colors.primary : colors.border,
                borderRadius:    radius.full,
              },
            ]}
          >
            <Text
              style={[
                text.buttonLabelSm,
                {
                  color:      active ? colors.textOnForest : colors.textSecondary,
                  fontFamily: active ? font.sansSemiBold : font.sansRegular,
                },
              ]}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Search bar ───────────────────────────────────────────────────────────────

function SearchBar({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible:  boolean;
  value:    string;
  onChange: (v: string) => void;
  onClose:  () => void;
}) {
  const { colors, text, radius } = useTheme();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) setTimeout(() => inputRef.current?.focus(), 100);
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutUp.duration(150)}
      style={styles.searchBarWrap}
    >
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: colors.inputBackground,
            borderColor:     colors.inputBorder,
            borderRadius:    radius.full,
          },
        ]}
      >
        <Search size={18} color={colors.textTertiary} strokeWidth={1.8} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder="Search bills…"
          placeholderTextColor={colors.inputPlaceholder}
          style={[text.body, styles.searchInput, { color: colors.text }]}
          clearButtonMode="while-editing"
        />
        <Pressable onPress={onClose} hitSlop={8}>
          <X size={18} color={colors.textTertiary} strokeWidth={1.8} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BillsScreen() {
  const { colors, text, font, fontSize, layout } = useTheme();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  const { bills, load: loadBills, isLoading } = useBillsStore();
  const { user } = useAuthStore();
  const hintBill = useFirstTimeHint('hint_bills_paid');

  const [segment,     setSegment]     = useState<SegmentKey>('all');
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addOpen,     setAddOpen]     = useState(false);
  const [editBill,    setEditBill]    = useState<Bill | null>(null);

  useEffect(() => {
    if (user) loadBills(user.id);
  }, [user]);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const handleReload = useCallback(() => {
    if (user) loadBills(user.id);
  }, [user, loadBills]);

  const filtered = filterBills(bills, segment, searchQuery);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, borderBottomColor: colors.borderLight },
        ]}
      >
        <Text
          style={[
            styles.headerTitle,
            { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
          ]}
        >
          Bills
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setSearchOpen((v) => !v)}
            style={[styles.headerIconBtn, { backgroundColor: colors.backgroundSecondary }]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Search size={20} color={colors.text} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            onPress={() => setAddOpen(true)}
            style={[styles.headerIconBtn, { backgroundColor: colors.backgroundSecondary }]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Add bill"
          >
            <Plus size={20} color={colors.text} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + layout.tabBarHeight + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Snapshot banner */}
        {isLoading ? <SkeletonBanner /> : <SnapshotBanner bills={bills} />}

        {/* Segment pills */}
        <View style={[styles.segmentWrap, { borderBottomColor: colors.borderLight }]}>
          <SegmentPills selected={segment} onChange={setSegment} />
        </View>

        {/* Search bar */}
        {searchOpen && (
          <SearchBar
            visible={searchOpen}
            value={searchQuery}
            onChange={setSearchQuery}
            onClose={handleSearchClose}
          />
        )}

        {/* Bills list — wrapped in Card exactly like home screen */}
        {isLoading ? (
          <SkeletonCard rows={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No bills"
            message={
              segment === 'all'
                ? 'Add your first bill to track upcoming payments'
                : `No ${segment === 'due-today' ? 'bills due today' : segment + ' bills'}`
            }
            action={{ label: 'Add Bill', onPress: () => setAddOpen(true) }}
            style={{ marginTop: 12 }}
          />
        ) : (
          <Animated.View entering={FadeInDown.delay(40).duration(280)}>
            <Card style={styles.billsCard}>
              {filtered.map((bill, idx) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  onPress={() => router.push(`/bills/${bill.id}` as never)}
                  onLongPress={() => setEditBill(bill)}
                  showStatus
                  style={idx === filtered.length - 1 ? { borderBottomWidth: 0 } : undefined}
                />
              ))}
            </Card>
          </Animated.View>
        ) }
      </ScrollView>

      {/* ── Sheets ── */}
      <AddBillSheet
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={handleReload}
      />
      <EditBillSheet
        bill={editBill}
        onClose={() => setEditBill(null)}
        onSuccess={handleReload}
      />

      <FirstTimeHint
        visible={hintBill.visible}
        onDismiss={hintBill.dismiss}
        text="Tap a bill to view details or mark it as paid."
        bottomOffset={layout.tabBarHeight + 16}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    paddingBottom:     12,
    borderBottomWidth: 1,
  },
  headerTitle:   { letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBtn: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop:        0,
    gap:               16,
  },

  // Banner
  bannerWrap: {
    borderRadius: 20,
    padding:      20,
    overflow:     'hidden',
    marginTop:    16,
  },

  // Segment pills
  segmentWrap: {
    borderBottomWidth: 1,
    marginHorizontal:  -24, // bleed to edge
    paddingHorizontal: 0,
  },
  segmentScroll: { flexShrink: 0 },
  segmentRow: {
    flexDirection:     'row',
    gap:               8,
    paddingHorizontal: 24,
    paddingVertical:   12,
  },
  segmentPill: {
    paddingHorizontal: 16,
    paddingVertical:   9,
    borderWidth:       1.5,
  },

  // Search
  searchBarWrap: {
    marginTop:    -8,
    marginBottom: 0,
  },
  searchBar: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    height:            48,
    borderWidth:       1,
    gap:               8,
  },
  searchInput: {
    flex: 1,
    includeFontPadding: false,
  } as object,

  // Bills card — matches home screen "Upcoming" card exactly
  billsCard: {
    paddingHorizontal: 16,
    paddingVertical:   8,
    borderRadius:      16,
  },
});
