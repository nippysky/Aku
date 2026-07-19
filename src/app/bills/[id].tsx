import React, { useCallback, useState } from 'react';
import {
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
  Pencil,
  Calendar,
  RefreshCw,
  FileText,
  Bell,
  BellOff,
  Trash2,
  Home,
  Zap,
  Car,
  UtensilsCrossed,
  Heart,
  BookOpen,
  Tv,
  ShoppingBag,
  Users,
  PiggyBank,
  Shield,
  MoreHorizontal,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { EditBillSheet } from '../../components/bills/EditBillSheet';
import { useBillsStore } from '../../store/bills.store';
import { useUIStore } from '../../store/ui.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import {
  BILL_CATEGORIES,
  BILL_FREQUENCY_LABELS,
  type Bill,
} from '../../types';

// ─── Icon map ─────────────────────────────────────────────────────────────────

const BILL_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  Home, Zap, Car, UtensilsCrossed, Heart, BookOpen, Tv,
  ShoppingBag, Users, PiggyBank, RefreshCw, Shield, MoreHorizontal,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDueDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'EEEE, d MMMM yyyy');
  } catch {
    return dateStr;
  }
}

// ─── Detail row ───────────────────────────────────────────────────────────────

interface DetailRowProps {
  icon:  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  value: string;
}

function DetailRow({ icon: Icon, label, value }: DetailRowProps) {
  const { colors, text } = useTheme();
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.borderLight }]}>
      <Icon size={18} color={colors.textTertiary} strokeWidth={1.8} />
      <View style={styles.detailContent}>
        <Text style={[text.caption, { color: colors.textTertiary }]}>{label}</Text>
        <Text style={[text.bodyMedium, { color: colors.text, marginTop: 2 }]}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Delete confirmation sheet ────────────────────────────────────────────────

interface DeleteSheetProps {
  visible:    boolean;
  billName:   string;
  onConfirm:  () => void;
  onCancel:   () => void;
}

