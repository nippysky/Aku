import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as LocalAuthentication from 'expo-local-authentication';
import { eq } from 'drizzle-orm';
import { generateUUID } from '../lib/uuid';
import {
  requestMagicLink,
  validateSession,
  revokeSession,
  getMe,
  fetchDek,
  uploadDek,
  deleteAccount as deleteAccountApi,
  updateCurrencyPreference,
  getFriendlyErrorMessage,
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
  const { useGoalsStore }    = require('./goals.store');

  useBillsStore.setState({ bills: [], isLoading: false, error: null });
  useExpensesStore.setState({ expenses: [], allExpenses: [], summary: null, isLoading: false, error: null });
  useGoalsStore.setState({ goals: [], contributions: {}, isLoading: false, error: null });
}

// ─── Keys ─────────────────────────────────────────────────────────────────
const KEYS = {
  SESSION:   'aku_session',
  PIN_HASH:  'aku_pin_hash',
  BIOMETRIC: 'aku_biometric',
  USER:      'aku_user',
  ONBOARDED: 'aku_onboarded',  // persists across restarts
} as const;

// ─── First-launch sentinel ────────────────────────────────────────────────
// iOS Keychain (backing SecureStore) survives app deletion — the app sandbox
// (including this file) does not. If this file is missing on a cold start,
// it means either (a) truly first-ever launch, or (b) the app was deleted and
// reinstalled, leaving a stale session in the Keychain. Either way, any
// SecureStore auth data at that point is untrustworthy and must be purged so
// "delete the app" behaves like a real sign-out, not a silent auto-login.
const FIRST_LAUNCH_SENTINEL = `${FileSystem.documentDirectory ?? ''}.aku_installed`;

