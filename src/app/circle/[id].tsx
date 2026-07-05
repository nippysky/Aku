/**
 * circle/[id].tsx — Contribution Group Detail
 *
 * Two tabs:
 *  [Members]  — member payment status, goal progress, payment details
 *  [Activity] — leaderboard, pending approvals (admin only), my contributions
 *
 * Admin (circle owner):
 *   - Settings gear → Edit Circle / Edit Payment Details
 *   - Verify / reject pending contributions in Activity tab
 *   - Remove members from Members tab
 *
 * Members:
 *   - Log Contribution FAB on Activity tab
 *   - Invite others via Share Code / Share Link
 *
 * Push notifications: all circle members receive a push when contributions
 * are logged or verified (via server-side fan-out by user IDs).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  Copy,
  Crown,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  Activity,
  CreditCard,
} from 'lucide-react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { useCirclesStore } from '../../store/circles.store';
import { useCircleStore } from '../../store/circle.store';
import { useUIStore } from '../../store/ui.store';
import { useCurrencyFormat } from '../../hooks/useCurrencyFormat';
import { InitialsAvatar } from '../../components/ui/InitialsAvatar';
import { Divider } from '../../components/ui/Divider';
import { Button } from '../../components/ui/Button';
import { AmountInput } from '../../components/ui/AmountInput';
import { AkuDatePicker } from '../../components/ui/AkuDatePicker';
import type {
  CircleContribution,
  CircleFrequency,
  MemberPaymentStatus,
} from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const FREQ_LABELS: Record<CircleFrequency, string> = {
  weekly:     'Weekly',
  biweekly:   'Every 2 weeks',
  monthly:    'Monthly',
  quarterly:  'Quarterly',
  yearly:     'Yearly',
  'one-time': 'One-time',
};

const CIRCLE_EMOJIS = ['💰','🏠','✈️','🎯','🎓','🏖️','💊','🚗','💍','🎉','🌍','🔑'];

const STATUS_CONFIG = {
  paid:    { bg: '#D1FAE5', fg: '#065F46', label: 'Paid'    },
  partial: { bg: '#FEF3C7', fg: '#92400E', label: 'Partial' },
  pending: { bg: '#EFF6FF', fg: '#1D4ED8', label: 'Pending' },
  overdue: { bg: '#FEE2E2', fg: '#991B1B', label: 'Overdue' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtShortDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return <InitialsAvatar name={name} size={size} />;
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  const { colors, text } = useTheme();
  return (
    <Text style={[text.labelCaps, {
      color: colors.textTertiary, marginTop: 22, marginBottom: 10, marginLeft: 2,
    }]}>
      {label}
    </Text>
  );
}

// ─── Admin pill ───────────────────────────────────────────────────────────────

function AdminPill() {
  const { font, fontSize } = useTheme();
  return (
    <View style={styles.adminPill}>
      <Crown size={9} color="#C4E07A" strokeWidth={2} />
      <Text style={{ fontFamily: font.sansSemiBold, fontSize: 9, color: '#C4E07A', letterSpacing: 0.5 }}>
        ADMIN
      </Text>
    </View>
  );
}

// ─── Tab switcher ─────────────────────────────────────────────────────────────

function TabSwitcher({
  active,
  onChange,
  pendingCount,
}: {
  active: 'members' | 'activity';
  onChange: (t: 'members' | 'activity') => void;
  pendingCount: number;
}) {
  const { font, fontSize } = useTheme();
  const tabs = [
    { key: 'members'  as const, label: 'Members',  Icon: Users    },
    { key: 'activity' as const, label: 'Activity', Icon: Activity },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 100, padding: 3, marginTop: 14, alignSelf: 'flex-start' }}>
      {tabs.map(({ key, label, Icon }) => {
        const isActive = active === key;
        const showBadge = key === 'activity' && pendingCount > 0;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 100, backgroundColor: isActive ? 'rgba(255,255,255,0.18)' : 'transparent' }}
          >
            <Icon size={13} color={isActive ? '#FAF9F5' : 'rgba(250,249,245,0.55)'} strokeWidth={2} />
            <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: isActive ? '#FAF9F5' : 'rgba(250,249,245,0.55)', letterSpacing: 0.2 }}>
              {label}
            </Text>
            {showBadge && (
              <View style={{ backgroundColor: '#FF6B6B', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ fontFamily: font.sansSemiBold, fontSize: 9, color: '#fff' }}>{pendingCount}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Member payment row ───────────────────────────────────────────────────────

function MemberRow({
  ms, fmt, isLast, isOwner, onRemove,
}: {
  ms: MemberPaymentStatus;
  fmt: (n: number) => string;
  isLast: boolean;
  isOwner: boolean;
  onRemove?: () => void;
}) {
  const { colors, font, fontSize, text } = useTheme();

  const isGenerous  = ms.expectedAmount > 0 && ms.verifiedAmount > ms.expectedAmount;
  const paidPct     = ms.expectedAmount > 0
    ? Math.round((ms.verifiedAmount / ms.expectedAmount) * 100)
    : 0;
  const basePct     = Math.min(paidPct, 100);
  const overflowPct = isGenerous ? Math.min(paidPct - 100, 60) : 0;

  const sc = isGenerous
    ? { bg: '#EEF9EC', fg: '#166534', label: `${paidPct}% 🎉` }
    : STATUS_CONFIG[ms.status];

  return (
    <View>
      <View style={[styles.memberRow, { paddingHorizontal: 14 }]}>
        {/* Avatar + owner crown */}
        <View style={{ position: 'relative', marginRight: 10 }}>
          <Avatar name={ms.name} size={40} />
          {ms.role === 'owner' && (
            <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: '#163A2F', borderRadius: 8, padding: 2 }}>
              <Crown size={8} color="#C4E07A" strokeWidth={2} />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }} numberOfLines={1}>
              {ms.name}
            </Text>
            {isGenerous && <Text style={{ fontSize: 12 }}>✨</Text>}
          </View>
          {ms.expectedAmount > 0 ? (
            <>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 5, overflow: 'hidden', flexDirection: 'row' }}>
                <View style={{ height: 4, backgroundColor: ms.status === 'partial' ? '#F59E0B' : '#16C172', width: `${basePct}%` }} />
                {isGenerous && overflowPct > 0 && (
                  <View style={{ height: 4, backgroundColor: '#C4E07A', width: `${overflowPct}%` }} />
                )}
              </View>
              <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                {fmt(ms.verifiedAmount)}{ms.expectedAmount > 0 ? ` of ${fmt(ms.expectedAmount)}` : ''}
                {isGenerous ? ` · ${paidPct - 100}% extra 🙌` : ms.pendingAmount > 0 ? ` · ${fmt(ms.pendingAmount)} pending` : ''}
              </Text>
            </>
          ) : (
            <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
              {ms.role === 'owner' ? 'Admin' : 'Member'}
            </Text>
          )}
        </View>

        {/* Status badge */}
        <View style={[styles.badge, { backgroundColor: sc.bg, marginLeft: 8 }]}>
          <Text style={{ fontFamily: font.sansSemiBold, fontSize: 9, color: sc.fg, letterSpacing: 0.3 }}>
            {isGenerous ? sc.label : sc.label.toUpperCase()}
          </Text>
        </View>

        {/* Admin: remove member icon (non-owner members only) */}
        {isOwner && ms.role !== 'owner' && onRemove && (
          <Pressable onPress={onRemove} hitSlop={10} style={{ marginLeft: 6, padding: 4 }}>
            <UserMinus size={15} color={colors.textTertiary} strokeWidth={1.8} />
          </Pressable>
        )}
      </View>
      {!isLast && <Divider style={{ marginLeft: 64 }} />}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CircleDetailScreen() {
  const { id: circleId } = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { colors, font, fontSize, text, layout } = useTheme();

  const { user }      = useAuthStore();
  const { circles }   = useCirclesStore();
  const { showToast } = useUIStore();
  const { fmt }       = useCurrencyFormat();

  const {
    settings, contributions, leaderboard,
    members, memberStatuses,
    isLoading, isSaving,
    loadCircle, saveSettings,
    logContribution, verifyContribution, deleteContribution,
    removeMember,
  } = useCircleStore();

  const circle  = useMemo(() => circles.find((c) => c.id === circleId) ?? null, [circles, circleId]);
  const isOwner = !!user && !!circle && circle.ownerId === user.id;

  const [activeTab, setActiveTab] = useState<'members' | 'activity'>('members');

  useEffect(() => {
    if (circleId) loadCircle(circleId);
  }, [circleId]);

  // ── Sheet refs ────────────────────────────────────────────────────────────
  const logSheetRef  = useRef<BottomSheetModal>(null);
  const editSheetRef = useRef<BottomSheetModal>(null);
  const paySheetRef  = useRef<BottomSheetModal>(null);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ), [],
  );

  // ── Log contribution form ─────────────────────────────────────────────────
  const [logAmountKobo, setLogAmountKobo] = useState(0);
  const [logNote,       setLogNote]       = useState('');

  const handleLog = useCallback(async () => {
    if (!user || !circleId) return;
    if (!logAmountKobo || logAmountKobo <= 0) { showToast('error', 'Enter a valid amount'); return; }
    await logContribution(
      circleId, user.id, logAmountKobo, logNote.trim() || undefined,
      { name: user.name, email: user.email, avatarUrl: user.avatarUrl },
    );
    logSheetRef.current?.dismiss();
    setLogAmountKobo(0);
    setLogNote('');
    showToast('success', 'Logged — awaiting admin verification');
  }, [user, circleId, logAmountKobo, logNote, logContribution, showToast]);

  // ── Circle details form (admin only) ─────────────────────────────────────
  const [editEmoji,          setEditEmoji]          = useState('💰');
  const [editDesc,           setEditDesc]           = useState('');
  const [editTargetKobo,     setEditTargetKobo]     = useState(0);
  const [editFrequency,      setEditFrequency]      = useState<CircleFrequency>('monthly');
  const [editPerMember,      setEditPerMember]      = useState(0);
  const [editDeadline,       setEditDeadline]       = useState('');
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);

  const openEditSheet = useCallback(() => {
    setEditEmoji(settings?.emoji ?? '💰');
    setEditDesc(settings?.description ?? '');
    setEditTargetKobo(settings?.targetAmount ?? 0);
    setEditFrequency((settings?.frequency ?? 'monthly') as CircleFrequency);
    setEditPerMember(settings?.perMemberAmount ?? 0);
    setEditDeadline(settings?.deadline ?? '');
    editSheetRef.current?.present();
  }, [settings]);

  const handleSaveDetails = useCallback(async () => {
    if (!circleId) return;
    await saveSettings(circleId, {
      emoji:            editEmoji || null,
      description:      editDesc.trim()   || null,
      targetAmount:     editTargetKobo > 0 ? editTargetKobo : null,
      frequency:        editFrequency,
      perMemberAmount:  editPerMember > 0 ? editPerMember : null,
      contributionType: 'equal',
      deadline:         editDeadline || null,
    });
    editSheetRef.current?.dismiss();
    showToast('success', 'Circle updated');
  }, [circleId, editEmoji, editDesc, editTargetKobo, editFrequency, editPerMember, editDeadline, saveSettings, showToast]);

  // ── Payment details form (admin only) ─────────────────────────────────────
  const [editAcctName,   setEditAcctName]   = useState('');
  const [editAcctNumber, setEditAcctNumber] = useState('');
  const [editBankName,   setEditBankName]   = useState('');
  const [editNotes,      setEditNotes]      = useState('');

  const openPaySheet = useCallback(() => {
    setEditAcctName(settings?.accountName    ?? '');
    setEditAcctNumber(settings?.accountNumber ?? '');
    setEditBankName(settings?.bankName       ?? '');
    setEditNotes(settings?.notes             ?? '');
    paySheetRef.current?.present();
  }, [settings]);

  const handleSavePayment = useCallback(async () => {
    if (!circleId) return;
    await saveSettings(circleId, {
      accountName:   editAcctName.trim()   || null,
      accountNumber: editAcctNumber.trim() || null,
      bankName:      editBankName.trim()   || null,
      notes:         editNotes.trim()      || null,
    });
    paySheetRef.current?.dismiss();
    showToast('success', 'Payment details saved');
  }, [circleId, editAcctName, editAcctNumber, editBankName, editNotes, saveSettings, showToast]);

  // ── Admin settings menu ───────────────────────────────────────────────────
  const handleSettingsMenu = useCallback(() => {
    Haptics.selectionAsync();
    const options = ['Edit Circle Details', 'Edit Payment Details', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, title: 'Admin Settings' },
        (idx) => {
          if (idx === 0) openEditSheet();
          if (idx === 1) openPaySheet();
        },
      );
    } else {
      Alert.alert('Admin Settings', undefined, [
        { text: 'Edit Circle Details',  onPress: openEditSheet },
        { text: 'Edit Payment Details', onPress: openPaySheet  },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [openEditSheet, openPaySheet]);

  // ── Invite ────────────────────────────────────────────────────────────────
  const handleInvite = useCallback(() => {
    Haptics.selectionAsync();
    const inviteCode = (circle as any)?.inviteCode ?? '';
    const deepLink   = `aku://circle/join?circleId=${circleId}&code=${inviteCode}`;

    const shareCode = async () => {
      if (inviteCode) {
        await Clipboard.setStringAsync(inviteCode);
        showToast('success', `Code ${inviteCode} copied!`);
      } else {
        showToast('info', 'No invite code available');
      }
    };

    const shareLink = async () => {
      try {
        await Share.share({
          message: `Join my ${circleEmoji} ${circle?.name ?? 'Circle'} on Akù!\n\nTap: ${deepLink}\n\nOr enter code: ${inviteCode}`,
          title:   `Join ${circle?.name ?? 'Circle'} on Akù`,
          url:     deepLink,
        });
      } catch {
        showToast('error', 'Could not open share sheet');
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Copy Invite Code', 'Share Invite Link', 'Cancel'], cancelButtonIndex: 2 },
        (idx) => { if (idx === 0) shareCode(); if (idx === 1) shareLink(); },
      );
    } else {
      Alert.alert('Invite Members', undefined, [
        { text: 'Copy Invite Code', onPress: shareCode },
        { text: 'Share Link',       onPress: shareLink },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [circle, circleId, showToast]);

  // ── Copy payment details ──────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!settings?.accountNumber) return;
    const details = [
      settings.bankName     ? `Institution: ${settings.bankName}`   : null,
      settings.accountNumber ? `Account: ${settings.accountNumber}` : null,
      settings.accountName  ? `Name: ${settings.accountName}`       : null,
      settings.notes        ? `Notes: ${settings.notes}`            : null,
    ].filter(Boolean).join('\n');
    await Clipboard.setStringAsync(details || settings.accountNumber);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('success', 'Account details copied');
  }, [settings, showToast]);

  // ── Verify / delete contribution ──────────────────────────────────────────
  const handleVerify = useCallback(async (c: CircleContribution) => {
    if (!user) return;
    Alert.alert(
      'Verify Contribution',
      `Mark ${fmt(c.amount)} from ${c.userName} as verified?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify',
          onPress: async () => {
            await verifyContribution(c.id, user.id);
            showToast('success', 'Verified ✓');
          },
        },
      ],
    );
  }, [user, verifyContribution, showToast, fmt]);

  const handleDeleteContribution = useCallback(async (c: CircleContribution) => {
    Alert.alert('Remove Entry', `Remove ${fmt(c.amount)} entry?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => { await deleteContribution(c.id); showToast('info', 'Removed'); },
      },
    ]);
  }, [deleteContribution, showToast, fmt]);

  // ── Remove member (admin only) ────────────────────────────────────────────
  const handleRemoveMember = useCallback((memberId: string, memberName: string) => {
    Alert.alert(
      'Remove Member',
      `Remove ${memberName} from this circle?\n\nTheir contribution history will remain.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeMember(memberId);
            showToast('info', `${memberName} removed`);
          },
        },
      ],
    );
  }, [removeMember, showToast]);

  // ── Computed values ───────────────────────────────────────────────────────
  const myContributions = useMemo(
    () => contributions.filter((c) => c.userId === user?.id), [contributions, user],
  );
  const pendingAll = useMemo(
    () => contributions.filter((c) => c.status === 'pending'), [contributions],
  );
  const grandVerified = useMemo(
    () => contributions.filter((c) => c.status === 'verified').reduce((s, c) => s + c.amount, 0),
    [contributions],
  );
  const targetPct = settings?.targetAmount && settings.targetAmount > 0
    ? Math.min(Math.round((grandVerified / settings.targetAmount) * 100), 100)
    : null;

  const effectivePerMember = useMemo(() => {
    if (settings?.perMemberAmount && settings.perMemberAmount > 0) return settings.perMemberAmount;
    if (settings?.targetAmount && settings.targetAmount > 0 && members.length > 0) {
      return Math.ceil(settings.targetAmount / members.length);
    }
    return 0;
  }, [settings, members.length]);

  if (!circle) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[text.body, { color: colors.textSecondary }]}>Circle not found.</Text>
      </View>
    );
  }

  const circleEmoji = settings?.emoji ?? '💰';

  // ── MEMBERS TAB ───────────────────────────────────────────────────────────
  const MembersTab = (
    <ScrollView
      contentContainerStyle={[styles.tabBody, { paddingBottom: insets.bottom + layout.tabBarHeight + 40, paddingHorizontal: layout.screenPadding }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Frequency / per-member / deadline meta bar */}
      {(settings?.frequency || settings?.deadline || effectivePerMember > 0) ? (
        <View style={[styles.metaRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {settings?.frequency && (
            <View style={styles.metaCell}>
              <Text style={[text.caption, { color: colors.textTertiary }]}>Frequency</Text>
              <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }}>
                {FREQ_LABELS[settings.frequency]}
              </Text>
            </View>
          )}
          {effectivePerMember > 0 && (
            <>
              {settings?.frequency && <View style={{ width: 1, backgroundColor: colors.border, alignSelf: 'stretch', marginHorizontal: 12 }} />}
              <View style={styles.metaCell}>
                <Text style={[text.caption, { color: colors.textTertiary }]}>
                  Per member{!settings?.perMemberAmount ? ' (split)' : ''}
                </Text>
                <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.primary }}>
                  {fmt(effectivePerMember)}
                </Text>
              </View>
            </>
          )}
          {settings?.deadline && (
            <>
              <View style={{ width: 1, backgroundColor: colors.border, alignSelf: 'stretch', marginHorizontal: 12 }} />
              <View style={styles.metaCell}>
                <Text style={[text.caption, { color: colors.textTertiary }]}>Deadline</Text>
                <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }}>
                  {fmtShortDate(settings.deadline)}
                </Text>
              </View>
            </>
          )}
        </View>
      ) : null}

      {/* Members header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }}>
        <Text style={[text.labelCaps, { color: colors.textTertiary, marginLeft: 2 }]}>
          Members · {members.length}
        </Text>
        <Pressable
          onPress={handleInvite}
          style={[styles.inviteBtn, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '30' }]}
        >
          <UserPlus size={13} color={colors.primary} strokeWidth={2} />
          <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.xs, color: colors.primary }}>Invite</Text>
        </Pressable>
      </View>

      {memberStatuses.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: colors.border }]}>
          <Users size={24} color={colors.textTertiary} strokeWidth={1.4} />
          <Text style={[text.bodySm, { color: colors.textTertiary, marginTop: 6, textAlign: 'center' }]}>
            No members yet.{'\n'}Tap Invite to share the code or link.
          </Text>
        </View>
      ) : (
        <Animated.View
          entering={FadeInDown.duration(280)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}
        >
          {memberStatuses.map((ms, idx) => {
            const memberRecord = members.find((m) => m.userId === ms.userId);
            return (
              <MemberRow
                key={ms.memberId}
                ms={ms}
                fmt={fmt}
                isLast={idx === memberStatuses.length - 1}
                isOwner={isOwner}
                onRemove={memberRecord && ms.role !== 'owner'
                  ? () => handleRemoveMember(memberRecord.id, ms.name)
                  : undefined
                }
              />
            );
          })}
        </Animated.View>
      )}

      {/* Payment details */}
      {(settings?.accountNumber || settings?.bankName || settings?.accountName) ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }}>
            <Text style={[text.labelCaps, { color: colors.textTertiary, marginLeft: 2 }]}>Payment Details</Text>
            {isOwner && (
              <Pressable onPress={openPaySheet} hitSlop={8}>
                <Text style={[text.caption, { color: colors.primary }]}>Edit</Text>
              </Pressable>
            )}
          </View>
          <Animated.View
            entering={FadeInDown.duration(280)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            {settings.bankName ? (
              <View style={styles.acctRow}>
                <Building2 size={16} color={colors.textTertiary} strokeWidth={1.8} />
                <View style={{ flex: 1 }}>
                  <Text style={[text.caption, { color: colors.textTertiary }]}>Institution / Platform</Text>
                  <Text style={[text.bodyMedium, { color: colors.text }]}>{settings.bankName}</Text>
                </View>
              </View>
            ) : null}
            {settings.accountNumber ? (
              <>
                {settings.bankName && <Divider style={{ marginVertical: 8 }} />}
                <View style={styles.acctRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[text.caption, { color: colors.textTertiary }]}>Account / Reference</Text>
                    <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.xl, letterSpacing: 2, color: colors.text }}>
                      {settings.accountNumber}
                    </Text>
                  </View>
                  <Pressable onPress={handleCopy} style={[styles.copyBtn, { backgroundColor: colors.primary + '14' }]}>
                    <Copy size={16} color={colors.primary} strokeWidth={1.8} />
                  </Pressable>
                </View>
              </>
            ) : null}
            {settings.accountName ? (
              <>
                <Divider style={{ marginVertical: 8 }} />
                <View style={styles.acctRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[text.caption, { color: colors.textTertiary }]}>Recipient Name</Text>
                    <Text style={[text.bodyMedium, { color: colors.text }]}>{settings.accountName}</Text>
                  </View>
                </View>
              </>
            ) : null}
            {settings.notes ? (
              <>
                <Divider style={{ marginVertical: 8 }} />
                <Text style={[text.bodySm, { color: colors.textSecondary, fontStyle: 'italic' }]}>{settings.notes}</Text>
              </>
            ) : null}
          </Animated.View>
        </>
      ) : isOwner ? (
        <>
          <SectionLabel label="Payment Details" />
          <Pressable onPress={openPaySheet} style={[styles.emptyCard, { borderColor: colors.border, borderStyle: 'dashed' }]}>
            <CreditCard size={20} color={colors.textTertiary} strokeWidth={1.5} />
            <Text style={[text.bodySm, { color: colors.textTertiary, marginTop: 6, textAlign: 'center' }]}>
              Add payment details so members know where to send funds{'\n'}(optional — tap to set up)
            </Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );

  // ── ACTIVITY TAB ──────────────────────────────────────────────────────────
  const ActivityTab = (
    <ScrollView
      contentContainerStyle={[styles.tabBody, { paddingBottom: insets.bottom + layout.tabBarHeight + 80, paddingHorizontal: layout.screenPadding }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Admin: Pending Approvals — shown first so admin acts quickly */}
      {isOwner && pendingAll.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 10 }}>
            <Text style={[text.labelCaps, { color: colors.textTertiary, marginLeft: 2 }]}>
              Pending Approvals · {pendingAll.length}
            </Text>
            <AdminPill />
          </View>
          <Animated.View
            entering={FadeInDown.duration(280)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}
          >
            {pendingAll.map((c, idx) => (
              <View key={c.id}>
                <View style={[styles.pendingRow, { paddingHorizontal: 14 }]}>
                  <Avatar name={c.userName} size={34} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }} numberOfLines={1}>
                      {c.userName || 'Member'}
                    </Text>
                    <Text style={[text.caption, { color: colors.textTertiary }]}>
                      {fmtDate(c.createdAt)}{c.note ? ` · ${c.note}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text, marginRight: 10 }}>
                    {fmt(c.amount)}
                  </Text>
                  <Pressable onPress={() => handleVerify(c)} style={[styles.iconBtn, { backgroundColor: colors.primary }]} disabled={isSaving}>
                    <ShieldCheck size={14} color="#FAF9F5" strokeWidth={2} />
                  </Pressable>
                  <Pressable onPress={() => handleDeleteContribution(c)} style={[styles.iconBtn, { backgroundColor: colors.dangerBg, marginLeft: 6 }]} disabled={isSaving}>
                    <Trash2 size={14} color={colors.danger} strokeWidth={2} />
                  </Pressable>
                </View>
                {idx < pendingAll.length - 1 && <Divider style={{ marginLeft: 58 }} />}
              </View>
            ))}
          </Animated.View>
        </>
      )}

      {/* Leaderboard */}
      <SectionLabel label="Leaderboard" />
      {leaderboard.length === 0 ? (
        <Animated.View entering={FadeInDown.duration(280)} style={[styles.emptyCard, { borderColor: colors.border }]}>
          <TrendingUp size={24} color={colors.textTertiary} strokeWidth={1.4} />
          <Text style={[text.bodySm, { color: colors.textTertiary, marginTop: 6, textAlign: 'center' }]}>
            No contributions yet.{'\n'}Tap "Log Contribution" to get started.
          </Text>
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeInDown.duration(280)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}
        >
          {leaderboard.map((entry, idx) => {
            const medal  = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
            const isLast = idx === leaderboard.length - 1;
            return (
              <View key={entry.userId}>
                <View style={[styles.leaderRow, { paddingHorizontal: 14 }]}>
                  <View style={styles.rankCol}>
                    {medal
                      ? <Text style={{ fontSize: 18 }}>{medal}</Text>
                      : <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.textTertiary }}>#{entry.rank}</Text>}
                  </View>
                  <Avatar name={entry.userName} size={36} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }} numberOfLines={1}>
                      {entry.userName || 'Member'}
                    </Text>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 4, overflow: 'hidden' }}>
                      <View style={{ height: 4, borderRadius: 2, width: `${entry.percentage}%`, backgroundColor: idx === 0 ? '#D4A017' : idx === 1 ? '#A8A9AD' : idx === 2 ? '#B87333' : colors.primary }} />
                    </View>
                    <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                      {entry.contributionCount} entr{entry.contributionCount !== 1 ? 'ies' : 'y'}
                      {entry.totalPending > 0 ? ` · ${fmt(entry.totalPending)} pending` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.primary }}>{fmt(entry.totalVerified)}</Text>
                    <Text style={[text.caption, { color: colors.textTertiary }]}>{entry.percentage}%</Text>
                  </View>
                </View>
                {!isLast && <Divider style={{ marginLeft: 60 }} />}
              </View>
            );
          })}
        </Animated.View>
      )}

      {/* My Contributions */}
      <SectionLabel label="My Contributions" />
      {myContributions.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: colors.border }]}>
          <Text style={[text.bodySm, { color: colors.textTertiary, textAlign: 'center' }]}>
            You haven't logged any contributions yet.
          </Text>
        </View>
      ) : (
        <Animated.View
          entering={FadeInDown.duration(280)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}
        >
          {myContributions.map((c, idx) => (
            <View key={c.id}>
              <View style={[styles.myRow, { paddingHorizontal: 14 }]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.base, color: colors.text }}>
                      {fmt(c.amount)}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: c.status === 'verified' ? '#D1FAE5' : '#FEF3C7' }]}>
                      <Text style={{ fontFamily: font.sansSemiBold, fontSize: 9, color: c.status === 'verified' ? '#065F46' : '#92400E', letterSpacing: 0.4 }}>
                        {c.status === 'verified' ? '✓ VERIFIED' : '⏳ PENDING'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                    {fmtDate(c.createdAt)}{c.note ? ` · ${c.note}` : ''}
                  </Text>
                </View>
                {c.status === 'pending' && (
                  <Pressable onPress={() => handleDeleteContribution(c)} hitSlop={8} disabled={isSaving}>
                    <Trash2 size={16} color={colors.textTertiary} strokeWidth={1.6} />
                  </Pressable>
                )}
              </View>
              {idx < myContributions.length - 1 && <Divider />}
            </View>
          ))}
        </Animated.View>
      )}
    </ScrollView>
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>

      {/* ── Header band ── */}
      <View style={[styles.headerBand, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
            <ArrowLeft size={22} color="#FAF9F5" strokeWidth={1.8} />
          </Pressable>

          <View style={{ flex: 1, marginHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 26 }}>{circleEmoji}</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: '#FAF9F5', letterSpacing: -0.5 }}
                numberOfLines={1}
              >
                {circle.name}
              </Text>
              {isOwner && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                  <Crown size={10} color="#C4E07A" strokeWidth={2} />
                  <Text style={{ fontFamily: font.sansSemiBold, fontSize: 10, color: '#C4E07A', letterSpacing: 0.4 }}>ADMIN</Text>
                </View>
              )}
            </View>
          </View>

          {/* Admin-only settings gear */}
          {isOwner && (
            <Pressable onPress={handleSettingsMenu} hitSlop={8} style={styles.headerBtn}>
              <Settings2 size={20} color="#FAF9F5" strokeWidth={1.8} />
            </Pressable>
          )}
        </View>

        {settings?.description && (
          <Text style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: 'rgba(250,249,245,0.65)', marginTop: 6, marginHorizontal: 4, lineHeight: 20 }}>
            {settings.description}
          </Text>
        )}

        {/* Goal progress bar */}
        {settings?.targetAmount && settings.targetAmount > 0 && targetPct !== null && (
          <View style={styles.progressCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontFamily: font.sansMedium, fontSize: fontSize.sm, color: 'rgba(250,249,245,0.7)' }}>
                Group Goal
              </Text>
              <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: '#C4E07A' }}>
                {targetPct}%
              </Text>
            </View>
            <View style={styles.bigBarWrap}>
              <View style={[styles.bigBar, { width: `${targetPct}%`, backgroundColor: targetPct >= 100 ? '#16C172' : '#C4E07A' }]} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: '#FAF9F5' }}>
                {fmt(grandVerified)} verified
              </Text>
              <Text style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: 'rgba(250,249,245,0.5)' }}>
                of {fmt(settings.targetAmount)}
              </Text>
            </View>
          </View>
        )}

        <TabSwitcher
          active={activeTab}
          onChange={setActiveTab}
          pendingCount={isOwner ? pendingAll.length : 0}
        />
      </View>

      {isLoading
        ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        : activeTab === 'members' ? MembersTab : ActivityTab}

      {/* Log Contribution FAB (Activity tab — all members) */}
      {activeTab === 'activity' && (
        <View style={[styles.fab, { bottom: insets.bottom + layout.tabBarHeight + 16, right: layout.screenPadding }]}>
          <Pressable
            onPress={() => {
              logSheetRef.current?.present();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
            style={[styles.fabBtn, { backgroundColor: colors.primary }]}
          >
            <Plus size={22} color="#FAF9F5" strokeWidth={2} />
            <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: '#FAF9F5' }}>
              Log Contribution
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Log Contribution Sheet (all members) ── */}
      <BottomSheetModal
        ref={logSheetRef}
        snapPoints={['52%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetView style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16 }}>
          <Text style={{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text, marginBottom: 4 }}>
            Log Contribution
          </Text>
          <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 20 }]}>
            Enter the amount you've contributed. The admin will verify it.
          </Text>
          <AmountInput label="Amount" value={logAmountKobo} onChange={setLogAmountKobo} size="md" style={{ marginBottom: 12 }} />
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground, marginBottom: 20 }]}>
            <TextInput
              value={logNote}
              onChangeText={setLogNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.inputPlaceholder}
              style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: colors.text, padding: 14 }}
            />
          </View>
          <Button
            variant="primary"
            label={isSaving ? 'Saving…' : 'Submit'}
            onPress={handleLog}
            disabled={isSaving || logAmountKobo <= 0}
          />
        </BottomSheetView>
      </BottomSheetModal>

      {/* ── Edit Circle Sheet (admin only) ── */}
      <BottomSheetModal
        ref={editSheetRef}
        snapPoints={['85%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text style={{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text }}>Edit Circle</Text>
            <AdminPill />
          </View>
          <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 20 }]}>
            Update goal, frequency, and contribution rules.
          </Text>

          {/* Emoji */}
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8 }]}>Circle Icon</Text>
          <FlatList
            data={CIRCLE_EMOJIS}
            keyExtractor={(e) => e}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, marginBottom: 20 }}
            renderItem={({ item: e }) => (
              <Pressable
                onPress={() => setEditEmoji(e)}
                style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: editEmoji === e ? '#163A2F' : colors.backgroundSecondary, borderWidth: 1.5, borderColor: editEmoji === e ? '#163A2F' : colors.border }}
              >
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </Pressable>
            )}
          />

          {/* Purpose */}
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>Purpose (optional)</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground, marginBottom: 16 }]}>
            <TextInput
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder="e.g. Monthly house savings, Trip fund"
              placeholderTextColor={colors.inputPlaceholder}
              style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: colors.text, padding: 14 }}
            />
          </View>

          {/* Goal */}
          <AmountInput label="Group Goal (optional)" value={editTargetKobo} onChange={setEditTargetKobo} size="md" style={{ marginBottom: 16 }} />

          {/* Frequency */}
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8 }]}>Contribution Frequency</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 16 }}>
            {(Object.keys(FREQ_LABELS) as CircleFrequency[]).map((f) => (
              <Pressable
                key={f}
                onPress={() => setEditFrequency(f)}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, borderWidth: 1.5, backgroundColor: editFrequency === f ? '#163A2F' : colors.backgroundSecondary, borderColor: editFrequency === f ? '#163A2F' : colors.border }}
              >
                <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: editFrequency === f ? '#FAF9F5' : colors.textSecondary }}>
                  {FREQ_LABELS[f]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Per-member */}
          <AmountInput label="Per-member Amount (optional)" value={editPerMember} onChange={setEditPerMember} size="md" style={{ marginBottom: 4 }} />
          <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 16 }]}>
            Leave 0 to auto-split the group goal equally among members.
          </Text>

          {/* Deadline */}
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>Deadline (optional)</Text>
          <Pressable
            onPress={() => setShowDeadlinePicker(true)}
            style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, marginBottom: 24 }]}
          >
            <Text style={{ flex: 1, fontFamily: font.sansRegular, fontSize: fontSize.sm, color: editDeadline ? colors.text : colors.inputPlaceholder }}>
              {editDeadline ? fmtShortDate(editDeadline) : 'No deadline'}
            </Text>
            {editDeadline
              ? <Pressable onPress={() => setEditDeadline('')}><Check size={16} color={colors.primary} strokeWidth={2} /></Pressable>
              : <Calendar size={16} color={colors.textTertiary} strokeWidth={1.8} />}
          </Pressable>

          <Button variant="primary" label={isSaving ? 'Saving…' : 'Save Circle Details'} onPress={handleSaveDetails} disabled={isSaving} />
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* ── Payment Details Sheet (admin only) ── */}
      <BottomSheetModal
        ref={paySheetRef}
        snapPoints={['70%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text style={{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text }}>Payment Details</Text>
            <AdminPill />
          </View>
          <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 20, lineHeight: 18 }]}>
            Where should members send their contributions?
          </Text>

          {([
            { label: 'Institution / Platform', value: editBankName,   setter: setEditBankName,   placeholder: 'e.g. Bank, PayPal, Venmo'  },
            { label: 'Account / Reference',    value: editAcctNumber, setter: setEditAcctNumber, placeholder: 'Account number, phone, ID…' },
            { label: 'Recipient Name',         value: editAcctName,   setter: setEditAcctName,   placeholder: 'Who receives the payment'   },
            { label: 'Notes',                  value: editNotes,      setter: setEditNotes,      placeholder: 'Any extra instructions'      },
          ] as const).map((f) => (
            <View key={f.label} style={{ marginBottom: 14 }}>
              <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>{f.label}</Text>
              <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
                <TextInput
                  value={f.value}
                  onChangeText={f.setter}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.inputPlaceholder}
                  style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: colors.text, padding: 14 }}
                />
              </View>
            </View>
          ))}

          <View style={{ marginTop: 8 }}>
            <Button variant="primary" label={isSaving ? 'Saving…' : 'Save Payment Details'} onPress={handleSavePayment} disabled={isSaving} />
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>

      <AkuDatePicker
        isOpen={showDeadlinePicker}
        value={editDeadline || todayString()}
        onChange={(iso) => { setEditDeadline(iso); setShowDeadlinePicker(false); }}
        onClose={() => setShowDeadlinePicker(false)}
        title="Set deadline"
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:      { flex: 1 },
  headerBand:  { backgroundColor: '#163A2F', paddingHorizontal: 16, paddingBottom: 16 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', paddingBottom: 4 },
  headerBtn:   { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  adminPill:   {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(196,224,122,0.12)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(196,224,122,0.25)',
  },
  progressCard:{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginTop: 12 },
  bigBarWrap:  { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, height: 10, overflow: 'hidden' },
  bigBar:      { height: 10, borderRadius: 6 },
  tabBody:     { paddingTop: 8 },
  metaRow:     { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 8, alignItems: 'center' },
  metaCell:    { flex: 1, gap: 2 },
  card:        { borderRadius: 14, borderWidth: 1, padding: 14 },
  emptyCard:   { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 6 },
  badge:       { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  memberRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  acctRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  copyBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  leaderRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  rankCol:     { width: 30, alignItems: 'center', marginRight: 8 },
  pendingRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  iconBtn:     { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  myRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  fab:         { position: 'absolute' },
  fabBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 100, shadowColor: '#163A2F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  inputWrap:   { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  inviteBtn:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 1 },
});
