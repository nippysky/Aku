/**
 * import-statement.tsx — Unified bank statement review screen
 *
 * Every row is either credit (green +) or debit (dark −).
 * Import saves credits → income store, debits → expenses store.
 * Auto-categorised from description keywords; user can override.
 * Long-press any row to edit description, amount, date, or flip credit↔debit.
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import {
  Check,
  ChevronLeft,
  Pencil,
  // expense icons
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
  RefreshCw, Shield,
  // income icons
  Briefcase, Building2, TrendingUp, ArrowLeftRight, RotateCcw,
  // UI
  TrendingDown, TrendingUp as IncomeArrow,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { AkuDatePicker } from '../components/ui/AkuDatePicker';
import { AmountInput } from '../components/ui/AmountInput';
import { getImportRows, clearImportRows } from '../lib/import-state';
import type { ImportRow, TxnType } from '../lib/statement-parser';
import { guessCategory } from '../lib/statement-parser';
import { useExpensesStore } from '../store/expenses.store';
import { useIncomeStore }   from '../store/income.store';
import { useAuthStore }     from '../store/auth.store';
import { useUIStore }       from '../store/ui.store';
import { useCurrencyFormat } from '../hooks/useCurrencyFormat';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type ExpenseCategory,
  type IncomeCategory,
} from '../types';

// ─── Icon maps ────────────────────────────────────────────────────────────────

const EXPENSE_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
  RefreshCw, Shield,
};

const INCOME_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  Briefcase, Zap, Building2, TrendingUp, Home, ArrowLeftRight, RotateCcw, MoreHorizontal,
};

const INCOME_GREEN = '#3DAA6B';

// ─── Category picker modal ────────────────────────────────────────────────────

interface CatPickerProps {
  visible:  boolean;
  type:     TxnType;
  current:  string;
  onSelect: (cat: string) => void;
  onClose:  () => void;
}

function CategoryPickerModal({ visible, type, current, onSelect, onClose }: CatPickerProps) {
  const { colors, text, font, fontSize, radius } = useTheme();
  const isIncome = type === 'credit';
  const catMap   = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const iconMap  = isIncome ? INCOME_ICONS       : EXPENSE_ICONS;
  const cats     = Object.keys(catMap) as (IncomeCategory | ExpenseCategory)[];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.xl }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { fontFamily: font.displayLight, fontSize: fontSize.lg, color: colors.text }]}>
            {isIncome ? 'Income category' : 'Expense category'}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
            <View style={styles.catGrid}>
              {cats.map((cat) => {
                const meta     = catMap[cat as keyof typeof catMap];
                const IconComp = iconMap[meta.icon] ?? MoreHorizontal;
                const selected = cat === current;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => { onSelect(cat); onClose(); }}
                    style={[
                      styles.catItem,
                      {
                        backgroundColor: selected ? meta.color + '22' : colors.backgroundSecondary,
                        borderColor:     selected ? meta.color        : colors.border,
                        borderRadius:    radius.md,
                      },
                    ]}
                  >
                    <View style={[styles.catIconWrap, { backgroundColor: meta.color + '20', borderRadius: radius.full }]}>
                      <IconComp size={18} color={meta.color} strokeWidth={1.8} />
                    </View>
                    <Text
                      style={[
                        text.caption,
                        {
                          color:      selected ? meta.color : colors.textSecondary,
                          fontFamily: selected ? font.sansSemiBold : font.sansRegular,
                          marginTop:  4,
                          textAlign:  'center',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Edit row modal ───────────────────────────────────────────────────────────

interface EditRowModalProps {
  visible:  boolean;
  row:      ImportRow | null;
  onSave:   (updated: Partial<ImportRow>) => void;
  onClose:  () => void;
}

function EditRowModal({ visible, row, onSave, onClose }: EditRowModalProps) {
  const { colors, text, font, fontSize, radius } = useTheme();

  const [desc,      setDesc]      = useState('');
  const [amount,    setAmount]    = useState(0);
  const [date,      setDate]      = useState('');
  const [type,      setType]      = useState<TxnType>('debit');
  const [dateOpen,  setDateOpen]  = useState(false);

  // Sync from row whenever it changes
  useEffect(() => {
    if (row) {
      setDesc(row.description);
      setAmount(row.amount);
      setDate(row.date);
      setType(row.type);
    }
  }, [row]);

  const handleSave = () => {
    if (!row) return;
    const newType = type;
    const newCat  = newType !== row.type
      ? guessCategory(newType, desc)
      : row.category;
    onSave({ description: desc.trim() || row.description, amount, date, type: newType, category: newCat });
    onClose();
  };

  const prettyDate = (iso: string) => {
    try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
  };

  if (!row) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.editCard, { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.xl }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[{ fontFamily: font.displayLight, fontSize: fontSize.lg, color: colors.text, marginBottom: 16 }]}>
            Edit transaction
          </Text>

          {/* Description */}
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>Description</Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            style={[
              styles.editInput,
              {
                backgroundColor: colors.backgroundSecondary,
                borderColor:     colors.border,
                borderRadius:    radius.md,
                color:           colors.text,
                fontFamily:      font.sansRegular,
                fontSize:        fontSize.md,
              },
            ]}
            placeholderTextColor={colors.textTertiary}
          />

          {/* Amount */}
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6, marginTop: 14 }]}>Amount</Text>
          <AmountInput value={amount} onChange={setAmount} />

          {/* Date */}
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6, marginTop: 14 }]}>Date</Text>
          <Pressable
            onPress={() => setDateOpen(true)}
            style={[
              styles.editInput,
              {
                backgroundColor: colors.backgroundSecondary,
                borderColor:     colors.border,
                borderRadius:    radius.md,
              },
            ]}
          >
            <Text style={[{ color: colors.text, fontFamily: font.sansRegular, fontSize: fontSize.md }]}>
              {prettyDate(date)}
            </Text>
          </Pressable>

          {/* Type toggle */}
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8, marginTop: 14 }]}>Type</Text>
          <View style={[styles.typeToggle, { backgroundColor: colors.backgroundSecondary, borderRadius: radius.full }]}>
            {(['debit', 'credit'] as TxnType[]).map((t) => {
              const active = type === t;
              const label  = t === 'credit' ? 'Income (+)' : 'Expense (−)';
              const color  = t === 'credit' ? INCOME_GREEN : colors.primary;
              return (
                <Pressable
                  key={t}
                  onPress={() => setType(t)}
                  style={[
                    styles.typeTab,
                    { borderRadius: radius.full },
                    active && { backgroundColor: color },
                  ]}
                >
                  <Text style={[text.bodySm, { color: active ? '#fff' : colors.textSecondary }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Actions */}
          <View style={styles.editActions}>
            <Pressable
              onPress={onClose}
              style={[styles.editBtn, { backgroundColor: colors.backgroundSecondary, borderRadius: radius.full }]}
            >
              <Text style={[text.bodyMedium, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={[styles.editBtn, { backgroundColor: colors.primary, borderRadius: radius.full }]}
            >
              <Text style={[text.bodyMedium, { color: '#fff' }]}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>

      <AkuDatePicker
        isOpen={dateOpen}
        value={date}
        onChange={(d) => { setDate(d); setDateOpen(false); }}
        onClose={() => setDateOpen(false)}
        title="Transaction date"
      />
    </Modal>
  );
}

// ─── Row item ─────────────────────────────────────────────────────────────────

interface RowItemProps {
  row:        ImportRow;
  onToggle:   (id: string) => void;
  onCatPress: (id: string) => void;
  onEdit:     (id: string) => void;
}

function RowItem({ row, onToggle, onCatPress, onEdit }: RowItemProps) {
  const { colors, text, font, fontSize, radius } = useTheme();
  const { fmt } = useCurrencyFormat();

  const isCredit = row.type === 'credit';
  const catMap   = isCredit ? INCOME_CATEGORIES  : EXPENSE_CATEGORIES;
  const iconMap  = isCredit ? INCOME_ICONS        : EXPENSE_ICONS;
  const meta     = catMap[row.category as keyof typeof catMap] ?? catMap['other' as keyof typeof catMap];
  const IconComp = iconMap[meta?.icon ?? 'MoreHorizontal'] ?? MoreHorizontal;
  const amtColor  = isCredit ? INCOME_GREEN : colors.text;
  const amtPrefix = isCredit ? '+' : '−';

  let displayDate = row.date;
  try { displayDate = format(parseISO(row.date), 'd MMM yyyy'); } catch { /* raw */ }

  return (
    <View
      style={[
        styles.rowWrap,
        { borderBottomColor: colors.borderLight, opacity: row.selected ? 1 : 0.38 },
      ]}
    >
      {/* Checkbox */}
      <Pressable onPress={() => onToggle(row.id)} style={styles.checkboxWrap} hitSlop={8}>
        <View
          style={[
            styles.checkbox,
            {
              borderColor:     row.selected ? colors.primary : colors.border,
              backgroundColor: row.selected ? colors.primary : 'transparent',
              borderRadius:    4,
            },
          ]}
        >
          {row.selected && <Check size={12} color="#fff" strokeWidth={3} />}
        </View>
      </Pressable>

      {/* Credit / debit badge */}
      <View
        style={[
          styles.typeBadge,
          { backgroundColor: (isCredit ? INCOME_GREEN : colors.textTertiary) + '18', borderRadius: 6 },
        ]}
      >
        {isCredit
          ? <IncomeArrow size={13} color={INCOME_GREEN} strokeWidth={2} />
          : <TrendingDown size={13} color={colors.textTertiary} strokeWidth={2} />
        }
      </View>

      {/* Info */}
      <View style={styles.rowInfo}>
        <Text style={[text.bodyMedium, { color: colors.text }]} numberOfLines={1}>
          {row.description}
        </Text>
        <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
          {displayDate}
        </Text>
      </View>

      {/* Right: amount + category chip + edit */}
      <View style={styles.rowRight}>
        <Text style={[text.bodyMedium, { color: amtColor, fontFamily: font.sansSemiBold }]}>
          {amtPrefix}{fmt(row.amount)}
        </Text>
        <View style={styles.rowRightBottom}>
          <Pressable
            onPress={() => onCatPress(row.id)}
            style={[
              styles.catChip,
              { backgroundColor: (meta?.color ?? colors.textTertiary) + '20', borderRadius: radius.full },
            ]}
            hitSlop={4}
          >
            <IconComp size={11} color={meta?.color ?? colors.textTertiary} strokeWidth={2} />
            <Text style={[text.caption, { color: meta?.color ?? colors.textTertiary, fontFamily: font.sansMedium, fontSize: fontSize.xs }]}>
              {meta?.label ?? 'Other'}
            </Text>
          </Pressable>
          <Pressable onPress={() => onEdit(row.id)} hitSlop={8} style={styles.editIcon}>
            <Pencil size={12} color={colors.textTertiary} strokeWidth={1.8} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Summary banner ───────────────────────────────────────────────────────────

function SummaryBanner({ rows }: { rows: ImportRow[] }) {
  const { colors, text, font } = useTheme();
  const { fmt } = useCurrencyFormat();

  const selected = rows.filter(r => r.selected);
  const earned   = selected.filter(r => r.type === 'credit').reduce((s, r) => s + r.amount, 0);
  const spent    = selected.filter(r => r.type === 'debit').reduce((s, r) => s + r.amount, 0);
  const net      = earned - spent;
  const isPos    = net >= 0;

  return (
    <View style={[styles.banner, { backgroundColor: colors.backgroundSecondary, borderBottomColor: colors.borderLight }]}>
      <View style={styles.bannerItem}>
        <Text style={[text.caption, { color: colors.textTertiary }]}>Earned</Text>
        <Text style={[text.bodyMedium, { color: INCOME_GREEN, fontFamily: font.sansSemiBold }]}>{fmt(earned)}</Text>
      </View>
      <View style={[styles.bannerDivider, { backgroundColor: colors.borderLight }]} />
      <View style={styles.bannerItem}>
        <Text style={[text.caption, { color: colors.textTertiary }]}>Spent</Text>
        <Text style={[text.bodyMedium, { color: colors.text, fontFamily: font.sansSemiBold }]}>{fmt(spent)}</Text>
      </View>
      <View style={[styles.bannerDivider, { backgroundColor: colors.borderLight }]} />
      <View style={styles.bannerItem}>
        <Text style={[text.caption, { color: colors.textTertiary }]}>Net</Text>
        <Text style={[text.bodyMedium, { color: isPos ? INCOME_GREEN : colors.danger, fontFamily: font.sansSemiBold }]}>
          {isPos ? '+' : '−'}{fmt(Math.abs(net))}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ImportStatementScreen() {
  const { colors, text, font, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { add: addExpense } = useExpensesStore();
  const { add: addIncome }  = useIncomeStore();
  const { user }            = useAuthStore();
  const { showToast }       = useUIStore();

  const [rows, setRows]         = useState<ImportRow[]>([]);
  const [saving, setSaving]     = useState(false);
  const [progress, setProgress] = useState(0);

  // Category picker
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [editingCatId, setEditingCatId]   = useState<string | null>(null);

  // Row editor
  const [editRowOpen, setEditRowOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  useEffect(() => {
    const loaded = getImportRows();
    setRows(loaded);
    return () => { clearImportRows(); };
  }, []);

  const selectedRows = useMemo(() => rows.filter(r => r.selected), [rows]);
  const incomeCount  = useMemo(() => selectedRows.filter(r => r.type === 'credit').length, [selectedRows]);
  const expenseCount = useMemo(() => selectedRows.filter(r => r.type === 'debit').length, [selectedRows]);

  const handleToggle = useCallback((id: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  }, []);

  const handleToggleAll = useCallback(() => {
    const allOn = rows.every(r => r.selected);
    setRows(prev => prev.map(r => ({ ...r, selected: !allOn })));
  }, [rows]);

  // Category picker
  const handleCatPress = useCallback((id: string) => {
    setEditingCatId(id);
    setCatPickerOpen(true);
  }, []);

  const handleCatSelect = useCallback((cat: string) => {
    if (!editingCatId) return;
    setRows(prev => prev.map(r =>
      r.id === editingCatId
        ? { ...r, category: cat as ExpenseCategory | IncomeCategory }
        : r
    ));
    setEditingCatId(null);
  }, [editingCatId]);

  // Row editor
  const handleEdit = useCallback((id: string) => {
    setEditingRowId(id);
    setEditRowOpen(true);
  }, []);

  const handleRowSave = useCallback((updated: Partial<ImportRow>) => {
    if (!editingRowId) return;
    setRows(prev => prev.map(r => r.id === editingRowId ? { ...r, ...updated } : r));
    setEditingRowId(null);
  }, [editingRowId]);

  // Import
  const handleImport = useCallback(async () => {
    if (!user || selectedRows.length === 0) return;
    setSaving(true);
    setProgress(0);

    let saved  = 0;
    let failed = 0;

    for (const row of selectedRows) {
      try {
        if (row.type === 'credit') {
          await addIncome(
            {
              amount:      row.amount,
              category:    row.category as IncomeCategory,
              description: row.description,
              date:        row.date,
            },
            user.id,
          );
        } else {
          await addExpense(
            {
              amount:      row.amount,
              category:    row.category as ExpenseCategory,
              description: row.description,
              date:        row.date,
              isShared:    false,
              householdId: null,
            },
            user.id,
          );
        }
        saved++;
      } catch {
        failed++;
      }
      setProgress(saved + failed);
    }

    setSaving(false);

    if (failed === 0) {
      const parts: string[] = [];
      if (incomeCount  > 0) parts.push(`${incomeCount} income`);
      if (expenseCount > 0) parts.push(`${expenseCount} expense${expenseCount !== 1 ? 's' : ''}`);
      showToast('success', `Imported: ${parts.join(' + ')}`);
    } else {
      showToast('error', `${saved} imported, ${failed} failed`);
    }

    router.back();
  }, [user, selectedRows, incomeCount, expenseCount, addExpense, addIncome, showToast, router]);

  const btnLabel = useMemo(() => {
    if (selectedRows.length === 0) return 'Select rows to import';
    const parts: string[] = [];
    if (incomeCount  > 0) parts.push(`${incomeCount} income`);
    if (expenseCount > 0) parts.push(`${expenseCount} expense${expenseCount !== 1 ? 's' : ''}`);
    return `Import ${parts.join(' + ')}`;
  }, [selectedRows.length, incomeCount, expenseCount]);

  const catPickerRow  = editingCatId  ? rows.find(r => r.id === editingCatId)  : null;
  const editingRow    = editingRowId  ? rows.find(r => r.id === editingRowId)  : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.borderLight }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={1.8} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text }]}>
            Review Import
          </Text>
          <Text style={[text.caption, { color: colors.textSecondary }]}>
            {rows.length} transaction{rows.length !== 1 ? 's' : ''} · tap pencil to edit
          </Text>
        </View>
        <Pressable onPress={handleToggleAll} hitSlop={8}>
          <Text style={[text.caption, { color: colors.primary, fontFamily: font.sansMedium }]}>
            {rows.every(r => r.selected) ? 'None' : 'All'}
          </Text>
        </Pressable>
      </View>

      {/* ── Summary ── */}
      {rows.length > 0 && <SummaryBanner rows={rows} />}

      {/* ── List ── */}
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[text.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            No transactions detected in this file.{'\n'}
            Try a different format or check that your statement has Date and Amount columns.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <RowItem
              row={item}
              onToggle={handleToggle}
              onCatPress={handleCatPress}
              onEdit={handleEdit}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 110 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Footer ── */}
      {rows.length > 0 && (
        <View
          style={[
            styles.footer,
            {
              paddingBottom:   insets.bottom + 16,
              borderTopColor:  colors.borderLight,
              backgroundColor: colors.background,
            },
          ]}
        >
          {saving ? (
            <View style={styles.progressWrap}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[text.body, { color: colors.textSecondary, marginLeft: 10 }]}>
                Saving {progress} / {selectedRows.length}…
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={handleImport}
              disabled={selectedRows.length === 0}
              style={[
                styles.importBtn,
                {
                  backgroundColor: selectedRows.length === 0 ? colors.border : colors.primary,
                  borderRadius:    radius.full,
                },
              ]}
            >
              <Text style={[text.buttonLabel, { color: selectedRows.length === 0 ? colors.textTertiary : '#fff', fontFamily: font.sansSemiBold }]}>
                {btnLabel}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ── Category picker ── */}
      {catPickerRow && (
        <CategoryPickerModal
          visible={catPickerOpen}
          type={catPickerRow.type}
          current={catPickerRow.category}
          onSelect={handleCatSelect}
          onClose={() => { setCatPickerOpen(false); setEditingCatId(null); }}
        />
      )}

      {/* ── Row editor ── */}
      <EditRowModal
        visible={editRowOpen}
        row={editingRow ?? null}
        onSave={handleRowSave}
        onClose={() => { setEditRowOpen(false); setEditingRowId(null); }}
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
    paddingHorizontal: 20,
    paddingBottom:     12,
    borderBottomWidth: 1,
    gap:               12,
  },
  backBtn:      { padding: 2 },
  headerCenter: { flex: 1 },
  headerTitle:  { letterSpacing: -0.3 },

  banner: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bannerItem: { flex: 1, alignItems: 'center', gap: 4 },
  bannerDivider: { width: 1, height: 28 },

  listContent: { paddingHorizontal: 20, paddingTop: 4 },

  rowWrap: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap:               10,
  },
  checkboxWrap: { flexShrink: 0 },
  checkbox: {
    width:          22,
    height:         22,
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
  },
  typeBadge: {
    width:          24,
    height:         24,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  rowInfo:       { flex: 1, minWidth: 0 },
  rowRight:      { alignItems: 'flex-end', gap: 5, flexShrink: 0 },
  rowRightBottom: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: 7,
    paddingVertical:   3,
  },
  editIcon: { padding: 2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  footer: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    paddingHorizontal: 20,
    paddingTop:        16,
    borderTopWidth:    1,
  },
  importBtn: { paddingVertical: 16, alignItems: 'center' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },

  // Category modal
  modalOverlay: {
    flex:              1,
    backgroundColor:   'rgba(0,0,0,0.5)',
    justifyContent:    'center',
    alignItems:        'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width:       '100%',
    borderWidth: 1,
    padding:     20,
  },
  modalTitle: { marginBottom: 16, letterSpacing: -0.3 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catItem: {
    width: '22%', flexGrow: 1,
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderWidth: 1.5,
  },
  catIconWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  // Edit modal
  editCard: {
    width:       '100%',
    borderWidth: 1,
    padding:     20,
  },
  editInput: {
    borderWidth:       1,
    paddingHorizontal: 14,
    paddingVertical:   12,
    marginBottom:      2,
  },
  typeToggle: { flexDirection: 'row', padding: 3 },
  typeTab:    { flex: 1, alignItems: 'center', paddingVertical: 9 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  editBtn: { flex: 1, paddingVertical: 13, alignItems: 'center' },
});
