import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  FadeOutUp,
  Layout,
} from 'react-native-reanimated';
import { Plus, Search, X, Receipt } from 'lucide-react-native';
import { useTheme } from '../../theme';
import { EmptyState } from '../../components/ui/EmptyState';
import { BillRow } from '../../components/home/BillRow';
import { AddBillSheet } from '../../components/bills/AddBillSheet';
import { EditBillSheet } from '../../components/bills/EditBillSheet';
import { useBillsStore } from '../../store/bills.store';
import { useAuthStore } from '../../store/auth.store';
import type { Bill, BillStatus } from '../../types';

// ─── Segment types ────────────────────────────────────────────────────────────

type SegmentKey = 'all' | 'upcoming' | 'due-today' | 'overdue' | 'paid';

interface Segment {
  key:   SegmentKey;
  label: string;
}

const SEGMENTS: Segment[] = [
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
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q),
    );
  }

  return filtered.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ─── Segmented control ────────────────────────────────────────────────────────

interface SegmentedControlProps {
  selected:  SegmentKey;
  onChange:  (key: SegmentKey) => void;
}

function SegmentedControl({ selected, onChange }: SegmentedControlProps) {
  const { colors, text, font, radius } = useTheme();

  return (
    <View style={styles.segmentContainer}>
      {SEGMENTS.map((seg) => {
        const isActive = selected === seg.key;
        return (
          <Pressable
            key={seg.key}
            onPress={() => onChange(seg.key)}
            style={[
              styles.segmentBtn,
              isActive && {
                backgroundColor: colors.primary,
                borderRadius:    100,
              },
            ]}
          >
            <Text
              style={[
                text.buttonLabelSm,
                {
                  color:      isActive ? colors.textOnForest : colors.textSecondary,
                  fontFamily: isActive ? font.sansSemiBold : font.sansRegular,
                },
              ]}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Search bar ───────────────────────────────────────────────────────────────

interface SearchBarProps {
  visible:   boolean;
  value:     string;
  onChange:  (v: string) => void;
  onClose:   () => void;
}

function SearchBar({ visible, value, onChange, onClose }: SearchBarProps) {
  const { colors, text, radius } = useTheme();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOutUp.springify()}
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
          placeholder="Search bills..."
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

  const { bills, load: loadBills } = useBillsStore();
  const { user } = useAuthStore();

  const [segment,      setSegment]      = useState<SegmentKey>('all');
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [addOpen,      setAddOpen]      = useState(false);
  const [editBill,     setEditBill]     = useState<Bill | null>(null);

  useEffect(() => {
    if (user) loadBills(user.id);
  }, [user]);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const filtered = filterBills(bills, segment, searchQuery);

  const renderItem = useCallback(({ item }: { item: Bill }) => (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      layout={Layout.springify()}
    >
      <BillRow
        bill={item}
        onPress={() => router.push(`/bills/${item.id}` as never)}
        showStatus
        style={styles.billRowItem}
      />
    </Animated.View>
  ), [router]);

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
          >
            <Search size={20} color={colors.text} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            onPress={() => setAddOpen(true)}
            style={[styles.headerIconBtn, { backgroundColor: colors.backgroundSecondary }]}
            hitSlop={6}
          >
            <Plus size={20} color={colors.text} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* ── Segment control ── */}
      <View style={[styles.segmentWrap, { borderBottomColor: colors.borderLight }]}>
        <SegmentedControl selected={segment} onChange={setSegment} />
      </View>

      {/* ── Search bar ── */}
      {searchOpen && (
        <SearchBar
          visible={searchOpen}
          value={searchQuery}
          onChange={setSearchQuery}
          onClose={handleSearchClose}
        />
      )}

      {/* ── Bills list ── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + layout.tabBarHeight + 24 },
        ]}
        ListEmptyComponent={
          <EmptyState
            icon={Receipt}
            title="No bills"
            message={
              segment === 'all'
                ? 'Add your first bill to track upcoming payments'
                : `No ${segment === 'due-today' ? 'bills due today' : segment + ' bills'}`
            }
            action={{
              label:   'Add Bill',
              onPress: () => setAddOpen(true),
            }}
          />
        }
        showsVerticalScrollIndicator={false}
        style={{ paddingHorizontal: 24 }}
      />

      {/* ── Sheets ── */}
      <AddBillSheet
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => user && loadBills(user.id)}
      />
      <EditBillSheet
        bill={editBill}
        onClose={() => setEditBill(null)}
        onSuccess={() => user && loadBills(user.id)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 24,
    paddingBottom:    12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  headerIconBtn: {
    width:          40,
    height:         40,
    borderRadius:   20,
    alignItems:     'center',
    justifyContent: 'center',
  },
  segmentWrap: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical:   12,
  },
  segmentContainer: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            4,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical:   8,
  },
  searchBarWrap: {
    paddingHorizontal: 24,
    paddingVertical:   10,
  },
  searchBar: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 14,
    height:          48,
    borderWidth:     1,
    gap:             8,
  },
  searchInput: {
    flex: 1,
    includeFontPadding: false,
  } as object,
  listContent: {
    paddingTop: 8,
  },
  billRowItem: {
    marginHorizontal: 0,
  },
});
