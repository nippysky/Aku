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
  method?:  'GET' | 'POST' | 'PUT' | 'DELETE';
  body?:    object | FormData;
  noAuth?:  boolean;   // set true for unauthenticated routes (magic-link send)
};

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, noAuth = false } = opts;

  const headers: Record<string, string> = {};

  if (!noAuth) {
    const token = await getToken();
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
    // Lazily import to avoid circular dependency
    const { useAuthStore } = require('../store/auth.store');
    useAuthStore.getState().signOut();
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
 */
export async function registerPushToken(
  token: string,
  platform: 'ios' | 'android',
): Promise<void> {
  await apiFetch('/api/notifications/token', {
    method: 'POST',
    body:   { token, platform },
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
 * Fan out a circle event push notification to a list of recipient user IDs.
 * Server resolves their registered push tokens and sends the notification.
 * Best-effort — silently ignores errors so it never blocks the caller.
 */
export async function sendCircleNotification(
  recipientUserIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (recipientUserIds.length === 0) return;
  try {
    await apiFetch('/api/notifications/circle-event', {
      method: 'POST',
      body:   { recipientUserIds, title, body, data: data ?? {} },
    });
  } catch {
    // Non-critical — push notifications are additive
  }
}

// ─── Statement parse endpoint ─────────────────────────────────────────────────

export type ServerTransaction = {
  date:        string;
  description: string;
  amount:      number;
  type:        'credit' | 'debit';
};

/**
 * Upload a base64-encoded PDF to the server for text extraction and
 * best-effort transaction parsing. Returns up to 200 transactions.
 */
export async function parseStatementPDF(pdfBase64: string): Promise<ServerTransaction[]> {
  const res = await apiFetch<{ transactions: ServerTransaction[] }>(
    '/api/statement/parse',
    { method: 'POST', body: { pdfBase64 } },
  );
  return res.transactions;
}

// ─── Receipt OCR endpoint ─────────────────────────────────────────────────────

/**
 * Send a base64-encoded receipt image to the server for OCR text extraction.
 * Returns the detected total amount in kobo (×100), or null if undetected.
 */
export async function scanReceiptImage(imageBase64: string): Promise<number | null> {
  const res = await apiFetch<{ amount: number | null }>(
    '/api/receipt/scan',
    { method: 'POST', body: { imageBase64 } },
  );
  return res.amount;
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
