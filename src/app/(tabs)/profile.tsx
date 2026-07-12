import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import {
  ChevronRight,
  Shield,
  Fingerprint,
  Bell,
  Moon,
  DollarSign,
  TrendingUp,
  Download,
  Trash2,
  FileText,
  Lock,
  MessageSquare,
  Check,
  Camera,
  ExternalLink,
  Users,
  Plus,
  LogIn,
  Repeat,
  HelpCircle,
} from 'lucide-react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { useCirclesStore } from '../../store/pools.store';
import { useUIStore } from '../../store/ui.store';
import { useBillsStore } from '../../store/bills.store';
import { useExpensesStore } from '../../store/expenses.store';
import { useBudgetsStore } from '../../store/budgets.store';
import { useGoalsStore } from '../../store/goals.store';
import { useIncomeStore } from '../../store/income.store';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Divider } from '../../components/ui/Divider';
import { AkuDatePicker } from '../../components/ui/AkuDatePicker';
import { CreateCircleSheet } from '../../components/circles/CreateCircleSheet';
import { formatAmount } from '../../lib/format';
import type { ThemeMode } from '../../store/ui.store';

// ─── Constants ────────────────────────────────────────────────────────────────


// ─── Theme options ────────────────────────────────────────────────────────────

interface ThemeOption {
  value: ThemeMode;
  label: string;
  desc:  string;
  icon:  string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'system', label: 'Follow System',  desc: 'Matches your device setting',  icon: '⚙️' },
  { value: 'light',  label: 'Always Light',   desc: 'Clean and bright',             icon: '☀️' },
  { value: 'dark',   label: 'Always Dark',    desc: 'Easy on the eyes at night',    icon: '🌙' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  const { colors, text } = useTheme();
  return (
    <Text
      style={[
        text.labelCaps,
        styles.sectionHeader,
        { color: colors.textTertiary },
      ]}
    >
      {label}
    </Text>
  );
}

// ─── Settings row ─────────────────────────────────────────────────────────────

interface LucideIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}
type LucideIcon = React.ComponentType<LucideIconProps>;

interface SettingsRowProps {
  icon: LucideIcon;
  label: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  isDestructive?: boolean;
  isExternal?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

function SettingsRow({
  icon: Icon,
  label,
  rightElement,
  onPress,
  isDestructive = false,
  isExternal = false,
  isFirst = false,
  isLast = false,
}: SettingsRowProps) {
  const { colors, text, radius } = useTheme();

  const labelColor = isDestructive ? colors.danger : colors.text;

  const content = (
    <View
      style={[
        styles.settingsRow,
        {
          backgroundColor: colors.card,
          borderTopLeftRadius:     isFirst ? radius.lg : 0,
          borderTopRightRadius:    isFirst ? radius.lg : 0,
          borderBottomLeftRadius:  isLast  ? radius.lg : 0,
          borderBottomRightRadius: isLast  ? radius.lg : 0,
        },
      ]}
    >
      <View
        style={[
          styles.settingsRowIcon,
          { backgroundColor: isDestructive ? colors.dangerBg : colors.backgroundSecondary },
        ]}
      >
        <Icon
          size={17}
          color={isDestructive ? colors.danger : colors.primary}
          strokeWidth={1.8}
        />
      </View>
      <Text style={[text.bodyMedium, styles.settingsRowLabel, { color: labelColor }]}>
        {label}
      </Text>
      <View style={styles.settingsRowRight}>
        {rightElement ?? (onPress ? (
          isExternal
            ? <ExternalLink size={15} color={colors.textTertiary} strokeWidth={1.8} />
            : <ChevronRight size={16} color={colors.textTertiary} strokeWidth={1.8} />
        ) : null)}
      </View>
    </View>
  );

  return (
    <>
      {onPress ? (
        <Pressable
          onPress={onPress}
          android_ripple={{ color: colors.borderLight }}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
      {!isLast && (
        <View style={{ backgroundColor: colors.card }}>
          <Divider style={{ marginLeft: 52 }} />
        </View>
      )}
    </>
  );
}

// ─── Settings group ───────────────────────────────────────────────────────────

function SettingsGroup({ children }: { children: React.ReactNode }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.settingsGroup,
        {
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
      ]}
    >
      {children}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { colors, font, fontSize, text, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { user, updateUser, saveAvatarData, biometric, setupBiometric, disableBiometric, signOut, deleteAccount } = useAuthStore();
  const { circles, activeCircle, load: loadCircles } = useCirclesStore();
  const { showToast, currency, themeMode, setThemeMode } = useUIStore();
  const { bills }    = useBillsStore();
  const { expenses } = useExpensesStore();
  const { budgets }  = useBudgetsStore();
  const { goals }    = useGoalsStore();
  const { allRecords: incomeRecords, loadAll: loadAllInc } = useIncomeStore();

  // ── Avatar picker sheet ───────────────────────────────────────────────
  const avatarPickerRef = useRef<BottomSheetModal>(null);

  // ── Theme picker sheet ────────────────────────────────────────────────
  const themeSheetRef = useRef<BottomSheetModal>(null);

  const openThemePicker = useCallback(() => {
    themeSheetRef.current?.present();
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    [],
  );

  // ── Statement date range sheet ────────────────────────────────────────
  const statementSheetRef = useRef<BottomSheetModal>(null);

  type RangePreset = 'all' | 'this_month' | 'last_3' | 'last_6' | 'this_year' | 'custom';
  const [rangePreset,  setRangePreset]  = useState<RangePreset>('all');
  const [rangeFrom,    setRangeFrom]    = useState('');
  const [rangeTo,      setRangeTo]      = useState('');
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker,   setShowToPicker]   = useState(false);

  const RANGE_PRESETS: { value: RangePreset; label: string; desc: string }[] = [
    { value: 'all',        label: 'All time',       desc: 'Complete financial history'    },
    { value: 'this_month', label: 'This month',     desc: new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' }) },
    { value: 'last_3',     label: 'Last 3 months',  desc: 'Past 90 days'                 },
    { value: 'last_6',     label: 'Last 6 months',  desc: 'Past 180 days'                },
    { value: 'this_year',  label: 'This year',      desc: `January – December ${new Date().getFullYear()}` },
    { value: 'custom',     label: 'Custom range',   desc: 'Pick your own start & end date' },
  ];

  const handleOpenStatementSheet = useCallback(() => {
    statementSheetRef.current?.present();
  }, []);

  /** Compute actual ISO date bounds for the selected preset */
  const getDateBounds = useCallback((): { from: string | null; to: string | null } => {
    const now   = new Date();
    const today = now.toISOString().split('T')[0]!;
    if (rangePreset === 'all')        return { from: null, to: null };
    if (rangePreset === 'this_month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!;
      return { from, to: today };
    }
    if (rangePreset === 'last_3') {
      const d = new Date(now); d.setMonth(d.getMonth() - 3);
      return { from: d.toISOString().split('T')[0]!, to: today };
    }
    if (rangePreset === 'last_6') {
      const d = new Date(now); d.setMonth(d.getMonth() - 6);
      return { from: d.toISOString().split('T')[0]!, to: today };
    }
    if (rangePreset === 'this_year') {
      return { from: `${now.getFullYear()}-01-01`, to: today };
    }
    // custom
    return { from: rangeFrom || null, to: rangeTo || today };
  }, [rangePreset, rangeFrom, rangeTo]);

  // ── Load circles + income on mount (ensures fresh data after app restart) ─────
  useEffect(() => {
    if (user?.id) {
      loadCircles(user.id);
      loadAllInc(user.id);
    }
  }, [user?.id]);

  // ── Create Circle sheet ───────────────────────────────────────────────
  const [showCreateCircle, setShowCreateCircle] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // ── Biometric toggle ──────────────────────────────────────────────────
  const handleBiometricToggle = useCallback(async (value: boolean) => {
    if (value) {
      const success = await setupBiometric();
      if (!success) {
        showToast('error', 'Biometric authentication not available on this device');
      }
    } else {
      await disableBiometric();
    }
  }, [setupBiometric, disableBiometric, showToast]);

  // ── Sign out ──────────────────────────────────────────────────────────
  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ],
    );
  }, [signOut]);

