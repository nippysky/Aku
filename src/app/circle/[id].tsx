/**
 * circle/[id].tsx — Contribution Group Detail
 *
 * Three tabs (admin) / two tabs (member):
 *  [Members]      — member payment status, goal progress, payment details
 *  [Activity]     — leaderboard, my contributions
 *  [Contributions]— (admin only) pending approvals with approve/deny+reason, full log
 *
 * Fully branded: no Alert.alert, no ActionSheetIOS, no native Share modal.
 * All confirmations use AkuAlert (in-app modal).
 * Invite and admin settings use branded BottomSheetModal sheets.
 * Member removal pushes real-time notification via server.
 * Circle settings (frequency/goal/etc.) sync via server so all members see same data.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// RNGH ScrollView: resolves gesture conflict with BottomSheetScrollView's pan
// handler so horizontal carousels inside sheets actually scroll.
import { ScrollView } from 'react-native-gesture-handler';
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
  CheckCircle2,
  Copy,
  Crown,
  Link2,
  Plus,
  Settings2,
  Share2,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  Activity,
  CreditCard,
  XCircle,
  X,
  LayoutList,
} from 'lucide-react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
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

// ─── AkuAlert — branded in-app confirmation modal ─────────────────────────────

interface AlertConfig {
  title:        string;
  message?:     string;
  confirmLabel: string;
  danger?:      boolean;
  onConfirm:    () => void | Promise<void>;
  onCancel:     () => void;
}

function AkuAlert({ config }: { config: AlertConfig | null }) {
  const { colors, font, fontSize } = useTheme();
  if (!config) return null;
  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <Pressable style={styles.alertOverlay} onPress={config.onCancel}>
        <Pressable style={[styles.alertCard, { backgroundColor: colors.card }]} onPress={() => {}}>
          <Text style={{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: '#163A2F', marginBottom: 8 }}>
            {config.title}
          </Text>
          {config.message ? (
            <Text style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: 20 }}>
              {config.message}
            </Text>
          ) : <View style={{ height: 12 }} />}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={config.onCancel}
              style={[styles.alertBtn, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, flex: 1 }]}
            >
              <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.textSecondary }}>
                {config.danger ? 'Cancel' : 'Cancel'}
              </Text>
            </Pressable>
            <Pressable
              onPress={async () => { await config.onConfirm(); config.onCancel(); }}
              style={[styles.alertBtn, { backgroundColor: config.danger ? '#FF3B30' : '#163A2F', flex: 1 }]}
            >
              <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: '#FAF9F5' }}>
                {config.confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Tab switcher ─────────────────────────────────────────────────────────────

type TabKey = 'members' | 'activity' | 'contributions';

function TabSwitcher({
  active,
  onChange,
  pendingCount,
  isAdmin,
}: {
  active:       TabKey;
  onChange:     (t: TabKey) => void;
  pendingCount: number;
  isAdmin:      boolean;
}) {
  const { font, fontSize } = useTheme();

  const tabs: { key: TabKey; label: string; Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }> }[] = [
    { key: 'members',       label: 'Members',      Icon: Users       },
    { key: 'activity',      label: 'Activity',     Icon: Activity    },
    ...(isAdmin ? [{ key: 'contributions' as const, label: 'Contributions', Icon: LayoutList }] : []),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginTop: 14 }}
      contentContainerStyle={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 100, padding: 3, alignSelf: 'flex-start' }}
    >
      {tabs.map(({ key, label, Icon }) => {
        const isActive   = active === key;
        const showBadge  = key === 'contributions' && pendingCount > 0;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: isActive ? 'rgba(255,255,255,0.18)' : 'transparent' }}
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
    </ScrollView>
  );
}

// ─── Member payment row ───────────────────────────────────────────────────────

function MemberRow({
  ms, fmt, isLast, isOwner, onRemove,
}: {
  ms:       MemberPaymentStatus;
  fmt:      (n: number) => string;
  isLast:   boolean;
  isOwner:  boolean;
  onRemove?: () => void;
}) {
  const { colors, font, fontSize, text } = useTheme();

  const isGenerous  = ms.expectedAmount > 0 && ms.verifiedAmount > ms.expectedAmount;
  const paidPct     = ms.expectedAmount > 0
    ? Math.round((ms.verifiedAmount / ms.expectedAmount) * 100)
    : 0;
  const basePct     = Math.min(paidPct, 100);
  const overflowPct = isGenerous ? Math.min(paidPct - 100, 60) : 0;

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
                <View style={{ height: 4, backgroundColor: ms.status === 'overdue' ? '#FF3B30' : ms.status === 'partial' ? '#F59E0B' : '#16C172', width: `${basePct}%` }} />
                {isGenerous && overflowPct > 0 && (
                  <View style={{ height: 4, backgroundColor: '#C4E07A', width: `${overflowPct}%` }} />
                )}
              </View>
              <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                {fmt(ms.verifiedAmount)}{ms.expectedAmount > 0 ? ` of ${fmt(ms.expectedAmount)}` : ''}
                {isGenerous
                  ? ` · ${paidPct - 100}% extra 🙌`
                  : ms.pendingAmount > 0
                    ? ` · ${fmt(ms.pendingAmount)} pending`
                    : ms.status === 'overdue'
                      ? ' · overdue'
                      : ''}
              </Text>
            </>
          ) : (
            <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
              {ms.role === 'owner' ? 'Admin' : 'Member'}
            </Text>
          )}
        </View>

        {/* Admin: remove member icon (non-owner members only) */}
        {isOwner && ms.role !== 'owner' && onRemove && (
          <Pressable onPress={onRemove} hitSlop={10} style={{ marginLeft: 8, padding: 4 }}>
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

  const { user }                    = useAuthStore();
  const { circles, syncVersion }    = useCirclesStore();
  const { updateName: updateCircleName } = useCirclesStore();
  const { showToast }               = useUIStore();
  const { fmt }                     = useCurrencyFormat();

  const {
    settings, contributions, leaderboard,
    members, memberStatuses,
    isLoading, isSaving,
    loadCircle, saveSettings,
    logContribution, verifyContribution, deleteContribution, denyContribution,
    removeMember,
  } = useCircleStore();

  const circle  = useMemo(() => circles.find((c) => c.id === circleId) ?? null, [circles, circleId]);
  const isOwner = !!user && !!circle && circle.ownerId === user.id;

  const [activeTab, setActiveTab] = useState<TabKey>('members');

  useEffect(() => {
    if (circleId) loadCircle(circleId);
  }, [circleId]);

  useEffect(() => {
    if (circleId && syncVersion > 0) loadCircle(circleId);
  }, [syncVersion]);

  // ── Sheet refs ────────────────────────────────────────────────────────────
  const logSheetRef      = useRef<BottomSheetModal>(null);
  const editSheetRef     = useRef<BottomSheetModal>(null);
  const paySheetRef      = useRef<BottomSheetModal>(null);
  const inviteSheetRef   = useRef<BottomSheetModal>(null);
  const settingsMenuRef  = useRef<BottomSheetModal>(null);
  const denySheetRef     = useRef<BottomSheetModal>(null);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ), [],
  );

  // ── AkuAlert state ────────────────────────────────────────────────────────
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

  const showAlert = useCallback((cfg: Omit<AlertConfig, 'onCancel'>) => {
    setAlertConfig({ ...cfg, onCancel: () => setAlertConfig(null) });
  }, []);

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
  const [editName,           setEditName]           = useState('');
  const [editEmoji,          setEditEmoji]          = useState('💰');
  const [editDesc,           setEditDesc]           = useState('');
  const [editTargetKobo,     setEditTargetKobo]     = useState(0);
  const [editFrequency,      setEditFrequency]      = useState<CircleFrequency>('monthly');
  const [editPerMember,      setEditPerMember]      = useState(0);
  const [editDeadline,       setEditDeadline]       = useState('');
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);

  const openEditSheet = useCallback(() => {
    setEditName(circle?.name ?? '');
    setEditEmoji(settings?.emoji ?? '💰');
    setEditDesc(settings?.description ?? '');
    setEditTargetKobo(settings?.targetAmount ?? 0);
    setEditFrequency((settings?.frequency ?? 'monthly') as CircleFrequency);
    setEditPerMember(settings?.perMemberAmount ?? 0);
    setEditDeadline(settings?.deadline ?? '');
    editSheetRef.current?.present();
  }, [circle, settings]);

  const handleSaveDetails = useCallback(async () => {
    if (!circleId) return;
    const trimmedName = editName.trim();
    if (trimmedName && trimmedName !== circle?.name) {
      await updateCircleName(circleId, trimmedName);
    }
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
  }, [circleId, circle, editName, editEmoji, editDesc, editTargetKobo, editFrequency, editPerMember, editDeadline, updateCircleName, saveSettings, showToast]);

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

  // ── Derived display values ─────────────────────────────────────────────────
  const circleEmoji  = settings?.emoji ?? '💰';
  const inviteCode   = (circle as any)?.inviteCode ?? '';
  const joinUrl      = `https://nippysky.com/ventures/aku/join?code=${inviteCode}`;
  const circleName   = circle?.name ?? 'Circle';

  // ── Invite actions ────────────────────────────────────────────────────────
  const handleCopyCode = useCallback(async () => {
    if (!inviteCode) { showToast('info', 'No invite code available'); return; }
    await Clipboard.setStringAsync(inviteCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('success', `Code ${inviteCode} copied!`);
  }, [inviteCode, showToast]);

  const handleShareLink = useCallback(async () => {
    if (!inviteCode) { showToast('info', 'No invite code available'); return; }
    try {
      const message =
        `${circleEmoji} Join "${circleName}" on Akù — the smart money circle app!\n\n` +
        `Tap to join instantly:\n${joinUrl}\n\n` +
        `Or enter code: ${inviteCode}`;
      await Share.share({ message, title: `Join ${circleName} on Akù` });
    } catch {
      showToast('error', 'Could not open share sheet');
    }
  }, [inviteCode, circleEmoji, circleName, joinUrl, showToast]);

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

  // ── Verify contribution ───────────────────────────────────────────────────
  const handleVerify = useCallback((c: CircleContribution) => {
    if (!user) return;
    showAlert({
      title:        'Verify Contribution',
      message:      `Mark ${fmt(c.amount)} from ${c.userName} as verified?`,
      confirmLabel: 'Verify ✓',
      onConfirm:    async () => {
        await verifyContribution(c.id, user.id);
        showToast('success', 'Verified ✓');
      },
    });
  }, [user, verifyContribution, showToast, fmt, showAlert]);

  // ── Delete contribution ───────────────────────────────────────────────────
  const handleDeleteContribution = useCallback((c: CircleContribution) => {
    showAlert({
      title:        'Remove Entry',
      message:      `Remove this ${fmt(c.amount)} entry?`,
      confirmLabel: 'Remove',
      danger:       true,
      onConfirm:    async () => { await deleteContribution(c.id); showToast('info', 'Removed'); },
    });
  }, [deleteContribution, showToast, fmt, showAlert]);

  // ── Deny contribution (admin) — opens sheet for reason ───────────────────
  const [denyTarget, setDenyTarget] = useState<CircleContribution | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const handleDeny = useCallback((c: CircleContribution) => {
    setDenyTarget(c);
    setDenyReason('');
    denySheetRef.current?.present();
  }, []);

  const handleConfirmDeny = useCallback(async () => {
    if (!denyTarget) return;
    await denyContribution(denyTarget.id, denyReason);
    denySheetRef.current?.dismiss();
    setDenyTarget(null);
    setDenyReason('');
    showToast('info', 'Contribution declined');
  }, [denyTarget, denyReason, denyContribution, showToast]);

  // ── Remove member (admin only) ────────────────────────────────────────────
  const handleRemoveMember = useCallback((memberId: string, memberUserId: string, memberName: string) => {
    showAlert({
      title:        'Remove Member',
      message:      `Remove ${memberName} from this circle?\n\nAll members will be notified. Their contribution history will remain.`,
      confirmLabel: 'Remove',
      danger:       true,
      onConfirm:    async () => {
        await removeMember(memberId, memberUserId, memberName);
        showToast('info', `${memberName} removed`);
      },
    });
  }, [removeMember, showToast, showAlert]);

  // ── Computed values ───────────────────────────────────────────────────────
  const myContributions = useMemo(
    () => contributions.filter((c) => c.userId === user?.id), [contributions, user],
  );
  const pendingAll = useMemo(
    () => contributions.filter((c) => c.status === 'pending'), [contributions],
  );
  const allVerified = useMemo(
    () => contributions.filter((c) => c.status === 'verified'), [contributions],
  );
  const grandVerified = useMemo(
    () => allVerified.reduce((s, c) => s + c.amount, 0), [allVerified],
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
          onPress={() => { Haptics.selectionAsync(); inviteSheetRef.current?.present(); }}
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
                  ? () => handleRemoveMember(memberRecord.id, memberRecord.userId, ms.name)
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

  // ── CONTRIBUTIONS TAB (admin only) ────────────────────────────────────────
  const ContributionsTab = (
    <ScrollView
      contentContainerStyle={[styles.tabBody, { paddingBottom: insets.bottom + layout.tabBarHeight + 40, paddingHorizontal: layout.screenPadding }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Pending Approvals */}
      {pendingAll.length === 0 ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 10 }}>
            <Text style={[text.labelCaps, { color: colors.textTertiary, marginLeft: 2 }]}>Pending Approvals</Text>
            <AdminPill />
          </View>
          <View style={[styles.emptyCard, { borderColor: colors.border }]}>
            <CheckCircle2 size={24} color={colors.textTertiary} strokeWidth={1.4} />
            <Text style={[text.bodySm, { color: colors.textTertiary, marginTop: 6, textAlign: 'center' }]}>
              All clear — no pending contributions.
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 10 }}>
            <Text style={[text.labelCaps, { color: colors.textTertiary, marginLeft: 2 }]}>
              Pending Approvals · {pendingAll.length}
            </Text>
            <AdminPill />
          </View>
          <Text style={[text.bodySm, { color: colors.textTertiary, marginBottom: 10, lineHeight: 18 }]}>
            Verify to confirm, or deny with a reason — the member will be notified.
          </Text>
          <Animated.View
            entering={FadeInDown.duration(280)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}
          >
            {pendingAll.map((c, idx) => (
              <View key={c.id}>
                <View style={[styles.pendingRow, { paddingHorizontal: 14 }]}>
                  <Avatar name={c.userName} size={36} />
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
                  {/* Approve */}
                  <Pressable
                    onPress={() => handleVerify(c)}
                    style={[styles.iconBtn, { backgroundColor: '#163A2F' }]}
                    disabled={isSaving}
                  >
                    <ShieldCheck size={14} color="#C4E07A" strokeWidth={2} />
                  </Pressable>
                  {/* Deny */}
                  <Pressable
                    onPress={() => handleDeny(c)}
                    style={[styles.iconBtn, { backgroundColor: colors.dangerBg, marginLeft: 6 }]}
                    disabled={isSaving}
                  >
                    <XCircle size={14} color={colors.danger} strokeWidth={2} />
                  </Pressable>
                </View>
                {idx < pendingAll.length - 1 && <Divider style={{ marginLeft: 60 }} />}
              </View>
            ))}
          </Animated.View>
        </>
      )}

      {/* All Contributions log */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }}>
        <Text style={[text.labelCaps, { color: colors.textTertiary, marginLeft: 2 }]}>
          All Contributions · {contributions.length}
        </Text>
      </View>
      {contributions.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: colors.border }]}>
          <Text style={[text.bodySm, { color: colors.textTertiary, textAlign: 'center' }]}>
            No contributions logged yet.
          </Text>
        </View>
      ) : (
        <Animated.View
          entering={FadeInDown.duration(280)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, overflow: 'hidden' }]}
        >
          {contributions.map((c, idx) => (
            <View key={c.id}>
              <View style={[styles.myRow, { paddingHorizontal: 14 }]}>
                <Avatar name={c.userName} size={34} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }}>
                      {fmt(c.amount)}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: c.status === 'verified' ? '#D1FAE5' : '#FEF3C7' }]}>
                      <Text style={{ fontFamily: font.sansSemiBold, fontSize: 9, color: c.status === 'verified' ? '#065F46' : '#92400E', letterSpacing: 0.4 }}>
                        {c.status === 'verified' ? '✓ VERIFIED' : '⏳ PENDING'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[text.caption, { color: colors.textTertiary, marginTop: 1 }]}>
                    {c.userName} · {fmtDate(c.createdAt)}{c.note ? ` · ${c.note}` : ''}
                  </Text>
                </View>
                {c.status === 'pending' && (
                  <Pressable onPress={() => handleDeleteContribution(c)} hitSlop={8} disabled={isSaving}>
                    <Trash2 size={15} color={colors.textTertiary} strokeWidth={1.6} />
                  </Pressable>
                )}
              </View>
              {idx < contributions.length - 1 && <Divider style={{ marginLeft: 58 }} />}
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

          {/* Admin-only settings gear — opens branded settings menu sheet */}
          {isOwner && (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); settingsMenuRef.current?.present(); }}
              hitSlop={8}
              style={styles.headerBtn}
            >
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
          isAdmin={isOwner}
        />
      </View>

      {isLoading
        ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        : activeTab === 'members'
          ? MembersTab
          : activeTab === 'activity'
            ? ActivityTab
            : ContributionsTab}

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
        <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          <Text style={{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text, marginBottom: 4 }}>
            Log Contribution
          </Text>
          <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 20 }]}>
            Enter the amount you've contributed. The admin will verify it.
          </Text>
          <AmountInput label="Amount" value={logAmountKobo} onChange={setLogAmountKobo} size="md" style={{ marginBottom: 12 }} />
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground, marginBottom: 20 }]}>
            <BottomSheetTextInput
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
        </BottomSheetScrollView>
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
        <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text style={{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text }}>Edit Circle</Text>
            <AdminPill />
          </View>
          <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 20 }]}>
            Update name, goal, frequency, and contribution rules.
          </Text>

          {/* Circle Name */}
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>Circle Name</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground, marginBottom: 20 }]}>
            <BottomSheetTextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="e.g. Family Fund, Trip Savings"
              placeholderTextColor={colors.inputPlaceholder}
              maxLength={60}
              style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: colors.text, padding: 14 }}
            />
          </View>

          {/* Emoji */}
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 8 }]}>Circle Icon</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 20 }}>
            {CIRCLE_EMOJIS.map((e) => (
              <Pressable
                key={e}
                onPress={() => setEditEmoji(e)}
                style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: editEmoji === e ? '#163A2F' : colors.backgroundSecondary, borderWidth: 1.5, borderColor: editEmoji === e ? '#163A2F' : colors.border }}
              >
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Purpose */}
          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>Purpose (optional)</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground, marginBottom: 16 }]}>
            <BottomSheetTextInput
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
        <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text style={{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text }}>Payment Details</Text>
            <AdminPill />
          </View>
          <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 20, lineHeight: 18 }]}>
            Where should members send their contributions?
          </Text>

          <View style={{ marginBottom: 14 }}>
            <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>Institution / Platform</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
              <BottomSheetTextInput
                value={editBankName}
                onChangeText={setEditBankName}
                placeholder="e.g. GTBank, Opay, PayPal, Venmo"
                placeholderTextColor={colors.inputPlaceholder}
                style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: colors.text, padding: 14 }}
              />
            </View>
          </View>
          <View style={{ marginBottom: 14 }}>
            <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>Account / Reference</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
              <BottomSheetTextInput
                value={editAcctNumber}
                onChangeText={setEditAcctNumber}
                placeholder="Account number, phone, wallet ID…"
                placeholderTextColor={colors.inputPlaceholder}
                keyboardType="default"
                style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: colors.text, padding: 14 }}
              />
            </View>
          </View>
          <View style={{ marginBottom: 14 }}>
            <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>Recipient Name</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
              <BottomSheetTextInput
                value={editAcctName}
                onChangeText={setEditAcctName}
                placeholder="Who receives the payment"
                placeholderTextColor={colors.inputPlaceholder}
                style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: colors.text, padding: 14 }}
              />
            </View>
          </View>
          <View style={{ marginBottom: 20 }}>
            <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>Notes (optional)</Text>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
              <BottomSheetTextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Any extra instructions for members"
                placeholderTextColor={colors.inputPlaceholder}
                multiline
                numberOfLines={3}
                style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: colors.text, padding: 14, minHeight: 72, textAlignVertical: 'top' }}
              />
            </View>
          </View>

          <View style={{ marginTop: 8 }}>
            <Button variant="primary" label={isSaving ? 'Saving…' : 'Save Payment Details'} onPress={handleSavePayment} disabled={isSaving} />
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* ── Admin Settings Menu Sheet ── */}
      <BottomSheetModal
        ref={settingsMenuRef}
        snapPoints={['30%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetView style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Text style={{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text }}>Admin Settings</Text>
            <AdminPill />
          </View>

          <Pressable
            onPress={() => { settingsMenuRef.current?.dismiss(); setTimeout(openEditSheet, 250); }}
            style={[styles.menuItem, { borderColor: colors.border }]}
          >
            <Settings2 size={18} color={colors.primary} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }}>Edit Circle Details</Text>
              <Text style={[text.caption, { color: colors.textTertiary }]}>Name, emoji, goal, frequency, deadline</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => { settingsMenuRef.current?.dismiss(); setTimeout(openPaySheet, 250); }}
            style={[styles.menuItem, { borderColor: colors.border, marginTop: 10, borderBottomWidth: 0 }]}
          >
            <CreditCard size={18} color={colors.primary} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }}>Edit Payment Details</Text>
              <Text style={[text.caption, { color: colors.textTertiary }]}>Bank account, mobile money, etc.</Text>
            </View>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>

      {/* ── Invite Sheet (branded) ── */}
      <BottomSheetModal
        ref={inviteSheetRef}
        snapPoints={['55%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          {/* Circle card */}
          <View style={[styles.inviteCircleCard, { backgroundColor: '#163A2F' }]}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>{circleEmoji}</Text>
            <Text style={{ fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: '#FAF9F5', letterSpacing: -0.5, textAlign: 'center' }}>
              {circleName}
            </Text>
            <Text style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: 'rgba(250,249,245,0.6)', marginTop: 4 }}>
              {members.length} member{members.length !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Invite code */}
          <Text style={[text.labelCaps, { color: colors.textTertiary, marginTop: 20, marginBottom: 8, marginLeft: 2 }]}>Invite Code</Text>
          <Pressable
            onPress={handleCopyCode}
            style={[styles.codeBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
          >
            <Text style={{ fontFamily: font.sansSemiBold, fontSize: 28, letterSpacing: 6, color: colors.text, textAlign: 'center' }}>
              {inviteCode || '——————'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <Copy size={12} color={colors.primary} strokeWidth={2} />
              <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.xs, color: colors.primary }}>Tap to copy</Text>
            </View>
          </Pressable>

          {/* Actions */}
          <View style={{ gap: 10, marginTop: 14 }}>
            <Pressable
              onPress={handleShareLink}
              style={[styles.shareBtn, { backgroundColor: '#163A2F' }]}
            >
              <Share2 size={18} color="#FAF9F5" strokeWidth={1.8} />
              <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: '#FAF9F5' }}>Share Invite Link</Text>
            </Pressable>
            <Pressable
              onPress={handleCopyCode}
              style={[styles.shareBtn, { backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border }]}
            >
              <Link2 size={18} color={colors.text} strokeWidth={1.8} />
              <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.sm, color: colors.text }}>Copy Code Only</Text>
            </Pressable>
          </View>

          <Text style={[text.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: 14, lineHeight: 18 }]}>
            Share the link or code. Anyone with it can join this circle.
          </Text>
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* ── Deny Contribution Sheet (admin only) ── */}
      <BottomSheetModal
        ref={denySheetRef}
        snapPoints={['48%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          <Text style={{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text, marginBottom: 4 }}>
            Decline Contribution
          </Text>
          {denyTarget && (
            <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 16, lineHeight: 18 }]}>
              Declining {fmt(denyTarget.amount)} from {denyTarget.userName}. They'll receive a push notification with your reason.
            </Text>
          )}

          <Text style={[text.label, { color: colors.textSecondary, marginBottom: 6 }]}>Reason (optional but recommended)</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground, marginBottom: 20 }]}>
            <BottomSheetTextInput
              value={denyReason}
              onChangeText={setDenyReason}
              placeholder="e.g. Wrong amount, already received, not yet due…"
              placeholderTextColor={colors.inputPlaceholder}
              multiline
              numberOfLines={3}
              style={{ fontFamily: font.sansRegular, fontSize: fontSize.sm, color: colors.text, padding: 14, minHeight: 80, textAlignVertical: 'top' }}
            />
          </View>

          <Button
            variant="danger"
            label={isSaving ? 'Declining…' : 'Decline Contribution'}
            onPress={handleConfirmDeny}
            disabled={isSaving}
          />
        </BottomSheetScrollView>
      </BottomSheetModal>

      <AkuDatePicker
        isOpen={showDeadlinePicker}
        value={editDeadline || todayString()}
        onChange={(iso) => { setEditDeadline(iso); setShowDeadlinePicker(false); }}
        onClose={() => setShowDeadlinePicker(false)}
        title="Set deadline"
      />

      {/* Branded alert — replaces all Alert.alert calls */}
      <AkuAlert config={alertConfig} />
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
  progressCard:     { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, marginTop: 12 },
  bigBarWrap:       { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, height: 10, overflow: 'hidden' },
  bigBar:           { height: 10, borderRadius: 6 },
  tabBody:          { paddingTop: 8 },
  metaRow:          { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 8, alignItems: 'center' },
  metaCell:         { flex: 1, gap: 2 },
  card:             { borderRadius: 14, borderWidth: 1, padding: 14 },
  emptyCard:        { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 6 },
  badge:            { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  memberRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  acctRow:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  copyBtn:          { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  leaderRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  rankCol:          { width: 30, alignItems: 'center', marginRight: 8 },
  pendingRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  iconBtn:          { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  myRow:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  fab:              { position: 'absolute' },
  fabBtn:           { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 100, shadowColor: '#163A2F', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  inputWrap:        { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  inviteBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 1 },
  menuItem:         { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 14, borderWidth: 1 },
  // AkuAlert
  alertOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  alertCard:        { width: '100%', maxWidth: 340, borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 12 },
  alertBtn:         { height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  // Invite sheet
  inviteCircleCard: { borderRadius: 20, padding: 24, alignItems: 'center', marginTop: 4 },
  codeBox:          { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center', marginBottom: 4 },
  shareBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: 14 },
});
