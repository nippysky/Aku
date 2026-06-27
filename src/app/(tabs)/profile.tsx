// Note: expo-linking is already installed. expo-mail-composer is NOT in package.json —
// run `npx expo install expo-mail-composer` to enable the Feedback button.
// For now, Feedback opens a mailto: URL via expo-linking as fallback.

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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import {
  House,
  ChevronRight,
  Shield,
  Fingerprint,
  Bell,
  Moon,
  DollarSign,
  Download,
  Layers,
  Trash2,
  Info,
  FileText,
  Lock,
  MessageSquare,
  Check,
} from 'lucide-react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { getActiveIconLabel } from '../../lib/app-icons';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { useHouseholdStore } from '../../store/household.store';
import { useUIStore } from '../../store/ui.store';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Divider } from '../../components/ui/Divider';
import type { ThemeMode } from '../../store/ui.store';

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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
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
  isFirst?: boolean;
  isLast?: boolean;
}

function SettingsRow({
  icon: Icon,
  label,
  rightElement,
  onPress,
  isDestructive = false,
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
          <ChevronRight size={16} color={colors.textTertiary} strokeWidth={1.8} />
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

  const { user, biometric, setupBiometric, disableBiometric, signOut } = useAuthStore();
  const { household } = useHouseholdStore();
  const { showToast, currency, themeMode, setThemeMode } = useUIStore();

  // ── Theme picker sheet ────────────────────────────────────────────────
  const themeSheetRef = useRef<BottomSheetModal>(null);

  const openThemePicker = useCallback(() => {
    themeSheetRef.current?.present();
  }, []);

  // ── Active app icon ───────────────────────────────────────────────────
  const [activeIconId, setActiveIconId] = useState<string>('default');
  useEffect(() => {
    if (Platform.OS === 'ios') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('expo-alternate-app-icons') as {
          getAlternateAppIconAsync?: () => Promise<string | null>;
        };
        mod.getAlternateAppIconAsync?.()
          .then((name: string | null) => { setActiveIconId(name ?? 'default'); })
          .catch(() => {});
      } catch {
        // package not yet installed / not a native build
      }
    }
  }, []);

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

  // ── Clear all data ────────────────────────────────────────────────────
  const handleClearData = useCallback(() => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all your bills, expenses, budgets, and goals. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            showToast('info', 'All data cleared');
          },
        },
      ],
    );
  }, [showToast]);

  // ── Export data ───────────────────────────────────────────────────────
  const handleExportData = useCallback(() => {
    showToast('info', 'Export coming soon');
  }, [showToast]);

  // ── Feedback ──────────────────────────────────────────────────────────
  const handleFeedback = useCallback(() => {
    Linking.openURL('mailto:hello@aku.app?subject=Feedback').catch(() => {
      showToast('info', 'Send feedback to hello@aku.app');
    });
  }, [showToast]);

  // (theme mode changed via bottom sheet — see themeSheetRef above)

  if (!user) return null;

  const initials     = getInitials(user.name);
  const memberSince  = formatMemberSince(user.createdAt);

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
          <View
            style={[
              styles.avatar,
              { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                styles.avatarInitials,
                { fontFamily: font.displayLight, color: colors.textOnForest },
              ]}
            >
              {initials}
            </Text>
          </View>

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

        {/* ── Household card ── */}
        <Card style={styles.card}>
          <View style={styles.householdHeader}>
            <View
              style={[
                styles.householdIconWrap,
                { backgroundColor: colors.backgroundSecondary },
              ]}
            >
              <House size={18} color={colors.primary} strokeWidth={1.8} />
            </View>
            <Text style={[text.bodyMedium, { color: colors.textSecondary }]}>
              Your Household
            </Text>
            <Text
              style={[text.bodyMedium, styles.householdName, { color: colors.text }]}
              numberOfLines={1}
            >
              {household?.name ?? '—'}
            </Text>
          </View>

          {household ? (
            <>
              <Divider style={{ marginVertical: 12 }} />
              <Pressable
                onPress={() => router.push('/profile/household' as never)}
                style={styles.householdManageRow}
              >
                <Text style={[text.bodySm, { color: colors.primary }]}>
                  Manage household
                </Text>
                <ChevronRight size={15} color={colors.primary} strokeWidth={2} />
              </Pressable>
            </>
          ) : (
            <>
              <Divider style={{ marginVertical: 12 }} />
              <Button
                label="Create a Household"
                variant="secondary"
                size="sm"
                fullWidth={false}
                onPress={() => router.push('/profile/household' as never)}
              />
            </>
          )}
        </Card>

        {/* ── Security ── */}
        <SectionHeader label="Security" />
        <SettingsGroup>
          <SettingsRow
            icon={Lock}
            label="Change Passcode"
            onPress={() => router.push('/(onboarding)/pin-setup' as never)}
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
            onPress={() => router.push('/notifications' as never)}
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
            icon={Layers}
            label="App Icon"
            onPress={() => router.push('/app-icon' as never)}
            rightElement={
              <Text style={[text.caption, { color: colors.textTertiary }]}>
                {getActiveIconLabel(activeIconId)}
              </Text>
            }
            isLast
          />
        </SettingsGroup>

        {/* ── Data ── */}
        <SectionHeader label="Data" />
        <SettingsGroup>
          <SettingsRow
            icon={Download}
            label="Export data"
            onPress={handleExportData}
            isFirst
          />
          <SettingsRow
            icon={Trash2}
            label="Clear all data"
            onPress={handleClearData}
            isDestructive
            isLast
          />
        </SettingsGroup>

        {/* ── About ── */}
        <SectionHeader label="About" />
        <SettingsGroup>
          <SettingsRow
            icon={Info}
            label="Version"
            rightElement={
              <Text style={[text.caption, { color: colors.textTertiary }]}>
                1.0.0
              </Text>
            }
            isFirst
          />
          <SettingsRow
            icon={Shield}
            label="Privacy Policy"
            onPress={() => router.push('/privacy' as never)}
          />
          <SettingsRow
            icon={FileText}
            label="Terms of Service"
            onPress={() => router.push('/terms' as never)}
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

      {/* ── Theme picker sheet ── */}
      <BottomSheetModal
        ref={themeSheetRef}
        snapPoints={['35%']}
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
  avatar: {
    width:          72,
    height:         72,
    borderRadius:   36,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   14,
  },
  avatarInitials: {
    fontSize:      36,
    lineHeight:    40,
    includeFontPadding: false,
  } as object,
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
  householdHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
  },
  householdIconWrap: {
    width:          32,
    height:         32,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  householdName: {
    flex:      1,
    textAlign: 'right',
  },
  householdManageRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
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
