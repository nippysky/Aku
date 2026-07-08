/**
 * circle/join.tsx — Join a Circle by invite code or deep link
 *
 * Deep link entry points (from nippysky.com/ventures/aku/join?code=XXXXXXXX):
 *   aku://circle/join?code=XXXXXXXX          → pre-fills code input
 *   aku://circle/join?circleId=UUID&code=XX  → shows circle preview + Confirm button
 *
 * Single TextInput for code entry — supports paste, autofill, SwiftUI QuickType
 * and Android clipboard suggestions natively.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Users, CheckCircle, Hash } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { getDatabase, schema } from '../../lib/database/client';
import { eq } from 'drizzle-orm';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { useCirclesStore } from '../../store/circles.store';
import { Button } from '../../components/ui/Button';

const CODE_LENGTH = 8;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function JoinCircleScreen() {
  const { colors, font, fontSize, text, layout, radius } = useTheme();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const params  = useLocalSearchParams<{ code?: string; circleId?: string }>();

  const { user }                       = useAuthStore();
  const { showToast }                  = useUIStore();
  const { joinByCode, joinById } = useCirclesStore();

  const inputRef = useRef<TextInput>(null);

  // ── Mode: code input vs. deep link preview ───────────────────────────────
  const [mode, setMode] = useState<'code' | 'preview'>('code');

  // code input
  const [code,      setCode]      = useState(params.code?.toUpperCase() ?? '');
  const [codeError, setCodeError] = useState('');

  // preview mode (from deep link with circleId)
  const [previewName,   setPreviewName]   = useState('');
  const [previewEmoji,  setPreviewEmoji]  = useState('💰');
  const [previewLoaded, setPreviewLoaded] = useState(false);

  const [isJoining,  setIsJoining]  = useState(false);
  const [joined,     setJoined]     = useState(false);
  const [joinedName, setJoinedName] = useState('');

  // Pre-fill from deep-link
  useEffect(() => {
    if (params.code) setCode(params.code.toUpperCase().substring(0, CODE_LENGTH));
  }, [params.code]);

  // If circleId provided, load preview
  useEffect(() => {
    const cid = params.circleId;
    if (!cid) return;
    setMode('preview');
    (async () => {
      try {
        const db   = getDatabase();
        const rows = await db.select().from(schema.households).where(eq(schema.households.id, cid));
        if (rows[0]) {
          setPreviewName(rows[0].name);
          const sr = await db.select().from(schema.circleSettings).where(eq(schema.circleSettings.id, cid));
          setPreviewEmoji((sr[0] as any)?.emoji ?? '💰');
        }
      } catch { /* silently ignore */ }
      finally   { setPreviewLoaded(true); }
    })();
  }, [params.circleId]);

  const handleChangeCode = useCallback((raw: string) => {
    const clean = raw.replace(/[^A-Za-z0-9]/g, '').substring(0, CODE_LENGTH).toUpperCase();
    setCode(clean);
    if (codeError) setCodeError('');
  }, [codeError]);

  // Paste button — reads clipboard and drops it into the field
  const handlePaste = useCallback(async () => {
    const str = await Clipboard.getStringAsync();
    if (str) handleChangeCode(str);
    Haptics.selectionAsync();
  }, [handleChangeCode]);

  const isReady = code.length === CODE_LENGTH;

  // ── Join by code ──────────────────────────────────────────────────────────
  const handleJoinByCode = useCallback(async () => {
    if (!isReady || !user) return;
    setCodeError('');
    setIsJoining(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await joinByCode(code, user.id);
      setJoinedName(result.circleName);
      setJoined(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => router.replace(`/circle/${result.circleId}` as never), 1800);
    } catch (e: any) {
      setCodeError(e?.message ?? 'Invalid or expired code. Check and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsJoining(false);
    }
  }, [code, isReady, user, joinByCode, router]);

  // ── Confirm join via deep link preview ───────────────────────────────────
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

  // ── Success state ─────────────────────────────────────────────────────────
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

  // ── Preview mode ──────────────────────────────────────────────────────────
  if (mode === 'preview') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
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
                You've been invited to join this circle. Tap below to confirm.
              </Text>
              <View style={{ marginTop: 36, width: '100%' }}>
                <Button
                  label={isJoining ? 'Joining…' : `Join ${previewName || 'Circle'}`}
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
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.borderLight }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBack}>
          <ArrowLeft size={22} color={colors.text} strokeWidth={1.8} />
        </Pressable>
        <Text style={[styles.headerTitle, { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text }]}>
          Join a Circle
        </Text>
        <View style={styles.headerBack} />
      </View>

      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingHorizontal: layout.screenPadding, paddingBottom: insets.bottom + 48 }]}
        bottomOffset={24}
      >
        {/* Icon + heading */}
        <Animated.View entering={FadeInDown.duration(280)} style={styles.iconWrap}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '14', borderRadius: radius.full }]}>
            <Users size={36} color={colors.primary} strokeWidth={1.4} />
          </View>
          <Text style={{ fontFamily: font.displayLight, fontSize: fontSize.xl, color: colors.text, marginTop: 16, textAlign: 'center' }}>
            Enter your invite code
          </Text>
          <Text style={[text.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 22, paddingHorizontal: 16 }]}>
            Ask the Circle owner for their 8-character code, or tap the invite link they sent you.
          </Text>
        </Animated.View>

        {/* Single clean text input */}
        <Animated.View entering={FadeInDown.delay(80).duration(280)} style={{ marginTop: 28 }}>
          <View
            style={[
              styles.codeInputWrap,
              {
                borderColor:     codeError ? colors.danger : isReady ? colors.primary : colors.border,
                borderRadius:    radius.lg,
                backgroundColor: colors.inputBackground,
              },
            ]}
          >
            <Hash size={18} color={colors.textTertiary} strokeWidth={1.8} style={{ marginLeft: 14 }} />
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={handleChangeCode}
              placeholder="XXXXXXXX"
              placeholderTextColor={colors.inputPlaceholder}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="one-time-code"
              keyboardType="default"
              maxLength={CODE_LENGTH}
              returnKeyType="done"
              onSubmitEditing={isReady ? handleJoinByCode : undefined}
              autoFocus
              style={[
                styles.codeInput,
                {
                  fontFamily:    font.sansSemiBold,
                  fontSize:      fontSize.xl,
                  color:         isReady ? colors.primary : colors.text,
                  letterSpacing: 4,
                },
              ]}
              accessibilityLabel="Invite code input"
            />
            {/* Explicit paste button — works alongside native long-press paste */}
            <Pressable
              onPress={handlePaste}
              hitSlop={8}
              style={[styles.pasteBtn, { borderRadius: radius.md, backgroundColor: colors.backgroundSecondary }]}
            >
              <Text style={{ fontFamily: font.sansMedium, fontSize: fontSize.xs, color: colors.primary }}>
                Paste
              </Text>
            </Pressable>
          </View>

          {codeError ? (
            <Text style={[text.caption, { color: colors.danger, marginTop: 8, marginLeft: 2 }]}>
              {codeError}
            </Text>
          ) : (
            <Text style={[text.caption, { color: colors.textTertiary, marginTop: 8, marginLeft: 2 }]}>
              {code.length}/{CODE_LENGTH} characters
            </Text>
          )}
        </Animated.View>

        {/* Join button */}
        <Animated.View entering={FadeInDown.delay(140).duration(280)} style={{ marginTop: 24 }}>
          <Button
            label="Join Circle"
            onPress={handleJoinByCode}
            loading={isJoining}
            disabled={!isReady || isJoining}
            size="lg"
          />
        </Animated.View>

        <Animated.Text
          entering={FadeInDown.delay(200).duration(280)}
          style={[text.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: 20, lineHeight: 18 }]}
        >
          Codes are 8 characters — letters and numbers only.{'\n'}
          You can long-press the input or tap "Paste" to paste from a message.
        </Animated.Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:       { flex: 1 },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingBottom:     12,
    borderBottomWidth: 1,
  },
  headerBack:   { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { flex: 1, textAlign: 'center', letterSpacing: -0.5 },
  body:         { flex: 1, paddingTop: 32 },
  iconWrap:     { alignItems: 'center' },
  iconCircle:   { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  successWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  previewWrap:  { flex: 1, alignItems: 'center', paddingTop: 32 },
  previewEmoji: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },

  // Code input
  codeInputWrap: {
    flexDirection: 'row',
    alignItems:    'center',
    borderWidth:   1.5,
    height:        58,
    gap:           10,
  },
  codeInput: {
    flex:   1,
    height: '100%',
    paddingLeft: 4,
  },
  pasteBtn: {
    paddingHorizontal: 12,
    paddingVertical:   7,
    marginRight:       10,
  },
});
