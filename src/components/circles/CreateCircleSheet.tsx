/**
 * CreateCircleSheet — full circle creation flow.
 *
 * Fields collected:
 *   - Emoji icon (12 options)
 *   - Circle name (required)
 *   - Purpose / description (optional)
 *   - Group goal amount (optional)
 *   - Contribution frequency (chip picker)
 *   - Per-member amount (optional)
 *   - Deadline date (optional, via AkuDatePicker)
 *
 * On submit: creates household + householdMember + circleSettings row.
 */
import React, { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Calendar, X } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useTheme } from '../../theme';
import { SheetModal } from '../ui/SheetModal';
import { AmountInput } from '../ui/AmountInput';
import { Button } from '../ui/Button';
import { AkuDatePicker } from '../ui/AkuDatePicker';
import { useCirclesStore } from '../../store/circles.store';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import type { CircleFrequency } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CIRCLE_EMOJIS = ['💰', '🏠', '✈️', '🎯', '🎓', '🏖️', '💊', '🚗', '💍', '🎉', '🌍', '🔑'];

interface FrequencyOption {
  value: CircleFrequency;
  label: string;
}

const FREQUENCY_OPTIONS: FrequencyOption[] = [
  { value: 'weekly',    label: 'Weekly'       },
  { value: 'biweekly',  label: 'Every 2 wks'  },
  { value: 'monthly',   label: 'Monthly'      },
  { value: 'quarterly', label: 'Quarterly'    },
  { value: 'yearly',    label: 'Yearly'       },
  { value: 'one-time',  label: 'One-time'     },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(iso: string): string {
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CreateCircleSheetProps {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess?: () => void;
}

// ─── Emoji button ─────────────────────────────────────────────────────────────

interface EmojiButtonProps {
  emoji:    string;
  selected: boolean;
  onPress:  () => void;
}

function EmojiButton({ emoji, selected, onPress }: EmojiButtonProps) {
  const { colors, radius } = useTheme();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = useCallback(() => {
    Haptics.selectionAsync();
    scale.value = withSpring(1.12, { damping: 14, stiffness: 400 });
    setTimeout(() => { scale.value = withSpring(1, { damping: 14, stiffness: 400 }); }, 100);
    onPress();
  }, [onPress, scale]);

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Select ${emoji}`}
        style={[
          styles.emojiBtn,
          {
            borderRadius:    radius.md,
            borderColor:     selected ? colors.primary : colors.border,
            borderWidth:     selected ? 2 : 1,
            backgroundColor: selected ? colors.primary + '16' : colors.backgroundSecondary,
          },
        ]}
      >
        <Text style={styles.emojiBtnText}>{emoji}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Frequency chip ───────────────────────────────────────────────────────────

interface FreqChipProps {
  label:    string;
  selected: boolean;
  onPress:  () => void;
}

function FreqChip({ label, selected, onPress }: FreqChipProps) {
  const { colors, font, fontSize, radius } = useTheme();
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={[
        styles.freqChip,
        {
          borderRadius:    radius.full,
          backgroundColor: selected ? colors.primary : colors.backgroundSecondary,
          borderColor:     selected ? colors.primary : colors.border,
          borderWidth:     1,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: selected ? font.sansSemiBold : font.sansRegular,
          fontSize:   fontSize.sm,
          color:      selected ? '#fff' : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  const { colors, text } = useTheme();
  return (
    <Text style={[text.label, { color: colors.textSecondary, marginBottom: 10 }]}>
      {children}
    </Text>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CreateCircleSheet({ isOpen, onClose, onSuccess }: CreateCircleSheetProps) {
  const { colors, text, font, fontSize, radius, spacing } = useTheme();
  const { create }    = useCirclesStore();
  const { user }      = useAuthStore();
  const { showToast } = useUIStore();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [emoji,          setEmoji]          = useState('💰');
  const [name,           setName]           = useState('');
  const [description,    setDescription]    = useState('');
  const [targetAmount,   setTargetAmount]   = useState(0);
  const [frequency,      setFrequency]      = useState<CircleFrequency>('monthly');
  const [perMember,      setPerMember]      = useState(0);
  const [hasDeadline,    setHasDeadline]    = useState(false);
  const [deadline,       setDeadline]       = useState(todayISO());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [nameError,      setNameError]      = useState('');

  // ── Reset on close ──────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setEmoji('💰');
    setName('');
    setDescription('');
    setTargetAmount(0);
    setFrequency('monthly');
    setPerMember(0);
    setHasDeadline(false);
    setDeadline(todayISO());
    setShowDatePicker(false);
    setNameError('');
    onClose();
  }, [onClose]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Circle name is required');
      return;
    }
    if (!user) return;

    setIsSubmitting(true);
    try {
      await create(trimmedName, user.id, {
        emoji:           emoji || null,
        description:     description.trim() || null,
        targetAmount:    targetAmount > 0 ? targetAmount : null,
        frequency,
        perMemberAmount: perMember > 0 ? perMember : null,
        contributionType: 'equal',
        deadline:        hasDeadline ? deadline : null,
      });
      showToast('success', `${emoji} ${trimmedName} created!`);
      handleClose();
      onSuccess?.();
    } catch {
      showToast('error', 'Failed to create circle');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    name, user, emoji, description, targetAmount,
    frequency, perMember, hasDeadline, deadline,
    create, showToast, handleClose, onSuccess,
  ]);

  return (
    <>
      <SheetModal visible={isOpen} onClose={handleClose}>

        {/* ── Title ── */}
        <Text
          style={[
            styles.title,
            { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
          ]}
        >
          Create a Circle
        </Text>
        <Text style={[text.bodySm, { color: colors.textSecondary, marginBottom: 28 }]}>
          A contribution group for saving towards a shared goal.
        </Text>

        {/* ── Emoji picker ── */}
        <SectionLabel>Choose an icon</SectionLabel>
        <View style={styles.emojiGrid}>
          {CIRCLE_EMOJIS.map((e) => (
            <EmojiButton
              key={e}
              emoji={e}
              selected={emoji === e}
              onPress={() => setEmoji(e)}
            />
          ))}
        </View>

        {/* ── Circle name ── */}
        <View style={styles.field}>
          <SectionLabel>Circle name</SectionLabel>
          <View
            style={[
              styles.inputBox,
              {
                borderColor:     nameError ? colors.danger : name ? colors.primary : colors.inputBorder,
                borderWidth:     name ? 1.5 : 1,
                borderRadius:    radius.md,
                backgroundColor: colors.inputBackground,
              },
            ]}
          >
            <BottomSheetTextInput
              value={name}
              onChangeText={(v) => { setName(v); if (v.trim()) setNameError(''); }}
              placeholder="e.g. House Rent Fund"
              placeholderTextColor={colors.inputPlaceholder}
              style={[
                styles.textInput,
                { fontFamily: font.sansRegular, fontSize: fontSize.base, color: colors.text },
              ]}
              maxLength={60}
              returnKeyType="next"
            />
          </View>
          {!!nameError && (
            <Text style={[text.caption, { color: colors.danger, marginTop: 4, marginLeft: 2 }]}>
              {nameError}
            </Text>
          )}
        </View>

        {/* ── Purpose / description ── */}
        <View style={styles.field}>
          <SectionLabel>Purpose (optional)</SectionLabel>
          <View
            style={[
              styles.inputBox,
              styles.textAreaBox,
              {
                borderColor:     description ? colors.primary : colors.inputBorder,
                borderWidth:     description ? 1.5 : 1,
                borderRadius:    radius.md,
                backgroundColor: colors.inputBackground,
              },
            ]}
          >
            <BottomSheetTextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What is this circle saving for?"
              placeholderTextColor={colors.inputPlaceholder}
              multiline
              numberOfLines={3}
              style={[
                styles.textInput,
                styles.textArea,
                { fontFamily: font.sansRegular, fontSize: fontSize.base, color: colors.text },
              ]}
              maxLength={200}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* ── Divider ── */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ── Group goal amount ── */}
        <View style={styles.field}>
          <AmountInput
            label="Group goal amount (optional)"
            value={targetAmount}
            onChange={setTargetAmount}
            asBottomSheetInput
          />
        </View>

        {/* ── Contribution frequency ── */}
        <View style={styles.field}>
          <SectionLabel>Contribution frequency</SectionLabel>
          <View style={styles.freqRow}>
            {FREQUENCY_OPTIONS.map((opt) => (
              <FreqChip
                key={opt.value}
                label={opt.label}
                selected={frequency === opt.value}
                onPress={() => setFrequency(opt.value)}
              />
            ))}
          </View>
        </View>

        {/* ── Per-member amount ── */}
        <View style={styles.field}>
          <AmountInput
            label="Per-member amount (optional)"
            value={perMember}
            onChange={setPerMember}
            asBottomSheetInput
          />
          <Text style={[text.caption, { color: colors.textTertiary, marginTop: 6, marginLeft: 2 }]}>
            Leave blank to auto-split the group goal equally.
          </Text>
        </View>

        {/* ── Divider ── */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ── Deadline ── */}
        <View style={styles.field}>
          <SectionLabel>Deadline</SectionLabel>

          {/* Toggle */}
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setHasDeadline((v) => !v); }}
            style={[
              styles.deadlineToggle,
              {
                borderColor:     hasDeadline ? colors.primary : colors.border,
                borderRadius:    radius.md,
                backgroundColor: hasDeadline ? colors.primary + '10' : colors.backgroundSecondary,
              },
            ]}
          >
            <View style={[
              styles.deadlineCheck,
              {
                borderRadius: 6,
                borderColor:  hasDeadline ? colors.primary : colors.border,
                backgroundColor: hasDeadline ? colors.primary : 'transparent',
              },
            ]}>
              {hasDeadline && <Text style={{ color: '#fff', fontSize: 11, fontFamily: font.sansSemiBold }}>✓</Text>}
            </View>
            <Text style={[text.body, { color: hasDeadline ? colors.primary : colors.textSecondary }]}>
              Set a deadline
            </Text>
          </Pressable>

          {/* Date button */}
          {hasDeadline && (
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={[
                styles.dateBtn,
                {
                  borderColor:     colors.primary,
                  borderRadius:    radius.md,
                  backgroundColor: colors.primary + '08',
                  marginTop:       10,
                },
              ]}
            >
              <Calendar size={16} color={colors.primary} strokeWidth={1.8} />
              <Text style={[text.body, { color: colors.primary, fontFamily: font.sansMedium }]}>
                {formatDateDisplay(deadline)}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── Submit button ── */}
        <View style={styles.submitRow}>
          <Button
            label={isSubmitting ? 'Creating…' : `Create ${emoji} ${name.trim() || 'Circle'}`}
            onPress={handleSubmit}
            disabled={isSubmitting}
            variant="primary"
          />
        </View>

      </SheetModal>

      {/* ── Date picker modal (renders above the sheet) ── */}
      <AkuDatePicker
        isOpen={showDatePicker}
        value={deadline}
        onChange={(iso) => { setDeadline(iso); }}
        onClose={() => setShowDatePicker(false)}
        minDate={todayISO()}
        title="Set deadline"
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  title: {
    letterSpacing: -0.4,
    marginBottom:  6,
  },
  emojiGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            10,
    marginBottom:   24,
  },
  emojiBtn: {
    width:          52,
    height:         52,
    alignItems:     'center',
    justifyContent: 'center',
  },
  emojiBtnText: {
    fontSize: 24,
  },
  field: {
    marginBottom: 20,
  },
  inputBox: {
    borderWidth:     1,
    paddingHorizontal: 14,
    height:          52,
    justifyContent:  'center',
  },
  textAreaBox: {
    height:    undefined,
    minHeight: 80,
    paddingVertical: 12,
  },
  textInput: {
    padding: 0,
    margin:  0,
  },
  textArea: {
    lineHeight: 22,
  },
  divider: {
    height:       1,
    marginBottom: 20,
    opacity:      0.5,
  },
  freqRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  freqChip: {
    paddingHorizontal: 14,
    paddingVertical:   8,
  },
  deadlineToggle: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    borderWidth:    1,
    paddingVertical:   14,
    paddingHorizontal: 14,
  },
  deadlineCheck: {
    width:          22,
    height:         22,
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
  },
  dateBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    borderWidth:    1.5,
    paddingVertical:   14,
    paddingHorizontal: 14,
  },
  submitRow: {
    marginTop: 8,
  },
});
