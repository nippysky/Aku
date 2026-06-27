/**
 * AkuDatePicker — branded calendar date picker.
 * Uses React Native's built-in Modal so it works anywhere in the tree
 * (onboarding, bottom sheets, tabs) without needing a BottomSheetModalProvider.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isBefore,
  isSameDay,
  isValid,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';

// ─── Types ─────────────────────────────────────────────────────────────────

interface AkuDatePickerProps {
  isOpen:   boolean;
  value:    string;             // 'YYYY-MM-DD'
  onChange: (iso: string) => void;
  onClose:  () => void;
  minDate?: string;             // 'YYYY-MM-DD' — dates before this are disabled
  title?:   string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CELL_SIZE  = 42;

function parseISOSafe(iso: string): Date | null {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    return isValid(d) ? d : null;
  } catch { return null; }
}

function toISO(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** date-fns getDay: 0 = Sunday. Convert to Monday-based (0 = Mon). */
function mondayBased(d: Date): number {
  const dow = getDay(d);
  return dow === 0 ? 6 : dow - 1;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AkuDatePicker({
  isOpen,
  value,
  onChange,
  onClose,
  minDate,
  title = 'Select date',
}: AkuDatePickerProps) {
  const { colors, font, fontSize, radius } = useTheme();

  const today      = useMemo(() => new Date(), []);
  const minDateObj = useMemo(() => (minDate ? parseISOSafe(minDate) : null), [minDate]);

  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = parseISOSafe(value);
    return startOfMonth(d ?? today);
  });

  const [selected, setSelected] = useState<Date | null>(() => parseISOSafe(value));

  // Sync when parent value changes while picker is open
  useEffect(() => {
    const d = parseISOSafe(value);
    if (d) {
      setSelected(d);
      setViewMonth(startOfMonth(d));
    }
  }, [value]);

  const days = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(viewMonth),
      end:   endOfMonth(viewMonth),
    });
  }, [viewMonth]);

  const leadingBlanks = useMemo(() => {
    return days.length > 0 ? mondayBased(days[0]!) : 0;
  }, [days]);

  const isDisabled = useCallback((d: Date) => {
    if (!minDateObj) return false;
    return isBefore(d, minDateObj) && !isSameDay(d, minDateObj);
  }, [minDateObj]);

  const handleDayPress = useCallback((d: Date) => {
    if (isDisabled(d)) return;
    Haptics.selectionAsync();
    setSelected(d);
  }, [isDisabled]);

  const handleConfirm = useCallback(() => {
    if (!selected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(toISO(selected));
    onClose();
  }, [selected, onChange, onClose]);

  const prevMonth = useCallback(() => {
    Haptics.selectionAsync();
    setViewMonth(m => subMonths(m, 1));
  }, []);

  const nextMonth = useCallback(() => {
    Haptics.selectionAsync();
    setViewMonth(m => addMonths(m, 1));
  }, []);

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop — tap to dismiss */}
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Sheet — stop propagation so tapping inside doesn't close */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card }]}
          onPress={() => {/* absorb */}}
        >
          {/* Handle bar */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Title */}
          <Text
            style={[
              styles.title,
              { fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text },
            ]}
          >
            {title}
          </Text>

          {/* Month navigation */}
          <View style={styles.monthRow}>
            <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={12}>
              <ChevronLeft size={22} color={colors.text} strokeWidth={1.8} />
            </Pressable>

            <Text style={[styles.monthLabel, { fontFamily: font.sansSemiBold, fontSize: fontSize.base, color: colors.text }]}>
              {format(viewMonth, 'MMMM yyyy')}
            </Text>

            <Pressable onPress={nextMonth} style={styles.navBtn} hitSlop={12}>
              <ChevronRight size={22} color={colors.text} strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* Day-of-week header */}
          <View style={styles.weekRow}>
            {DAY_LABELS.map((h) => (
              <Text
                key={h}
                style={[styles.weekLabel, { fontFamily: font.sansMedium, fontSize: fontSize.xs, color: colors.textTertiary }]}
              >
                {h}
              </Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.grid}>
            {/* Monday-aligned leading blanks */}
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <View key={`b${i}`} style={styles.cell} />
            ))}

            {days.map((d) => {
              const isToday    = isSameDay(d, today);
              const isSel      = selected !== null && isSameDay(d, selected);
              const disabled   = isDisabled(d);

              return (
                <Pressable
                  key={d.toISOString()}
                  onPress={() => handleDayPress(d)}
                  disabled={disabled}
                  style={styles.cell}
                >
                  <View style={[styles.cellInner, isSel && styles.cellSelected]}>
                    <Text
                      style={[
                        styles.cellText,
                        {
                          fontFamily: font.sansRegular,
                          fontSize:   fontSize.sm,
                          color:      disabled
                            ? colors.textTertiary
                            : isSel
                            ? Palette.linen
                            : colors.text,
                          opacity: disabled ? 0.35 : 1,
                        },
                      ]}
                    >
                      {format(d, 'd')}
                    </Text>

                    {/* Today indicator dot */}
                    {isToday && !isSel && (
                      <View style={styles.todayDot} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Confirm */}
          <Pressable
            onPress={handleConfirm}
            disabled={selected === null}
            style={[
              styles.confirmBtn,
              {
                backgroundColor: selected ? Palette.forest : colors.backgroundSecondary,
                borderRadius: radius.full,
              },
            ]}
          >
            <Text
              style={[
                styles.confirmLabel,
                {
                  fontFamily: font.sansSemiBold,
                  fontSize:   fontSize.base,
                  color: selected ? Palette.linen : colors.textTertiary,
                },
              ]}
            >
              Confirm date
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    justifyContent:  'flex-end',
    backgroundColor: 'rgba(15,17,16,0.5)',
  },
  sheet: {
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    paddingHorizontal:    20,
    paddingBottom:        Platform.OS === 'ios' ? 40 : 28,
    paddingTop:           12,
  },
  handle: {
    width:        40,
    height:       4,
    borderRadius: 2,
    alignSelf:    'center',
    marginBottom: 16,
  },
  title: {
    textAlign:    'center',
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  monthRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginBottom:    12,
  },
  navBtn: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
  },
  monthLabel: {
    letterSpacing: 0,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom:  4,
  },
  weekLabel: {
    width:     CELL_SIZE,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    marginBottom:  20,
  },
  cell: {
    width:          CELL_SIZE,
    height:         CELL_SIZE,
    alignItems:     'center',
    justifyContent: 'center',
  },
  cellInner: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
  },
  cellSelected: {
    backgroundColor: Palette.forest,
  },
  cellText: {
    textAlign: 'center',
  },
  todayDot: {
    position:        'absolute',
    bottom:          3,
    alignSelf:       'center',
    width:           4,
    height:          4,
    borderRadius:    2,
    backgroundColor: Palette.gold,
  },
  confirmBtn: {
    height:         54,
    alignItems:     'center',
    justifyContent: 'center',
  },
  confirmLabel: {
    letterSpacing: 0.1,
  },
});
