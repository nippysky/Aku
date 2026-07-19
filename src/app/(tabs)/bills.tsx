import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
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
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import {
  Plus, Search, X, Receipt, CheckCircle2, MoreHorizontal,
  Home, Zap, Car, UtensilsCrossed, Heart, BookOpen, Tv,
  ShoppingBag, Users, PiggyBank, RefreshCw, Shield,
} from 'lucide-react-native';
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
import { useExpensesStore } from '../../store/expenses.store';
import { useAuthStore } from '../../store/auth.store';
import { useSyncStore } from '../../store/sync.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { FirstTimeHint } from '../../components/ui/FirstTimeHint';
import { useFirstTimeHint } from '../../hooks/useFirstTimeHint';
import { BILL_CATEGORIES } from '../../types';
import type { Bill } from '../../types';

const BILL_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  Home, Zap, Car, UtensilsCrossed, Heart, BookOpen, Tv,
  ShoppingBag, Users, PiggyBank, RefreshCw, Shield, MoreHorizontal,
};

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

// ─── Paid tab: ledger-sourced payment history ─────────────────────────────────
// Recurring bills reset to 'upcoming' the instant they're paid (their due date
// just advances to the next cycle) — the payment itself only lives on in the
// expense ledger. So "Paid" can't filter on bill.status; it reads the ledger.

interface PaymentRecord {
  id:       string;   // expense id
  billName: string;
  amount:   number;
  date:     string;
  category: Bill['category'] | null; // matched to a live bill, if any
}

const BILL_PAYMENT_PREFIX = 'Bill: ';

function buildPaymentHistory(allExpenses: { id: string; description: string | null; amount: number; date: string }[], bills: Bill[]): PaymentRecord[] {
  const billsByName = new Map(bills.map((b) => [b.name.toLowerCase(), b]));
  return allExpenses
    .filter((e) => e.description?.startsWith(BILL_PAYMENT_PREFIX))
    .map((e) => {
      const billName = e.description!.slice(BILL_PAYMENT_PREFIX.length);
      const match = billsByName.get(billName.toLowerCase());
      return {
        id:       e.id,
        billName,
        amount:   e.amount,
        date:     e.date,
        category: match?.category ?? null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function filterPaymentHistory(records: PaymentRecord[], query: string): PaymentRecord[] {
  if (!query.trim()) return records;
  const q = query.toLowerCase();
  return records.filter((r) => r.billName.toLowerCase().includes(q));
}

function formatPaidDate(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return 'Paid today';
    if (isYesterday(d)) return 'Paid yesterday';
    return `Paid ${format(d, 'MMM d, yyyy')}`;
  } catch {
    return `Paid ${dateStr}`;
  }
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

// ─── Payment history row (Paid tab) ───────────────────────────────────────────

function PaymentHistoryRow({ record, style }: { record: PaymentRecord; style?: object }) {
  const { colors, text, radius } = useTheme();
  const { fmt } = useCurrencyFormat();

  const meta = record.category ? BILL_CATEGORIES[record.category] : null;
  const IconComp = meta ? (BILL_ICONS[meta.icon] ?? Receipt) : Receipt;
  const iconColor = meta?.color ?? colors.textSecondary;

  return (
    <View style={[styles.paymentRow, { borderBottomColor: colors.borderLight }, style]}>
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: iconColor + '20', borderRadius: radius.full },
        ]}
      >
        <IconComp size={20} color={iconColor} strokeWidth={1.8} />
      </View>

      <View style={styles.center}>
        <Text style={[text.bodyMedium, { color: colors.text }]} numberOfLines={1}>
          {record.billName}
        </Text>
        <Text style={[text.caption, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>
          {formatPaidDate(record.date)}
        </Text>
      </View>

      <View style={styles.right}>
        <Text style={[text.amount, { color: colors.text }]}>{fmt(record.amount)}</Text>
        <View style={styles.paidBadge}>
          <CheckCircle2 size={12} color={colors.statusPaid} strokeWidth={2} />
          <Text style={[text.caption, { color: colors.statusPaid, fontSize: 11 }]}>Paid</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BillsScreen() {
  const { colors, text, font, fontSize, layout } = useTheme();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();

  const { bills, load: loadBills, isLoading } = useBillsStore();
  const { allExpenses, loadAll: loadAllExpenses } = useExpensesStore();
  const { user } = useAuthStore();
  const syncVersion = useSyncStore((s) => s.syncVersion);
  const hintBill = useFirstTimeHint('hint_bills_paid');

  const [segment,     setSegment]     = useState<SegmentKey>('all');
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addOpen,     setAddOpen]     = useState(false);
  const [editBill,    setEditBill]    = useState<Bill | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      loadBills(user.id);
      loadAllExpenses(user.id);
    }
  }, [user]);

  // ── Sync version watcher — reload silently when server pull lands ─────────
  useEffect(() => {
    if (!user || syncVersion === 0) return;
    loadBills(user.id);
    loadAllExpenses(user.id);
  }, [syncVersion]);

  const onRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    await Promise.all([loadBills(user.id), loadAllExpenses(user.id)]);
    setRefreshing(false);
  }, [user, loadBills, loadAllExpenses]);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const handleReload = useCallback(() => {
    if (user) {
      loadBills(user.id);
      loadAllExpenses(user.id);
    }
  }, [user, loadBills, loadAllExpenses]);

  const filtered = filterBills(bills, segment, searchQuery);
  const paymentHistory = filterPaymentHistory(buildPaymentHistory(allExpenses, bills), searchQuery);
  const isPaidSegment = segment === 'paid';

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
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
        {isPaidSegment ? (
          isLoading ? (
            <SkeletonCard rows={4} />
          ) : paymentHistory.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No payments yet"
              message="Bills you mark as paid show up here, logged straight to your expenses"
              style={{ marginTop: 12 }}
            />
          ) : (
            <Animated.View entering={FadeInDown.delay(40).duration(280)}>
              <Card style={styles.billsCard}>
                {paymentHistory.map((record, idx) => (
                  <PaymentHistoryRow
                    key={record.id}
                    record={record}
                    style={idx === paymentHistory.length - 1 ? { borderBottomWidth: 0 } : undefined}
                  />
                ))}
              </Card>
            </Animated.View>
          )
        ) : isLoading ? (
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

  // Payment history row (Paid tab)
  paymentRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   14,
    borderBottomWidth: 1,
  },
  iconCircle: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
    marginRight:    12,
    flexShrink:     0,
  },
  center: { flex: 1, marginRight: 10 },
  right:  { alignItems: 'flex-end', flexShrink: 0, gap: 4 },
  paidBadge: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
});
