import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { generateUUID } from '../lib/uuid';
import type { User, AuthSession, BiometricConfig } from '../types';

// ─── Keys ─────────────────────────────────────────────────────────────────
const KEYS = {
  SESSION:       'aku_session',
  PIN_HASH:      'aku_pin_hash',
  BIOMETRIC:     'aku_biometric',
  USER:          'aku_user',
  ONBOARDED:     'aku_onboarded',      // persists across restarts
  HAS_SEEN_TOUR: 'aku_has_seen_tour',  // persists across restarts
} as const;

// ─── State ────────────────────────────────────────────────────────────────

interface AuthState {
  // Data
  user:          User | null;
  session:       AuthSession | null;
  biometric:     BiometricConfig;
  isLocked:      boolean;
  hasOnboarded:  boolean;   // persisted — true once first onboarding complete
  hasSeenTour:   boolean;   // persisted — true once home tour dismissed

  // Status
  isLoading:        boolean;
  isInitialized:    boolean;
  error:            string | null;

  // Actions — Auth
  initialize:              () => Promise<void>;
  createLocalUser:         (name: string, email: string) => Promise<void>;
  signIn:                  (email: string) => Promise<void>;
  signOut:                 () => Promise<void>;
  updateUser:              (patch: Partial<User>) => void;
  markOnboardingComplete:  () => Promise<void>;
  markTourSeen:            () => Promise<void>;

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
  hasSeenTour:    false,
  isLoading:      false,
  isInitialized:  false,
  error:          null,

  // ── Initialize: load persisted session + biometric config on app start ──
  initialize: async () => {
    try {
      set({ isLoading: true });

      const [sessionJson, userJson, biometricJson, onboardedStr, tourStr] = await Promise.all([
        SecureStore.getItemAsync(KEYS.SESSION),
        SecureStore.getItemAsync(KEYS.USER),
        SecureStore.getItemAsync(KEYS.BIOMETRIC),
        SecureStore.getItemAsync(KEYS.ONBOARDED),
        SecureStore.getItemAsync(KEYS.HAS_SEEN_TOUR),
      ]);

      const session: AuthSession | null = sessionJson ? JSON.parse(sessionJson) : null;
      const user: User | null = userJson ? JSON.parse(userJson) : null;
      const biometric: BiometricConfig = biometricJson
        ? JSON.parse(biometricJson)
        : { enabled: false, type: 'none' };
      const hasOnboarded = onboardedStr === 'true';
      const hasSeenTour  = tourStr === 'true';

      // Check if session is still valid
      const isSessionValid = session
        ? new Date(session.expiresAt) > new Date()
        : false;

      set({
        user:          isSessionValid ? user : null,
        session:       isSessionValid ? session : null,
        biometric,
        hasOnboarded,
        hasSeenTour,
        // Locked only if onboarding is done and there's a valid session to protect
        isLocked:      hasOnboarded && isSessionValid,
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

  // ── Sign In: store session + user ──────────────────────────────────────
  signIn: async (email: string) => {
    // In MVP: create a local session (no server round-trip)
    // Full integration: call Better Auth API here
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session: AuthSession = {
      userId:      get().user?.id ?? '',
      accessToken: `local_${Date.now()}`,
      expiresAt:   expiresAt.toISOString(),
    };

    await SecureStore.setItemAsync(KEYS.SESSION, JSON.stringify(session));
    set({ session, isLocked: false });
  },

  // ── Sign Out ───────────────────────────────────────────────────────────
  signOut: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.SESSION),
      SecureStore.deleteItemAsync(KEYS.USER),
    ]);
    set({ user: null, session: null, isLocked: true });
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

  // ── Mark tour seen (persists across restarts) ──────────────────────────
  markTourSeen: async () => {
    await SecureStore.setItemAsync(KEYS.HAS_SEEN_TOUR, 'true');
    set({ hasSeenTour: true });
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
