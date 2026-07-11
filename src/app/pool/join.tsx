/**
 * pool/join.tsx — Join a Pool by invite code
 *
 * Three-step flow:
 *   1. Code entry   — user types / pastes 8-char code
 *   2. Preview      — previewPool() fetches pool info; shows emoji, name,
 *                     owner, member count + avatar strip. No membership created yet.
 *   3. Success      — joinByCode() records membership → auto-navigate to circle
 *
 * Deep-link entry:
 *   aku://circle/join?code=XXXXXXXX   → pre-fills code + immediately previews
 *   aku://circle/join?circleId=UUID   → shows simple local preview + confirm
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
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ArrowLeft, CheckCircle, Hash, Users, Crown, AlertCircle } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../theme';
import { useAuthStore } from '../../store/auth.store';
import { useUIStore } from '../../store/ui.store';
import { useCirclesStore } from '../../store/circles.store';
import { previewCircle, type CirclePreview } from '../../lib/api-client';
import { Button } from '../../components/ui/Button';
import { InitialsAvatar } from '../../components/ui/InitialsAvatar';

const CODE_LENGTH = 8;

type Mode = 'code' | 'preview' | 'deeplink' | 'success';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function JoinCircleScreen() {
  const { colors, font, fontSize, text, layout, radius, spacing } = useTheme();
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const params  = useLocalSearchParams<{ code?: string; circleId?: string }>();

  const { user }                              = useAuthStore();
  const { showToast }                         = useUIStore();
  const { circles, joinByCode, joinById }     = useCirclesStore();

  const inputRef = useRef<TextInput>(null);

  const [mode, setMode] = useState<Mode>('code');

  // code input
  const [code,      setCode]      = useState(params.code?.toUpperCase() ?? '');
  const [codeError, setCodeError] = useState('');
  const [previewing, setPreviewing] = useState(false);

  // preview data (from previewCircle API)
  const [preview, setPreview] = useState<CirclePreview | null>(null);

  // deep-link preview (from in-memory circles store)
  const [dlName,  setDlName]  = useState('');
  const [dlLoaded, setDlLoaded] = useState(false);

  // joining
  const [isJoining,  setIsJoining]  = useState(false);
  const [joinedName, setJoinedName] = useState('');

  // Pre-fill from deep-link code param
  useEffect(() => {
    if (params.code) setCode(params.code.toUpperCase().substring(0, CODE_LENGTH));
  }, [params.code]);

  // If circleId provided (deep link), look up circle name from store
  useEffect(() => {
    const cid = params.circleId;
    if (!cid) return;
    setMode('deeplink');
    const found = circles.find((c) => c.id === cid);
    if (found) setDlName(found.name);
    setDlLoaded(true);
  }, [params.circleId, circles]);

  const handleChangeCode = useCallback((raw: string) => {
    const clean = raw.replace(/[^A-Za-z0-9]/g, '').substring(0, CODE_LENGTH).toUpperCase();
    setCode(clean);
    if (codeError) setCodeError('');
  }, [codeError]);

  const handlePaste = useCallback(async () => {
    const str = await Clipboard.getStringAsync();
    if (str) handleChangeCode(str);
    Haptics.selectionAsync();
  }, [handleChangeCode]);

  const isReady = code.length === CODE_LENGTH;

  // ── Step 1: Fetch preview ─────────────────────────────────────────────────
  const handlePreview = useCallback(async () => {
    if (!isReady || previewing) return;
    setCodeError('');
    setPreviewing(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const data = await previewCircle(code);
      if (data.alreadyMember) {
        setCodeError('You\'re already a member of this Pool.');
        return;
      }
      setPreview(data);
      setMode('preview');
    } catch (e: any) {
      setCodeError(e?.message ?? 'Invalid or expired code. Check and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPreviewing(false);
    }
  }, [code, isReady, previewing]);

  // ── Step 2: Confirm join ──────────────────────────────────────────────────
  const handleJoin = useCallback(async () => {
    if (!user || isJoining) return;
    setIsJoining(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await joinByCode(code, user.id);
      setJoinedName(result.circleName);
      setMode('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => router.replace(`/pool/${result.circleId}` as never), 1800);
    } catch (e: any) {
      showToast('error', e?.message ?? 'Could not join pool');
      setMode('code'); // back to code entry
    } finally {
      setIsJoining(false);
    }
  }, [code, user, joinByCode, showToast, router, isJoining]);

  // ── Deep link confirm ─────────────────────────────────────────────────────
  const handleDeepLinkJoin = useCallback(async () => {
    const cid = params.circleId;
    if (!cid || !user || isJoining) return;
    setIsJoining(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await joinById(cid, user.id);
      setJoinedName(dlName);
      setMode('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => router.replace(`/pool/${cid}` as never), 1800);
    } catch (e: any) {
      showToast('error', e?.message ?? 'Could not join pool');
    } finally {
      setIsJoining(false);
    }
  }, [params.circleId, user, joinById, dlName, showToast, router, isJoining]);

  // ─── Shared header ─────────────────────────────────────────────────────────

  const Header = ({ title }: { title: string }) => (
    <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.borderLight }]}>
      <Pressable
        onPress={mode === 'preview' ? () => setMode('code') : () => router.back()}
        hitSlop={8}
        style={styles.headerBack}
      >
        <ArrowLeft size={22} color={colors.text} strokeWidth={1.8} />
      </Pressable>
      <Text style={[styles.headerTitle, { fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text }]}>
        {title}
      </Text>
      <View style={styles.headerBack} />
    </View>
  );

  // ─── Success ───────────────────────────────────────────────────────────────

  if (mode === 'success') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.successWrap}>
          <Animated.View entering={FadeIn.duration(300)}>
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

  // ─── Deep-link preview ─────────────────────────────────────────────────────

  if (mode === 'deeplink') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Header title="Join Pool" />
        <View style={[styles.body, { paddingHorizontal: layout.screenPadding, paddingBottom: insets.bottom + 32 }]}>
          {!dlLoaded ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
          ) : (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.previewWrap}>
              <View style={[styles.previewEmoji, { backgroundColor: colors.primary + '14', borderRadius: radius.xl }]}>
                <Text style={{ fontSize: 56 }}>{'💰'}</Text>
              </View>
              <Text style={{ fontFamily: font.displayLight, fontSize: fontSize['2xl'], color: colors.text, marginTop: 20, textAlign: 'center' }}>
                {dlName || 'A Pool'}
              </Text>
              <Text style={[text.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22, paddingHorizontal: 24 }]}>
                You've been invited to join this pool.
              </Text>
              <View style={{ marginTop: 36, width: '100%', gap: 12 }}>
                <Button
                  label={isJoining ? 'Joining…' : `Join ${dlName || 'Pool'}`}
                  onPress={handleDeepLinkJoin}
                  disabled={isJoining}
                  size="lg"
                  variant="primary"
                />
                <Pressable onPress={() => router.back()} style={{ alignSelf: 'center', padding: 10 }}>
                  <Text style={[text.bodySm, { color: colors.textTertiary }]}>Not now</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </View>
      </View>
    );
  }

  // ─── Circle Preview ────────────────────────────────────────────────────────

  if (mode === 'preview' && preview) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Header title="Preview" />
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: layout.screenPadding,
            paddingTop: 32,
            paddingBottom: insets.bottom + 32,
          }}
        >
          {/* Emoji + name */}
          <Animated.View entering={FadeIn.duration(300)} style={styles.previewWrap}>
            <View style={[styles.previewEmoji, { backgroundColor: colors.primary + '14', borderRadius: radius.xl }]}>
              <Text style={{ fontSize: 64 }}>{preview.emoji}</Text>
            </View>

            <Text
              style={{
                fontFamily: font.displayLight,
                fontSize:   fontSize['2xl'],
                color:      colors.text,
                marginTop:  20,
                textAlign:  'center',
              }}
            >
              {preview.name}
            </Text>

            {/* Owner */}
            <View style={[styles.ownerRow, { marginTop: spacing[3] }]}>
              <Crown size={13} color={colors.primary} strokeWidth={1.8} />
              <Text style={[text.bodySm, { color: colors.textSecondary, marginLeft: 5 }]}>
                Created by <Text style={{ color: colors.text, fontFamily: font.sansMedium }}>{preview.ownerName}</Text>
              </Text>
            </View>

            {/* Stat pill */}
            <View style={[styles.memberPill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, marginTop: spacing[4] }]}>
              <Users size={14} color={colors.textSecondary} strokeWidth={1.8} />
              <Text style={[text.bodySm, { color: colors.textSecondary, marginLeft: 6, fontFamily: font.sansMedium }]}>
                {preview.memberCount} {preview.memberCount === 1 ? 'member' : 'members'}
              </Text>
            </View>

            {/* Member avatars */}
            {preview.members.length > 0 && (
              <View style={[styles.avatarStrip, { marginTop: spacing[6] }]}>
                {preview.members.map((m, i) => (
                  <View
                    key={i}
                    style={[
                      styles.avatarWrap,
                      {
                        marginLeft:   i > 0 ? -14 : 0,
                        borderColor:  colors.background,
                        borderRadius: 999,
                        zIndex:       preview.members.length - i,
                      },
                    ]}
                  >
                    <InitialsAvatar name={m.name} size={40} />
                  </View>
                ))}
                {preview.memberCount > preview.members.length && (
                  <View
                    style={[
                      styles.avatarWrap,
                      styles.avatarMore,
                      {
                        marginLeft:      -14,
                        backgroundColor: colors.backgroundSecondary,
                        borderColor:     colors.border,
                      },
                    ]}
                  >
                    <Text style={{ fontFamily: font.sansMedium, fontSize: fontSize.xs, color: colors.textSecondary }}>
                      +{preview.memberCount - preview.members.length}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Invite description */}
            <Text
              style={[
                text.body,
                {
                  color:       colors.textSecondary,
                  textAlign:   'center',
                  marginTop:   spacing[6],
                  lineHeight:  24,
                  paddingHorizontal: 16,
                },
              ]}
            >
              Joining means you'll contribute to the shared goal and see the group's progress in real time.
            </Text>
          </Animated.View>

          {/* CTA */}
          <Animated.View entering={FadeInDown.delay(120).duration(280)} style={{ marginTop: spacing[8], gap: 12 }}>
            <Button
              label={isJoining ? 'Joining…' : `Join ${preview.name}`}
              onPress={handleJoin}
              disabled={isJoining}
              loading={isJoining}
              size="lg"
              variant="primary"
            />
            <Pressable
              onPress={() => setMode('code')}
              style={{ alignSelf: 'center', paddingVertical: 10 }}
            >
              <Text style={[text.bodySm, { color: colors.textTertiary }]}>
                Use a different code
              </Text>
            </Pressable>
          </Animated.View>
        </KeyboardAwareScrollView>
      </View>
    );
  }

  // ─── Code entry ────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header title="Join a Pool" />

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
            Ask the Pool owner for their 8-character code, or tap the invite link they sent you.
          </Text>
        </Animated.View>

        {/* Code input */}
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
              onSubmitEditing={isReady ? handlePreview : undefined}
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
            <View style={[styles.errorRow, { marginTop: 8 }]}>
              <AlertCircle size={13} color={colors.danger} strokeWidth={1.8} />
              <Text style={[text.caption, { color: colors.danger, marginLeft: 4 }]}>
                {codeError}
              </Text>
            </View>
          ) : (
            <Text style={[text.caption, { color: colors.textTertiary, marginTop: 8, marginLeft: 2 }]}>
              {code.length}/{CODE_LENGTH} characters
            </Text>
          )}
        </Animated.View>

        {/* Continue button */}
        <Animated.View entering={FadeInDown.delay(140).duration(280)} style={{ marginTop: 24 }}>
          <Button
            label={previewing ? 'Loading…' : 'Continue'}
            onPress={handlePreview}
            loading={previewing}
            disabled={!isReady || previewing}
            size="lg"
          />
        </Animated.View>

        <Animated.Text
          entering={FadeInDown.delay(200).duration(280)}
          style={[text.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: 20, lineHeight: 18 }]}
        >
          Codes are 8 characters — letters and numbers only.{'\n'}
          Long-press the field or tap "Paste" to paste from a message.
        </Animated.Text>
      </KeyboardAwareScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingBottom:     12,
    borderBottomWidth: 1,
  },
  headerBack:  { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', letterSpacing: -0.5 },

  body:        { flex: 1, paddingTop: 32 },
  iconWrap:    { alignItems: 'center' },
  iconCircle:  { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  // Preview
  previewWrap:  { alignItems: 'center' },
  previewEmoji: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  ownerRow:     { flexDirection: 'row', alignItems: 'center' },
  memberPill: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    paddingVertical:   7,
    borderRadius:      999,
    borderWidth:       1,
  },
  avatarStrip: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap:  { borderWidth: 2 },
  avatarMore: {
    width:          40,
    height:         40,
    borderRadius:   999,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 2 },

  // Code input
  codeInputWrap: {
    flexDirection: 'row',
    alignItems:    'center',
    borderWidth:   1.5,
    height:        58,
    gap:           10,
  },
  codeInput: {
    flex:        1,
    height:      '100%',
    paddingLeft: 4,
  },
  pasteBtn: {
    paddingHorizontal: 12,
    paddingVertical:   7,
    marginRight:       10,
  },
});