async function purgeStaleKeychainSessionIfReinstalled(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(FIRST_LAUNCH_SENTINEL);
    if (info.exists) return;

    // No sentinel — sandbox is fresh. Wipe anything the Keychain held over
    // from a previous install before we ever read it below.
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.SESSION),
      SecureStore.deleteItemAsync(KEYS.USER),
      SecureStore.deleteItemAsync(KEYS.PIN_HASH),
      SecureStore.deleteItemAsync(KEYS.BIOMETRIC),
      SecureStore.deleteItemAsync(KEYS.ONBOARDED),
    ]);
    try {
      await useSyncStore.getState().clearDek();
    } catch { /* non-fatal — DEK store may not be ready yet */ }

    await FileSystem.writeAsStringAsync(FIRST_LAUNCH_SENTINEL, String(Date.now()));
  } catch {
    // FileSystem unavailable for some reason — fail open (keep existing
    // behavior) rather than block app startup.
  }
}

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
  /**
   * Permanently delete this account on the server (cascades all data via PostgreSQL),
   * then wipe all local SQLite tables and SecureStore. Irreversible.
   * Throws if the server call fails so the caller can surface the error.
   */
  deleteAccount:           () => Promise<void>;
  updateUser:              (patch: Partial<User>) => void;
  markOnboardingComplete:  () => Promise<void>;
  /**
   * Atomically marks onboarding complete AND unlocks in a single Zustand set().
   * Use in secure.tsx to avoid the nav-guard seeing hasOnboarded:true + isLocked:true
   * as two separate updates — on Android that intermediate state triggers a stray redirect.
   */
  completeOnboardingAndUnlock: () => Promise<void>;
  /**
   * Pull the latest profile (name) from the server and update local SQLite +
   * in-memory state. Called on WS sync push from another device.
   */
  refreshProfile:          () => Promise<void>;

  // Actions — Device security (biometrics / device PIN / pattern)
  /** Ensures the DEK exists (Keychain → server → generate). Runs during onboarding. */
  setupDeviceSecurity:  () => Promise<void>;
  /** System auth sheet: biometric first, device PIN/pattern fallback.
   *  Devices with no enrolled lock unlock freely. Returns true on unlock. */
  unlockWithDeviceAuth: () => Promise<boolean>;

  // Actions — Biometric
  setupBiometric:        () => Promise<boolean>;
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

      // Must run BEFORE any SecureStore reads below — purges a stale
      // Keychain session left over from a previous install.
      await purgeStaleKeychainSessionIfReinstalled();

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
            createdAt:   user?.createdAt ?? new Date().toISOString(),
            updatedAt:   new Date().toISOString(),
          };

          // Currency preference is server-authoritative once set — keeps this
          // device in sync if it was changed elsewhere.
          if (profile.preferredCurrencyCode && profile.preferredCurrencySymbol) {
            const { useUIStore } = require('./ui.store');
            useUIStore.getState().hydrateCurrencyFromServer(
              profile.preferredCurrencyCode,
              profile.preferredCurrencySymbol,
            );
          }
          await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(validatedUser));
        } catch {
          // Network unavailable — trust the local cache
        }
      }

      // Upsert to SQLite so queries can resolve the user's name.
      if (validatedUser) {
        const db  = getDatabase();
        const now = new Date().toISOString();
        try {
          await db.insert(schema.users).values({
            id:        validatedUser.id,
            name:      validatedUser.name,
            email:     validatedUser.email,
            createdAt: now,
            updatedAt: now,
          });
        } catch {
          try {
            await db.update(schema.users)
              .set({ name: validatedUser.name, updatedAt: now })
              .where(eq(schema.users.id, validatedUser.id));
          } catch { /* ignore */ }
        }
      }

      const willBeLocked = hasOnboarded && locallyValid && biometric.enabled;

      set({
        user:          validatedUser,
        session,
        biometric,
        hasOnboarded,
        isLocked:      willBeLocked,
        isInitialized: true,
      });

      // ── Warm the sync layer ────────────────────────────────────────────
      // Load persisted push/pull cursors BEFORE any sync can run, so the
      // first sync of the session is a true delta, not a full re-push/pull.
      await useSyncStore.getState().loadLastSyncAt();

      // If the app starts UNLOCKED (App Lock off, or no enrolled device
      // security), no unlock flow will ever run — so load the DEK and kick
      // off sync here. Locked starts load the DEK in unlockWithDeviceAuth().
      if (!willBeLocked && hasOnboarded && validatedUser) {
        void useSyncStore.getState().loadDek().then((loaded) => {
          if (loaded) {
            import('../lib/sync/engine').then(({ fullSync }) => fullSync()).catch(() => {});
          }
        });
      }
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

    // Upsert to SQLite so queries can resolve the user's name
    const upsertDb  = getDatabase();
    const upsertNow = now.toISOString(); // `now` is the Date already declared above
    try {
      await upsertDb.insert(schema.users).values({
        id: user.id, name: user.name, email: user.email,
        createdAt: upsertNow, updatedAt: upsertNow,
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
      set({ error: getFriendlyErrorMessage(err, 'Could not send the sign-in email. Please try again.') });
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

    // Upsert to SQLite so queries can resolve the user's name immediately,
    // without waiting for a sync pull.
    const db2  = getDatabase();
    const now2 = new Date().toISOString();
    try {
      await db2.insert(schema.users).values({
        id: user.id, name: user.name, email: user.email,
        createdAt:  now2,
        updatedAt:  now2,
      });
    } catch {
      try {
        await db2.update(schema.users)
          .set({ name: user.name, updatedAt: now2 })
          .where(eq(schema.users.id, user.id));
      } catch { /* ignore */ }
    }

    // Locked = true so PIN screen shows before entering the app
    set({ user, session, isLocked: true });

    // ── Currency preference reconciliation ─────────────────────────────────
    // Returning user with a currency already on file: server wins, so this
    // device picks up whatever was set elsewhere. Brand-new user (or one
    // who never set it server-side): push whatever the onboarding currency
    // step selected locally so it's persisted from the very first session.
    const { useUIStore } = require('./ui.store');
    if (profile.preferredCurrencyCode && profile.preferredCurrencySymbol) {
      useUIStore.getState().hydrateCurrencyFromServer(
        profile.preferredCurrencyCode,
        profile.preferredCurrencySymbol,
      );
    } else {
      const localCurrency = useUIStore.getState().currency;
      updateCurrencyPreference(localCurrency.code, localCurrency.symbol).catch(() => {});
    }
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

  // ── Delete Account — nuclear: server + local wipe ────────────────────
  deleteAccount: async () => {
    // STEP 1: Delete on server (BLOCKING — must succeed before we touch local state)
    await deleteAccountApi();

    // STEP 2: Disconnect WebSocket so no sync fires after wipe
    void (async () => {
      try {
        const { wsClient } = require('../lib/sync/ws-client');
        wsClient.disconnect();
      } catch { /* non-critical */ }
    })();

    // STEP 3: Wipe ALL local SQLite tables — order matters (children before parents)
    try {
      const db = getDatabase();
      await db.delete(schema.goalContributions);
      await db.delete(schema.goals);
      await db.delete(schema.income);
      await db.delete(schema.expenses);
      await db.delete(schema.bills);
      await db.delete(schema.recurringIncome);
      await db.delete(schema.recurringExpenses);
      await db.delete(schema.notifications);
      await db.delete(schema.appState);
      await db.delete(schema.users);
    } catch { /* server already deleted — local wipe is best-effort */ }

    // STEP 4: Clear all SecureStore keys + DEK
    void useSyncStore.getState().clearDek();
    await Promise.all([
      SecureStore.deleteItemAsync(KEYS.SESSION),
      SecureStore.deleteItemAsync(KEYS.USER),
      SecureStore.deleteItemAsync(KEYS.PIN_HASH),
      SecureStore.deleteItemAsync(KEYS.BIOMETRIC),
      SecureStore.deleteItemAsync(KEYS.ONBOARDED),
    ]);

    // STEP 5: Reset all Zustand data stores
    resetAllDataStores();

    // STEP 6: Auth state reset → nav guard routes to onboarding
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

  // ── Refresh Profile from Server ────────────────────────────────────────
  // Called by the WS client when a sync push arrives from another device.
  // Fetches the latest name from the server and updates local state.
  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    try {
      const profile = await getMe();
      const db  = getDatabase();
      const now = new Date().toISOString();
      // Update SQLite so other queries see the latest values
      await db
        .update(schema.users)
        .set({ name: profile.name, updatedAt: now })
        .where(eq(schema.users.id, user.id));
      // Update in-memory state + SecureStore — UI re-renders immediately, and
      // a fully-offline cold-start relaunch still sees the latest name.
      const updated = { ...user, name: profile.name };
      set({ user: updated });
      await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(updated)).catch(() => {});
    } catch { /* Non-fatal — profile refreshes on next app open */ }
  },

  // ── Mark onboarding complete (persists across restarts) ───────────────
  markOnboardingComplete: async () => {
    await SecureStore.setItemAsync(KEYS.ONBOARDED, 'true');
    set({ hasOnboarded: true });
  },

  // ── Complete onboarding AND unlock in one atomic set() ────────────────
  // Use this instead of calling markOnboardingComplete() + unlock() separately.
  // Two separate set() calls cause the nav guard to see hasOnboarded:true + isLocked:true
  // between them, which on Android triggers a stray redirect to /(auth).
  completeOnboardingAndUnlock: async () => {
    await SecureStore.setItemAsync(KEYS.ONBOARDED, 'true');
    set({ hasOnboarded: true, isLocked: false });
  },

  // ── Setup device security ─────────────────────────────────────────────
  //
  // The app lock is the DEVICE's own security (biometrics / PIN / pattern) —
  // there is no app-specific passcode. The DEK is a random 32-byte key
  // generated once per account and stored on the server (encrypted at rest):
  //   - New device: auth via email → fetch DEK → done.
  //   - New account: no DEK anywhere → generate → upload.
  //
  setupDeviceSecurity: async () => {
    const { user } = get();
    if (!user) throw new Error('setupDeviceSecurity called without a logged-in user');

    // Determine the DEK to use — in priority order:
    //    a) Already in Keychain (same device).
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
    } catch (err) {
      console.warn('[setupDeviceSecurity] fetchDek failed (will generate fresh):', err);
    }

    if (dekHex) {
      // Returning user — server has the DEK; store it in Keychain.
      try {
        await syncStore.setDek(decodeDEK(dekHex));
      } catch (err) {
        console.error('[setupDeviceSecurity] Failed to save server DEK to Keychain:', err);
        throw err;
      }
    } else {
      // Brand-new account (or server DEK unreadable) — generate a random DEK.
      const newDek = await generateDEK();
      try {
        await syncStore.setDek(newDek);
      } catch (err) {
        console.error('[setupDeviceSecurity] Failed to save generated DEK to Keychain:', err);
        throw err;
      }
      try {
        await uploadDek(encodeDEK(newDek));
      } catch (err) {
        console.warn('[setupDeviceSecurity] uploadDek failed (non-fatal):', err);
      }
    }
  },

  // ── Unlock with device auth ───────────────────────────────────────────
  //
  // Shows the system sheet: Face ID / Touch ID / fingerprint first, falling
  // back automatically to the device PIN / pattern / passcode.
  // Devices with NO enrolled security unlock freely (data is still E2E
  // encrypted server-side; a device without a lock screen is inherently open).
  //
  unlockWithDeviceAuth: async () => {
    const finishUnlock = () => {
      set({ isLocked: false });
      // Load DEK from Keychain, then sync. If missing (Keychain wiped after
      // reinstall), the user re-auths via email to restore it.
      void useSyncStore.getState().loadDek().then((loaded) => {
        if (loaded) {
          import('../lib/sync/engine').then(({ fullSync }) => fullSync()).catch(() => {});
        }
      });
    };

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled  = hasHardware && (await LocalAuthentication.isEnrolledAsync());

      if (!isEnrolled) {
        // No device lock set up — open freely (policy: zero friction + nudge in UI)
        finishUnlock();
        return true;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage:         'Unlock Akù',
        cancelLabel:           'Cancel',
        disableDeviceFallback: false, // biometric → device PIN/pattern fallback
      });

      if (result.success) {
        finishUnlock();
        return true;
      }
      return false;
    } catch {
      // Hardware/OS error — never brick the app over the lock screen
      finishUnlock();
      return true;
    }
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
