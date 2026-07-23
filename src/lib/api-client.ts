/**
 * Akù API client
 *
 * Typed wrapper around the server API. Every method:
 *  - Reads the JWT from SecureStore and attaches `Authorization: Bearer TOKEN`
 *  - Throws `ApiError` on non-2xx responses
 *  - Handles 401 by triggering sign-out (clears session + re-routes to onboarding)
 *
 * Base URL is set via EXPO_PUBLIC_API_URL in your .env file:
 *   EXPO_PUBLIC_API_URL=https://api.yourdomain.com
 */
import * as SecureStore from 'expo-secure-store';

// ─── Config ───────────────────────────────────────────────────────────────────

const SESSION_KEY = 'aku_session';

function getBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    // Fall back to localhost for local dev
    return __DEV__ ? 'http://localhost:3000' : '';
  }
  return url.replace(/\/$/, ''); // strip trailing slash
}

// ─── Error type ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  try {
    const sessionJson = await SecureStore.getItemAsync(SESSION_KEY);
    if (!sessionJson) return null;
    const session = JSON.parse(sessionJson) as { accessToken?: string };
    return session.accessToken ?? null;
  } catch {
    return null;
  }
}

type FetchOptions = {
  method?:  'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?:    object | FormData;
  noAuth?:  boolean;   // set true for unauthenticated routes (magic-link send)
};

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, noAuth = false } = opts;

  const headers: Record<string, string> = {};
  let token: string | null = null;

  if (!noAuth) {
    token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let fetchBody: BodyInit | undefined;
  if (body instanceof FormData) {
    // Don't set Content-Type — let the browser set it with the boundary
    fetchBody = body;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers,
    body: fetchBody,
  });

  if (res.status === 401) {
    // Only auto-signout if we actually sent a token that the server rejected.
    // Without this guard, revokeSession() (called inside signOut) would get a
    // 401 back (no token in SecureStore), call signOut() again, and cascade
    // into hundreds of recursive DELETE /api/auth/session requests.
    if (token) {
      const { useAuthStore } = require('../store/auth.store');
      useAuthStore.getState().signOut();
    }
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }

  let data: T;
  try {
    data = await res.json() as T;
  } catch {
    throw new ApiError(res.status, `Server returned non-JSON response (${res.status})`);
  }

  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }

  return data;
}

// ─── Friendly error messages ────────────────────────────────────────────────
// Non-technical users shouldn't ever see raw server/network errors like
// "Internal server error" or "Network request failed". This translates any
// error into plain, reassuring copy while still logging the real message for
// debugging. Messages we wrote ourselves server-side (validation, rate limits,
// "session expired") are already human-readable, so those pass through as-is.

const FRIENDLY_FALLBACK = 'Something went wrong on our end. Please try again in a moment.';

export function getFriendlyErrorMessage(err: unknown, fallback: string = FRIENDLY_FALLBACK): string {
  if (err instanceof ApiError) {
    // 5xx = server-side bug or crash — the raw message is for developers, not users.
    if (err.status >= 500) {
      console.error('[api] Server error:', err.message);
      return fallback;
    }
    // 4xx messages are hand-written server-side (e.g. "Valid email is required",
    // "Too many attempts, please wait 15 minutes") — safe to show directly.
    return err.message;
  }

  if (err instanceof TypeError && /network|fetch/i.test(err.message)) {
    return "Can't reach Akù right now. Check your internet connection and try again.";
  }

  if (err instanceof Error) {
    console.error('[api] Unexpected error:', err.message);
  }

  return fallback;
}

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export type UserProfile = {
  id:         string;
  name:       string;
  email:      string;
  /** Server-persisted currency preference — null if never set. */
  preferredCurrencyCode?:   string | null;
  preferredCurrencySymbol?: string | null;
  /** True only when the account was created in this magic-link request. */
  isNew?:     boolean;
};

/**
 * Request a magic link email. Call this when the user taps "Continue" on the
 * email screen during onboarding.
 */
export async function requestMagicLink(email: string, name?: string): Promise<void> {
  await apiFetch('/api/auth/magic-link', {
    method:  'POST',
    body:    { email, name },
    noAuth:  true,
  });
}

/**
 * Verify the 6-digit OTP that was included in the magic link email.
 * Use this when the email arrives on a different device — the user types
 * the code on the original device instead of tapping the link.
 */
export async function verifyMagicOTP(
  email: string,
  otp:   string,
): Promise<{ jwt: string; user: UserProfile; isNew: boolean }> {
  return apiFetch<{ jwt: string; user: UserProfile; isNew: boolean }>(
    '/api/auth/magic-link/verify-otp',
    { method: 'POST', body: { email, otp }, noAuth: true },
  );
}

/**
 * Validate the stored JWT on app startup. Returns the user profile if the
 * session is still valid, or null if it has expired / been revoked.
 */