function DeleteConfirmSheet({ visible, billName, onConfirm, onCancel }: DeleteSheetProps) {
  const { colors, text, font, fontSize, radius, shadow } = useTheme();

  if (!visible) return null;

  return (
    <View style={[styles.deleteOverlay, { backgroundColor: colors.overlay }]}>
      <Animated.View
        entering={FadeInDown.duration(200)}
        style={[
          styles.deleteSheet,
          {
            backgroundColor: colors.card,
            borderRadius:    radius['2xl'],
            ...shadow.lg,
          },
        ]}
      >
        <Text
          style={[
            { fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text },
            styles.deleteTitle,
          ]}
        >
          Delete bill?
        </Text>
        <Text style={[text.body, { color: colors.textSecondary, marginTop: 8 }]}>
          "{billName}" will be permanently removed. This cannot be undone.
        </Text>
        <View style={styles.deleteActions}>
          <Pressable
            onPress={onCancel}
            style={[
              styles.deleteActionBtn,
              {
                backgroundColor: colors.backgroundSecondary,
                borderRadius:    radius.full,
                flex:            1,
              },
            ]}
          >
            <Text style={[text.buttonLabel, { color: colors.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            style={[
              styles.deleteActionBtn,
              {
                backgroundColor: colors.danger,
                borderRadius:    radius.full,
                flex:            1,
              },
            ]}
          >
            <Text style={[text.buttonLabel, { color: colors.textInverse }]}>Delete</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, text, font, fontSize, radius, shadow, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { bills, markPaid, markUnpaid, remove } = useBillsStore();
  const { showToast } = useUIStore();
  const { fmt } = useCurrencyFormat();

  const bill = bills.find((b) => b.id === id) ?? null;

  const [editOpen,          setEditOpen]          = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isPaidLoading,     setIsPaidLoading]     = useState(false);

  const handleMarkPaid = useCallback(async () => {
    if (!bill) return;
    setIsPaidLoading(true);
    try {
      const isRecurring = bill.frequency !== 'one-time' && bill.frequency !== 'custom';
      await markPaid(bill.id);
      showToast(
        'success',
        isRecurring
          ? 'Paid & logged to expenses — due date moved to next cycle'
          : 'Paid & logged to expenses',
      );
      // Return to the bills list — it now shows the next due date (recurring)
      // or the bill under Paid (one-time). The payment lives in the ledger.
      router.back();
    } catch {
      showToast('error', 'Failed to update bill');
    } finally {
      setIsPaidLoading(false);
    }
  }, [bill, markPaid, showToast, router]);

  const handleMarkUnpaid = useCallback(async () => {
    if (!bill) return;
    setIsPaidLoading(true);
    try {
      await markUnpaid(bill.id);
      showToast('success', 'Bill marked as unpaid');
    } catch {
      showToast('error', 'Failed to update bill');
    } finally {
      setIsPaidLoading(false);
    }
  }, [bill, markUnpaid, showToast]);

  const handleDelete = useCallback(async () => {
    if (!bill) return;
    router.back();
    try {
      await remove(bill.id);
      showToast('success', 'Bill deleted');
    } catch {
      showToast('error', 'Failed to delete bill');
    }
  }, [bill, remove, showToast, router]);

  if (!bill) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title="Bill"
          leftAction={{ icon: ArrowLeft, onPress: () => router.back(), accessibilityLabel: 'Back' }}
        />
        <View style={styles.notFound}>
          <Text style={[text.body, { color: colors.textSecondary }]}>Bill not found.</Text>
        </View>
      </View>
    );
  }

  const meta     = BILL_CATEGORIES[bill.category];
  const IconComp = BILL_ICONS[meta.icon] ?? MoreHorizontal;

  const notifications = [
    { key: 'notify14', label: '14 days before', value: bill.notify14 },
    { key: 'notify7',  label: '7 days before',  value: bill.notify7  },
    { key: 'notify3',  label: '3 days before',  value: bill.notify3  },
    { key: 'notify1',  label: '1 day before',   value: bill.notify1  },
    { key: 'notifyDay',label: 'On the day',      value: bill.notifyDay},
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={bill.name}
        leftAction={{
          icon:             ArrowLeft,
          onPress:          () => router.back(),
          accessibilityLabel: 'Back',
        }}
        rightAction={{
          icon:             Pencil,
          onPress:          () => setEditOpen(true),
          accessibilityLabel: 'Edit bill',
        }}
        style={{ paddingTop: insets.top + 4 }}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <Animated.View
          entering={FadeInDown.delay(0).duration(200)}
          style={styles.hero}
        >
          <View
            style={[
              styles.heroIcon,
              { backgroundColor: meta.color + '20', borderRadius: radius.full },
            ]}
          >
            <IconComp size={32} color={meta.color} strokeWidth={1.8} />
          </View>

          <Text
            style={[
              styles.heroName,
              { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
            ]}
          >
            {bill.name}
          </Text>

          <Text
            style={[
              {
                fontFamily:    font.displayLight,
                fontSize:      fontSize['4xl'],
                color:         colors.text,
                letterSpacing: -1,
                marginTop:     8,
              },
            ]}
          >
            {fmt(bill.amount)}
          </Text>

          {bill.autoPay && bill.status !== 'paid' ? (
            <View style={[styles.autoPayHeroBadge, { backgroundColor: colors.primary + '18', marginTop: 12 }]}>
              <RefreshCw size={13} color={colors.primary} strokeWidth={2} />
              <Text style={[text.caption, { color: colors.primary }]}>Auto-pay</Text>
            </View>
          ) : (
            <StatusBadge status={bill.status} style={{ marginTop: 12 }} />
          )}
        </Animated.View>

        {/* ── Details card ── */}
        <Animated.View entering={FadeInDown.delay(80).duration(200)}>
          <Card style={styles.card}>
            <DetailRow
              icon={Calendar}
              label="Due date"
              value={formatDueDate(bill.dueDate)}
            />
            <DetailRow
              icon={RefreshCw}
              label="Frequency"
              value={BILL_FREQUENCY_LABELS[bill.frequency]}
            />
            {bill.notes && (
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <FileText size={18} color={colors.textTertiary} strokeWidth={1.8} />
                <View style={styles.detailContent}>
                  <Text style={[text.caption, { color: colors.textTertiary }]}>Notes</Text>
                  <Text style={[text.body, { color: colors.text, marginTop: 2 }]}>{bill.notes}</Text>
                </View>
              </View>
            )}
            {!bill.notes && (
              <View style={[styles.detailRow, { borderBottomWidth: 0, opacity: 0 }]}>
                {/* spacer */}
              </View>
            )}
          </Card>
        </Animated.View>

        {/* ── Notifications card — not applicable to auto-pay bills ── */}
        {bill.autoPay ? (
          <Animated.View entering={FadeInDown.delay(160).duration(200)}>
            <Card style={[styles.card, styles.autoPayInfoCard]}>
              <RefreshCw size={18} color={colors.primary} strokeWidth={1.8} />
              <Text style={[text.bodySm, { color: colors.textSecondary, flex: 1 }]}>
                Auto-pay is on — this bill logs itself as an expense the moment it's due,
                with no reminders and nothing to confirm.
              </Text>
            </Card>
          </Animated.View>
        ) : (
        <Animated.View entering={FadeInDown.delay(160).duration(200)}>
          <Text
            style={[
              styles.sectionLabel,
              { fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.textSecondary },
            ]}
          >
            REMINDERS
          </Text>
          <Card style={styles.card}>
            {notifications.map(({ key, label, value }, idx) => (
              <View
                key={key}
                style={[
                  styles.notifRow,
                  {
                    borderBottomColor: colors.borderLight,
                    borderBottomWidth: idx < notifications.length - 1 ? 1 : 0,
                  },
                ]}
              >
                {value
                  ? <Bell size={16} color={colors.success} strokeWidth={1.8} />
                  : <BellOff size={16} color={colors.textTertiary} strokeWidth={1.8} />
                }
                <Text
                  style={[
                    text.body,
                    { color: value ? colors.text : colors.textTertiary, marginLeft: 12 },
                  ]}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    text.caption,
                    { color: value ? colors.success : colors.textTertiary, marginLeft: 'auto' },
                  ]}
                >
                  {value ? 'On' : 'Off'}
                </Text>
              </View>
            ))}
          </Card>
        </Animated.View>
        )}

        {/* ── Actions ── */}
        <Animated.View
          entering={FadeInDown.delay(240).duration(200)}
          style={styles.actions}
        >
          {bill.isPaid ? (
            <Button
              label="Mark as Unpaid"
              variant="secondary"
              size="lg"
              onPress={handleMarkUnpaid}
              loading={isPaidLoading}
            />
          ) : bill.autoPay ? (
            <Button
              label="Log Now"
              variant="secondary"
              size="lg"
              onPress={handleMarkPaid}
              loading={isPaidLoading}
            />
          ) : (
            <Button
              label="Mark as Paid"
              variant="primary"
              size="lg"
              onPress={handleMarkPaid}
              loading={isPaidLoading}
            />
          )}

          <Button
            label="Delete Bill"
            variant="ghost"
            size="md"
            onPress={() => setDeleteConfirmOpen(true)}
            iconLeft={Trash2}
          />
        </Animated.View>
      </ScrollView>

      {/* ── Edit sheet ── */}
      <EditBillSheet
        bill={editOpen ? bill : null}
        onClose={() => setEditOpen(false)}
        onSuccess={() => setEditOpen(false)}
      />

      {/* ── Delete confirmation ── */}
      <DeleteConfirmSheet
        visible={deleteConfirmOpen}
        billName={bill.name}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          handleDelete();
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  notFound: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop:        8,
    gap:               20,
  },

  // Hero
  hero: {
    alignItems:    'center',
    paddingVertical: 24,
  },
  heroIcon: {
    width:          64,
    height:         64,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   16,
  },
  heroName: {
    letterSpacing: -0.3,
    textAlign:     'center',
  },

  // Card
  card: {
    paddingHorizontal: 16,
    paddingTop:        4,
    paddingBottom:     4,
  },
  sectionLabel: {
    letterSpacing: 1.2,
    marginBottom:  8,
    marginLeft:    2,
  },

  // Detail row
  detailRow: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap:             12,
  },
  detailContent: {
    flex: 1,
  },

  // Notification row
  notifRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: 14,
  },

  // Auto-pay
  autoPayHeroBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      999,
  },
  autoPayInfoCard: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    paddingVertical: 16,
  },

  // Actions
  actions: {
    gap:        12,
    marginTop:  8,
    marginBottom: 8,
  },

  // Delete sheet
  deleteOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems:     'center',
    justifyContent: 'flex-end',
    zIndex:         999,
    paddingHorizontal: 24,
    paddingBottom:  40,
  },
  deleteSheet: {
    width:   '100%',
    padding: 28,
  },
  deleteTitle: {
    letterSpacing: -0.3,
  },
  deleteActions: {
    flexDirection: 'row',
    gap:           12,
    marginTop:     28,
  },
  deleteActionBtn: {
    height:         52,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
