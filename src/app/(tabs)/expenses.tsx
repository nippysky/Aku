import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Alert,
  FlatList,
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Plus,
  Upload,
  Wallet,
  TrendingUp,
  Search,
  X,
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
  Briefcase, Building2, ArrowLeftRight, RotateCcw,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { parseCSV, fromServerTransactions } from '../../lib/statement-parser';
import { setImportRows } from '../../lib/import-state';
import { parseStatementPDF } from '../../lib/api-client';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import { BannerAmount } from '../../components/ui/CompactAmountDisplay';
import { SkeletonBanner, SkeletonExpenseRow } from '../../components/ui/Skeleton';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { AddExpenseSheet } from '../../components/expenses/AddExpenseSheet';
import { EditExpenseSheet } from '../../components/expenses/EditExpenseSheet';
import { ExpenseRow } from '../../components/expenses/ExpenseRow';
import { AddIncomeSheet } from '../../components/income/AddIncomeSheet';
import { IncomeRow } from '../../components/income/IncomeRow';
import { useExpensesStore } from '../../store/expenses.store';
import { useIncomeStore } from '../../store/income.store';
import { useAuthStore } from '../../store/auth.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { FirstTimeHint } from '../../components/ui/FirstTimeHint';
import { useFirstTimeHint } from '../../hooks/useFirstTimeHint';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type ExpenseCategory,
  type IncomeCategory,
  type Expense,
  type Income,
} from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Segment = 'expenses' | 'income';
type CategoryFilter = 'all' | ExpenseCategory | IncomeCategory;

interface MonthOption {
  label: string;
  value: string;
}

interface ExpenseDateGroup {
  dateKey:   string;
  dateValue: string;
  items:     Expense[];
}

interface IncomeDateGroup {
  dateKey:   string;
  dateValue: string;
  items:     Income[];
}

type ExpenseListItem = { type: 'dateGroup'; group: ExpenseDateGroup };
type IncomeListItem  = { type: 'dateGroup'; group: IncomeDateGroup  };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMonthOptions(): MonthOption[] {
  const now = new Date();
  const opts: MonthOption[] = [];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    opts.push({
      label: `${monthNames[m]} ${y}`,
      value: `${y}-${String(m + 1).padStart(2, '0')}`,
    });
  }
  return opts;
}

function currentMonthLabel(): string {
  const now = new Date();
  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  return `${names[now.getMonth()]} ${now.getFullYear()}`;
}

