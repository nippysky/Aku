import React, { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
// Switch is used by notification reminder toggles below
import { useForm, Controller } from 'react-hook-form';
import {
  Home, Zap, Car, UtensilsCrossed, Heart, BookOpen, Tv,
  ShoppingBag, Users, PiggyBank, RefreshCw, Shield, MoreHorizontal,
  Calendar,
} from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';
import { SheetModal } from '../ui/SheetModal';
import { Input } from '../ui/Input';
import { AmountInput } from '../ui/AmountInput';
import { Button } from '../ui/Button';
import { AkuDatePicker } from '../ui/AkuDatePicker';
import { useBillsStore } from '../../store/bills.store';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import {
  BILL_CATEGORIES,
  type BillCategory,
  type BillFrequency,
} from '../../types';

// ─── Icon map ─────────────────────────────────────────────────────────────────

const BILL_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  Home, Zap, Car, UtensilsCrossed, Heart, BookOpen, Tv,
  ShoppingBag, Users, PiggyBank, RefreshCw, Shield, MoreHorizontal,
};

// ─── Form types ───────────────────────────────────────────────────────────────

interface FormData {
  name:      string;
  amount:    number;
  category:  BillCategory;
  dueDate:   string;
  frequency: BillFrequency;
  notes:     string;
  notify14:  boolean;
  notify7:   boolean;
  notify3:   boolean;
  notify1:   boolean;
  notifyDay: boolean;
}

