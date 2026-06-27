/**
 * expenses/[id].tsx — Expense detail screen.
 *
 * Shows full expense info: amount, category, description, date, shared flag.
 * Header actions: edit (opens EditExpenseSheet) and delete (Alert confirmation).
 */
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowLeft,
  Calendar,
  Pencil,
  Tag,
  Trash2,
  Users,
  UtensilsCrossed, Car, ShoppingBag, Tv, Home, Zap,
  Heart, BookOpen, PiggyBank, Gift, MoreHorizontal,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { EditExpenseSheet } from '../../components/expenses/EditExpenseSheet';
import { useExpensesStore } from '../../store/expenses.store';
import { useUIStore } from '../../store/ui.store';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type Expense } from '../../types';
import { formatAmount } from '../../lib/format';

// ─── Icon map ─────────────────────────────────────────────────────────────────

const EXPENSE_ICONS: Record<
  ExpenseCategory,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = {
  food:          UtensilsCrossed,
  transport:     Car,
  shopping:      ShoppingBag,
  entertainment: Tv,
  housing:       Home,
  utilities:     Zap,
  health:        Heart,
  family:        Users,
  education:     BookOpen,
  savings:       PiggyBank,
  gifts:         Gift,
  other:         MoreHorizontal,
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try { return format(parseISO(iso), 'EEEE, d MMMM yyyy'); }
  catch { return iso; }
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { colors, text, font, fontSize, radius } = useTheme();
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, { backgroundColor: colors.backgroundSecondary, borderRadius: radius.md }]}>
        <Icon size={18} color={colors.textSecondary} strokeWidth={1.6} />
      </View>
      <View style={styles.infoText}>
        <Text style={[text.caption, { color: colors.textTertiary }]}>{label}</Text>
        <Text
          style={[
            { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: valueColor ?? colors.text },
          ]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExpenseDetailScreen() {
  const { colors, text, font, fontSize, spacing, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router  = useRouter();
  const { id }  = useLocalSearchParams<{ id: string }>();

  const { expenses, remove } = useExpensesStore();
  const { showToast }        = useUIStore();

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting]         = useState(false);

  const expense = expenses.find((e) => e.id === id);

  const handleDelete = useCallback(() => {
    if (!expense) return;
    Alert.alert(
      'Delete Expense',
      `Remove ${expense.description ?? EXPENSE_CATEGORIES[expense.category].label} of ${formatAmount(expense.amount)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Delete',
          style:   'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              await remove(expense.id);
              showToast('success', 'Expense deleted');
              router.back();
            } catch {
              showToast('error', 'Could not delete expense');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  }, [expense, remove, showToast, router]);

  // ── Not found ──────────────────────────────────────────────────────────

  if (!expense) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title="Expense"
          leftAction={{ icon: ArrowLeft, onPress: () => router.back(), accessibilityLabel: 'Back' }}
          style={{ paddingTop: insets.top + 4 }}
        />
        <View style={styles.notFound}>
          <Text style={[text.body, { color: colors.textSecondary }]}>Expense not found.</Text>
        </View>
      </View>
    );
  }

  const meta     = EXPENSE_CATEGORIES[expense.category];
  const IconComp = EXPENSE_ICONS[expense.category] ?? MoreHorizontal;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Expense detail"
        leftAction={{
          icon:               ArrowLeft,
          onPress:            () => router.back(),
          accessibilityLabel: 'Back',
        }}
        rightAction={{
          icon:               Pencil,
          onPress:            () => setEditingExpense(expense),
          accessibilityLabel: 'Edit expense',
        }}
        style={{ paddingTop: insets.top + 4 }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: layout.screenPadding, paddingBottom: insets.bottom + 40 },
        ]}
      >
        {/* ── Hero ── */}
        <Animated.View
          entering={FadeInDown.delay(0).springify().damping(18)}
          style={styles.hero}
        >
          {/* Category icon */}
          <View
            style={[
              styles.categoryCircle,
              { backgroundColor: meta.color + '22', borderRadius: radius.full },
            ]}
          >
            <IconComp size={36} color={meta.color} strokeWidth={1.6} />
          </View>

          {/* Amount */}
          <Text
            style={[
              styles.amount,
              { fontFamily: font.displayLight, fontSize: fontSize['3xl'], color: colors.text },
            ]}
          >
            {formatAmount(expense.amount)}
          </Text>

          {/* Category label */}
          <View style={[styles.categoryPill, { backgroundColor: meta.color + '18', borderRadius: radius.full }]}>
            <Text style={[{ fontFamily: font.sansMedium, fontSize: fontSize.xs, color: meta.color }]}>
              {meta.label}
            </Text>
          </View>
        </Animated.View>

        {/* ── Info rows ── */}
        <Animated.View
          entering={FadeInDown.delay(80).springify().damping(18)}
          style={[styles.infoCard, { backgroundColor: colors.card, borderRadius: radius.xl }]}
        >
          <InfoRow
            icon={Calendar}
            label="Date"
            value={formatDate(expense.date)}
          />
          {expense.description ? (
            <InfoRow
              icon={Tag}
              label="Description"
              value={expense.description}
            />
          ) : null}
          <InfoRow
            icon={Users}
            label="Shared expense"
            value={expense.isShared ? 'Yes — shared with household' : 'Personal'}
            valueColor={expense.isShared ? colors.primary : colors.text}
          />
        </Animated.View>

        {/* ── Delete button ── */}
        <Animated.View entering={FadeInDown.delay(160).springify().damping(18)} style={{ marginTop: spacing[6] }}>
          <Pressable
            onPress={handleDelete}
            disabled={isDeleting}
            style={[
              styles.deleteBtn,
              {
                backgroundColor: colors.danger + '12',
                borderRadius:    radius.full,
              },
            ]}
          >
            <Trash2 size={16} color={colors.danger} strokeWidth={1.8} />
            <Text style={[{ fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.danger }]}>
              {isDeleting ? 'Deleting…' : 'Delete expense'}
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* Edit sheet */}
      <EditExpenseSheet
        expense={editingExpense}
        onClose={() => setEditingExpense(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  notFound: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Hero
  hero: {
    alignItems:   'center',
    paddingVertical: 32,
    gap:          12,
  },
  categoryCircle: {
    width:          80,
    height:         80,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   4,
  },
  amount: {
    letterSpacing:      -1,
    includeFontPadding: false,
  } as object,
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical:   5,
  },

  // Info card
  infoCard: {
    padding:  4,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
  infoIcon: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  infoText: {
    flex: 1,
    gap:  2,
  },

  // Delete
  deleteBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    paddingVertical: 14,
  },
});