function formatDateHeader(dateStr: string): string {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yStr)     return 'Yesterday';

  const [, m, d] = dateStr.split('-');
  const date = new Date(dateStr + 'T00:00:00');
  const dayNames   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dayNames[date.getDay()]} ${parseInt(d, 10)} ${monthNames[parseInt(m, 10) - 1]}`;
}

function groupExpensesByDate(expenses: Expense[]): ExpenseDateGroup[] {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    const arr = map.get(e.date) ?? [];
    arr.push(e);
    map.set(e.date, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateValue, items]) => ({ dateKey: formatDateHeader(dateValue), dateValue, items }));
}

function groupIncomeByDate(records: Income[]): IncomeDateGroup[] {
  const map = new Map<string, Income[]>();
  for (const r of records) {
    const arr = map.get(r.date) ?? [];
    arr.push(r);
    map.set(r.date, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateValue, items]) => ({ dateKey: formatDateHeader(dateValue), dateValue, items }));
}

function getTop3Expenses(byCategory: Record<ExpenseCategory, number>) {
  return (Object.entries(byCategory) as Array<[ExpenseCategory, number]>)
    .filter(([, amt]) => amt > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat, amount]) => ({ cat, amount }));
}

function getTop3Income(byCategory: Record<IncomeCategory, number>) {
  return (Object.entries(byCategory) as Array<[IncomeCategory, number]>)
    .filter(([, amt]) => amt > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 1)
    .map(([cat, amount]) => ({ cat, amount }));
}

// ─── Date group card — Expenses ───────────────────────────────────────────────

function ExpenseDateGroupCard({ group, onPress, onLongPress }: {
  group:       ExpenseDateGroup;
  onPress:     (id: string) => void;
  onLongPress: (exp: Expense) => void;
}) {
  const { colors, text } = useTheme();
  return (
    <View>
      <Text style={[styles.dateLabel, text.labelCaps, { color: colors.textSecondary }]}>
        {group.dateKey}
      </Text>
      <Card style={styles.dateCard}>
        {group.items.map((exp, idx) => (
          <View
            key={exp.id}
            style={idx < group.items.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.borderLight } : undefined}
          >
            <ExpenseRow
              expense={exp}
              onPress={() => onPress(exp.id)}
              onLongPress={() => onLongPress(exp)}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}

// ─── Date group card — Income ─────────────────────────────────────────────────

function IncomeDateGroupCard({ group, onLongPress }: {
  group:       IncomeDateGroup;
  onLongPress: (rec: Income) => void;
}) {
  const { colors, text } = useTheme();
  return (
    <View>
      <Text style={[styles.dateLabel, text.labelCaps, { color: colors.textSecondary }]}>
        {group.dateKey}
      </Text>
      <Card style={styles.dateCard}>
        {group.items.map((rec, idx) => (
          <View
            key={rec.id}
            style={idx < group.items.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.borderLight } : undefined}
          >
            <IncomeRow
              record={rec}
              onPress={() => {}}
              onLongPress={() => onLongPress(rec)}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}

const EXPENSE_CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];
const INCOME_CATEGORY_KEYS  = Object.keys(INCOME_CATEGORIES)  as IncomeCategory[];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const { colors, text, font, fontSize, radius, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // ── Expenses store ────────────────────────────────────────────────────────
  const {
    expenses, allExpenses, summary: expSummary, selectedMonth, isLoading: expLoading,
    load: loadExp, loadAll: loadAllExp, loadMonth: loadMonthExp, setMonth: setExpMonth,
  } = useExpensesStore();

  // ── Income store ──────────────────────────────────────────────────────────
  const {
    records: incRecords, allRecords: allIncRecords, summary: incSummary,
    isLoading: incLoading,
    load: loadInc, loadAll: loadAllInc, loadMonth: loadMonthInc, setMonth: setIncMonth,
  } = useIncomeStore();

  const { user }             = useAuthStore();
  const { fmt, fmtCompact }  = useCurrencyFormat();
  const hintSwipe            = useFirstTimeHint('hint_expenses_swipe');

  // ── Deep-link segment param (e.g. from home "Earned · Month" tap) ─────────
  const params = useLocalSearchParams<{ segment?: string }>();

  const [segment,        setSegment]        = useState<Segment>('expenses');
  const [viewMode,       setViewMode]       = useState<'all' | 'month'>('all');
  const [addExpOpen,     setAddExpOpen]     = useState(false);
  const [addIncOpen,     setAddIncOpen]     = useState(false);
  const [editExpense,    setEditExpense]    = useState<Expense | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [importing,      setImporting]      = useState(false);

  const monthOptions = useMemo(() => buildMonthOptions(), []);

  // ── Switch segment when navigated from home banner ────────────────────────
  useEffect(() => {
    if (params.segment === 'income' || params.segment === 'expenses') {
      setSegment(params.segment as Segment);
      setCategoryFilter('all');
      setSearchQuery('');
    }
  }, [params.segment]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (viewMode === 'all') {
      loadAllExp(user.id);
      loadAllInc(user.id);
    } else {
      loadExp(user.id);
      loadInc(user.id);
    }
  }, [user, viewMode]);

  const isLoading = segment === 'expenses' ? expLoading : incLoading;

  // ── Month handlers ────────────────────────────────────────────────────────
  const handleMonthSelect = useCallback((monthValue: string) => {
    if (!user) return;
    setViewMode('month');
    setExpMonth(monthValue);
    setIncMonth(monthValue);
    loadMonthExp(user.id, monthValue);
    loadMonthInc(user.id, monthValue);
    setCategoryFilter('all');
  }, [user, setExpMonth, setIncMonth, loadMonthExp, loadMonthInc]);

  const handleViewAll = useCallback(() => {
    if (!user) return;
    setViewMode('all');
    setCategoryFilter('all');
    loadAllExp(user.id);
    loadAllInc(user.id);
  }, [user, loadAllExp, loadAllInc]);

  const handleSuccess = useCallback(() => {
    if (!user) return;
    if (viewMode === 'all') { loadAllExp(user.id); loadAllInc(user.id); }
    else                    { loadExp(user.id);    loadInc(user.id);    }
  }, [user, viewMode, loadExp, loadAllExp, loadInc, loadAllInc]);

  // ── Segment switch ────────────────────────────────────────────────────────
  const handleSegmentChange = useCallback((seg: Segment) => {
    setSegment(seg);
    setCategoryFilter('all');
    setSearchQuery('');
  }, []);

  // ── Filtered data — Expenses ──────────────────────────────────────────────
  const sourceExpenses = viewMode === 'all' ? allExpenses : expenses;

  const filteredExpenses = useMemo(() => {
    let result = categoryFilter === 'all'
      ? sourceExpenses
      : sourceExpenses.filter((e) => e.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          (e.description ?? '').toLowerCase().includes(q) ||
          EXPENSE_CATEGORIES[e.category]?.label.toLowerCase().includes(q)
      );
    }
    return result;
  }, [sourceExpenses, categoryFilter, searchQuery]);

  const expDateGroups = useMemo(() => groupExpensesByDate(filteredExpenses), [filteredExpenses]);

  const recentlyAddedExp = useMemo(() => {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    return [...allExpenses]
      .filter((e) => new Date(e.createdAt).getTime() > cutoff)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
  }, [allExpenses]);

  // ── Filtered data — Income ────────────────────────────────────────────────
  const sourceIncome = viewMode === 'all' ? allIncRecords : incRecords;

  const filteredIncome = useMemo(() => {
    let result = categoryFilter === 'all'
      ? sourceIncome
      : sourceIncome.filter((r) => r.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          (r.description ?? '').toLowerCase().includes(q) ||
          INCOME_CATEGORIES[r.category]?.label.toLowerCase().includes(q)
      );
    }
    return result;
  }, [sourceIncome, categoryFilter, searchQuery]);

  const incDateGroups = useMemo(() => groupIncomeByDate(filteredIncome), [filteredIncome]);

  // ── Banner stats ──────────────────────────────────────────────────────────
  const totalSpent  = expSummary?.totalAmount ?? 0;
  const totalIncome = incSummary?.totalAmount ?? 0;
  const expTxCount  = sourceExpenses.length;
  const incTxCount  = sourceIncome.length;
  const top3Exp     = useMemo(() => (expSummary ? getTop3Expenses(expSummary.byCategory) : []), [expSummary]);
  const top1Inc     = useMemo(() => (incSummary ? getTop3Income(incSummary.byCategory) : []), [incSummary]);

  // ── Import handler ────────────────────────────────────────────────────────
  const handleImportStatement = useCallback(async () => {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/pdf',
               'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });
    } catch { return; }
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const name  = (asset.name ?? '').toLowerCase();
    const isPDF = name.endsWith('.pdf') || asset.mimeType === 'application/pdf';

    setImporting(true);
    try {
      if (isPDF) {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const txns = await parseStatementPDF(base64);
        if (txns.length === 0) {
          Alert.alert('No transactions found', 'The PDF could not be parsed. Ensure it\'s a standard bank statement.');
          return;
        }
        setImportRows(fromServerTransactions(txns));
      } else {
        const csvText = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const rows = parseCSV(csvText);
        if (rows.length === 0) {
          Alert.alert('No transactions found', 'Could not detect Date or Amount columns in this CSV.');
          return;
        }
        setImportRows(rows);
      }
      router.push('/import-statement' as never);
    } catch {
      Alert.alert('Import failed', 'Could not read the file. Please try again.');
    } finally {
      setImporting(false);
    }
  }, [router]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const ExpListHeader = useCallback(
    () => (
      <>
        {isLoading && <SkeletonBanner style={{ marginBottom: 8 }} />}
        {!isLoading && (
          <View style={styles.summaryBanner}>
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
                {viewMode === 'all' ? 'ALL TIME SPENT' : 'TOTAL SPENT'}
              </Text>
              <BannerAmount
                kobo={totalSpent}
                textStyle={{
                  fontFamily: font.displayLight, fontSize: fontSize['3xl'],
                  color: Palette.linen, letterSpacing: -1, marginTop: 4,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                <View>
                  <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Transactions</Text>
                  <Text style={[text.bodyMedium, { color: Palette.linen, marginTop: 2 }]}>
                    {expTxCount} {expTxCount === 1 ? 'entry' : 'entries'}
                  </Text>
                </View>
                {top3Exp[0] && (
                  <>
                    <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
                    <View>
                      <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Top category</Text>
                      <Text style={[text.bodyMedium, { color: Palette.gold, marginTop: 2 }]}>
                        {EXPENSE_CATEGORIES[top3Exp[0].cat].label}
                      </Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
                    <View>
                      <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Amount</Text>
                      <Text style={[text.bodyMedium, { color: Palette.linen, marginTop: 2 }]}>
                        {fmtCompact(top3Exp[0].amount)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Category filter pills */}
        <ScrollView
          horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow} style={styles.filterScroll}
        >
          <Pressable
            onPress={() => setCategoryFilter('all')}
            style={[
              styles.filterPill,
              {
                backgroundColor: categoryFilter === 'all' ? colors.primary : colors.backgroundSecondary,
                borderColor:     categoryFilter === 'all' ? colors.primary : colors.border,
                borderRadius:    radius.full,
              },
            ]}
          >
            <Text style={[text.buttonLabelSm, { color: categoryFilter === 'all' ? colors.textOnForest : colors.textSecondary }]}>
              All
            </Text>
          </Pressable>
          {EXPENSE_CATEGORY_KEYS.map((cat) => {
            const meta = EXPENSE_CATEGORIES[cat];
            const sel  = categoryFilter === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategoryFilter(cat)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: sel ? colors.primary : colors.backgroundSecondary,
                    borderColor:     sel ? colors.primary : colors.border,
                    borderRadius:    radius.full,
                  },
                ]}
              >
                <Text style={[text.buttonLabelSm, { color: sel ? colors.textOnForest : colors.textSecondary }]}>
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Recently added expenses */}
        {recentlyAddedExp.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={[text.labelCaps, { color: colors.textSecondary, marginBottom: 10 }]}>
              Recently Added
            </Text>
            <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
              {recentlyAddedExp.map((exp) => {
                const meta = EXPENSE_CATEGORIES[exp.category];
                return (
                  <Pressable
                    key={exp.id}
                    onPress={() => router.push(`/expenses/${exp.id}` as never)}
                    style={[styles.recentCard, { backgroundColor: colors.card, borderRadius: radius.lg }]}
                  >
                    <View style={[styles.recentDot, { backgroundColor: meta.color }]} />
                    <Text style={{ fontFamily: font.sansMedium, fontSize: 12, color: colors.text, lineHeight: 16 }} numberOfLines={1}>
                      {exp.description ?? meta.label}
                    </Text>
                    <Text style={{ fontFamily: font.sansSemiBold, fontSize: 11, color: colors.textSecondary, marginTop: 3 }} numberOfLines={1}>
                      {fmtCompact(exp.amount)}
                    </Text>
                    <Text style={{ fontFamily: font.sansRegular, fontSize: 10, color: colors.textTertiary, marginTop: 4 }}>
                      {exp.date}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </>
    ),
    [top3Exp, expTxCount, totalSpent, categoryFilter, recentlyAddedExp, viewMode, isLoading, colors, text, font, fontSize, radius, fmtCompact, router],
  );

  const IncListHeader = useCallback(
    () => (
      <>
        {isLoading && <SkeletonBanner style={{ marginBottom: 8 }} />}
        {!isLoading && (
          <View style={[styles.summaryBanner, { }]}>
            {Platform.OS === 'ios' && (
              <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFill} />
            )}
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    Platform.OS === 'ios' ? 'rgba(15,60,40,0.88)' : '#1B5E35',
                  borderRadius: 20,
                },
              ]}
            />
            <View style={{ position: 'relative' }}>
              <Text style={[text.caption, { color: 'rgba(250,250,248,0.65)', letterSpacing: 1 }]}>
                {viewMode === 'all' ? 'ALL TIME INCOME' : 'TOTAL INCOME'}
              </Text>
              <BannerAmount
                kobo={totalIncome}
                textStyle={{
                  fontFamily: font.displayLight, fontSize: fontSize['3xl'],
                  color: '#A5F3C0', letterSpacing: -1, marginTop: 4,
                }}
              />
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                <View>
                  <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Entries</Text>
                  <Text style={[text.bodyMedium, { color: Palette.linen, marginTop: 2 }]}>
                    {incTxCount} {incTxCount === 1 ? 'entry' : 'entries'}
                  </Text>
                </View>
                {top1Inc[0] && (
                  <>
                    <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
                    <View>
                      <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Top source</Text>
                      <Text style={[text.bodyMedium, { color: Palette.gold, marginTop: 2 }]}>
                        {INCOME_CATEGORIES[top1Inc[0].cat].label}
                      </Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: 'rgba(250,250,248,0.15)' }} />
                    <View>
                      <Text style={[text.caption, { color: 'rgba(250,250,248,0.55)' }]}>Amount</Text>
                      <Text style={[text.bodyMedium, { color: '#A5F3C0', marginTop: 2 }]}>
                        {fmtCompact(top1Inc[0].amount)}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Income category filter pills */}
        <ScrollView
          horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow} style={styles.filterScroll}
        >
          <Pressable
            onPress={() => setCategoryFilter('all')}
            style={[
              styles.filterPill,
              {
                backgroundColor: categoryFilter === 'all' ? colors.success : colors.backgroundSecondary,
                borderColor:     categoryFilter === 'all' ? colors.success : colors.border,
                borderRadius:    radius.full,
              },
            ]}
          >
            <Text style={[text.buttonLabelSm, { color: categoryFilter === 'all' ? '#fff' : colors.textSecondary }]}>
              All
            </Text>
          </Pressable>
          {INCOME_CATEGORY_KEYS.map((cat) => {
            const meta = INCOME_CATEGORIES[cat];
            const sel  = categoryFilter === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategoryFilter(cat)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: sel ? colors.success : colors.backgroundSecondary,
                    borderColor:     sel ? colors.success : colors.border,
                    borderRadius:    radius.full,
                  },
                ]}
              >
                <Text style={[text.buttonLabelSm, { color: sel ? '#fff' : colors.textSecondary }]}>
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </>
    ),
    [top1Inc, incTxCount, totalIncome, categoryFilter, viewMode, isLoading, colors, text, font, fontSize, radius, fmtCompact],
  );

  // Expense list renderItem
  const renderExpenseItem = useCallback(
    ({ item }: { item: ExpenseListItem }) => (
      <ExpenseDateGroupCard
        group={item.group}
        onPress={(id) => router.push(`/expenses/${id}` as never)}
        onLongPress={(exp) => setEditExpense(exp)}
      />
    ),
    [router],
  );

  // Income list renderItem
  const renderIncomeItem = useCallback(
    ({ item }: { item: IncomeListItem }) => (
      <IncomeDateGroupCard
        group={item.group}
        onLongPress={() => {}}
      />
    ),
    [],
  );

  const expListData  = useMemo(
    (): ExpenseListItem[] => expDateGroups.map((group) => ({ type: 'dateGroup', group })),
    [expDateGroups],
  );
  const incListData  = useMemo(
    (): IncomeListItem[] => incDateGroups.map((group) => ({ type: 'dateGroup', group })),
    [incDateGroups],
  );

  const expKeyExtractor = useCallback((item: ExpenseListItem) => `exp-${item.group.dateValue}`, []);
  const incKeyExtractor = useCallback((item: IncomeListItem)  => `inc-${item.group.dateValue}`,  []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, borderBottomColor: colors.borderLight },
        ]}
      >
        <Text style={[styles.headerTitle, { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text }]}>
          {segment === 'expenses' ? 'Expenses' : 'Income'}
        </Text>
        <View style={styles.headerRight}>
          <Text style={[text.bodySm, { color: colors.textSecondary }]}>
            {currentMonthLabel()}
          </Text>
          {segment === 'expenses' && (
            <Pressable
              onPress={handleImportStatement}
              disabled={importing}
              style={[styles.headerIconBtn, { backgroundColor: colors.backgroundSecondary }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Import bank statement"
            >
              <Upload size={18} color={colors.text} strokeWidth={1.8} />
            </Pressable>
          )}
          <Pressable
            onPress={() => segment === 'expenses' ? setAddExpOpen(true) : setAddIncOpen(true)}
            style={[styles.headerIconBtn, { backgroundColor: colors.backgroundSecondary }]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={segment === 'expenses' ? 'Add expense' : 'Add income'}
          >
            <Plus size={20} color={colors.text} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* ── Segment toggle ── */}
      <View style={[styles.segmentWrap, { borderBottomColor: colors.borderLight }]}>
        {(['expenses', 'income'] as Segment[]).map((seg) => {
          const active = segment === seg;
          const accent = seg === 'income' ? colors.success : colors.primary;
          return (
            <Pressable
              key={seg}
              onPress={() => handleSegmentChange(seg)}
              style={[
                styles.segmentTab,
                active && { borderBottomColor: accent, borderBottomWidth: 2 },
              ]}
            >
              <Text
                style={[
                  text.buttonLabelSm,
                  {
                    color:      active ? accent : colors.textSecondary,
                    fontFamily: active ? font.sansSemiBold : font.sansRegular,
                  },
                ]}
              >
                {seg === 'expenses' ? 'Expenses' : 'Income'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Search bar ── */}
      <View style={[styles.searchRow, { borderBottomColor: colors.borderLight }]}>
        <View style={[styles.searchInput, { backgroundColor: colors.backgroundSecondary, borderRadius: 99 }]}>
          <Search size={15} color={colors.textTertiary} strokeWidth={2} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={segment === 'expenses' ? 'Search expenses…' : 'Search income…'}
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchText, { color: colors.text, fontFamily: font.sansRegular, fontSize: fontSize.sm }]}
            returnKeyType="search"
            clearButtonMode="never"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
              <X size={14} color={colors.textTertiary} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Month chips ── */}
      <View style={[styles.monthScrollWrap, { borderBottomColor: colors.borderLight }]}>
        <ScrollView
          horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthRow}
        >
          <Pressable
            onPress={handleViewAll}
            style={[
              styles.monthChip,
              {
                backgroundColor: viewMode === 'all' ? colors.primary : colors.backgroundSecondary,
                borderColor:     viewMode === 'all' ? colors.primary : colors.border,
                borderRadius:    100,
              },
            ]}
          >
            <Text style={[text.buttonLabelSm, { color: viewMode === 'all' ? colors.textOnForest : colors.textSecondary }]}>
              All time
            </Text>
          </Pressable>
          {monthOptions.map((opt) => {
            const selected = viewMode === 'month' && selectedMonth === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => handleMonthSelect(opt.value)}
                style={[
                  styles.monthChip,
                  {
                    backgroundColor: selected ? colors.primary : colors.backgroundSecondary,
                    borderColor:     selected ? colors.primary : colors.border,
                    borderRadius:    100,
                  },
                ]}
              >
                <Text style={[text.buttonLabelSm, { color: selected ? colors.textOnForest : colors.textSecondary }]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── List ── */}
      {segment === 'expenses' ? (
        <FlatList
          data={expListData}
          keyExtractor={expKeyExtractor}
          renderItem={renderExpenseItem}
          style={{ flex: 1 }}
          ListHeaderComponent={ExpListHeader}
          ListEmptyComponent={
            isLoading ? (
              <View style={{ gap: 0 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <SkeletonExpenseRow key={i} style={{ paddingHorizontal: 0, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.06)' }} />
                ))}
              </View>
            ) : (
              <EmptyState
                icon={Wallet}
                title="No expenses yet"
                message="Tap + to add your first expense"
                action={{ label: 'Add Expense', onPress: () => setAddExpOpen(true) }}
                style={{ marginTop: 24 }}
              />
            )
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + layout.tabBarHeight + 24 }]}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={incListData}
          keyExtractor={incKeyExtractor}
          renderItem={renderIncomeItem}
          style={{ flex: 1 }}
          ListHeaderComponent={IncListHeader}
          ListEmptyComponent={
            isLoading ? (
              <View style={{ gap: 0 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <SkeletonExpenseRow key={i} style={{ paddingHorizontal: 0, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.06)' }} />
                ))}
              </View>
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="No income recorded"
                message="Tap + to record your first income entry"
                action={{ label: 'Add Income', onPress: () => setAddIncOpen(true) }}
                style={{ marginTop: 24 }}
              />
            )
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + layout.tabBarHeight + 24 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Sheets ── */}
      <AddExpenseSheet
        isOpen={addExpOpen}
        onClose={() => setAddExpOpen(false)}
        onSuccess={handleSuccess}
      />
      <EditExpenseSheet
        expense={editExpense}
        onClose={() => setEditExpense(null)}
        onSuccess={handleSuccess}
      />
      <AddIncomeSheet
        isOpen={addIncOpen}
        onClose={() => setAddIncOpen(false)}
        onSuccess={handleSuccess}
      />

      <FirstTimeHint
        visible={hintSwipe.visible}
        onDismiss={hintSwipe.dismiss}
        text="Long-press any entry to edit or delete it."
        bottomOffset={layout.tabBarHeight + 16}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    paddingBottom:     12,
    borderBottomWidth: 1,
  },
  headerTitle: { letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },

  // Segment toggle
  segmentWrap: {
    flexDirection:     'row',
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  segmentTab: {
    flex:              1,
    alignItems:        'center',
    paddingVertical:   12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },

  // Search
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderBottomWidth: 1,
  },
  searchInput: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 9, gap: 8,
  },
  searchText: { flex: 1 },

  // Month chips
  monthScrollWrap: { borderBottomWidth: 1, flexShrink: 0, overflow: 'visible' },
  monthRow: {
    flexDirection: 'row', gap: 8,
    paddingLeft: 24, paddingRight: 24, paddingTop: 14, paddingBottom: 14,
  },
  monthChip: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1.5 },

  // Summary banner
  summaryBanner: {
    marginTop: 16, marginBottom: 8, borderRadius: 20, padding: 20, overflow: 'hidden',
  },

  // Category filter
  filterScroll: { marginTop: 4, flexShrink: 0 },
  filterRow: { flexDirection: 'row', gap: 8, paddingVertical: 10 },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1.5 },

  // Recently added
  recentSection: { marginTop: 16, marginBottom: 4 },
  recentRow: { flexDirection: 'row', gap: 10 },
  recentCard: { padding: 12, minWidth: 130, maxWidth: 170 },
  recentDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },

  // List
  listContent: { paddingTop: 8, paddingHorizontal: 24, gap: 16 },
  dateLabel: { fontSize: 12, marginBottom: 8, marginTop: 4 },
  dateCard: { paddingHorizontal: 16, paddingVertical: 8 },
});
