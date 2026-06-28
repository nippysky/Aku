/**
 * AkuDatePicker — branded calendar date picker.
 *
 * Features:
 * - Standard month-by-month calendar navigation
 * - Tap the "Month Year" header → jump to year/month quick-pick mode
 *   so users can reach any month in seconds without tapping 24 times
 * - minDate / maxDate support
 * - Haptics on selection
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
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
  getYear,
  getMonth,
  setMonth,
  setYear,
  startOfYear,
} from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { Palette } from '../../theme/colors';

// ─── Types ─────────────────────────────────────────────────────────────────

type PickerMode = 'calendar' | 'monthYear';

interface AkuDatePickerProps {
  isOpen:   boolean;
  value:    string;             // 'YYYY-MM-DD'
  onChange: (iso: string) => void;
  onClose:  () => void;
  minDate?: string;             // 'YYYY-MM-DD'
  maxDate?: string;             // 'YYYY-MM-DD'
  title?:   string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const DAY_LABELS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CELL_SIZE    = 42;

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

/** Year range to display in year/month picker — 10 years before/after current view. */
function buildYearRange(centreYear: number): number[] {
  const start = centreYear - 6;
  return Array.from({ length: 15 }, (_, i) => start + i);
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AkuDatePicker({
  isOpen,
  value,
  onChange,
  onClose,
  minDate,
  maxDate,
  title = 'Select date',
}: AkuDatePickerProps) {
  const { colors, font, fontSize, radius } = useTheme();

  const today      = useMemo(() => new Date(), []);
  const minDateObj = useMemo(() => (minDate ? parseISOSafe(minDate) : null), [minDate]);
  const maxDateObj = useMemo(() => (maxDate ? parseISOSafe(maxDate) : null), [maxDate]);

  const [mode,      setMode]      = useState<PickerMode>('calendar');
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = parseISOSafe(value);
    return startOfMonth(d ?? today);
  });
  const [selected,  setSelected]  = useState<Date | null>(() => parseISOSafe(value));

  // Year displayed in the year/month picker
  const [pickYear, setPickYear] = useState<number>(() => {
    const d = parseISOSafe(value);
    return getYear(d ?? today);
  });

  // Sync when parent value changes while open
  useEffect(() => {
    const d = parseISOSafe(value);
    if (d) {
      setSelected(d);
      setViewMonth(startOfMonth(d));
      setPickYear(getYear(d));
    }
  }, [value]);

  // Reset to calendar mode when picker opens
  useEffect(() => {
    if (isOpen) setMode('calendar');
  }, [isOpen]);

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const days = useMemo(() => eachDayOfInterval({
    start: startOfMonth(viewMonth),
    end:   endOfMonth(viewMonth),
  }), [viewMonth]);

  const leadingBlanks = useMemo(
    () => (days.length > 0 ? mondayBased(days[0]!) : 0),
    [days],
  );

  const isDayDisabled = useCallback((d: Date) => {
    if (minDateObj && isBefore(d, minDateObj) && !isSameDay(d, minDateObj)) return true;
    if (maxDateObj && isBefore(maxDateObj, d) && !isSameDay(d, maxDateObj)) return true;
    return false;
  }, [minDateObj, maxDateObj]);

  // ── Month/year picker helpers ─────────────────────────────────────────────
  const isMonthDisabled = useCallback((year: number, monthIdx: number): boolean => {
    // All days in that month would be disabled
    const firstOfMonth = new Date(year, monthIdx, 1);
    const lastOfMonth  = endOfMonth(firstOfMonth);
    if (minDateObj && isBefore(lastOfMonth, minDateObj)) return true;
    if (maxDateObj && isBefore(maxDateObj, firstOfMonth)) return true;
    return false;
  }, [minDateObj, maxDateObj]);

  const isYearDisabled = useCallback((year: number): boolean => {
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    if (minDateObj && isBefore(dec31, minDateObj)) return true;
    if (maxDateObj && isBefore(maxDateObj, jan1)) return true;
    return false;
  }, [minDateObj, maxDateObj]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDayPress = useCallback((d: Date) => {
    if (isDayDisabled(d)) return;
    Haptics.selectionAsync();
    setSelected(d);
  }, [isDayDisabled]);

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

  const openMonthYearPicker = useCallback(() => {
    Haptics.selectionAsync();
    setPickYear(getYear(viewMonth));
    setMode('monthYear');
  }, [viewMonth]);

  const selectMonth = useCallback((monthIdx: number) => {
    if (isMonthDisabled(pickYear, monthIdx)) return;
    Haptics.selectionAsync();
    const newMonth = startOfMonth(setMonth(setYear(today, pickYear), monthIdx));
    setViewMonth(newMonth);
    setMode('calendar');
  }, [pickYear, today, isMonthDisabled]);

  const prevPickYear = useCallback(() => {
    Haptics.selectionAsync();
    setPickYear(y => y - 1);
  }, []);

  const nextPickYear = useCallback(() => {
    Haptics.selectionAsync();
    setPickYear(y => y + 1);
  }, []);

  // ── Colours ───────────────────────────────────────────────────────────────
  const viewMonthIdx = getMonth(viewMonth);
  const viewMonthYear = getYear(viewMonth);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Title */}
          <Text style={[styles.title, { fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text }]}>
            {title}
          </Text>

          {/* ── Month navigation (calendar mode) ── */}
          {mode === 'calendar' && (
            <>
              <View style={styles.monthRow}>
                <Pressable onPress={prevMonth} style={styles.navBtn} hitSlop={12}>
                  <ChevronLeft size={22} color={colors.text} strokeWidth={1.8} />
                </Pressable>

                {/* Tapping the month/year label jumps to month-year picker */}
                <Pressable onPress={openMonthYearPicker} style={styles.monthLabelBtn} hitSlop={8}>
                  <Text style={[styles.monthLabel, { fontFamily: font.sansSemiBold, fontSize: fontSize.base, color: colors.text }]}>
                    {format(viewMonth, 'MMMM yyyy')}
                  </Text>
                  <ChevronDown size={14} color={colors.textTertiary} strokeWidth={2} />
                </Pressable>

                <Pressable onPress={nextMonth} style={styles.navBtn} hitSlop={12}>
                  <ChevronRight size={22} color={colors.text} strokeWidth={1.8} />
                </Pressable>
              </View>

              {/* Day-of-week header */}
              <View style={styles.weekRow}>
                {DAY_LABELS.map((h) => (
                  <Text key={h} style={[styles.weekLabel, { fontFamily: font.sansMedium, fontSize: fontSize.xs, color: colors.textTertiary }]}>
                    {h}
                  </Text>
                ))}
              </View>

              {/* Day grid */}
              <View style={styles.grid}>
                {Array.from({ length: leadingBlanks }).map((_, i) => (
                  <View key={`b${i}`} style={styles.cell} />
                ))}
                {days.map((d) => {
                  const isToday  = isSameDay(d, today);
                  const isSel    = selected !== null && isSameDay(d, selected);
                  const disabled = isDayDisabled(d);
                  return (
                    <Pressable
                      key={d.toISOString()}
                      onPress={() => handleDayPress(d)}
                      disabled={disabled}
                      style={styles.cell}
                    >
                      <View style={[styles.cellInner, isSel && { backgroundColor: Palette.forest }]}>
                        <Text
                          style={[
                            styles.cellText,
                            {
                              fontFamily: font.sansRegular,
                              fontSize:   fontSize.sm,
                              color:      disabled ? colors.textTertiary : isSel ? Palette.linen : colors.text,
                              opacity:    disabled ? 0.35 : 1,
                            },
                          ]}
                        >
                          {format(d, 'd')}
                        </Text>
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
                style={[styles.confirmBtn, { backgroundColor: selected ? Palette.forest : colors.backgroundSecondary, borderRadius: radius.full }]}
              >
                <Text style={[styles.confirmLabel, { fontFamily: font.sansSemiBold, fontSize: fontSize.base, color: selected ? Palette.linen : colors.textTertiary }]}>
                  {selected ? `Confirm — ${format(selected, 'd MMM yyyy')}` : 'Confirm date'}
                </Text>
              </Pressable>
            </>
          )}

          {/* ── Year / Month picker mode ── */}
          {mode === 'monthYear' && (
            <View style={styles.monthYearPicker}>
              {/* Year row */}
              <View style={styles.yearRow}>
                <Pressable
                  onPress={prevPickYear}
                  disabled={isYearDisabled(pickYear - 1)}
                  style={[styles.navBtn, { opacity: isYearDisabled(pickYear - 1) ? 0.3 : 1 }]}
                  hitSlop={12}
                >
                  <ChevronLeft size={22} color={colors.text} strokeWidth={1.8} />
                </Pressable>

                <Text style={[{ fontFamily: font.sansSemiBold, fontSize: fontSize.lg, color: colors.text }]}>
                  {pickYear}
                </Text>

                <Pressable
                  onPress={nextPickYear}
                  disabled={isYearDisabled(pickYear + 1)}
                  style={[styles.navBtn, { opacity: isYearDisabled(pickYear + 1) ? 0.3 : 1 }]}
                  hitSlop={12}
                >
                  <ChevronRight size={22} color={colors.text} strokeWidth={1.8} />
                </Pressable>
              </View>

              {/* Month grid — 3 × 4 */}
              <View style={styles.monthGrid}>
                {MONTH_LABELS.map((label, idx) => {
                  const disabled  = isMonthDisabled(pickYear, idx);
                  const isCurrent = pickYear === viewMonthYear && idx === viewMonthIdx;
                  return (
                    <Pressable
                      key={label}
                      onPress={() => selectMonth(idx)}
                      disabled={disabled}
                      style={[
                        styles.monthCell,
                        {
                          backgroundColor: isCurrent ? Palette.forest : colors.backgroundSecondary,
                          borderRadius:    radius.md,
                          opacity:         disabled ? 0.3 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          { fontFamily: font.sansMedium, fontSize: fontSize.sm, color: isCurrent ? Palette.linen : colors.text },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Back to calendar hint */}
              <Pressable onPress={() => setMode('calendar')} style={styles.backToCalBtn}>
                <Text style={[{ fontFamily: font.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary }]}>
                  ← Back to calendar
                </Text>
              </Pressable>
            </View>
          )}
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

  // ── Calendar mode ──
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
  monthLabelBtn: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    paddingVertical: 6,
    paddingHorizontal: 10,
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

  // ── Month/Year picker mode ──
  monthYearPicker: {
    gap: 16,
  },
  yearRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  monthGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            10,
    paddingHorizontal: 4,
  },
  monthCell: {
    width:          '30%',
    flexGrow:       1,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },
  backToCalBtn: {
    alignSelf:  'center',
    paddingVertical: 10,
    marginBottom: Platform.OS === 'ios' ? 0 : 4,
  },
});
