/**
 * In-memory sliding-window rate limiter for Hono.
 *
 * Two flavours:
 *   globalRateLimit   — 200 requests per 15 min per IP (all routes)
 *   magicLinkLimit    — 5 requests per 15 min per email (magic-link send only)
 *   strictRateLimit   — 10 requests per 1 min per IP (auth verify)
 *
 * Scale note: for multi-instance deployments, replace the Map with a Redis
 * sorted-set store (ZADD / ZREMRANGEBYSCORE / ZCARD pattern).
 */
import type { Context, Next } from 'hono';

// ─── Sliding-window store ─────────────────────────────────────────────────────

interface Window {
  timestamps: number[]; // epoch ms of each request
}

const store = new Map<string, Window>();

/** Remove all timestamps older than `windowMs` from a window entry. */
function prune(entry: Window, windowMs: number, now: number): void {
  const cutoff = now - windowMs;
  let i = 0;
  while (i < entry.timestamps.length && entry.timestamps[i] < cutoff) i++;
  if (i > 0) entry.timestamps.splice(0, i);
}

/** Record a request and return true if it should be allowed. */
function check(key: string, limit: number, windowMs: number): boolean {
  const now   = Date.now();
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  prune(entry, windowMs, now);

  if (entry.timestamps.length >= limit) return false; // rate-limited

  entry.timestamps.push(now);
  return true;
}

// ─── Purge stale keys every 10 minutes to prevent unbounded memory growth ────

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    prune(entry, 60 * 60 * 1000, now); // drop keys idle for > 1 hour
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, CLEANUP_INTERVAL_MS).unref(); // Don't prevent process exit

// ─── IP extraction ────────────────────────────────────────────────────────────

function getIp(c: Context): string {
  // Trust X-Forwarded-For when behind a reverse proxy (nginx / DigitalOcean LB)
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  // Hono's built-in helper (falls back to socket remote address)
  return c.req.header('x-real-ip') ?? 'unknown';
}

// ─── Middleware factories ─────────────────────────────────────────────────────

const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_MIN     = 60 * 1000;

/**
 * Global IP rate limit: 200 req / 15 min.
 * Apply to all routes as the first middleware.
 */
export function globalRateLimit() {
  return async (c: Context, next: Next) => {
    const key = `global:${getIp(c)}`;
    if (!check(key, 200, FIFTEEN_MIN)) {
      return c.json(
        { error: 'Too many requests. Please slow down and try again later.' },
        429,
      );
    }
    await next();
  };
}

/**
 * Strict IP rate limit: 10 req / 1 min.
 * Use on auth verify / PIN routes to slow brute-force.
 */
export function strictRateLimit() {
  return async (c: Context, next: Next) => {
    const key = `strict:${getIp(c)}`;
    if (!check(key, 10, ONE_MIN)) {
      return c.json({ error: 'Too many requests. Please wait a moment.' }, 429);
    }
    await next();
  };
}

/**
 * Magic-link email rate limit: 5 req / 15 min per email address.
 * Expects the request body to contain `{ email: string }`.
 * Falls back to IP-based limiting if the body can't be parsed.
 */
export function magicLinkRateLimit() {
  return async (c: Context, next: Next) => {
    // Peek at the body without consuming it — clone the request
    let email: string | undefined;
    try {
      const raw = await c.req.raw.clone().json();
      email = typeof raw?.email === 'string' ? raw.email.trim().toLowerCase() : undefined;
    } catch {
      // Body parse failed — fall through to IP key
    }

    const key = email ? `magic:${email}` : `magic-ip:${getIp(c)}`;
    if (!check(key, 5, FIFTEEN_MIN)) {
      return c.json(
        {
          error: email
            ? `Too many sign-in attempts for ${email}. Please wait 15 minutes.`
            : 'Too many requests. Please wait 15 minutes.',
        },
        429,
      );
    }
    await next();
  };
}
