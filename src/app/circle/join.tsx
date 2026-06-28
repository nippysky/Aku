/**
 * circle/join.tsx — Join a Circle by invite code or deep link
 *
 * Deep link entry points:
 *   aku://circle/join?code=XXXXXXXX          → pre-fills code input
 *   aku://circle/join?circleId=UUID&code=XX  → shows circle preview + Confirm button
 *
 * Local SQLite flow (no backend needed):
 *   joinByCode(code, userId)  — looks up circle by invite_code, inserts member row
 *   joinById(circleId, userId) — inserts member row directly (deep link confirm)
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Users, CheckCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { getDatabase, schema } from '../../lib/database/client';
import { eq } from 'drizzle-orm';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { useCirclesStore } from '../../store/circles.store';
import { Button } from '../../components/ui/Button';

// ─── Code-box: 8 character cells ─────────────────────────────────────────────

const CODE_LENGTH = 8;

function CodeBox({
  value,
  onChange,
  error,
}: {
  value:    string;
  onChange: (v: string) => void;
  error:    boolean;
}) {
  const { colors, font, fontSize, radius } = useTheme();
  const inputRef = useRef<TextInput>(null);

  const chars = value.toUpperCase().split('');

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.codeBoxWrap}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^A-Za-z0-9]/g, '').substring(0, CODE_LENGTH))}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        maxLength={CODE_LENGTH}
        keyboardType="default"
        style={styles.hiddenInput}
        accessibilityLabel="Invite code input"
      />
      <View style={styles.codeRow}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => {
          const ch      = chars[i] ?? '';
          const isFocus = i === Math.min(chars.length, CODE_LENGTH - 1);
          return (
            <View
              key={i}
              style={[
                styles.codeCell,
                {
                  borderRadius:    radius.md,
                  borderColor:     error
                    ? colors.danger
                    : isFocus ? colors.primary : ch ? colors.border : colors.borderLight,
                  backgroundColor: ch ? colors.backgroundSecondary : colors.inputBackground,
                },
              ]}
            >
              <Text style={{ fontFamily: font.sansSemiBold, fontSize: fontSize.xl, color: ch ? colors.primary : colors.inputPlaceholder }}>
                {ch || '·'}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function JoinCircleScreen() {
  const { colors, font, fontSize, text, layout, radius } = useTheme();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const params  = useLocalSearchParams<{ code?: string; circleId?: string }>();

  const { user }            = useAuthStore();
  const { showToast }       = useUIStore();
  const { load, joinByCode, joinById } = useCirclesStore();

  // ── Mode: code input vs. deep link preview ───────────────────────────────
  const [mode, setMode] = useState<'code' | 'preview'>('code');

  // code input mode
  const [code,      setCode]      = useState(params.code?.toUpperCase() ?? '');
  const [codeError, setCodeError] = useState(false);

  // preview mode (from deep link with circleId)
  const [previewName,  setPreviewName]  = useState('');
  const [previewEmoji, setPreviewEmoji] = useState('💰');
  const [previewLoaded, setPreviewLoaded] = useState(false);

  const [isJoining, setIsJoining] = useState(false);
  const [joined,    setJoined]    = useState(false);
  const [joinedName, setJoinedName] = useState('');

  // Auto-populate from deep link
  useEffect(() => {
    if (params.code) setCode(params.code.toUpperCase().substring(0, CODE_LENGTH));
  }, [params.code]);

  // If circleId provided, load circle preview
  useEffect(() => {
    const cid = params.circleId;
    if (!cid) return;

    setMode('preview');

    (async () => {
      try {
        const db = getDatabase();
        const rows = await db.select().from(schema.households).where(eq(schema.households.id, cid));
        if (rows[0]) {
          setPreviewName(rows[0].name);
          // load emoji from circleSettings
          const sr = await db.select().from(schema.circleSettings).where(eq(schema.circleSettings.id, cid));
          setPreviewEmoji((sr[0] as any)?.emoji ?? '💰');
        }
      } catch {
        // silently ignore
      } finally {
        setPreviewLoaded(true);
      }
    })();
  }, [params.circleId]);

  const isReady = code.length === CODE_LENGTH;

  // ── Join by code ──────────────────────────────────────────────────────────
  const handleJoinByCode = useCallback(async () => {
    if (!isReady || !user) return;
    setCodeError(false);
    setIsJoining(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await joinByCode(code, user.id);
      setJoinedName(result.circleName);
      setJoined(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => router.replace(`/circle/${result.circleId}` as never), 1800);
    } catch (e: any) {
      setCodeError(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast('error', e?.message ?? 'Invalid or expired code');
    } finally {
      setIsJoining(false);
    }
  }, [code, isReady, user, joinByCode, showToast, router]);

  // ── Confirm join via deep link ────────────────────────────────────────────
  const handleConfirmJoin = useCallback(async () => {
    const cid = params.circleId;
    if (!cid || !user) return;
    setIsJoining(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await joinById(cid, user.id);
      setJoinedName(previewName);
      setJoined(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => router.replace(`/circle/${cid}` as never), 1800);
    } catch (e: any) {
      showToast('error', e?.message ?? 'Could not join circle');
    } finally {
      setIsJoining(false);
    }
  }, [params.circleId, user, joinById, previewName, showToast, router]);

  // ── Success state ──────────────────────────────────────────────────────────
  if (joined) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.successWrap}>
          <Animated.View entering={FadeInDown.duration(300)}>
            <CheckCircle size={72} color={colors.success} strokeWidth={1.4} />
          </Animated.View>
          <Animated.Text
            entering={FadeInDown.delay(100).duration(280)}
            style={{ fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text, marginTop: 20, textAlign: 'center' }}
          >
            You're in!
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.delay(160).duration(280)}
            style={[text.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 8 }]}
          >
            Welcome to {joinedName}. Taking you there now…
          </Animated.Text>
        </View>
      </View>
    );
  }

  // ── Preview mode (deep link with circleId) ────────────────────────────────
  if (mode === 'preview') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.borderLight }]}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBack}>
            <ArrowLeft size={22} color={colors.text} strokeWidth={1.8} />
          </Pressable>
          <Text style={[styles.headerTitle, { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text }]}>
            Join Circle
          </Text>
          <View style={styles.headerBack} />
        </View>

        <View style={[styles.body, { paddingHorizontal: layout.screenPadding, paddingBottom: insets.bottom + 32 }]}>
          {!previewLoaded ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
          ) : (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.previewWrap}>
              <View style={[styles.previewEmoji, { backgroundColor: colors.primary + '14', borderRadius: radius.xl }]}>
                <Text style={{ fontSize: 56 }}>{previewEmoji}</Text>
              </View>
              <Text style={{ fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text, marginTop: 20, textAlign: 'center' }}>
                {previewName || 'A Circle'}
              </Text>
              <Text style={[text.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22, paddingHorizontal: 24 }]}>
                You've been invited to join this circle. Tap below to confirm and become a member.
              </Text>

              <View style={{ marginTop: 36, width: '100%' }}>
                <Button
                  label={isJoining ? 'Joining…' : `Confirm — Join ${previewName || 'Circle'}`}
                  onPress={handleConfirmJoin}
                  disabled={isJoining}
                  size="lg"
                  variant="primary"
                />
              </View>

              <Pressable onPress={() => router.back()} style={{ marginTop: 16, alignSelf: 'center', padding: 10 }}>
                <Text style={[text.bodySm, { color: colors.textTertiary }]}>Not now</Text>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>
    );
  }

  // ── Code input mode ───────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.borderLight }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBack}>
          <ArrowLeft size={22} color={colors.text} strokeWidth={1.8} />
        </Pressable>
        <Text style={[styles.headerTitle, { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text }]}>
          Join a Circle
        </Text>
        <View style={styles.headerBack} />
      </View>

      <View style={[styles.body, { paddingHorizontal: layout.screenPadding, paddingBottom: insets.bottom + 32 }]}>
        <Animated.View entering={FadeInDown.duration(280)} style={styles.iconWrap}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '14', borderRadius: radius.full }]}>
            <Users size={36} color={colors.primary} strokeWidth={1.4} />
          </View>
          <Text style={{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text, marginTop: 16, textAlign: 'center' }}>
            Enter your invite code
          </Text>
          <Text style={[text.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 22, paddingHorizontal: 16 }]}>
            Ask the Circle owner to share their 8-character invite code, or tap the invite link they sent you.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(280)} style={{ marginTop: 32 }}>
          <CodeBox value={code} onChange={(v) => { setCode(v); setCodeError(false); }} error={codeError} />
          {codeError ? (
            <Text style={[text.caption, { color: colors.danger, textAlign: 'center', marginTop: 10 }]}>
              Code not found or expired. Double-check and try again.
            </Text>
          ) : (
            <Text style={[text.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: 10 }]}>
              {code.length}/{CODE_LENGTH} characters
            </Text>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(140).duration(280)} style={{ marginTop: 32 }}>
          <Button
            label="Join Circle"
            onPress={handleJoinByCode}
            loading={isJoining}
            disabled={!isReady}
            size="lg"
          />
        </Animated.View>

        <Animated.Text
          entering={FadeInDown.delay(200).duration(280)}
          style={[text.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: 20, lineHeight: 18 }]}
        >
          Codes are case-insensitive and contain letters and numbers only.{'\n'}
          Don't have a code? Ask the Circle owner to share one.
        </Animated.Text>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerBack:  { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', letterSpacing: -0.5 },
  body: { flex: 1, paddingTop: 32 },
  iconWrap: { alignItems: 'center' },
  iconCircle: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  codeBoxWrap: { alignItems: 'center' },
  hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
  codeRow:     { flexDirection: 'row', gap: 8 },
  codeCell:    { width: 36, height: 48, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  previewWrap: { flex: 1, alignItems: 'center', paddingTop: 32 },
  previewEmoji: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
});
