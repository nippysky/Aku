/**
 * WebSocket connection registry — Redis pub/sub backed.
 *
 * Architecture:
 *   • Each server instance maintains a local Map<userId, Set<NotifyFn>>
 *     for the WS connections open on THAT instance.
 *   • When any device pushes data, the sync route calls notifyUser(userId),
 *     which PUBLISHes to the Redis channel "sync:<userId>".
 *   • Every server instance that has active WS connections for that user
 *     SUBSCRIBEs to that channel and fires its local notify functions,
 *     which send { type: 'sync' } over the WebSocket.
 *
 * Single-droplet behaviour (current):
 *   Only one server instance exists. publish → redisSub receives → fires local fns.
 *   Functionally identical to the in-memory version but now persistent and
 *   correct under PM2 cluster mode.
 *
 * Multi-server behaviour (horizontal scale):
 *   Each droplet has its own redisSub receiving the broadcast. All connected
 *   devices across all instances are notified instantly. Zero code changes needed.
 *
 * Scale path:
 *   1. Point REDIS_URL at DigitalOcean Managed Redis.
 *   2. Add more API droplets behind a load balancer.
 *   Done.
 */

import { redis, redisSub } from './redis.js';

type NotifyFn = () => void;

// Per-instance local registry — WS connections open on THIS process
const localRegistry = new Map<string, Set<NotifyFn>>();

// ── Redis subscriber message handler ─────────────────────────────────────────
// Fires whenever any server instance calls notifyUser(userId).
// Delivers the sync nudge to all WS connections on THIS instance for that user.

redisSub.on('message', (channel: string) => {
  if (!channel.startsWith('sync:')) return;
  const userId = channel.slice(5); // strip 'sync:' prefix
  const fns = localRegistry.get(userId);
  if (!fns?.size) return;
  for (const fn of fns) {
    try { fn(); } catch { /* isolate — don't let one bad socket affect others */ }
  }
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register a WebSocket connection for a user on this instance.
 * Returns an unregister function — call it on ws close / error.
 */
export function registerWs(userId: string, notify: NotifyFn): () => void {
  const channel = `sync:${userId}`;
  const isFirstOnInstance = !localRegistry.has(userId);

  if (isFirstOnInstance) {
    localRegistry.set(userId, new Set());
    // Subscribe to the Redis channel for this user
    redisSub.subscribe(channel).catch((err: Error) =>
      console.error(`[ws-registry] subscribe error for ${userId}: ${err.message}`),
    );
  }
  localRegistry.get(userId)!.add(notify);

  return () => {
    const fns = localRegistry.get(userId);
    if (!fns) return;
    fns.delete(notify);
    if (fns.size === 0) {
      localRegistry.delete(userId);
      // Last connection on this instance — unsubscribe from Redis channel
      redisSub.unsubscribe(channel).catch(() => {});
    }
  };
}

/**
 * Notify all connected devices for this user across ALL server instances.
 * Called by the sync push route after a successful write.
 */
export function notifyUser(userId: string): void {
  redis.publish(`sync:${userId}`, '1').catch((err: Error) =>
    console.error(`[ws-registry] publish error for ${userId}: ${err.message}`),
  );
}

/** Total active WS connections on THIS instance (for diagnostics / health). */
export function connectionCount(): number {
  let total = 0;
  for (const s of localRegistry.values()) total += s.size;
  return total;
}
