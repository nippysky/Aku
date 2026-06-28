/**
 * notification-settings.tsx — Akù Notification Preferences
 *
 * Dedicated screen for push notification toggles.
 * Accessed from Profile → Notification settings.
 * The notification FEED (/notifications) is separate.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  Linking,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Receipt,
  Wallet,
  Target,
  Sun,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { Palette } from '../theme/colors';
import { Divider } from '../components/ui/Divider';

// ─── Types ────────────────────────────────────────────────────────────────────

type LucideIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

interface NotifPrefs {
  billReminders:  boolean;
  budgetAlerts:   boolean;
  goalMilestones: boolean;
  dailyDigest:    boolean;
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({
  icon: Icon,
  label,
  sublabel,
  value,
  onChange,
  disabled = false,
  isFirst  = false,
  isLast   = false,
}: {
  icon:      LucideIcon;
  label:     string;
  sublabel?: string;
  value:     boolean;
  onChange:  (v: boolean) => void;
  disabled?: boolean;
  isFirst?:  boolean;
  isLast?:   boolean;
}) {
  const { colors, text, radius } = useTheme();

  return (
    <>
      <View
        style={[
          styles.toggleRow,
          {
            backgroundColor:         colors.card,
            borderTopLeftRadius:     isFirst ? radius.lg : 0,
            borderTopRightRadius:    isFirst ? radius.lg : 0,
            borderBottomLeftRadius:  isLast  ? radius.lg : 0,
            borderBottomRightRadius: isLast  ? radius.lg : 0,
            opacity: disabled ? 0.45 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.toggleIconWrap,
            { backgroundColor: colors.backgroundSecondary },
          ]}
        >
          <Icon size={17} color={colors.primary} strokeWidth={1.8} />
        </View>
        <View style={styles.toggleText}>
          <Text style={[text.bodyMedium, { color: colors.text }]}>{label}</Text>
          {sublabel ? (
            <Text style={[text.caption, { color: colors.textTertiary, marginTop: 2 }]}>
              {sublabel}
            </Text>
          ) : null}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={Platform.OS === 'android' ? colors.card : undefined}
        />
      </View>
      {!isLast && (
        <View style={{ backgroundColor: colors.card }}>
          <Divider style={{ marginLeft: 52 }} />
        </View>
      )}
    </>
  );
}

// ─── Permission banner ────────────────────────────────────────────────────────

function PermBanner({
  status,
  onRequest,
}: {
  status:    PermissionStatus;
  onRequest: () => void;
}) {
  const { colors, text, radius } = useTheme();

  if (status === 'granted') return null;

  const isDenied = status === 'denied';
  const bg       = isDenied ? colors.dangerBg  : colors.warningBg;
  const fg       = isDenied ? colors.danger     : colors.warning;
  const IconComp = isDenied ? BellOff           : Bell;
  const message  = isDenied
    ? 'Notifications are blocked. Enable them in your device Settings.'
    : 'Allow Akù to send you bill reminders and budget alerts.';
  const action = isDenied ? 'Open Settings' : 'Enable Notifications';

  return (
    <View style={[styles.permBanner, { backgroundColor: bg, borderRadius: radius.md }]}>
      <IconComp size={16} color={fg} strokeWidth={2} />
      <View style={{ flex: 1 }}>
        <Text style={[text.bodySm, { color: fg }]}>{message}</Text>
        <Pressable
          onPress={isDenied ? () => Linking.openSettings() : onRequest}
          style={{ alignSelf: 'flex-start', marginTop: 6 }}
        >
          <Text style={[text.bodySm, { color: fg, fontWeight: '600' }]}>{action}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const { colors, text, font, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [permStatus, setPermStatus] = useState<PermissionStatus>('undetermined');
  const [prefs, setPrefs] = useState<NotifPrefs>({
    billReminders:  true,
    budgetAlerts:   true,
    goalMilestones: true,
    dailyDigest:    false,
  });

  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then((r) =>
        setPermStatus(r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied')
      )
      .catch(() => setPermStatus('undetermined'));
  }, []);

  const requestPermission = useCallback(async () => {
    const r = await Notifications.requestPermissionsAsync();
    setPermStatus(r.granted ? 'granted' : !r.canAskAgain ? 'denied' : 'undetermined');
  }, []);

  function setPref<K extends keyof NotifPrefs>(key: K, value: boolean) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>

      {/* ── Forest-green header ── */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                Platform.OS === 'ios' ? 'rgba(22,58,47,0.88)' : colors.primary,
            },
          ]}
        />
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.headerBackBtn}
          >
            <ArrowLeft size={22} color={Palette.linen} strokeWidth={1.8} />
          </Pressable>
          <Text
            style={[
              styles.headerTitle,
              { fontFamily: font.displayLight, fontSize: fontSize.xl, color: Palette.linen },
            ]}
          >
            Notifications
          </Text>
          <View style={styles.headerRight} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 48 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission banner */}
        {permStatus !== 'granted' && (
          <PermBanner status={permStatus} onRequest={requestPermission} />
        )}

        {/* Description */}
        <Text style={[text.bodySm, styles.desc, { color: colors.textSecondary }]}>
          Choose which alerts Akù can send you. These settings are saved on your device.
        </Text>

        {/* Toggles */}
        <Text style={[text.labelCaps, styles.sectionLabel, { color: colors.textTertiary }]}>
          Alert Types
        </Text>
        <View
          style={[
            styles.group,
            {
              borderRadius: radius.lg,
              overflow:     'hidden',
              borderWidth:  1,
              borderColor:  colors.border,
            },
          ]}
        >
          <ToggleRow
            icon={Receipt}
            label="Bill reminders"
            sublabel="Get notified before bills are due"
            value={prefs.billReminders}
            onChange={(v) => setPref('billReminders', v)}
            disabled={permStatus !== 'granted'}
            isFirst
          />
          <ToggleRow
            icon={Wallet}
            label="Budget alerts"
            sublabel="Warns when you're approaching your limit"
            value={prefs.budgetAlerts}
            onChange={(v) => setPref('budgetAlerts', v)}
            disabled={permStatus !== 'granted'}
          />
          <ToggleRow
            icon={Target}
            label="Goal milestones"
            sublabel="Celebrate 25%, 50%, 75% and 100% progress"
            value={prefs.goalMilestones}
            onChange={(v) => setPref('goalMilestones', v)}
            disabled={permStatus !== 'granted'}
          />
          <ToggleRow
            icon={Sun}
            label="Daily digest"
            sublabel="Morning summary of what's due today"
            value={prefs.dailyDigest}
            onChange={(v) => setPref('dailyDigest', v)}
            disabled={permStatus !== 'granted'}
            isLast
          />
        </View>
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
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 20,
    paddingVertical:   14,
  },
  headerBackBtn: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex:          1,
    textAlign:     'center',
    letterSpacing: -0.3,
  },
  headerRight: {
    width: 36,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop:        24,
    gap:               4,
  },
  desc: {
    marginBottom: 20,
    lineHeight:   20,
  },
  sectionLabel: {
    marginBottom: 8,
    marginLeft:   2,
    letterSpacing: 1,
  },
  group: {},
  toggleRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   14,
    paddingHorizontal: 14,
    gap:               12,
    minHeight:         64,
  },
  toggleIconWrap: {
    width:          34,
    height:         34,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  toggleText: {
    flex: 1,
  },
  permBanner: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    padding:        14,
    gap:            10,
    marginBottom:   20,
  },
});
