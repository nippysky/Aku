/**
 * recurring-expenses.tsx — Recurring schedule screen
 *
 * Two segments: Expenses | Income
 * Auto-logged to the correct store on their schedule.
 * Netflix, salary, gym, rent — all in one place.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ChevronLeft,
  Plus,
  Repeat,
  Trash2,
  // expense icons
  UtensilsCrossed, Car, ShoppingBag, Tv, Home,
  Zap, Heart, Users, BookOpen, PiggyBank, Gift, MoreHorizontal,
  RefreshCw, Shield,
  // income icons
  Briefcase, Building2, TrendingUp, ArrowLeftRight, RotateCcw,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../theme';
import { Card } from '../components/ui/Card';
import { SheetModal } from '../components/ui/SheetModal';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { AmountInput } from '../components/ui/AmountInput';
import { Button } from '../components/ui/Button';
import { AkuDatePicker } from '../components/ui/AkuDatePicker';
import { useAuthStore } from '../store/auth.store';
import { useUIStore } from '../store/ui.store';
import {
  useRecurringExpensesStore,
  RECURRING_FREQ_LABELS,
  type RecurringFrequency,
  type RecurringCreateInput,
} from '../store/recurring-expenses.store';
import {
  useRecurringIncomeStore,
  type RecurringIncomeCreateInput,
} from '../store/recurring-income.store';
import { useGoalsStore } from '../store/goals.store';
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

const EXPENSE_CATS = Object.keys(EXPENSE_CATEGORIES) as ExpenseCategory[];
const INCOME_CATS  = Object.keys(INCOME_CATEGORIES)  as IncomeCategory[];

const FREQUENCIES: RecurringFrequency[] = [
  'daily', 'weekly', 'biweekly', 'monthly', 'yearly',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function prettyDate(iso: string): string {
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

// Default start date: today (user picks from here)
function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// ─── Shared type for FlatList ─────────────────────────────────────────────────

type AnyRecurring = {
  id:        string;
  name:      string;
  amount:    number;
  category:  string;
  frequency: RecurringFrequency;
  nextDate:  string;
  isActive:  boolean;
};

// ─── Segment ──────────────────────────────────────────────────────────────────

type Segment = 'expenses' | 'income';

// ─── Add Expense Recurring Sheet ─────────────────────────────────────────────

interface AddExpenseSheetProps {
  isOpen:  boolean;
  onClose: () => void;
}

function AddExpenseRecurringSheet({ isOpen, onClose }: AddExpenseSheetProps) {
  const { colors, text, font, fontSize, radius } = useTheme();
  const { user }      = useAuthStore();
  const { add }       = useRecurringExpensesStore();
  const { showToast } = useUIStore();

  const [name,        setName]        = useState('');
  const [amount,      setAmount]      = useState(0);
  const [category,    setCategory]    = useState<ExpenseCategory>('other');
  const [frequency,   setFrequency]   = useState<RecurringFrequency>('monthly');
  const [firstDate,   setFirstDate]   = useState(todayISO());
  const [dateOpen,    setDateOpen]    = useState(false);
  const [saving,      setSaving]      = useState(false);

  const reset = useCallback(() => {
    setName(''); setAmount(0); setCategory('other');
    setFrequency('monthly'); setFirstDate(todayISO());
  }, []);

  const handleSave = useCallback(async () => {
    if (!user) return;
    if (!name.trim())  { showToast('error', 'Name is required'); return; }
    if (amount <= 0)   { showToast('error', 'Enter a valid amount'); return; }

    setSaving(true);
    try {
      const input: RecurringCreateInput = {
        name: name.trim(),
        amount,
        category,
        frequency,
        nextDate: firstDate,
      };
      await add(input, user.id);
      showToast('success', `${name.trim()} added`);
      reset();
      onClose();
    } catch {
      showToast('error', 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [user, name, amount, category, frequency, firstDate, add, showToast, reset, onClose]);

  return (
    <SheetModal visible={isOpen} onClose={() => { reset(); onClose(); }}>
      <View style={styles.sheetContent}>
        {/* Name */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>
          Name
        </Text>
        <BottomSheetTextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Netflix, Gym"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.input,
            {
              backgroundColor: colors.backgroundSecondary,
              borderColor:     colors.border,
              borderRadius:    radius.md,
              color:           colors.text,
              fontFamily:      font.sansRegular,
              fontSize:        fontSize.md,
            },
          ]}
        />

        {/* Amount */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6, marginTop: 16 }]}>
          Amount
        </Text>
        <AmountInput value={amount} onChange={setAmount} />

        {/* Frequency */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8, marginTop: 16 }]}>
          Frequency
        </Text>
        <View style={styles.pillRow}>
          {FREQUENCIES.map((f) => {
            const active = frequency === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFrequency(f)}
                style={[
                  styles.pill,
                  {
                    backgroundColor: active ? colors.primary : colors.backgroundSecondary,
                    borderRadius:    radius.full,
                  },
                ]}
              >
                <Text style={[text.bodySm, { color: active ? '#fff' : colors.text }]}>
                  {RECURRING_FREQ_LABELS[f]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* First occurrence date */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8, marginTop: 16 }]}>
          First occurrence
        </Text>
        <Pressable
          onPress={() => setDateOpen(true)}
          style={[
            styles.dateTrigger,
            {
              backgroundColor: colors.backgroundSecondary,
              borderColor:     colors.border,
              borderRadius:    radius.md,
            },
          ]}
        >
          <Text style={[text.body, { color: colors.text }]}>{prettyDate(firstDate)}</Text>
        </Pressable>

        {/* Category */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8, marginTop: 16 }]}>
          Category
        </Text>
        <View style={styles.catGrid}>
          {EXPENSE_CATS.map((cat) => {
            const meta     = EXPENSE_CATEGORIES[cat];
            const IconComp = EXPENSE_ICONS[meta.icon] ?? MoreHorizontal;
            const active   = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategory(cat)}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: active ? meta.color + '20' : colors.backgroundSecondary,
                    borderRadius:    radius.md,
                    borderWidth:     active ? 1.5 : 0,
                    borderColor:     active ? meta.color : 'transparent',
                  },
                ]}
              >
                <IconComp size={16} color={active ? meta.color : colors.textTertiary} strokeWidth={1.8} />
                <Text
                  style={[text.caption, { color: active ? meta.color : colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Button label="Save" onPress={handleSave} loading={saving} style={{ marginTop: 24 }} />
      </View>

      <AkuDatePicker
        isOpen={dateOpen}
        value={firstDate}
        onChange={(d) => { setFirstDate(d); setDateOpen(false); }}
        onClose={() => setDateOpen(false)}
        title="First occurrence"
      />
    </SheetModal>
  );
}

// ─── Add Income Recurring Sheet ───────────────────────────────────────────────

interface AddIncomeSheetProps {
  isOpen:  boolean;
  onClose: () => void;
}

function AddIncomeRecurringSheet({ isOpen, onClose }: AddIncomeSheetProps) {
  const { colors, text, font, fontSize, radius } = useTheme();
  const { user }      = useAuthStore();
  const { add }       = useRecurringIncomeStore();
  const { goals }     = useGoalsStore();
  const { showToast } = useUIStore();

  const activeGoals = goals.filter((g) => !g.isCompleted);

  const [name,           setName]           = useState('');
  const [amount,         setAmount]         = useState(0);
  const [category,       setCategory]       = useState<IncomeCategory>('salary');
  const [frequency,      setFrequency]      = useState<RecurringFrequency>('monthly');
  const [firstDate,      setFirstDate]      = useState(todayISO());
  const [dateOpen,       setDateOpen]       = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [allocateGoal,   setAllocateGoal]   = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [allocationPct,  setAllocationPct]  = useState('10');

  const reset = useCallback(() => {
    setName(''); setAmount(0); setCategory('salary');
    setFrequency('monthly'); setFirstDate(todayISO());
    setAllocateGoal(false); setSelectedGoalId(null); setAllocationPct('10');
  }, []);

  const handleSave = useCallback(async () => {
    if (!user) return;
    if (!name.trim())  { showToast('error', 'Name is required'); return; }
    if (amount <= 0)   { showToast('error', 'Enter a valid amount'); return; }

    const pct = parseInt(allocationPct, 10);
    if (allocateGoal && !selectedGoalId) {
      showToast('error', 'Select a goal to allocate to'); return;
    }
    if (allocateGoal && (isNaN(pct) || pct < 1 || pct > 100)) {
      showToast('error', 'Allocation must be 1–100%'); return;
    }

    setSaving(true);
    try {
      const input: RecurringIncomeCreateInput = {
        name:          name.trim(),
        amount,
        category,
        frequency,
        nextDate:      firstDate,
        goalId:        allocateGoal ? selectedGoalId : null,
        allocationPct: allocateGoal ? pct : 0,
      };
      await add(input, user.id);
      showToast('success', `${name.trim()} added`);
      reset();
      onClose();
    } catch {
      showToast('error', 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [user, name, amount, category, frequency, firstDate, add, showToast, reset, onClose]);

  return (
    <SheetModal visible={isOpen} onClose={() => { reset(); onClose(); }}>
      <View style={styles.sheetContent}>
        {/* Name */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>
          Name
        </Text>
        <BottomSheetTextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Monthly Salary, Rent Income"
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.input,
            {
              backgroundColor: colors.backgroundSecondary,
              borderColor:     colors.border,
              borderRadius:    radius.md,
              color:           colors.text,
              fontFamily:      font.sansRegular,
              fontSize:        fontSize.md,
            },
          ]}
        />

        {/* Amount */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6, marginTop: 16 }]}>
          Amount
        </Text>
        <AmountInput value={amount} onChange={setAmount} />

        {/* Frequency */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8, marginTop: 16 }]}>
          Frequency
        </Text>
        <View style={styles.pillRow}>
          {FREQUENCIES.map((f) => {
            const active = frequency === f;
            return (
              <Pressable
                key={f}
                onPress={() => setFrequency(f)}
                style={[
                  styles.pill,
                  {
                    backgroundColor: active ? colors.primary : colors.backgroundSecondary,
                    borderRadius:    radius.full,
                  },
                ]}
              >
                <Text style={[text.bodySm, { color: active ? '#fff' : colors.text }]}>
                  {RECURRING_FREQ_LABELS[f]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* First occurrence date */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8, marginTop: 16 }]}>
          First occurrence
        </Text>
        <Pressable
          onPress={() => setDateOpen(true)}
          style={[
            styles.dateTrigger,
            {
              backgroundColor: colors.backgroundSecondary,
              borderColor:     colors.border,
              borderRadius:    radius.md,
            },
          ]}
        >
          <Text style={[text.body, { color: colors.text }]}>{prettyDate(firstDate)}</Text>
        </Pressable>

        {/* Category */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8, marginTop: 16 }]}>
          Category
        </Text>
        <View style={styles.catGrid}>
          {INCOME_CATS.map((cat) => {
            const meta     = INCOME_CATEGORIES[cat];
            const IconComp = INCOME_ICONS[meta.icon] ?? MoreHorizontal;
            const active   = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setCategory(cat)}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: active ? meta.color + '20' : colors.backgroundSecondary,
                    borderRadius:    radius.md,
                    borderWidth:     active ? 1.5 : 0,
                    borderColor:     active ? meta.color : 'transparent',
                  },
                ]}
              >
                <IconComp size={16} color={active ? meta.color : colors.textTertiary} strokeWidth={1.8} />
                <Text
                  style={[text.caption, { color: active ? meta.color : colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {meta.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Auto-allocate to goal */}
        <View style={[styles.allocateRow, { marginTop: 20 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[text.label, { color: colors.textSecondary }]}>
              Auto-allocate to goal
            </Text>
            <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
              Automatically contribute a % to a savings goal
            </Text>
          </View>
          <Switch
            value={allocateGoal}
            onValueChange={setAllocateGoal}
            trackColor={{ false: colors.backgroundSecondary, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        {allocateGoal && (
          <>
            {/* Goal picker */}
            <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8, marginTop: 14 }]}>
              Goal
            </Text>
            {activeGoals.length === 0 ? (
              <Text style={[text.caption, { color: colors.textTertiary }]}>
                No active goals — create one first
              </Text>
            ) : (
              <View style={styles.catGrid}>
                {activeGoals.map((g) => {
                  const active = selectedGoalId === g.id;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => setSelectedGoalId(g.id)}
                      style={[
                        styles.catChip,
                        {
                          backgroundColor: active ? colors.primary + '20' : colors.backgroundSecondary,
                          borderRadius:    radius.md,
                          borderWidth:     active ? 1.5 : 0,
                          borderColor:     active ? colors.primary : 'transparent',
                        },
                      ]}
                    >
                      <Text style={[text.caption, { color: active ? colors.primary : colors.textSecondary }]} numberOfLines={1}>
                        {g.emoji ? `${g.emoji} ` : ''}{g.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Percentage input */}
            <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6, marginTop: 14 }]}>
              Allocation %
            </Text>
            <BottomSheetTextInput
              value={allocationPct}
              onChangeText={setAllocationPct}
              keyboardType="numeric"
              placeholder="e.g. 10"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.input,
                {
                  backgroundColor: colors.backgroundSecondary,
                  borderColor:     colors.border,
                  borderRadius:    radius.md,
                  color:           colors.text,
                  fontFamily:      font.sansRegular,
                  fontSize:        fontSize.md,
                  width:           100,
                },
              ]}
            />
          </>
        )}

        <Button
          label="Save"
          onPress={handleSave}
          loading={saving}
          style={{ marginTop: 24, backgroundColor: colors.primary }}
        />
      </View>

      <AkuDatePicker
        isOpen={dateOpen}
        value={firstDate}
        onChange={(d) => { setFirstDate(d); setDateOpen(false); }}
        onClose={() => setDateOpen(false)}
        title="First occurrence"
      />
    </SheetModal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RecurringScreen() {
  const { colors, text, font, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const { showToast } = useUIStore();

  const {
    items: expenseItems,
    isLoading: expLoading,
    load: loadExpenses,
    remove: removeExpense,
    toggleActive: toggleExpense,
  } = useRecurringExpensesStore();

  const {
    items: incomeItems,
    isLoading: incLoading,
    load: loadIncome,
    remove: removeIncome,
    toggleActive: toggleIncome,
  } = useRecurringIncomeStore();

  const [segment, setSegment] = useState<Segment>('expenses');
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadExpenses(user.id);
      loadIncome(user.id);
    }
  }, [user]);

  const isLoading = expLoading || incLoading;

  const handleDeleteExpense = useCallback((id: string, name: string) => {
    Alert.alert(
      'Remove recurring expense',
      `Stop auto-logging "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => { await removeExpense(id); showToast('success', 'Removed'); },
        },
      ],
    );
  }, [removeExpense, showToast]);

  const handleDeleteIncome = useCallback((id: string, name: string) => {
    Alert.alert(
      'Remove recurring income',
      `Stop auto-logging "${name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => { await removeIncome(id); showToast('success', 'Removed'); },
        },
      ],
    );
  }, [removeIncome, showToast]);

  const isExpenses  = segment === 'expenses';
  const activeItems = (isExpenses ? expenseItems : incomeItems) as AnyRecurring[];
  const accentColor = colors.primary;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.borderLight }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={1.8} />
        </Pressable>
        <Text style={[styles.headerTitle, { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text }]}>
          Recurring
        </Text>
        <Pressable
          onPress={() => setAddOpen(true)}
          hitSlop={8}
          style={[styles.headerBtn, { backgroundColor: colors.backgroundSecondary }]}
        >
          <Plus size={20} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>

      {/* ── Segment toggle ── */}
      <View style={[styles.segmentWrap, { borderBottomColor: colors.borderLight }]}>
        <View style={[styles.segmentBar, { backgroundColor: colors.backgroundSecondary, borderRadius: radius.full }]}>
          {(['expenses', 'income'] as Segment[]).map((seg) => {
            const active = segment === seg;
            const label  = seg === 'expenses' ? 'Expenses' : 'Income';
            const color  = colors.primary;
            return (
              <Pressable
                key={seg}
                onPress={() => setSegment(seg)}
                style={[
                  styles.segmentTab,
                  { borderRadius: radius.full },
                  active && { backgroundColor: color },
                ]}
              >
                <Text style={[text.bodyMedium, { color: active ? '#fff' : colors.textSecondary }]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Subtext */}
        <Text style={[text.caption, { color: colors.textTertiary, marginTop: 8, textAlign: 'center' }]}>
          {isExpenses
            ? 'Auto-logged on schedule — Netflix, gym, subscriptions'
            : 'Auto-logged on schedule — salary, rent, dividends'}
        </Text>
      </View>

      {/* ── List ── */}
      <FlatList
        data={activeItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 40 },
          activeItems.length === 0 && { flex: 1 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Repeat size={40} color={colors.textTertiary} strokeWidth={1.4} />
              <Text style={[text.bodyMedium, { color: colors.textSecondary, marginTop: 12 }]}>
                {isExpenses ? 'No recurring expenses' : 'No recurring income'}
              </Text>
              <Text style={[text.bodySm, { color: colors.textTertiary, marginTop: 4, textAlign: 'center' }]}>
                {isExpenses
                  ? 'Add Netflix, gym or any subscription\nand Akù logs it automatically.'
                  : 'Add your salary, rent income or dividends\nand Akù logs them automatically.'}
              </Text>
              <Pressable
                onPress={() => setAddOpen(true)}
                style={[styles.emptyBtn, { backgroundColor: accentColor, borderRadius: radius.full }]}
              >
                <Text style={[text.bodyMedium, { color: '#fff' }]}>Add one</Text>
              </Pressable>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const isInc    = !isExpenses;
          const catMap   = isInc ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
          const iconMap  = isInc ? INCOME_ICONS       : EXPENSE_ICONS;
          const meta     = catMap[item.category as keyof typeof catMap];
          const IconComp = iconMap[meta?.icon ?? 'MoreHorizontal'] ?? MoreHorizontal;

          return (
            <Animated.View entering={FadeInDown.delay(index * 40).duration(220)}>
              <Card style={styles.itemCard}>
                <View style={styles.itemRow}>
                  {/* Icon */}
                  <View
                    style={[
                      styles.itemIcon,
                      {
                        backgroundColor: (meta?.color ?? colors.textTertiary) + '18',
                        borderRadius:    radius.md,
                        opacity:         item.isActive ? 1 : 0.4,
                      },
                    ]}
                  >
                    <IconComp size={20} color={meta?.color ?? colors.textTertiary} strokeWidth={1.8} />
                  </View>

                  {/* Info */}
                  <View style={styles.itemInfo}>
                    <Text
                      style={[text.bodyMedium, { color: colors.text, opacity: item.isActive ? 1 : 0.5 }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                      {RECURRING_FREQ_LABELS[item.frequency]} · next {prettyDate(item.nextDate)}
                    </Text>
                  </View>

                  {/* Active toggle */}
                  <Switch
                    value={item.isActive}
                    onValueChange={() =>
                      isExpenses ? toggleExpense(item.id) : toggleIncome(item.id)
                    }
                    trackColor={{ false: colors.border, true: accentColor }}
                    thumbColor={Platform.OS === 'android' ? colors.card : undefined}
                    style={{ marginRight: 4 }}
                  />

                  {/* Delete */}
                  <Pressable
                    onPress={() =>
                      isExpenses
                        ? handleDeleteExpense(item.id, item.name)
                        : handleDeleteIncome(item.id, item.name)
                    }
                    hitSlop={8}
                    style={styles.deleteBtn}
                  >
                    <Trash2 size={16} color={colors.danger} strokeWidth={1.8} />
                  </Pressable>
                </View>
              </Card>
            </Animated.View>
          );
        }}
      />

      {/* ── Add sheets ── */}
      {isExpenses ? (
        <AddExpenseRecurringSheet isOpen={addOpen} onClose={() => setAddOpen(false)} />
      ) : (
        <AddIncomeRecurringSheet isOpen={addOpen} onClose={() => setAddOpen(false)} />
      )}
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
    paddingHorizontal: 16,
    paddingBottom:     12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1, textAlign: 'center', letterSpacing: -0.5,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },

  // Segment toggle
  segmentWrap: {
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: 1,
  },
  segmentBar: {
    flexDirection: 'row',
    padding:       3,
    gap:           0,
  },
  segmentTab: {
    flex:            1,
    alignItems:      'center',
    paddingVertical: 9,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               10,
  },

  empty: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingTop:     60,
  },
  emptyBtn: {
    marginTop:         20,
    paddingHorizontal: 24,
    paddingVertical:   12,
  },

  itemCard: { marginBottom: 0 },
  itemRow: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       14,
    gap:           12,
  },
  itemIcon: {
    width:          42,
    height:         42,
    alignItems:     'center',
    justifyContent: 'center',
  },
  itemInfo: { flex: 1 },
  deleteBtn: {
    width:          32,
    height:         32,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Sheet
  sheetContent: {
    paddingHorizontal: 16,
    paddingBottom:     40,
    paddingTop:        8,
  },
  input: {
    borderWidth:       1,
    paddingHorizontal: 14,
    paddingVertical:   12,
  },
  dateTrigger: {
    borderWidth:       1,
    paddingHorizontal: 14,
    paddingVertical:   13,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical:   8,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  catChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingHorizontal: 10,
    paddingVertical:   8,
    minWidth:          80,
  },
  allocateRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingVertical: 4,
  },
});