function validateForm(data: FormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.name.trim()) errors.name = 'Name is required';
  if (!data.amount || data.amount <= 0) errors.amount = 'Amount must be greater than 0';
  if (!data.dueDate) errors.dueDate = 'Due date is required';
  return errors;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(iso: string): string {
  if (!iso) return '';
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddBillSheetProps {
  isOpen:    boolean;
  onClose:   () => void;
  onSuccess?: () => void;
}

type FrequencyOption = { value: BillFrequency; label: string };

const CATEGORIES = Object.keys(BILL_CATEGORIES) as BillCategory[];
const FREQUENCIES: FrequencyOption[] = [
  { value: 'weekly',    label: 'Weekly'    },
  { value: 'monthly',   label: 'Monthly'   },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly'    },
  { value: 'one-time',  label: 'One-time'  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AddBillSheet({ isOpen, onClose, onSuccess }: AddBillSheetProps) {
  const { colors, text, font, fontSize, radius } = useTheme();
  const { add } = useBillsStore();
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { control, handleSubmit, reset, setError, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    defaultValues: {
      name:      '',
      amount:    0,
      category:  'utilities',
      dueDate:   todayString(),
      frequency: 'monthly',
      notes:     '',
      notify14:  true,
      notify7:   true,
      notify3:   true,
      notify1:   true,
      notifyDay: true,
    },
  });

  const dueDate = watch('dueDate');

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const onSubmit = useCallback(async (data: FormData) => {
    if (!user) return;
    const validationErrors = validateForm(data);
    if (Object.keys(validationErrors).length > 0) {
      Object.entries(validationErrors).forEach(([k, v]) =>
        setError(k as keyof FormData, { message: v })
      );
      return;
    }
    try {
      await add({
        name:        data.name,
        amount:      data.amount,
        category:    data.category,
        dueDate:     data.dueDate,
        frequency:   data.frequency,
        notes:       data.notes ?? null,
        isShared:    false,
        householdId: null,
        notify30:    false,
        notify14:    data.notify14,
        notify7:     data.notify7,
        notify3:     data.notify3,
        notify1:     data.notify1,
        notifyDay:   data.notifyDay,
      }, user.id);
      showToast('success', 'Bill added successfully');
      reset();
        handleClose();
      onSuccess?.();
    } catch {
      showToast('error', 'Failed to add bill');
    }
  }, [user, add, showToast, reset, handleClose, onSuccess, setError]);

  return (
    <>
      <SheetModal visible={isOpen} onClose={handleClose}>
        {/* Title */}
        <Text
          style={[
            styles.title,
            { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
          ]}
        >
          Add Bill
        </Text>

        {/* Name */}
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Input
              label="Bill name"
              placeholder="e.g. Electricity, Netflix"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.name?.message}
              style={styles.field}
              asBottomSheetInput
            />
          )}
        />

        {/* Amount */}
        <Controller
          control={control}
          name="amount"
          render={({ field }) => (
            <AmountInput
              label="Amount"
              value={field.value}
              onChange={field.onChange}
              error={errors.amount?.message}
              style={styles.field}
              asBottomSheetInput
            />
          )}
        />

        {/* Category grid */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 10 }]}>
          Category
        </Text>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => {
                const meta = BILL_CATEGORIES[cat];
                const IconComp = BILL_ICONS[meta.icon] ?? MoreHorizontal;
                const selected = field.value === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => field.onChange(cat)}
                    style={[
                      styles.categoryItem,
                      {
                        backgroundColor: selected ? meta.color + '25' : colors.backgroundSecondary,
                        borderColor:     selected ? meta.color : colors.border,
                        borderRadius:    radius.md,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.categoryIcon,
                        { backgroundColor: meta.color + '20', borderRadius: radius.full },
                      ]}
                    >
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
          )}
        />

        {/* Due date */}
        <Controller
          control={control}
          name="dueDate"
          render={({ field }) => (
            <View style={styles.field}>
              <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>
                Due date
              </Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                style={[
                  styles.dateTrigger,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor:     errors.dueDate ? colors.danger : colors.inputBorder,
                    borderRadius:    radius.md,
                  },
                ]}
              >
                <Text
                  style={[
                    text.body,
                    { color: field.value ? colors.text : colors.textTertiary, flex: 1 },
                  ]}
                >
                  {field.value ? formatDisplayDate(field.value) : 'Select due date'}
                </Text>
                <Calendar size={20} color={colors.textSecondary} strokeWidth={1.6} />
              </Pressable>
              {errors.dueDate && (
                <Text style={[text.caption, { color: colors.danger, marginTop: 4 }]}>
                  {errors.dueDate.message}
                </Text>
              )}
            </View>
          )}
        />

        {/* Frequency chips */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 10 }]}>
          Frequency
        </Text>
        <Controller
          control={control}
          name="frequency"
          render={({ field }) => (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
              style={styles.field}
            >
              {FREQUENCIES.map((freq) => {
                const selected = field.value === freq.value;
                return (
                  <Pressable
                    key={freq.value}
                    onPress={() => field.onChange(freq.value)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? Palette.forest : colors.backgroundSecondary,
                        borderColor:     selected ? Palette.forest : colors.border,
                        borderRadius:    radius.full,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        text.buttonLabelSm,
                        { color: selected ? Palette.linen : colors.textSecondary },
                      ]}
                    >
                      {freq.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        />

        {/* Notes */}
        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <Input
              label="Notes (optional)"
              placeholder="Add any notes..."
              value={field.value ?? ''}
              onChangeText={field.onChange}
              multiline
              numberOfLines={3}
              style={styles.field}
              asBottomSheetInput
            />
          )}
        />


        {/* Notifications */}
        <Text style={[text.label, { color: colors.textSecondary, marginBottom: 10, marginTop: 8 }]}>
          Reminders
        </Text>
        {(
          [
            { key: 'notify14', label: '14 days before' },
            { key: 'notify7',  label: '7 days before'  },
            { key: 'notify3',  label: '3 days before'  },
            { key: 'notify1',  label: '1 day before'   },
            { key: 'notifyDay',label: 'On the day'     },
          ] as const
        ).map(({ key, label }) => (
          <Controller
            key={key}
            control={control}
            name={key}
            render={({ field }) => (
              <View style={[styles.toggleRow, { borderColor: colors.borderLight }]}>
                <Text style={[text.body, { color: colors.text }]}>{label}</Text>
                <Switch
                  value={field.value}
                  onValueChange={field.onChange}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.card}
                />
              </View>
            )}
          />
        ))}

        {/* Submit */}
        <View style={styles.submit}>
          <Button
            label="Add Bill"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            size="lg"
          />
        </View>
      </SheetModal>

      {/* Date picker sits outside the sheet so it layers on top */}
      <AkuDatePicker
        isOpen={showDatePicker}
        value={dueDate}
        onChange={(d) => { setValue('dueDate', d); setShowDatePicker(false); }}
        onClose={() => setShowDatePicker(false)}
        title="Select due date"
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  title: {
    marginBottom:  24,
    letterSpacing: -0.5,
  },
  field: {
    marginBottom: 20,
  },
  categoryGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            10,
    marginBottom:   20,
  },
  categoryItem: {
    width:         '30%',
    flexGrow:      1,
    alignItems:    'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth:   1.5,
  },
  categoryIcon: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    gap:           8,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderWidth:       1.5,
  },
  toggleRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  submit: {
    marginTop: 28,
  },
  dateTrigger: {
    height:            52,
    paddingHorizontal: 16,
    flexDirection:     'row',
    alignItems:        'center',
    borderWidth:       1,
  },
});
