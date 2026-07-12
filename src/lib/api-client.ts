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

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export type UserProfile = {
  id:         string;
  name:       string;
  email:      string;
  avatarUrl:  string | null;
  avatarData: string | null;
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
 * Sync avatar to the server (fire-and-forget).
 * Pass the full data URI: `data:image/jpeg;base64,...`
 * Server stores it in the users.avatar_data PostgreSQL column.
 */
export async function syncAvatarData(avatarData: string): Promise<void> {
  await apiFetch('/api/user/avatar-data', {
    method: 'PUT',
    body:   { avatarData },
  });
}

// ─── DEK endpoints ───────────────────────────────────────────────────────────

/**
 * Fetch the user's DEK from the server (auth-gated).
 * Returns the DEK as a 64-char hex string, or null if the server has no DEK
 * stored yet (brand-new account that hasn't completed PIN setup yet).
 *
 * Called on new-device restore inside setupPin() before generating a fresh key.
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
 * Fan out a pool event push notification to a list of recipient user IDs.
 * Server resolves their registered push tokens and sends the notification.
 * Best-effort — silently ignores errors so it never blocks the caller.
 */
export async function sendPoolNotification(
  recipientUserIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (recipientUserIds.length === 0) return;
  try {
    await apiFetch('/api/notifications/pool-event', {
      method: 'POST',
      body:   { recipientUserIds, title, body, data: data ?? {} },
    });
  } catch {
    // Non-critical — push notifications are additive
  }
}

/**
 * Report aggregated financial insight signals to the server after each sync.
 * The server uses these to craft personalised push notifications.
 *
 * All values are aggregated/relative — no raw financial amounts ever leave the
 * device. Budget utilization is a 0.0–2.0+ ratio; amounts stay on device.
 *
 * Best-effort, fire-and-forget: call without awaiting.
 */
export type UserInsightPayload = {
  /** Highest budget utilization ratio (0.0–2.0+). null = no budgets. */
  budgetUtilization:   number | null;
  /** True if any budget is ≥ 100 % spent this period. */
  hasOverBudget:       boolean;
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
};

export async function reportInsight(payload: UserInsightPayload): Promise<void> {
  await apiFetch('/api/notifications/insight', {
    method: 'POST',
    body:   payload,
  });
}

/**
 * Sync notification preferences to the server so the server-side notification
 * worker can respect the user's choices. Call fire-and-forget after any
 * preference toggle in the notification settings screen.
 */
export async function updateNotifPrefs(prefs: {
  billReminders:  boolean;
  budgetAlerts:   boolean;
  goalMilestones: boolean;
  dailyDigest:    boolean;
}): Promise<void> {
  try {
    await apiFetch('/api/notifications/preferences', {
      method: 'PATCH',
      body:   prefs,
    });
  } catch {
    // Non-critical — prefs will sync on the next insight report or app restart
  }
}

// ─── Pool endpoints ──────────────────────────────────────────────────────────

/**
 * Register a newly created pool with the server so other users can find it
 * by invite code. Call fire-and-forget after creating locally.
 */
export async function registerPool(
  id:         string,
  name:       string,
  emoji:      string,
  inviteCode: string,
): Promise<void> {
  await apiFetch('/api/pools', {
    method: 'POST',
    body:   { id, name, emoji, inviteCode },
  });
}

export type PoolJoinResult = {
  poolId:     string;
  name:       string;
  emoji:      string;
  inviteCode: string;
  ownerId:    string;
  ownerName:  string | null;
};

/**
 * Join a pool by its 8-character invite code.
 * Returns pool metadata so the client can seed its local SQLite records.
 */
export async function joinPoolByCode(code: string): Promise<PoolJoinResult> {
  return apiFetch<PoolJoinResult>('/api/pools/join', {
    method: 'POST',
    body:   { code },
  });
}

export type ServerPool = {
  id:         string;
  name:       string;
  emoji:      string;
  inviteCode: string;
  ownerId:    string;
  role:       string;
};

/** Fetch all pools the authenticated user belongs to from the server. */
export async function fetchUserPools(): Promise<ServerPool[]> {
  const res = await apiFetch<{ pools: ServerPool[] }>('/api/pools');
  return res.pools;
}

export type PoolPreview = {
  id:            string;
  name:          string;
  emoji:         string;
  memberCount:   number;
  ownerName:     string;
  members:       { name: string; avatarData: string | null }[];
  alreadyMember: boolean;
};

/**
 * Preview a pool by its 8-char invite code — no membership created.
 * Use before the final "Join" confirmation step.
 */
export async function previewPool(code: string): Promise<PoolPreview> {
  return apiFetch<PoolPreview>(`/api/pools/preview/${encodeURIComponent(code)}`);
}

export type PoolMemberInfo = {
  userId:    string;
  name:      string;
  avatarData: string | null;
  role:      string;
  joinedAt:  string;
};

/**
 * Fetch all members of a pool the authenticated user belongs to.
 * Used by syncFromServer to seed other members' profiles into local SQLite.
 */
export async function fetchPoolMembers(poolId: string): Promise<PoolMemberInfo[]> {
  const res = await apiFetch<{ members: PoolMemberInfo[] }>(`/api/pools/${poolId}/members`);
  return res.members;
}

/**
 * Update pool name (and optionally emoji) on the server.
 * Called immediately after the owner saves a name change locally.
 * The server notifies all members via WS so they reload.
 */
export async function updatePoolOnServer(
  poolId:  string,
  updates: { name?: string; emoji?: string },
): Promise<void> {
  await apiFetch(`/api/pools/${poolId}`, { method: 'PATCH', body: updates });
}

/**
 * Push pool settings to the server so other members can pull them on sync.
 * Called by the admin after saving settings locally. Fire-and-forget.
 */
export async function pushPoolSettings(
  poolId:   string,
  settings: Record<string, unknown>,
): Promise<void> {
  await apiFetch(`/api/pools/${poolId}/settings`, { method: 'PUT', body: settings });
}

/**
 * Pull the latest pool settings from the server.
 * Called during syncFromServer so members always see the admin's latest settings.
 * Returns null if the admin has never pushed settings.
 */
export async function fetchPoolSettings(
  poolId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await apiFetch<{ settings: Record<string, unknown> | null }>(
      `/api/pools/${poolId}/settings`,
    );
    return res.settings;
  } catch {
    return null;
  }
}

/**
 * Ask the server to remove a member from a pool.
 * The server will push a notification to the removed user and remaining members.
 */
export async function removePoolMemberFromServer(
  poolId:       string,
  targetUserId: string,
): Promise<void> {
  await apiFetch(`/api/pools/${poolId}/members/${targetUserId}`, { method: 'DELETE' });
}

/**
 * Delete an entire pool (owner only).
 * The server notifies all members via push + WS before deleting.
 */
export async function deletePoolOnServer(poolId: string): Promise<void> {
  await apiFetch(`/api/pools/${poolId}`, { method: 'DELETE' });
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
