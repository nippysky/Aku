import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { eq } from 'drizzle-orm';
import { generateUUID } from '../lib/uuid';
import {
  requestMagicLink,
  validateSession,
  revokeSession,
  syncAvatarData,
  fetchDek,
  uploadDek,
  type UserProfile,
} from '../lib/api-client';
import { getDatabase, schema } from '../lib/database/client';
import { generateDEK, encodeDEK, decodeDEK } from '../lib/sync/crypto';
import { useSyncStore } from './sync.store';
import type { User, AuthSession, BiometricConfig } from '../types';

// ─── Cross-store reset helper ─────────────────────────────────────────────────
// Imported lazily to avoid circular dependencies at module parse time.
// Called only from signOut(), which runs after the module graph is settled.
function resetAllDataStores() {
  // Lazy import avoids circular dep: auth → stores → auth
  const { useBillsStore }    = require('./bills.store');
  const { useExpensesStore } = require('./expenses.store');
  const { useBudgetsStore }  = require('./budgets.store');
  const { useGoalsStore }    = require('./goals.store');
  const { useCirclesStore }  = require('./circles.store');
  const { useCircleStore }   = require('./circle.store');

  useBillsStore.setState({ bills: [], isLoading: false, error: null });
  useExpensesStore.setState({ expenses: [], allExpenses: [], summary: null, isLoading: false, error: null });
  useBudgetsStore.setState({ budgets: [], isLoading: false, error: null });
  useGoalsStore.setState({ goals: [], contributions: {}, isLoading: false, error: null });
  useCirclesStore.setState({ circles: [], activeCircle: null, members: [], isLoading: false, error: null });
  useCircleStore.setState({ settings: null, contributions: [], leaderboard: [], members: [], memberStatuses: [], activeCircleId: null });
}

// ─── Keys ─────────────────────────────────────────────────────────────────
const KEYS = {
  SESSION:   'aku_session',
  PIN_HASH:  'aku_pin_hash',
  BIOMETRIC: 'aku_biometric',
  USER:      'aku_user',
  ONBOARDED: 'aku_onboarded',  // persists across restarts
} as const;

// ─── State ────────────────────────────────────────────────────────────────

interface AuthState {
  // Data
  user:          User | null;
  session:       AuthSession | null;
  biometric:     BiometricConfig;
  isLocked:      boolean;
  hasOnboarded:  boolean;   // persisted — true once first onboarding complete

  // Status
  isLoading:        boolean;
  isInitialized:    boolean;
  error:            string | null;

  // Actions — Auth
  initialize:              () => Promise<void>;
  createLocalUser:         (name: string, email: string) => Promise<void>;
  signIn:                  (email: string, name?: string) => Promise<void>;
  handleAuthCallback:      (jwt: string, user: UserProfile) => Promise<void>;
  signOut:                 () => Promise<void>;
  updateUser:              (patch: Partial<User>) => void;
  markOnboardingComplete:  () => Promise<void>;
  /**
   * Save a new avatar (base64 data URI) locally and sync to server.
   * avatarData is stored in SQLite only — never SecureStore (size limit).
   */
  saveAvatarData:          (avatarData: string) => Promise<void>;

  // Actions — PIN
  setupPin:         (pin: string) => Promise<void>;
  verifyPin:        (pin: string) => Promise<boolean>;
  resetPin:         () => Promise<void>;

  // Actions — Biometric
  setupBiometric:        () => Promise<boolean>;
  authenticateBiometric: () => Promise<boolean>;
  disableBiometric:      () => Promise<void>;

  // Actions — Lock
  lock:             () => void;
  unlock:           () => void;