  // ── Delete Account ────────────────────────────────────────────────────
  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your Akù account and everything in it — expenses, bills, goals, budgets, income, and pools. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            // Second confirmation — no going back after this
            Alert.alert(
              'Are you absolutely sure?',
              'Your account will be gone forever. There is no way to recover it.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    setIsDeletingAccount(true);
                    try {
                      await deleteAccount();
                    } catch {
                      setIsDeletingAccount(false);
                      Alert.alert('Error', 'Could not delete your account. Please check your connection and try again.');
                    }
                    // deleteAccount() resets auth state → nav guard routes to onboarding
                    // No need to setIsDeletingAccount(false) — component will unmount
                  },
                },
              ],
            );
          },
        },
      ],
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteAccount]);

  // ── Profile avatar ────────────────────────────────────────────────────
  // Flow: pick → resize 250×250 JPEG → read as base64 → save to SQLite
  // → sync to server in background. Entire flow is crash-safe.

  const pickAndSaveAvatar = useCallback(async (source: 'camera' | 'library') => {
    try {
      let result: ImagePicker.ImagePickerResult;

      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showToast('error', 'Camera permission is required');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showToast('error', 'Photo library permission is required');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      }

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const { width, height } = asset;

      // Step 1: center-crop to a square so avatars are never distorted
      const size    = Math.min(width, height);
      const originX = Math.floor((width  - size) / 2);
      const originY = Math.floor((height - size) / 2);

      // Step 2: crop → resize to 260×260 → compress to JPEG
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        [
          { crop: { originX, originY, width: size, height: size } },
          { resize: { width: 260, height: 260 } },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      if (!manipulated.base64) throw new Error('Image processing failed');
      const dataUri = `data:image/jpeg;base64,${manipulated.base64}`;

      // saveAvatarData: updates memory + SQLite instantly, syncs server in background
      await saveAvatarData(dataUri);
      showToast('success', 'Profile photo updated');
    } catch {
      showToast('error', 'Could not update photo — please try again');
    }
  }, [saveAvatarData, showToast]);

  const handlePickAvatar = useCallback(() => {
    avatarPickerRef.current?.present();
  }, []);

  // ── Generate PDF bank statement (with optional date range) ───────────
  const handleExportData = useCallback(async (bounds?: { from: string | null; to: string | null }) => {
    if (!user) return;
    statementSheetRef.current?.dismiss();
    try {
      showToast('info', 'Generating statement…');

      const sym = currency.symbol;
      const now = new Date();
      const dateLabel = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const filename  = `Aku_Statement_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

      const money = (kobo: number) =>
        `${sym}${(kobo / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // ── Apply date range filter ───────────────────────────────────────
      const from = bounds?.from ?? null;
      const to   = bounds?.to   ?? null;
      const inRange = (dateStr: string) => {
        if (!from && !to) return true;
        const d = dateStr.slice(0, 10);
        if (from && d < from) return false;
        if (to   && d > to)   return false;
        return true;
      };

      const filteredBills    = from || to ? bills.filter((b) => inRange(b.dueDate))        : bills;
      const filteredExpenses = from || to ? expenses.filter((e) => inRange(e.date))         : expenses;
      const filteredIncome   = from || to ? incomeRecords.filter((r) => inRange(r.date))    : incomeRecords;
      const filteredGoals    = goals;  // goals not date-filtered

      const rangeLabel = from
        ? `${new Date(from + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}${to ? '  →  ' + new Date(to + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ' onwards'}`
        : 'All time — complete financial history';

      // ── Load Akù brand logo for PDF ──────────────────────────────────
      let logoSrc = '';
      try {
        const logoAsset = Asset.fromModule(require('../../assets/images/icon.png') as number);
        await logoAsset.downloadAsync();
        if (logoAsset.localUri) {
          const b64 = await FileSystem.readAsStringAsync(logoAsset.localUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          logoSrc = `data:image/png;base64,${b64}`;
        }
      } catch { /* logo is optional — statement still generates */ }

      const totalBills    = filteredBills.reduce((s, b) => s + b.amount, 0);
      const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
      const totalIncome   = filteredIncome.reduce((s, r) => s + r.amount, 0);
      const netFlow       = totalIncome - totalExpenses;

      // ── Bill rows HTML ──
      const billRows = filteredBills.length === 0
        ? '<tr><td colspan="3" class="empty">No bills in this period</td></tr>'
        : filteredBills.map((b) => `
            <tr>
              <td>${b.name}</td>
              <td><span class="badge badge-${b.status}">${b.status}</span></td>
              <td class="amount">${money(b.amount)}</td>
            </tr>`).join('') +
          `<tr class="subtotal"><td colspan="2">Total Bills</td><td class="amount">${money(totalBills)}</td></tr>`;

      // ── Expense rows HTML ──
      const expenseRows = filteredExpenses.length === 0
        ? '<tr><td colspan="3" class="empty">No expenses in this period</td></tr>'
        : filteredExpenses.map((e) => {
            const d = new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            return `<tr>
              <td>${d}</td>
              <td>${e.description ?? e.category}</td>
              <td class="amount debit">${money(e.amount)}</td>
            </tr>`;
          }).join('') +
          `<tr class="subtotal"><td colspan="2">Total Expenses</td><td class="amount debit">${money(totalExpenses)}</td></tr>`;

      // ── Income rows HTML ──
      const incomeRows = filteredIncome.length === 0
        ? '<tr><td colspan="3" class="empty">No income recorded in this period</td></tr>'
        : filteredIncome.map((r) => {
            const d = new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            return `<tr>
              <td>${d}</td>
              <td>${r.description ?? r.category}</td>
              <td class="amount credit">${money(r.amount)}</td>
            </tr>`;
          }).join('') +
          `<tr class="subtotal"><td colspan="2">Total Income</td><td class="amount credit">${money(totalIncome)}</td></tr>`;

      // ── Budget rows HTML ──
      const budgetRows = budgets.length === 0
        ? '<tr><td colspan="3" class="empty">No budgets recorded</td></tr>'
        : budgets.map((b) => {
            const pct = Math.round(b.progress * 100);
            const statusColor = b.status === 'exceeded' ? '#D63B3B' : b.status === 'near-limit' ? '#D97706' : '#16C172';
            return `<tr>
              <td>${b.category}</td>
              <td><span style="color:${statusColor};font-weight:600">${pct}%</span> used</td>
              <td class="amount">${money(b.amount)}</td>
            </tr>`;
          }).join('');

      // ── Goal rows HTML ──
      const goalRows = filteredGoals.length === 0
        ? '<tr><td colspan="3" class="empty">No goals recorded</td></tr>'
        : filteredGoals.map((g) => {
            const pct     = Math.round(g.progress * 100);
            const saved   = Math.round(g.targetAmount * g.progress);
            const barColor = pct >= 100 ? '#16C172' : pct >= 60 ? '#163A2F' : '#D97706';
            return `<tr>
              <td>${g.emoji ?? '🎯'} ${g.name}</td>
              <td>
                <div class="progress-wrap">
                  <div class="progress-bar" style="width:${Math.min(pct,100)}%;background:${barColor}"></div>
                </div>
                <span style="font-size:10px;color:#666;margin-top:2px;display:block">${pct}% of target</span>
              </td>
              <td class="amount">${money(saved)}<br/><span style="color:#999;font-weight:400;font-size:10px">of ${money(g.targetAmount)}</span></td>
            </tr>`;
          }).join('');

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @page { margin: 0; size: A4; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif; color:#1A1F1C; background:#FFFFFF; font-size:11px; line-height:1.5; }

  /* ── Header ── */
  .header { background:#163A2F; padding:36px 48px 28px; color:#FAF9F5; }
  .header-inner { display:flex; justify-content:space-between; align-items:flex-start; }
  .logo-wrap { display:flex; align-items:center; gap:14px; }
  .logo-img { width:52px; height:52px; border-radius:13px; object-fit:cover; }
  .logo-name { font-family:Georgia,'Times New Roman',serif; font-size:34px; font-weight:300; letter-spacing:-1px; color:#FAF9F5; line-height:1; }
  .logo-name span { color:#C4E07A; }
  .logo-tagline { font-size:9px; letter-spacing:2.5px; text-transform:uppercase; color:rgba(250,249,245,0.4); margin-top:5px; }
  .header-right { text-align:right; }
  .stmt-type { font-size:10px; font-weight:700; letter-spacing:2.5px; text-transform:uppercase; color:#C4E07A; margin-bottom:10px; }
  .meta-row { font-size:10px; color:rgba(250,249,245,0.6); margin-top:2px; }
  .meta-val { color:#FAF9F5; font-weight:600; }

  /* ── Period band ── */
  .period-band { background:#1E4A3B; padding:14px 48px; display:flex; justify-content:space-between; align-items:center; }
  .pband-block { }
  .pband-label { font-size:8.5px; letter-spacing:1.5px; text-transform:uppercase; color:rgba(250,249,245,0.45); margin-bottom:3px; }
  .pband-val { font-size:13px; font-weight:600; color:#FAF9F5; letter-spacing:-0.2px; }

  /* ── Account strip ── */
  .account-strip { background:#FFFFFF; border-bottom:1px solid #EAEAE5; padding:16px 48px; display:flex; gap:48px; }
  .acct-field .field-label { font-size:8.5px; letter-spacing:1.5px; text-transform:uppercase; color:#9CA3A0; margin-bottom:3px; }
  .acct-field .field-val { font-size:13px; font-weight:600; color:#1A1F1C; }

  /* ── Summary boxes ── */
  .summary-section { background:#F6FAF7; border-bottom:1px solid #E0E8E2; padding:22px 48px; }
  .summary-grid { display:flex; gap:12px; }
  .summary-box { flex:1; background:#FFFFFF; border:1px solid #E0E8E2; border-radius:10px; padding:14px 16px; }
  .s-label { font-size:8.5px; letter-spacing:1.5px; text-transform:uppercase; color:#9CA3A0; margin-bottom:5px; }
  .s-value { font-size:20px; font-weight:300; color:#163A2F; letter-spacing:-0.5px; font-family:Georgia,'Times New Roman',serif; }
  .s-value.debit { color:#D63B3B; }
  .s-value.credit { color:#16A85A; }
  .s-sub { font-size:9px; color:#B0B8B4; margin-top:4px; }

  /* ── Body ── */
  .body { padding:28px 48px; }

  /* ── Section ── */
  .section { margin-bottom:32px; }
  .section-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
  .section-title { font-size:9px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#163A2F; white-space:nowrap; }
  .section-rule { flex:1; height:1px; background:#163A2F; opacity:0.15; }

  /* ── Table ── */
  table { width:100%; border-collapse:collapse; }
  thead tr { border-bottom:1.5px solid rgba(22,58,47,0.15); }
  th { text-align:left; font-size:8.5px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#9CA3A0; padding:5px 8px 7px; }
  td { padding:9px 8px; border-bottom:1px solid #F0F0EC; font-size:11.5px; color:#1A1F1C; vertical-align:middle; }
  tr:last-child td { border-bottom:none; }
  .amount { text-align:right; font-weight:600; font-family:'Courier New','Courier',monospace; white-space:nowrap; letter-spacing:-0.3px; }
  .debit { color:#D63B3B; }
  .credit { color:#16C172; }
  .empty { color:#B0B8B4; font-style:italic; text-align:center; padding:18px 0; font-size:11px; }
  .subtotal td { font-weight:700; background:#F3F7F4; border-top:1.5px solid rgba(22,58,47,0.15); border-bottom:1.5px solid rgba(22,58,47,0.15); color:#163A2F; font-size:12px; }

  /* ── Badges ── */
  .badge { display:inline-block; padding:2px 8px; border-radius:20px; font-size:8.5px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; }
  .badge-paid     { background:#D1FAE5; color:#065F46; }
  .badge-pending  { background:#FEF3C7; color:#92400E; }
  .badge-overdue  { background:#FEE2E2; color:#991B1B; }
  .badge-upcoming { background:#EDE9FE; color:#4C1D95; }

  /* ── Progress ── */
  .progress-wrap { background:#E8EDE9; border-radius:3px; height:5px; overflow:hidden; margin-bottom:3px; width:120px; }
  .progress-bar { height:5px; border-radius:3px; }

  /* ── Footer ── */
  .footer { border-top:1px solid #EAEAE5; padding:16px 48px; display:flex; justify-content:space-between; align-items:center; }
  .footer-l { font-size:9px; color:#9CA3A0; line-height:1.6; }
  .footer-l strong { color:#163A2F; font-weight:700; }
  .footer-r { font-size:9px; color:#B0B8B4; }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div class="header-inner">
    <div class="logo-wrap">
      ${logoSrc ? `<img src="${logoSrc}" class="logo-img" alt="Akù" />` : ''}
      <div>
        <div class="logo-name">ak<span>ù</span></div>
        <div class="logo-tagline">Personal Finance</div>
      </div>
    </div>
    <div class="header-right">
      <div class="stmt-type">Financial Statement</div>
      <div class="meta-row">Generated on <span class="meta-val">${dateLabel}</span></div>
      <div class="meta-row">Currency <span class="meta-val">${currency.code} (${sym})</span></div>
    </div>
  </div>
</div>

<!-- PERIOD BAND -->
<div class="period-band">
  <div class="pband-block">
    <div class="pband-label">Statement Period</div>
    <div class="pband-val">${rangeLabel}</div>
  </div>
  <div class="pband-block" style="text-align:right">
    <div class="pband-label">Pool</div>
    <div class="pband-val">${activeCircle?.name ?? '—'}</div>
  </div>
</div>

<!-- ACCOUNT STRIP -->
<div class="account-strip">
  <div class="acct-field">
    <div class="field-label">Account Holder</div>
    <div class="field-val">${user.name}</div>
  </div>
  <div class="acct-field">
    <div class="field-label">Email</div>
    <div class="field-val">${user.email}</div>
  </div>
  <div class="acct-field">
    <div class="field-label">Statement Date</div>
    <div class="field-val">${dateLabel}</div>
  </div>
</div>

<!-- SUMMARY -->
<div class="summary-section">
  <div class="summary-grid">
    <div class="summary-box">
      <div class="s-label">Total Earned</div>
      <div class="s-value credit">${money(totalIncome)}</div>
      <div class="s-sub">${filteredIncome.length} income record${filteredIncome.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="summary-box">
      <div class="s-label">Total Spent</div>
      <div class="s-value debit">${money(totalExpenses)}</div>
      <div class="s-sub">${filteredExpenses.length} expense${filteredExpenses.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="summary-box">
      <div class="s-label">Net${netFlow >= 0 ? ' Surplus' : ' Deficit'}</div>
      <div class="s-value ${netFlow >= 0 ? 'credit' : 'debit'}">${netFlow >= 0 ? '' : '−'}${money(Math.abs(netFlow))}</div>
      <div class="s-sub">Income − Expenses</div>
    </div>
    <div class="summary-box">
      <div class="s-label">Bills Outstanding</div>
      <div class="s-value">${money(totalBills)}</div>
      <div class="s-sub">${filteredBills.length} bill${filteredBills.length !== 1 ? 's' : ''}</div>
    </div>
  </div>
</div>

<!-- BODY -->
<div class="body">

  <!-- Bills -->
  <div class="section">
    <div class="section-head">
      <div class="section-title">Bills</div>
      <div class="section-rule"></div>
    </div>
    <table>
      <thead><tr><th>Bill Name</th><th>Status</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${billRows}</tbody>
    </table>
  </div>

  <!-- Income -->
  <div class="section">
    <div class="section-head">
      <div class="section-title">Income</div>
      <div class="section-rule"></div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${incomeRows}</tbody>
    </table>
  </div>

  <!-- Expenses -->
  <div class="section">
    <div class="section-head">
      <div class="section-title">Expenses</div>
      <div class="section-rule"></div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${expenseRows}</tbody>
    </table>
  </div>

  <!-- Budgets -->
  <div class="section">
    <div class="section-head">
      <div class="section-title">Budgets</div>
      <div class="section-rule"></div>
    </div>
    <table>
      <thead><tr><th>Category</th><th>Usage</th><th style="text-align:right">Limit</th></tr></thead>
      <tbody>${budgetRows}</tbody>
    </table>
  </div>

  <!-- Goals -->
  <div class="section">
    <div class="section-head">
      <div class="section-title">Savings Goals</div>
      <div class="section-rule"></div>
    </div>
    <table>
      <thead><tr><th>Goal</th><th>Progress</th><th style="text-align:right">Saved / Target</th></tr></thead>
      <tbody>${goalRows}</tbody>
    </table>
  </div>

</div>

<!-- FOOTER -->
<div class="footer">
  <div class="footer-l"><strong>Akù Personal Finance</strong> · nippysky.com<br/>This document is for personal reference only. Not a certified financial statement.</div>
  <div class="footer-r">Generated ${dateLabel}</div>
</div>

</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });

      // Rename to a friendlier filename by sharing directly
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType:    'application/pdf',
          UTI:         'com.adobe.pdf',
          dialogTitle: `${filename}.pdf`,
        });
      } else {
        showToast('info', 'PDF saved — check your Files app');
      }
    } catch {
      showToast('error', 'Failed to generate PDF');
    }
  }, [user, activeCircle, currency, bills, expenses, incomeRecords, budgets, goals, showToast]);

  // ── Feedback ──────────────────────────────────────────────────────────
  const handleFeedback = useCallback(() => {
    Linking.openURL('mailto:contact@nippysky.com?subject=Feedback').catch(() => {
      showToast('info', 'Send feedback to contact@nippysky.com');
    });
  }, [showToast]);

  // (theme mode changed via bottom sheet — see themeSheetRef above)

  if (!user) return null;

  const memberSince = formatMemberSince(user.createdAt);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop:    insets.top + 24,
            paddingBottom: insets.bottom + layout.tabBarHeight + 32,
            paddingHorizontal: layout.screenPadding,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile hero ── */}
        <View style={styles.hero}>
          <Pressable
            onPress={handlePickAvatar}
            style={styles.avatarWrap}
            accessibilityLabel="Change profile photo"
          >
            <UserAvatar
              name={user.name}
              avatarData={user.avatarData}
              size={80}
            />
            <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
              <Camera size={12} color={colors.textOnForest} strokeWidth={2} />
            </View>
          </Pressable>

          <Text
            style={[
              styles.heroName,
              { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text },
            ]}
          >
            {user.name}
          </Text>

          <Text style={[text.bodySm, styles.heroEmail, { color: colors.textSecondary }]}>
            {user.email}
          </Text>

          <Text style={[text.caption, { color: colors.textTertiary }]}>
            Member since {memberSince}
          </Text>
        </View>


        {/* ── Circles section ── */}
        <SectionHeader label="My Pools" />

        {circles.length > 0 ? (
          <>
            {circles.map((circle) => (
              <SettingsGroup key={circle.id}>
                <SettingsRow
                  icon={Users}
                  label={circle.name}
                  onPress={() => router.push(`/pool/${circle.id}` as never)}
                  isFirst
                  isLast
                  rightElement={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {circle.ownerId === user?.id && (
                        <View style={[styles.ownerBadge, { backgroundColor: colors.primary + '18' }]}>
                          <Text style={[{ fontFamily: font.sansSemiBold, fontSize: 10, color: colors.primary, letterSpacing: 0.4 }]}>
                            OWNER
                          </Text>
                        </View>
                      )}
                      <ChevronRight size={16} color={colors.textTertiary} strokeWidth={1.8} />
                    </View>
                  }
                />
              </SettingsGroup>
            ))}
            <View style={styles.circleActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.circleActionBtn,
                  { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40', opacity: pressed ? 0.75 : 1 },
                ]}
                onPress={() => setShowCreateCircle(true)}
              >
                <Plus size={15} color={colors.primary} strokeWidth={2.2} />
                <Text style={[text.caption, { color: colors.primary, fontFamily: font.sansSemiBold }]}>New Pool</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.circleActionBtn,
                  { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
                ]}
                onPress={() => router.push('/pool/join' as never)}
              >
                <LogIn size={15} color={colors.primary} strokeWidth={2} />
                <Text style={[text.caption, { color: colors.primary, fontFamily: font.sansMedium }]}>Join Pool</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Card style={styles.circlesEmptyCard}>
            {/* Icon badge */}
            <View style={[styles.circlesEmptyBadge, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '30' }]}>
              <Users size={28} color={colors.primary} strokeWidth={1.5} />
            </View>

            <Text style={[text.bodyMedium, { color: colors.text, fontFamily: font.sansSemiBold, textAlign: 'center' }]}>
              No Pools yet
            </Text>
            <Text style={[text.caption, { color: colors.textSecondary, textAlign: 'center', lineHeight: 19 }]}>
              Save together, track together.{'\n'}Create one or join with an invite code.
            </Text>

            {/* Primary CTA — solid fill */}
            <Pressable
              style={({ pressed }) => [
                styles.circlesEmptyPrimary,
                { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
              ]}
              onPress={() => setShowCreateCircle(true)}
            >
              <Plus size={17} color="#F5F2EC" strokeWidth={2.2} />
              <Text style={[text.bodySm, { color: '#F5F2EC', fontFamily: font.sansSemiBold }]}>
                Create a Pool
              </Text>
            </Pressable>

            {/* Secondary CTA — outlined */}
            <Pressable
              style={({ pressed }) => [
                styles.circlesEmptySecondary,
                { borderColor: colors.primary + '50', opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => router.push('/pool/join' as never)}
            >
              <LogIn size={17} color={colors.primary} strokeWidth={2} />
              <Text style={[text.bodySm, { color: colors.primary, fontFamily: font.sansMedium }]}>
                Join a Pool
              </Text>
            </Pressable>
          </Card>
        )}

        {/* ── Security ── */}
        <SectionHeader label="Security" />
        <SettingsGroup>
          <SettingsRow
            icon={Lock}
            label="Change Passcode"
            onPress={() => router.push('/change-passcode' as never)}
            isFirst
          />
          <SettingsRow
            icon={Fingerprint}
            label="Face ID / Touch ID"
            rightElement={
              <Switch
                value={biometric.enabled}
                onValueChange={handleBiometricToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.card}
              />
            }
            isLast
          />
        </SettingsGroup>

        {/* ── Notifications ── */}
        <SectionHeader label="Notifications" />
        <SettingsGroup>
          <SettingsRow
            icon={Bell}
            label="Notification settings"
            onPress={() => router.push('/notification-settings' as never)}
            isFirst
            isLast
          />
        </SettingsGroup>

        {/* ── Expenses ── */}
        <SectionHeader label="Expenses" />
        <SettingsGroup>
          <SettingsRow
            icon={Repeat}
            label="Recurring"
            onPress={() => router.push('/recurring-expenses' as never)}
            isFirst
            isLast
          />
        </SettingsGroup>

        {/* ── Appearance ── */}
        <SectionHeader label="Appearance" />
        <SettingsGroup>
          <SettingsRow
            icon={Moon}
            label="Appearance"
            onPress={openThemePicker}
            isFirst
            rightElement={
              <Text style={[text.caption, { color: colors.textTertiary }]}>
                {themeMode === 'system' ? 'Auto' : themeMode === 'dark' ? 'Dark' : 'Light'}
              </Text>
            }
          />
          <SettingsRow
            icon={DollarSign}
            label="Currency"
            onPress={() => router.push('/currency' as never)}
            rightElement={
              <Text style={[text.caption, { color: colors.textTertiary }]}>
                {currency.flag} {currency.code}
              </Text>
            }
          />
          <SettingsRow
            icon={TrendingUp}
            label="Live Exchange Rates"
            onPress={() => router.push('/currency-rates' as never)}
            isLast={Platform.OS !== 'ios'}
          />
        </SettingsGroup>

        {/* ── Data ── */}
        <SectionHeader label="Data" />
        <SettingsGroup>
          <SettingsRow
            icon={Download}
            label="Download Statement"
            onPress={handleOpenStatementSheet}
            isFirst
          />
          <SettingsRow
            icon={Trash2}
            label={isDeletingAccount ? 'Deleting account…' : 'Delete Account'}
            onPress={isDeletingAccount ? undefined : handleDeleteAccount}
            isDestructive
            isLast
          />
        </SettingsGroup>

        {/* ── About ── */}
        <SectionHeader label="About" />
        <SettingsGroup>
          <SettingsRow
            icon={HelpCircle}
            label="FAQ & Help"
            onPress={() => router.push('/faq' as never)}
            isFirst
          />
          <SettingsRow
            icon={Shield}
            label="Privacy Policy"
            onPress={() => router.push('/privacy')}
          />
          <SettingsRow
            icon={FileText}
            label="Terms of Service"
            onPress={() => router.push('/terms')}
          />
          <SettingsRow
            icon={MessageSquare}
            label="Feedback"
            onPress={handleFeedback}
            isLast
          />
        </SettingsGroup>

        {/* ── Sign out ── */}
        <View style={styles.signOutWrap}>
          <Pressable
            onPress={handleSignOut}
            style={[
              styles.signOutBtn,
              {
                borderColor: colors.danger,
                borderRadius: 999,
              },
            ]}
          >
            <Text style={[text.buttonLabel, { color: colors.danger }]}>
              Sign Out
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ── Avatar picker sheet ── */}
      <BottomSheetModal
        ref={avatarPickerRef}
        snapPoints={['28%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetView style={{ padding: 24, gap: 12 }}>
          <Text
            style={{
              fontFamily:    font.displayLight,
              fontSize:      fontSize.xl,
              color:         colors.text,
              marginBottom:  8,
              letterSpacing: -0.3,
            }}
          >
            Change Photo
          </Text>

          {/* Take photo */}
          <Pressable
            onPress={() => {
              avatarPickerRef.current?.dismiss();
              pickAndSaveAvatar('camera');
            }}
            style={({ pressed }) => [
              {
                flexDirection:  'row',
                alignItems:     'center',
                gap:            14,
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius:   radius.lg,
                backgroundColor: pressed ? colors.backgroundSecondary : colors.backgroundSecondary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={18} color={colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={[text.bodyMedium, { color: colors.text }]}>Take a photo</Text>
          </Pressable>

          {/* Choose from library */}
          <Pressable
            onPress={() => {
              avatarPickerRef.current?.dismiss();
              pickAndSaveAvatar('library');
            }}
            style={({ pressed }) => [
              {
                flexDirection:  'row',
                alignItems:     'center',
                gap:            14,
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius:   radius.lg,
                backgroundColor: colors.backgroundSecondary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Download size={18} color={colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={[text.bodyMedium, { color: colors.text }]}>Choose from library</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>

      {/* ── Theme picker sheet ── */}
      <BottomSheetModal
        ref={themeSheetRef}
        snapPoints={['35%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetView style={{ padding: 20, gap: 4 }}>
          <Text
            style={[
              {
                fontFamily:   font.displayLight,
                fontSize:     fontSize.xl,
                color:        colors.text,
                marginBottom: 16,
                letterSpacing: -0.3,
              },
            ]}
          >
            Appearance
          </Text>
          {THEME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => {
                setThemeMode(opt.value);
                themeSheetRef.current?.dismiss();
                Haptics.selectionAsync();
              }}
              style={[
                {
                  flexDirection:   'row',
                  alignItems:      'center',
                  padding:         14,
                  borderRadius:    radius.lg,
                  backgroundColor: themeMode === opt.value
                    ? colors.primary + '12'
                    : 'transparent',
                  gap: 14,
                },
              ]}
            >
              <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[text.bodyMedium, { color: colors.text }]}>{opt.label}</Text>
                <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
                  {opt.desc}
                </Text>
              </View>
              {themeMode === opt.value && (
                <View
                  style={{
                    width:          20,
                    height:         20,
                    borderRadius:   10,
                    backgroundColor: colors.primary,
                    alignItems:     'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={12} color={colors.textOnForest} strokeWidth={2.5} />
                </View>
              )}
            </Pressable>
          ))}
        </BottomSheetView>
      </BottomSheetModal>

      {/* ── Statement date range sheet ── */}
      <BottomSheetModal
        ref={statementSheetRef}
        snapPoints={['60%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetView
          style={{
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: insets.bottom + 20,
            gap: 0,
          }}
        >
          {/* Title */}
          <Text
            style={[{
              fontFamily: font.displayLight,
              fontSize: fontSize.xl,
              color: colors.text,
              letterSpacing: -0.3,
              marginBottom: 4,
            }]}
          >
            Statement Period
          </Text>
          <Text style={[text.caption, { color: colors.textTertiary, marginBottom: 20 }]}>
            Choose the date range to include in your PDF statement
          </Text>

          {/* Preset pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {RANGE_PRESETS.map((p) => {
              const active = rangePreset === p.value;
              return (
                <Pressable
                  key={p.value}
                  onPress={() => {
                    setRangePreset(p.value);
                    Haptics.selectionAsync();
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 100,
                    borderWidth: 1.5,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary + '14' : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: active ? font.sansSemiBold : font.sansRegular,
                      fontSize: fontSize.sm,
                      color: active ? colors.primary : colors.textSecondary,
                    }}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Custom date pickers */}
          {rangePreset === 'custom' && (
            <View style={{ gap: 10, marginBottom: 20 }}>
              <Pressable
                onPress={() => setShowFromPicker(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: colors.inputBackground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.lg,
                  padding: 14,
                }}
              >
                <Text style={[text.caption, { color: colors.textTertiary }]}>From</Text>
                <Text
                  style={{
                    fontFamily: font.sansMedium,
                    fontSize: fontSize.sm,
                    color: rangeFrom ? colors.text : colors.textTertiary,
                  }}
                >
                  {rangeFrom
                    ? new Date(rangeFrom + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'Select start date'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setShowToPicker(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: colors.inputBackground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.lg,
                  padding: 14,
                }}
              >
                <Text style={[text.caption, { color: colors.textTertiary }]}>To</Text>
                <Text
                  style={{
                    fontFamily: font.sansMedium,
                    fontSize: fontSize.sm,
                    color: rangeTo ? colors.text : colors.textTertiary,
                  }}
                >
                  {rangeTo
                    ? new Date(rangeTo + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'Select end date'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Generate button */}
          <Button
            variant="primary"
            label="Generate Statement"
            onPress={() => handleExportData(getDateBounds())}
          />
        </BottomSheetView>
      </BottomSheetModal>

      {/* AkuDatePicker modals for custom range */}
      <AkuDatePicker
        isOpen={showFromPicker}
        value={rangeFrom || new Date().toISOString().split('T')[0]!}
        onChange={(iso) => { setRangeFrom(iso); setShowFromPicker(false); }}
        onClose={() => setShowFromPicker(false)}
        title="Statement From"
        maxDate={rangeTo || new Date().toISOString().split('T')[0]!}
      />
      <AkuDatePicker
        isOpen={showToPicker}
        value={rangeTo || new Date().toISOString().split('T')[0]!}
        onChange={(iso) => { setRangeTo(iso); setShowToPicker(false); }}
        onClose={() => setShowToPicker(false)}
        title="Statement To"
        minDate={rangeFrom || undefined}
        maxDate={new Date().toISOString().split('T')[0]!}
      />

      {/* ── Create Circle sheet ── */}
      <CreateCircleSheet
        isOpen={showCreateCircle}
        onClose={() => setShowCreateCircle(false)}
        onSuccess={() => { if (user?.id) loadCircles(user.id); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: 0,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarWrap: {
    width:        80,
    height:       80,
    marginBottom: 14,
    position:     'relative',
  },
  cameraBadge: {
    position:       'absolute',
    bottom:         0,
    right:          0,
    width:          24,
    height:         24,
    borderRadius:   12,
    borderWidth:    2,
    alignItems:     'center',
    justifyContent: 'center',
  },
  heroName: {
    letterSpacing: -0.5,
    marginBottom:  4,
  },
  heroEmail: {
    marginBottom: 4,
  },
  card: {
    padding:      16,
    marginBottom: 24,
  },
  // ── My Pools empty state ────────────────────────────────────────────────
  circlesEmptyCard: {
    paddingVertical:   28,
    paddingHorizontal: 20,
    gap: 8,
  },
  circlesEmptyBadge: {
    width:          64,
    height:         64,
    borderRadius:   32,
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
    alignSelf:      'center',
    marginBottom:   4,
  },
  circlesEmptyPrimary: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingVertical: 15,
    borderRadius:   100,
    marginTop:      8,
    marginBottom:   6,
  },
  circlesEmptySecondary: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingVertical: 14,
    borderRadius:   100,
    borderWidth:    1.5,
  },

  // ── Has-circles action row ─────────────────────────────────────────────────
  circleActions: {
    flexDirection:  'row',
    gap:            10,
    marginTop:      10,
  },
  circleActionBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius:    100,
    borderWidth:     1,
  },
  ownerBadge: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      4,
    marginRight:       4,
  },
  sectionHeader: {
    marginTop:    20,
    marginBottom: 8,
    marginLeft:   4,
  },
  settingsGroup: {
    // overflow hidden + border set dynamically
  },
  settingsRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap:            12,
    minHeight:      52,
  },
  settingsRowIcon: {
    width:          32,
    height:         32,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  settingsRowLabel: {
    flex: 1,
  },
  settingsRowRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutWrap: {
    marginTop:    32,
    marginBottom: 8,
  },
  signOutBtn: {
    height:         48,
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