export async function validateSession(): Promise<UserProfile | null> {
  try {
    const res = await apiFetch<{ user: UserProfile }>('/api/auth/session');
    return res.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

/**
 * Sign out — revokes the session on the server side.
 */
export async function revokeSession(): Promise<void> {
  try {
    await apiFetch('/api/auth/session', { method: 'DELETE' });
  } catch {
    // Best-effort — local state is cleared regardless
  }
}

// ─── User endpoints ───────────────────────────────────────────────────────────

export async function getMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/user/me');
}

export async function updateName(name: string): Promise<void> {
  await apiFetch('/api/user/me', { method: 'PUT', body: { name } });
}

/**
 * Permanently delete the authenticated user's account and all data.
 * Throws on network error so the caller can surface it before wiping local state.
 */
export async function deleteAccount(): Promise<void> {
  await apiFetch('/api/user/me', { method: 'DELETE' });
}

/**
 * Persist the user's preferred currency server-side so it survives logout,
 * reinstall, and sign-in on a new device. Fire-and-forget from the caller.
 */
export async function updateCurrencyPreference(code: string, symbol: string): Promise<void> {
  await apiFetch('/api/user/currency', {
    method: 'PUT',
    body:   { code, symbol },
  });
}

// ─── DEK endpoints ───────────────────────────────────────────────────────────

/**
 * Fetch the user's DEK from the server (auth-gated).
 * Returns the DEK as a 64-char hex string, or null if the server has no DEK
 * stored yet (brand-new account that hasn't completed PIN setup yet).
 *
 * Called on new-device restore inside setupDeviceSecurity() before generating a fresh key.
 */
export async function fetchDek(): Promise<string | null> {
  const res = await apiFetch<{ dek: string | null }>('/api/user/dek');
  return res.dek;
}

/**
 * Upload the user's DEK to the server for safe-keeping.
 * The server encrypts it at rest with its master key before storing.
 * Idempotent — safe to call multiple times (each call overwrites the previous).
 *
 * @param dekHex 64-char lowercase hex string (the raw 32-byte DEK, hex-encoded).
 */
export async function uploadDek(dekHex: string): Promise<void> {
  await apiFetch('/api/user/dek', { method: 'POST', body: { dek: dekHex } });
}

// ─── Notification endpoints ───────────────────────────────────────────────────

/**
 * Register a device's Expo push token with the server.
 * Safe to call on every app launch — the server upserts.
 * Automatically includes the device's IANA timezone so the server can deliver
 * notifications at 7 pm the user's local time (Tier 3 smart timing).
 */
export async function registerPushToken(
  token: string,
  platform: 'ios' | 'android',
): Promise<void> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  await apiFetch('/api/notifications/token', {
    method: 'POST',
    body:   { token, platform, timezone },
  });
}

/**
 * Deregister a push token on sign-out so the device stops receiving
 * push notifications while logged out.
 */
export async function deregisterPushToken(token: string): Promise<void> {
  try {
    await apiFetch('/api/notifications/token', {
      method: 'DELETE',
      body:   { token },
    });
  } catch {
    // Best-effort — token will be pruned by DeviceNotRegistered cleanup anyway
  }
}

/**
 * Send a test push notification to all of the authenticated user's own devices.
 * Use this from DEV builds or admin tools to verify the push pipeline.
 */
export async function sendTestPush(): Promise<{ sent: number }> {
  return apiFetch<{ sent: number }>('/api/notifications/test', { method: 'POST' });
}

/**
 * Report aggregated financial insight signals to the server after each sync.
 * The server uses these to craft personalised push notifications.
 *
 * Most values are aggregated/relative — amounts otherwise stay on device.
 * The one exception is yesterdayExpenseTotal, needed to compose the
 * "yesterday you spent X" push.
 *
 * Best-effort, fire-and-forget: call without awaiting.
 */
export type UserInsightPayload = {
  /** % of this month's income kept (income − expenses) / income. null = no income logged. */
  savingsRatePct:      number | null;
  /** Consecutive days with at least one expense logged. */
  spendingStreak:      number;
  /** % change in total spending vs the previous 7-day window. null = < 2 weeks of data. */
  weeklyChangePct:     number | null;
  /** Total expenses logged this calendar month. */
  monthlyExpenseCount: number;
  /** Top expense category by total amount this month. null = no expenses. */
  topCategory:         string | null;
  /** Total non-completed savings goals. */
  totalGoalsCount:     number;
  /** Goals pacing on track (saved ≥ 80 % of expected given deadline). */
  goalsOnTrack:        number;
  /** True if any active goals exist. */
  hasActiveGoals:      boolean;
  /**
   * Total spent yesterday (kobo/cents) + entry count — the one deliberate
   * exception to "no raw amounts leave the device". Needed so the server can
   * compose the "here's what you spent yesterday" push while the app is
   * closed. Formatted server-side with the user's own currency symbol.
   */
  yesterdayExpenseTotal: number;
  yesterdayExpenseCount: number;
};

export async function reportInsight(payload: UserInsightPayload): Promise<void> {
  await apiFetch('/api/notifications/insight', {
    method: 'POST',
    body:   payload,
  });
}

// ─── Sync endpoints ───────────────────────────────────────────────────────────

export type SyncPushRecord = {
  id:               string;
  entityType:       string;
  entityId:         string;
  encryptedPayload: string;
  clientUpdatedAt:  string;
  isDeleted:        boolean;
};

export type SyncPulledRecord = {
  id:               string;
  entityType:       string;
  entityId:         string;
  encryptedPayload: string;
  clientUpdatedAt:  string;
  serverUpdatedAt:  string;
  isDeleted:        boolean;
};

/**
 * Push a batch of encrypted records to the server.
 * Returns the number of records pushed and the server timestamp.
 */
export async function syncPush(
  records: SyncPushRecord[],
): Promise<{ pushed: number; serverUpdatedAt: string }> {
  return apiFetch('/api/sync/push', { method: 'POST', body: { records } });
}

/**
 * Pull encrypted records from the server.
 * Pass `since` (ISO string) to fetch only deltas since the last sync.
 * Omit `since` to pull everything (full restore on new device).
 */
export async function syncPull(
  since?: string,
): Promise<{ records: SyncPulledRecord[]; pulledAt: string }> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  return apiFetch(`/api/sync/pull${qs}`);
}

/**
 * Get sync statistics (record counts by entity type).
 */
export async function getSyncStats(): Promise<{
  counts: Record<string, number>;
  totalActive: number;
}> {
  return apiFetch('/api/sync/stats');
}