  // Helpers
  clearError:       () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()((set, get) => ({
  user:           null,
  session:        null,
  biometric:      { enabled: false, type: 'none' },
  isLocked:       true,
  hasOnboarded:   false,
  isLoading:      false,
  isInitialized:  false,
  error:          null,

  // ── Initialize: load persisted session + biometric config on app start ──
  initialize: async () => {
    try {
      set({ isLoading: true });

      const [sessionJson, userJson, biometricJson, onboardedStr] = await Promise.all([
        SecureStore.getItemAsync(KEYS.SESSION),
        SecureStore.getItemAsync(KEYS.USER),
        SecureStore.getItemAsync(KEYS.BIOMETRIC),
        SecureStore.getItemAsync(KEYS.ONBOARDED),
      ]);

      const session: AuthSession | null = sessionJson ? JSON.parse(sessionJson) : null;
      const user: User | null = userJson ? JSON.parse(userJson) : null;
      const biometric: BiometricConfig = biometricJson
        ? JSON.parse(biometricJson)
        : { enabled: false, type: 'none' };
      const hasOnboarded = onboardedStr === 'true';

      // Local expiry check first (avoids a network round-trip on every cold start)
      const locallyValid = session ? new Date(session.expiresAt) > new Date() : false;

      if (!locallyValid) {
        set({ user: null, session: null, biometric, hasOnboarded, isLocked: false, isInitialized: true });
        return;
      }

      // For non-local sessions (real JWT from server) validate against the API
      // to catch server-side revocations. Local dev sessions skip this.
      const isLocalSession = session?.accessToken?.startsWith('local_') ?? false;
      let validatedUser = user;

      if (!isLocalSession) {
        try {
          const profile = await validateSession();
          if (!profile) {
            // Server says session is invalid — clear it
            await Promise.all([
              SecureStore.deleteItemAsync(KEYS.SESSION),
              SecureStore.deleteItemAsync(KEYS.USER),
            ]);
            set({ user: null, session: null, biometric, hasOnboarded, isLocked: false, isInitialized: true });
            return;
          }
          // Sync latest profile from server (avatarData comes from SQLite below)
          validatedUser = {
            id:          profile.id,
            name:        profile.name,
            email:       profile.email,
            avatarUrl:   profile.avatarUrl,
            avatarData:  null, // loaded from SQLite below
            householdId: user?.householdId ?? null,
            createdAt:   user?.createdAt ?? new Date().toISOString(),
            updatedAt:   new Date().toISOString(),
          };
          // Save to SecureStore WITHOUT avatarData (too large for Keychain)
          const { avatarData: _strip, ...toStore } = validatedUser;
          void _strip;
          await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(toStore));
        } catch {
          // Network unavailable — trust the local cache
        }
      }

      // Load avatarData from SQLite — it's stored there, not SecureStore
      let avatarData: string | null = null;
      if (validatedUser?.id) {
        try {
          const db = getDatabase();
          const rows = await db
            .select({ avatarData: schema.users.avatarData })
            .from(schema.users)
            .where(eq(schema.users.id, validatedUser.id))
            .limit(1);
          avatarData = rows[0]?.avatarData ?? null;
        } catch { /* SQLite not yet ready — non-fatal */ }
      }

      const userWithAvatar: User | null = validatedUser
        ? { ...validatedUser, avatarData }
        : null;

      // Upsert to SQLite so circle LEFT JOINs resolve names without band-aids.
      // This replaces scattered ensureUserInSQLite() calls throughout circle.store.
      if (userWithAvatar) {
        const db  = getDatabase();
        const now = new Date().toISOString();
        try {
          await db.insert(schema.users).values({
            id:        userWithAvatar.id,
            name:      userWithAvatar.name,
            email:     userWithAvatar.email,
            avatarUrl: userWithAvatar.avatarUrl ?? null,
            createdAt: now,
            updatedAt: now,
          });
        } catch {
          try {
            await db.update(schema.users)
              .set({ name: userWithAvatar.name, updatedAt: now })
              .where(eq(schema.users.id, userWithAvatar.id));
          } catch { /* ignore */ }
        }
      }

      set({
        user:          userWithAvatar,
        session,
        biometric,
        hasOnboarded,
        isLocked:      hasOnboarded && locallyValid,
        isInitialized: true,
      });
    } catch {
      set({ isInitialized: true, isLocked: false });
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Create Local User: build a User + AuthSession locally (no server) ─
  createLocalUser: async (name: string, email: string) => {
    const now       = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const user: User = {
      id:          generateUUID(),
      name,
      email,
      householdId: null,
      avatarUrl:   null,
      avatarData:  null,
      createdAt:   now.toISOString(),
      updatedAt:   now.toISOString(),
    };

    const session: AuthSession = {
      userId:      user.id,
      accessToken: `local_${Date.now()}`,
      expiresAt:   expiresAt.toISOString(),
    };

    await Promise.all([
      SecureStore.setItemAsync(KEYS.USER,    JSON.stringify(user)),
      SecureStore.setItemAsync(KEYS.SESSION, JSON.stringify(session)),
    ]);

    // Upsert to SQLite so circle LEFT JOINs can resolve the user's name
    const upsertDb  = getDatabase();
    const upsertNow = now.toISOString(); // `now` is the Date already declared above
    try {
      await upsertDb.insert(schema.users).values({
        id: user.id, name: user.name, email: user.email,
        avatarUrl: null, createdAt: upsertNow, updatedAt: upsertNow,
      });
    } catch {
      try {
        await upsertDb.update(schema.users)
          .set({ name: user.name, updatedAt: upsertNow })
          .where(eq(schema.users.id, user.id));
      } catch { /* ignore */ }
    }

    // Keep locked — the user still needs to go through PIN setup in onboarding.
    // unlock() is called at the end of the onboarding flow.
    set({ user, session, isLocked: true });
  },

  // ── Sign In: request a magic link email via the server ────────────────
  signIn: async (email: string, name?: string) => {
    set({ isLoading: true, error: null });
    try {
      await requestMagicLink(email, name);
      // After this, the user checks their email and taps the magic link.
      // The deep link opens the app and calls handleAuthCallback().
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send magic link';
      set({ error: msg });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Handle Auth Callback: called when the magic link deep link arrives ─
  // jwt      — the signed JWT from the server
  // profile  — user data decoded from the deep link
  handleAuthCallback: async (jwt: string, profile: UserProfile) => {
    const now       = new Date();
    // Parse expiry from JWT header (or default to 30 days)
    let expiresAt   = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const parts  = jwt.split('.');
      const claims = JSON.parse(atob(parts[1])) as { exp?: number };
      if (claims.exp) expiresAt = new Date(claims.exp * 1000).toISOString();
    } catch { /* use default */ }

    const user: User = {
      id:          profile.id,
      name:        profile.name,
      email:       profile.email,
      avatarUrl:   profile.avatarUrl,
      // Restore avatar from server on new device — written to SQLite below.
      // SecureStore has a size limit so base64 images are never stored there.
      avatarData:  profile.avatarData ?? null,
      householdId: null,
      createdAt:   now.toISOString(),
      updatedAt:   now.toISOString(),
    };

    const session: AuthSession = {
      userId:      profile.id,
      accessToken: jwt,
      expiresAt,
    };

    // Store user WITHOUT avatarData — base64 is too large for SecureStore (Keychain)
    const { avatarData: _strip, ...toStore } = user;
    void _strip;
    await Promise.all([
      SecureStore.setItemAsync(KEYS.USER,    JSON.stringify(toStore)),
      SecureStore.setItemAsync(KEYS.SESSION, JSON.stringify(session)),
    ]);

    // Upsert to SQLite — include avatarData so it's available immediately on
    // new device without waiting for a sync pull (avatar is also in sync_records
    // but this path is faster and ensures it's present before the PIN screen).
    const db2  = getDatabase();
    const now2 = new Date().toISOString();
    try {
      await db2.insert(schema.users).values({
        id: user.id, name: user.name, email: user.email,
        avatarUrl:  user.avatarUrl  ?? null,
        avatarData: user.avatarData ?? null,   // restore from server
        createdAt:  now2,
        updatedAt:  now2,
      });
    } catch {
      try {
        await db2.update(schema.users)
          .set({ name: user.name, avatarData: user.avatarData ?? null, updatedAt: now2 })
          .where(eq(schema.users.id, user.id));
      } catch { /* ignore */ }
    }

    // Locked = true so PIN screen shows before entering the app
    set({ user, session, isLocked: true });
  },

  // ── Sign Out — full wipe so nav guard lands on onboarding, not PIN loop ──
  signOut: async () => {
    // Tell the server to revoke the session (best-effort — don't block sign-out)
    void revokeSession();

    // Deregister push token so this device stops receiving push notifications
    // while signed out. Fire-and-forget — non-blocking.
    void (async () => {
      try {
        const { notificationService } = require('../lib/notifications');
        const { deregisterPushToken } = require('../lib/api-client');
        const token = await notificationService.getExpoPushToken();
        if (token) await deregisterPushToken(token);
      } catch {
        // Non-critical — token will be cleaned up by DeviceNotRegistered on next send
      }
    })();

    // Delete every persisted key so the app starts completely fresh.
    // Also wipe the DEK from memory and SecureStore.
    void useSyncStore.getState().clearDek();
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.SESSION),
      SecureStore.deleteItemAsync(KEYS.USER),
      SecureStore.deleteItemAsync(KEYS.PIN_HASH),
      SecureStore.deleteItemAsync(KEYS.BIOMETRIC),
      SecureStore.deleteItemAsync(KEYS.ONBOARDED),
    ]);
    // Reset all data stores so the next user sees a clean slate
    resetAllDataStores();
    // isLocked:false + hasOnboarded:false → nav guard routes to /(onboarding)
    set({
      user:          null,
      session:       null,
      isLocked:      false,
      hasOnboarded:  false,
      biometric:     { enabled: false, type: 'none' },
      error:         null,
    });
  },

  // ── Update User ────────────────────────────────────────────────────────
  updateUser: (patch) => {
    const current = get().user;
    if (!current) return;
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    set({ user: updated });
    // Strip avatarData — too large for SecureStore (Keychain size limit)
    const { avatarData: _strip, ...toStore } = updated;
    void _strip;
    SecureStore.setItemAsync(KEYS.USER, JSON.stringify(toStore)).catch(() => {});
  },

  // ── Save Avatar Data ───────────────────────────────────────────────────
  // Persists a base64 data URI to SQLite, updates in-memory state,
  // then fire-and-forgets a sync to the server. Never throws.
  saveAvatarData: async (avatarData: string) => {
    const { user } = get();
    if (!user) return;

    // 1. Optimistic in-memory update — UI responds instantly
    set({ user: { ...user, avatarData } });

    // 2. Persist to SQLite
    try {
      const db = getDatabase();
      await db
        .update(schema.users)
        .set({ avatarData })
        .where(eq(schema.users.id, user.id));
    } catch { /* SQLite write failed — in-memory state still updated */ }

    // 3. Fire-and-forget server sync — failure is silent, local is authoritative
    void syncAvatarData(avatarData).catch(() => {});
  },

  // ── Mark onboarding complete (persists across restarts) ───────────────
  markOnboardingComplete: async () => {
    await SecureStore.setItemAsync(KEYS.ONBOARDED, 'true');
    set({ hasOnboarded: true });
  },

  // ── Setup PIN ─────────────────────────────────────────────────────────
  //
  // Option B architecture: PIN is a screen-lock only — it never derives the DEK.
  // The DEK is a random 32-byte key generated once per account and stored on the
  // server (encrypted at rest). This means:
  //   - Forgotten PIN: re-auth via email → fetch same DEK → all data intact.
  //   - New device: auth → fetch DEK → set PIN → done.
  //   - New account: PIN setup → no DEK anywhere → generate → upload.
  //
  setupPin: async (pin: string) => {
    const { user } = get();
    if (!user) throw new Error('setupPin called without a logged-in user');

    // 1. Hash PIN for local screen-lock verification (SHA-256, never sent to server).
    //    Domain-separated so an attacker who gets this hash can't reuse it elsewhere.
    const { digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto');
    const pinHash = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      `aku:pin:${user.id}:${pin}`,
    );
    await SecureStore.setItemAsync(KEYS.PIN_HASH, pinHash);

    // 2. Determine the DEK to use — in priority order:
    //    a) Already in Keychain (same device — PIN reset or re-setup).
    //    b) Available on server (returning user on new device).
    //    c) Generate fresh (brand-new account — DEK doesn't exist anywhere yet).
    const syncStore = useSyncStore.getState();
    const alreadyLoaded = await syncStore.loadDek();

    if (alreadyLoaded) {
      // DEK was already in Keychain. Opportunistically ensure it's on the server
      // (covers the edge case where the initial upload failed due to a network error).
      void uploadDek(encodeDEK(syncStore.dek!)).catch(() => {});
      return;
    }

    // No DEK in Keychain — try the server first (returning user on new device).
    let dekHex: string | null = null;
    try {
      dekHex = await fetchDek();
    } catch { /* offline — will fall through to generate */ }

    if (dekHex) {
      // Returning user — server has the DEK; store it in Keychain.
      await syncStore.setDek(decodeDEK(dekHex));
    } else {
      // Brand-new account — generate a random DEK, store locally and upload.
      const newDek = await generateDEK();
      await syncStore.setDek(newDek);
      try {
        await uploadDek(encodeDEK(newDek));
      } catch {
        // Non-fatal — the opportunistic upload in the `alreadyLoaded` branch
        // above will retry next time setupPin is called on this device.
      }
    }
  },

  // ── Verify PIN ────────────────────────────────────────────────────────
  //
  // PIN verification is now purely a local screen-lock check.
  // If valid, load the DEK from Keychain (set during setupPin) and sync.
  //
  verifyPin: async (pin: string) => {
    const { user } = get();
    const stored = await SecureStore.getItemAsync(KEYS.PIN_HASH);
    if (!stored || !user) return false;

    let isValid: boolean;

    if (stored.startsWith('pin_')) {
      // ── Legacy format (pre-Option-B): `pin_<btoa(pin)>_<timestamp>` ──
      // Verify, then migrate the hash format in-place so next unlock uses SHA-256.
      const parts = stored.split('_');
      isValid = parts.length >= 2 && parts[1] === btoa(pin);
      if (isValid) {
        const { digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto');
        const newHash = await digestStringAsync(
          CryptoDigestAlgorithm.SHA256,
          `aku:pin:${user.id}:${pin}`,
        );
        void SecureStore.setItemAsync(KEYS.PIN_HASH, newHash).catch(() => {});
      }
    } else {
      // ── New SHA-256 format ──
      const { digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto');
      const pinHash = await digestStringAsync(
        CryptoDigestAlgorithm.SHA256,
        `aku:pin:${user.id}:${pin}`,
      );
      isValid = pinHash === stored;
    }

    if (isValid) {
      // Load DEK from Keychain (stored there since setupPin). If missing
      // (edge case: Keychain wiped by OS after app reinstall), the user will
      // need to re-auth via email to restore it.
      void useSyncStore.getState().loadDek().then((loaded) => {
        if (loaded) {
          import('../lib/sync/engine').then(({ fullSync }) => fullSync()).catch(() => {});
        }
      });
    }

    return isValid;
  },

  // ── Reset PIN ─────────────────────────────────────────────────────────
  resetPin: async () => {
    await SecureStore.deleteItemAsync(KEYS.PIN_HASH);
  },

  // ── Setup Biometric ───────────────────────────────────────────────────
  setupBiometric: async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return false;

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const hasFaceId = types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
    );

    const config: BiometricConfig = {
      enabled: true,
      type: hasFaceId ? 'faceId' : 'fingerprint',
    };

    await SecureStore.setItemAsync(KEYS.BIOMETRIC, JSON.stringify(config));
    set({ biometric: config });
    return true;
  },

  // ── Authenticate with Biometric ───────────────────────────────────────
  authenticateBiometric: async () => {
    const { biometric } = get();
    if (!biometric.enabled) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage:              'Unlock Akù',
      fallbackLabel:              'Use passcode',
      cancelLabel:                'Cancel',
      disableDeviceFallback:      false,
    });

    if (result.success) {
      set({ isLocked: false });
      // Load DEK from SecureStore (set during PIN setup) then trigger sync.
      void useSyncStore.getState().loadDek().then((loaded) => {
        if (loaded) {
          import('../lib/sync/engine').then(({ fullSync }) => fullSync()).catch(() => {});
        }
      });
    }
    return result.success;
  },

  // ── Disable Biometric ─────────────────────────────────────────────────
  disableBiometric: async () => {
    const config: BiometricConfig = { enabled: false, type: 'none' };
    await SecureStore.setItemAsync(KEYS.BIOMETRIC, JSON.stringify(config));
    set({ biometric: config });
  },

  // ── Lock / Unlock ─────────────────────────────────────────────────────
  lock:   () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),

  clearError: () => set({ error: null }),
}));
