/**
 * ioredis client singletons.
 *
 * Two separate connections are required because a Redis client in
 * subscriber mode can ONLY issue SUBSCRIBE / UNSUBSCRIBE commands —
 * any other command (PUBLISH, ZADD, GET …) must go through a separate
 * connection.
 *
 *   redis    — publisher + all general commands (rate limiting, etc.)
 *   redisSub — subscriber-only connection for WS pub/sub fan-out
 *
 * Config: set REDIS_URL in your .env.
 *   Local (same droplet):  redis://localhost:6379   ← default, zero cost
 *   Managed (multi-server): redis://:password@host:6379
 *
 * Scale path: point REDIS_URL at DigitalOcean Managed Redis when you
 * go multi-server — no code changes needed anywhere else.
 */

import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// ── Publisher / general-purpose client ───────────────────────────────────────

export const redis = new Redis(REDIS_URL, {
  // Fail fast after 3 retries so rate-limiter can fall back gracefully
  maxRetriesPerRequest: 3,
  enableReadyCheck:     false,
  lazyConnect:          false,
});

// ── Subscriber client ─────────────────────────────────────────────────────────
// null = retry forever — subscriber must stay alive to maintain WS fan-out.
// ioredis auto-resubscribes to channels after reconnection (autoResubscribe: true).

export const redisSub = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  lazyConnect:          false,
});

// ── Error logging ─────────────────────────────────────────────────────────────
// Errors are logged but NOT thrown — the server must keep running even when
// Redis is temporarily unavailable. Rate-limiter fails open; WS registry
// falls back to local-only delivery (still works on a single droplet).

redis.on('error',   (err: Error) => console.error('[redis] pub error:', err.message));
redisSub.on('error', (err: Error) => console.error('[redis] sub error:', err.message));

redis.on('connect',    () => console.log('[redis] pub connected'));
redisSub.on('connect', () => console.log('[redis] sub connected'));
redis.on('ready',    () => console.log('[redis] pub ready'));
redisSub.on('ready', () => console.log('[redis] sub ready'));
