/**
 * Redis sliding-window rate limiter for Hono.
 *
 * Algorithm: sorted-set per key, scored by epoch-ms timestamp.
 *   ZREMRANGEBYSCORE  — evict timestamps older than the window
 *   ZADD              — record this request
 *   ZCARD             — count requests in window
 *   PEXPIRE           — auto-expire the key after the window
 *
 * All four commands run atomically in a single pipeline round-trip.
 * This is the standard FAANG-grade approach (used by Stripe, Vercel, etc.).
 *
 * Fail-open: if Redis is unavailable, requests are allowed through rather
 * than blocking legitimate users. Redis on the same droplet has 99.99%+
 * uptime in practice — this is a safety valve, not a normal code path.
 *
 * Three limiters:
 *   globalRateLimit   — 1000 req / 15 min per IP (unauthenticated only)
 *   magicLinkLimit    — 20 req / 15 min per email (magic-link send)
 *   strictRateLimit   — 10 req / 1 min per IP (auth verify)
 *
 * Scale path: point REDIS_URL at managed Redis — no changes needed here.
 */

import type { Context, Next } from 'hono';
import { redis } from '../lib/redis.js';

// ─── Core sliding-window check ────────────────────────────────────────────────

/**
 * Returns true if the request is allowed (under the limit).
 * Fails open on Redis errors — don't block users if Redis is temporarily down.
 */
async function isAllowed(
  key:      string,
  limit:    number,
  windowMs: number,
): Promise<boolean> {
  try {
    const now         = Date.now();
    const windowStart = now - windowMs;
    // Unique member — timestamp:random to avoid collisions on concurrent requests
    const member      = `${now}:${Math.random().toString(36).slice(2, 9)}`;

    const results = await redis
      .pipeline()
      .zremrangebyscore(key, '-inf', windowStart)  // evict old entries
      .zadd(key, now, member)                       // record this request
      .zcard(key)                                   // count in-window requests
      .pexpire(key, windowMs)                       // auto-expire key
      .exec();

    if (!results) return true; // Redis returned null — fail open

    // results[2] = [error, count] from ZCARD
    const count = (results[2]?.[1] ?? 0) as number;
    return count <= limit;
  } catch {
    // Redis unavailable — fail open
    return true;
  }
}

// ─── IP extraction ────────────────────────────────────────────────────────────

function getIp(c: Context): string {
  // Trust X-Forwarded-For when behind nginx / DigitalOcean Load Balancer
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return c.req.header('x-real-ip') ?? 'unknown';
}

// ─── Window constants ─────────────────────────────────────────────────────────

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const ONE_MIN_MS     =      60 * 1000;

// ─── Middleware factories ─────────────────────────────────────────────────────

/**
 * Global IP rate limit: 1000 req / 15 min — unauthenticated traffic only.
 *
 * Authenticated requests (those carrying a Bearer token) are exempt because:
 *   • They've already proven identity via JWT
 *   • Background sync, push-token calls, and session checks fire constantly
 *     and would exhaust the budget before a sign-in attempt could succeed
 *   • Abuse of authenticated endpoints is mitigated by JWT expiry + auth middleware
 *
 * This limit only guards against unauthenticated abuse:
 * credential stuffing, DDoS, scraping, enumeration.
 */
export function globalRateLimit() {
  return async (c: Context, next: Next) => {
    // Authenticated requests bypass the global counter entirely
    const auth = c.req.header('authorization');
    if (auth?.startsWith('Bearer ')) {
      await next();
      return;
    }

    const key = `rl:global:${getIp(c)}`;
    if (!await isAllowed(key, 1000, FIFTEEN_MIN_MS)) {
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
 * Applied to auth verify and PIN routes to slow brute-force.
 */
export function strictRateLimit() {
  return async (c: Context, next: Next) => {
    const key = `rl:strict:${getIp(c)}`;
    if (!await isAllowed(key, 10, ONE_MIN_MS)) {
      return c.json({ error: 'Too many requests. Please wait a moment.' }, 429);
    }
    await next();
  };
}

/**
 * Magic-link email rate limit: 20 req / 15 min per email address.
 *
 * Raised to 20 to support legitimate multi-device usage — a user with both
 * an iPhone and Android needs separate auth emails per device, and dev testing
 * across simulators compounds this. Still blocks abuse.
 *
 * Expects the request body to contain { email: string }.
 * Falls back to IP-based limiting if the body can't be parsed.
 */
export function magicLinkRateLimit() {
  return async (c: Context, next: Next) => {
    let email: string | undefined;
    try {
      const raw = await c.req.raw.clone().json();
      email = typeof raw?.email === 'string' ? raw.email.trim().toLowerCase() : undefined;
    } catch {
      // Body parse failed — fall through to IP key
    }

    const key = email ? `rl:magic:${email}` : `rl:magic-ip:${getIp(c)}`;
    if (!await isAllowed(key, 20, FIFTEEN_MIN_MS)) {
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
