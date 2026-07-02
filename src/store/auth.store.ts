import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { generateUUID } from '../lib/uuid';
import {
  requestMagicLink,
  validateSession,
  revokeSession,
  type UserProfile,
} from '../lib/api-client';
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
          // Sync latest profile from server
          validatedUser = {
            id:          profile.id,
            name:        profile.name,
            email:       profile.email,
            avatarUrl:   profile.avatarUrl,
            householdId: user?.householdId ?? null,
            createdAt:   user?.createdAt ?? new Date().toISOString(),
            updatedAt:   new Date().toISOString(),
          };
          await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(validatedUser));
        } catch {
          // Network unavailable — trust the local cache
        }
      }

      set({
        user:          validatedUser,
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
      householdId: null,
      createdAt:   now.toISOString(),
      updatedAt:   now.toISOString(),
    };

    const session: AuthSession = {
      userId:      profile.id,
      accessToken: jwt,
      expiresAt,
    };

    await Promise.all([
      SecureStore.setItemAsync(KEYS.USER,    JSON.stringify(user)),
      SecureStore.setItemAsync(KEYS.SESSION, JSON.stringify(session)),
    ]);

    // Locked = true so PIN screen shows before entering the app
    set({ user, session, isLocked: true });
  },

  // ── Sign Out — full wipe so nav guard lands on onboarding, not PIN loop ──
  signOut: async () => {
    // Tell the server to revoke the session (best-effort — don't block sign-out)
    void revokeSession();

    // Delete every persisted key so the app starts completely fresh
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
    SecureStore.setItemAsync(KEYS.USER, JSON.stringify(updated)).catch(() => {});
  },

  // ── Mark onboarding complete (persists across restarts) ───────────────
  markOnboardingComplete: async () => {
    await SecureStore.setItemAsync(KEYS.ONBOARDED, 'true');
    set({ hasOnboarded: true });
  },

  // ── Setup PIN (hash + store) ───────────────────────────────────────────
  setupPin: async (pin: string) => {
    // Simple hash for demo — in production use bcrypt via a service
    const hash = `pin_${btoa(pin)}_${Date.now()}`;
    await SecureStore.setItemAsync(KEYS.PIN_HASH, hash);
  },

  // ── Verify PIN ────────────────────────────────────────────────────────
  verifyPin: async (pin: string) => {
    const stored = await SecureStore.getItemAsync(KEYS.PIN_HASH);
    if (!stored) return false;
    // Extract the encoded part and compare
    const parts = stored.split('_');
    if (parts.length < 2) return false;
    return parts[1] === btoa(pin);
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
