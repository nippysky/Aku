import React, { useState, useCallback, useEffect } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Pencil,
  Check,
  X,
  Plus,
  UserPlus,
} from 'lucide-react-native';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { useHouseholdStore } from '../../store/household.store';
import { useUIStore } from '../../store/ui.store';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Divider } from '../../components/ui/Divider';
import type { HouseholdMember } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts.length || !parts[0]) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

// ─── Member row ───────────────────────────────────────────────────────────────

interface MemberRowProps {
  member:  HouseholdMember;
  isLast:  boolean;
}

function MemberRow({ member, isLast }: MemberRowProps) {
  const { colors, text, font, radius } = useTheme();

  const initials   = getInitials(member.name || member.email);
  const isOwner    = member.role === 'owner';

  return (
    <>
      <View style={styles.memberRow}>
        {/* Avatar */}
        <View
          style={[
            styles.memberAvatar,
            {
              backgroundColor: isOwner ? colors.primary : colors.backgroundSecondary,
              borderRadius:    radius.full,
            },
          ]}
        >
          <Text
            style={[
              text.label,
              {
                color:      isOwner ? colors.textOnForest : colors.textSecondary,
                fontFamily: font.sansSemiBold,
              },
            ]}
          >
            {initials}
          </Text>
        </View>

        {/* Name + email */}
        <View style={styles.memberInfo}>
          <Text style={[text.bodyMedium, { color: colors.text }]} numberOfLines={1}>
            {member.name || '—'}
          </Text>
          {member.email ? (
            <Text style={[text.caption, { color: colors.textTertiary }]} numberOfLines={1}>
              {member.email}
            </Text>
          ) : null}
        </View>

        {/* Role badge */}
        <View
          style={[
            styles.roleBadge,
            {
              backgroundColor: isOwner ? colors.primary + '15' : colors.backgroundSecondary,
              borderColor:     isOwner ? colors.primary         : colors.border,
              borderRadius:    radius.full,
            },
          ]}
        >
          <Text
            style={[
              text.caption,
              {
                color:      isOwner ? colors.primary : colors.textSecondary,
                fontFamily: font.sansSemiBold,
              },
            ]}
          >
            {isOwner ? 'Owner' : 'Member'}
          </Text>
        </View>
      </View>
      {!isLast && <Divider style={{ marginLeft: 56 }} />}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HouseholdScreen() {
  const { colors, font, fontSize, text, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { user }                                = useAuthStore();
  const { household, members, updateName, load, create } = useHouseholdStore();
  const { showToast }                           = useUIStore();

  const [editingName, setEditingName]   = useState(false);
  const [nameValue,   setNameValue]     = useState(household?.name ?? '');
  const [isSaving,    setIsSaving]      = useState(false);
  const [isCreating,  setIsCreating]    = useState(false);
  const [newHHName,   setNewHHName]     = useState('');

  // Sync nameValue with household
  useEffect(() => {
    if (household?.name) {
      setNameValue(household.name);
    }
  }, [household?.name]);

  const isOwner = household?.ownerId === user?.id;

  // ── Save household name ───────────────────────────────────────────────
  const handleSaveName = useCallback(async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      showToast('error', 'Household name cannot be empty');
      return;
    }
    if (trimmed === household?.name) {
      setEditingName(false);
      return;
    }
    try {
      setIsSaving(true);
      await updateName(trimmed);
      showToast('success', 'Household name updated');
      setEditingName(false);
    } catch {
      showToast('error', 'Failed to update name');
    } finally {
      setIsSaving(false);
    }
  }, [nameValue, household?.name, updateName, showToast]);

  const handleCancelEdit = useCallback(() => {
    setNameValue(household?.name ?? '');
    setEditingName(false);
  }, [household?.name]);

  // ── Create household ──────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!user) return;
    const trimmed = newHHName.trim();
    if (!trimmed) {
      showToast('error', 'Please enter a household name');
      return;
    }
    try {
      setIsCreating(true);
      await create(trimmed, user.id);
      showToast('success', `"${trimmed}" household created`);
      setNewHHName('');
      await load(user.id);
    } catch {
      showToast('error', 'Failed to create household');
    } finally {
      setIsCreating(false);
    }
  }, [user, newHHName, create, load, showToast]);

  // ── Invite member ─────────────────────────────────────────────────────
  const handleInvite = useCallback(() => {
    showToast('info', 'Household invites coming soon');
  }, [showToast]);

  // ── Leave household ───────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    Alert.alert(
      'Leave Household',
      `You will be removed from "${household?.name}". This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            showToast('info', 'Leaving household — coming soon');
          },
        },
      ],
    );
  }, [household?.name, showToast]);

  // ── Delete household ──────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Household',
      `This will permanently delete "${household?.name}" and remove all members. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Household',
          style: 'destructive',
          onPress: () => {
            showToast('info', 'Delete household — coming soon');
          },
        },
      ],
    );
  }, [household?.name, showToast]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop:        insets.top + 12,
            borderBottomColor: colors.borderLight,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBack}>
          <ChevronLeft size={22} color={colors.text} strokeWidth={1.8} />
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
          ]}
        >
          Household
        </Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop:        24,
            paddingBottom:     insets.bottom + 48,
            paddingHorizontal: layout.screenPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {household ? (
          <>
            {/* ── Household name card ── */}
            <Text style={[text.labelCaps, styles.sectionLabel, { color: colors.textTertiary }]}>
              Household Name
            </Text>
            <Card style={styles.card}>
              <View style={styles.nameRow}>
                {editingName ? (
                  <>
                    <TextInput
                      value={nameValue}
                      onChangeText={setNameValue}
                      style={[
                        text.bodyMedium,
                        styles.nameInput,
                        {
                          color:           colors.text,
                          borderColor:     colors.inputFocusBorder,
                          backgroundColor: colors.inputBackground,
                          borderRadius:    radius.sm,
                        },
                      ]}
                      autoFocus
                      selectTextOnFocus
                      returnKeyType="done"
                      onSubmitEditing={handleSaveName}
                    />
                    <Pressable
                      onPress={handleSaveName}
                      disabled={isSaving}
                      hitSlop={8}
                      style={[styles.nameActionBtn, { backgroundColor: colors.primary, borderRadius: radius.sm }]}
                    >
                      <Check size={16} color={colors.textOnForest} strokeWidth={2.5} />
                    </Pressable>
                    <Pressable
                      onPress={handleCancelEdit}
                      hitSlop={8}
                      style={[styles.nameActionBtn, { backgroundColor: colors.backgroundSecondary, borderRadius: radius.sm }]}
                    >
                      <X size={16} color={colors.textSecondary} strokeWidth={2} />
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={[text.bodyMedium, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                      {household.name}
                    </Text>
                    {isOwner && (
                      <Pressable
                        onPress={() => setEditingName(true)}
                        hitSlop={8}
                        style={[styles.nameActionBtn, { backgroundColor: colors.backgroundSecondary, borderRadius: radius.sm }]}
                      >
                        <Pencil size={15} color={colors.textSecondary} strokeWidth={1.8} />
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            </Card>

            {/* ── Members ── */}
            <Text
              style={[text.labelCaps, styles.sectionLabel, { color: colors.textTertiary, marginTop: 24 }]}
            >
              Members
            </Text>
            <Card style={styles.card}>
              {members.length === 0 ? (
                <Text style={[text.bodySm, { color: colors.textTertiary, padding: 16, textAlign: 'center' }]}>
                  No members loaded
                </Text>
              ) : (
                members.map((m, i) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isLast={i === members.length - 1}
                  />
                ))
              )}

              <Divider />

              {/* Invite row */}
              <Pressable
                onPress={handleInvite}
                style={styles.inviteRow}
              >
                <View
                  style={[
                    styles.inviteIcon,
                    { backgroundColor: colors.backgroundSecondary, borderRadius: radius.md },
                  ]}
                >
                  <UserPlus size={18} color={colors.primary} strokeWidth={1.8} />
                </View>
                <Text style={[text.bodyMedium, { color: colors.primary, flex: 1 }]}>
                  Invite member
                </Text>
                <Plus size={16} color={colors.primary} strokeWidth={2} />
              </Pressable>
            </Card>

            {/* ── Danger zone ── */}
            <Text
              style={[text.labelCaps, styles.sectionLabel, { color: colors.textTertiary, marginTop: 24 }]}
            >
              Danger Zone
            </Text>
            <Card
              style={[styles.card, styles.dangerCard, { borderColor: colors.danger + '40' }]}
            >
              {!isOwner && (
                <Pressable
                  onPress={handleLeave}
                  style={[styles.dangerRow, { borderBottomWidth: isOwner ? 0 : 0 }]}
                >
                  <Text style={[text.bodyMedium, { color: colors.danger }]}>
                    Leave household
                  </Text>
                </Pressable>
              )}
              {isOwner && (
                <Pressable onPress={handleDelete} style={styles.dangerRow}>
                  <Text style={[text.bodyMedium, { color: colors.danger }]}>
                    Delete household
                  </Text>
                </Pressable>
              )}
            </Card>
          </>
        ) : (
          /* ── No household — create one ── */
          <View style={styles.createWrap}>
            <Text
              style={[
                styles.createTitle,
                { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
              ]}
            >
              Create a Household
            </Text>
            <Text style={[text.body, styles.createSubtitle, { color: colors.textSecondary }]}>
              Households let you share bills, budgets, and goals with family or housemates.
            </Text>

            <Card style={styles.card}>
              <View style={styles.createInputWrap}>
                <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8 }]}>
                  Household name
                </Text>
                <TextInput
                  value={newHHName}
                  onChangeText={setNewHHName}
                  placeholder="e.g. The Johnson Family"
                  placeholderTextColor={colors.inputPlaceholder}
                  style={[
                    text.body,
                    styles.createInput,
                    {
                      color:           colors.text,
                      borderColor:     colors.inputBorder,
                      backgroundColor: colors.inputBackground,
                      borderRadius:    radius.md,
                    },
                  ]}
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                />
              </View>
            </Card>

            <View style={{ marginTop: 16 }}>
              <Button
                label="Create Household"
                onPress={handleCreate}
                loading={isCreating}
                size="lg"
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingBottom:     12,
    borderBottomWidth: 1,
  },
  headerBack: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex:          1,
    textAlign:     'center',
    letterSpacing: -0.5,
  },
  content: {
    // padding set inline
  },
  sectionLabel: {
    marginBottom: 8,
    marginLeft:   4,
  },
  card: {
    overflow: 'hidden',
  },
  nameRow: {
    flexDirection:  'row',
    alignItems:     'center',
    padding:        16,
    gap:            10,
  },
  nameInput: {
    flex:              1,
    height:            40,
    paddingHorizontal: 12,
    borderWidth:       1.5,
    includeFontPadding: false,
  } as object,
  nameActionBtn: {
    width:          32,
    height:         32,
    alignItems:     'center',
    justifyContent: 'center',
  },
  memberRow: {
    flexDirection:   'row',
    alignItems:      'center',
    padding:         14,
    gap:             12,
  },
  memberAvatar: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
  },
  memberInfo: {
    flex: 1,
    gap:  2,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderWidth:       1,
  },
  inviteRow: {
    flexDirection:  'row',
    alignItems:     'center',
    padding:        14,
    gap:            12,
  },
  inviteIcon: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  dangerCard: {
    borderWidth: 1,
  },
  dangerRow: {
    padding:         16,
    alignItems:      'center',
  },
  // ── Create household ──
  createWrap: {
    paddingTop: 24,
  },
  createTitle: {
    letterSpacing: -0.5,
    marginBottom:  8,
  },
  createSubtitle: {
    lineHeight:   22,
    marginBottom: 24,
  },
  createInputWrap: {
    padding: 16,
  },
  createInput: {
    height:            52,
    borderWidth:       1,
    paddingHorizontal: 14,
    includeFontPadding: false,
  } as object,
});
