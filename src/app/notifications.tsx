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
  AlertCircle,
} from 'lucide-react-native';
import { useTheme } from '../theme';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Divider } from '../components/ui/Divider';

// ─── Types ────────────────────────────────────────────────────────────────────

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

interface NotificationPrefs {
  billReminders: boolean;
  budgetAlerts:  boolean;
  goalMilestones: boolean;
  dailyDigest:   boolean;
}

// ─── LucideIconProps ─────────────────────────────────────────────────────────

interface LucideIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}
type LucideIcon = React.ComponentType<LucideIconProps>;

// ─── Toggle Row ───────────────────────────────────────────────────────────────

interface ToggleRowProps {
  icon:     LucideIcon;
  label:    string;
  sublabel?: string;
  value:    boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  isFirst?: boolean;
  isLast?:  boolean;
}

function ToggleRow({
  icon: Icon,
  label,
  sublabel,
  value,
  onChange,
  disabled = false,
  isFirst = false,
  isLast = false,
}: ToggleRowProps) {
  const { colors, text, radius } = useTheme();

  return (
    <>
      <View
        style={[
          styles.toggleRow,
          {
            backgroundColor: colors.card,
            borderTopLeftRadius:     isFirst ? radius.lg : 0,
            borderTopRightRadius:    isFirst ? radius.lg : 0,
            borderBottomLeftRadius:  isLast  ? radius.lg : 0,
            borderBottomRightRadius: isLast  ? radius.lg : 0,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.toggleIcon,
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
          thumbColor={colors.card}
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { colors, text, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [permStatus, setPermStatus] = useState<PermissionStatus>('undetermined');

  const [prefs, setPrefs] = useState<NotificationPrefs>({
    billReminders:  true,
    budgetAlerts:   true,
    goalMilestones: true,
    dailyDigest:    false,
  });

  // Check permission on mount
  useEffect(() => {
    Notifications.getPermissionsAsync().then((result) => {
      if (result.granted) {
        setPermStatus('granted');
      } else if (result.canAskAgain) {
        setPermStatus('undetermined');
      } else {
        setPermStatus('denied');
      }
    }).catch(() => {
      setPermStatus('undetermined');
    });
  }, []);

  const requestPermission = useCallback(async () => {
    const result = await Notifications.requestPermissionsAsync();
    if (result.granted) {
      setPermStatus('granted');
    } else if (!result.canAskAgain) {
      setPermStatus('denied');
    } else {
      setPermStatus('undetermined');
    }
  }, []);

  function setPref<K extends keyof NotificationPrefs>(key: K, value: boolean) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  const disabled = permStatus !== 'granted';

  // ── Permission banner ───────────────────────────────────────────────────
  function renderBanner() {
    if (permStatus === 'granted') {
      return (
        <View
          style={[
            styles.banner,
            { backgroundColor: colors.successBg, borderRadius: radius.md },
          ]}
        >
          <Bell size={16} color={colors.success} strokeWidth={2} />
          <Text style={[text.bodySm, styles.bannerText, { color: colors.success }]}>
            Notifications are enabled.
          </Text>
        </View>
      );
    }

    if (permStatus === 'denied') {
      return (
        <View
          style={[
            styles.banner,
            { backgroundColor: colors.dangerBg, borderRadius: radius.md },
          ]}
        >
          <BellOff size={16} color={colors.danger} strokeWidth={2} />
          <View style={styles.bannerBody}>
            <Text style={[text.bodySm, { color: colors.danger }]}>
              Notifications are disabled. Enable them in Settings to get reminders.
            </Text>
            <Pressable
              onPress={() => Linking.openSettings()}
              style={styles.openSettingsBtn}
            >
              <Text style={[text.bodySm, { color: colors.danger, fontWeight: '600' }]}>
                Open Settings
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    // undetermined
    return (
      <View
        style={[
          styles.banner,
          { backgroundColor: colors.warningBg, borderRadius: radius.md },
        ]}
      >
        <AlertCircle size={16} color={colors.warning} strokeWidth={2} />
        <View style={styles.bannerBody}>
          <Text style={[text.bodySm, { color: colors.warning }]}>
            Allow Akù to send you bill reminders and budget alerts.
          </Text>
          <Pressable onPress={requestPermission} style={styles.openSettingsBtn}>
            <Text style={[text.bodySm, { color: colors.warning, fontWeight: '600' }]}>
              Enable Notifications
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Notifications"
        leftAction={{
          icon: ArrowLeft,
          onPress: () => router.back(),
          accessibilityLabel: 'Back',
        }}
        style={{ paddingTop: insets.top }}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission banner */}
        <View style={styles.section}>{renderBanner()}</View>

        {/* Toggle group */}
        <Text
          style={[
            text.labelCaps,
            styles.sectionHeader,
            { color: colors.textTertiary },
          ]}
        >
          Preferences
        </Text>

        <View
          style={[
            styles.group,
            {
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            },
          ]}
        >
          <ToggleRow
            icon={Receipt}
            label="Bill reminders"
            sublabel="Get notified before bills are due"
            value={prefs.billReminders}
            onChange={(v) => setPref('billReminders', v)}
            disabled={disabled}
            isFirst
          />
          <ToggleRow
            icon={Wallet}
            label="Budget alerts"
            sublabel="Warns when you're approaching your limit"
            value={prefs.budgetAlerts}
            onChange={(v) => setPref('budgetAlerts', v)}
            disabled={disabled}
          />
          <ToggleRow
            icon={Target}
            label="Goal milestones"
            sublabel="Celebrate 25%, 50%, 75%, and 100% progress"
            value={prefs.goalMilestones}
            onChange={(v) => setPref('goalMilestones', v)}
            disabled={disabled}
          />
          <ToggleRow
            icon={Sun}
            label="Daily digest"
            sublabel="Morning summary of what's due today"
            value={prefs.dailyDigest}
            onChange={(v) => setPref('dailyDigest', v)}
            disabled={disabled}
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  section: {
    marginBottom: 8,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 10,
  },
  bannerText: {
    flex: 1,
  },
  bannerBody: {
    flex: 1,
    gap: 8,
  },
  openSettingsBtn: {
    alignSelf: 'flex-start',
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {},
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
    minHeight: 60,
  },
  toggleIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    flex: 1,
  },
});
