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
  id:        string;
  name:      string;
  email:     string;
  avatarUrl: string | null;
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
 * Upload an avatar image. Pass a local file URI (from expo-image-picker).
 * Returns the Cloudinary HTTPS URL.
 */
export async function uploadAvatarFile(localUri: string): Promise<string> {
  const form = new FormData();

  // React Native's FormData accepts { uri, name, type } objects
  form.append('avatar', {
    uri:  localUri,
    name: 'avatar.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);

  const res = await apiFetch<{ avatarUrl: string }>('/api/user/avatar', {
    method: 'POST',
    body:   form,
  });

  return res.avatarUrl;
}
