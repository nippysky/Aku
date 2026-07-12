/**
 * WebSocket client singleton — real-time sync push.
 *
 * Replaces the 30-second polling interval. When the server receives a push
 * from any device, it sends { type: 'sync' } to all other connected devices
 * for that user. The client immediately calls pullAndMerge, which bumps
 * syncVersion and silently reloads all tab screens.
 *
 * Reconnect: exponential backoff starting at 2 s, doubling each attempt,
 * capped at 30 s. Reset to 2 s on every successful connection.
 *
 * Keepalive: client sends { type: 'ping' } every 25 s. Server responds
 * with { type: 'pong' }. This keeps the connection through NAT and
 * load-balancer idle timeouts (typically 60 s).
 *
 * Auth: the JWT is passed as ?token=<jwt> on the WSS URL. WSS encrypts
 * the URL so the token is not exposed in transit. React Native's WebSocket
 * does not support custom upgrade headers, so query-param auth is standard.
 *
 * Scale path: swap the server's in-memory registry for Redis pub/sub —
 * this client is unchanged.
 */

import * as SecureStore from 'expo-secure-store';
import { useSyncStore } from '../../store/sync.store';

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_KEY       = 'aku_session';
const PING_INTERVAL_MS  = 25_000;   // keep-alive interval
const INITIAL_BACKOFF   = 2_000;    // first reconnect delay
const MAX_BACKOFF       = 30_000;   // reconnect delay cap

// WS readyState constants (WebSocket spec)
const WS_CONNECTING = 0;
const WS_OPEN       = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWsBaseUrl(): string {
  const httpUrl =
    process.env.EXPO_PUBLIC_API_URL ??
    (__DEV__ ? 'http://localhost:3000' : '');
  return httpUrl
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://')
    .replace(/\/$/, '');
}

async function getAccessToken(): Promise<string | null> {
  try {
    const json = await SecureStore.getItemAsync(SESSION_KEY);
    if (!json) return null;
    const s = JSON.parse(json) as { accessToken?: string };
    return s.accessToken ?? null;
  } catch {
    return null;
  }
}

// ─── WsClient class ───────────────────────────────────────────────────────────

class WsClient {
  private ws:              WebSocket | null = null;
  private pingTimer:       ReturnType<typeof setInterval>  | null = null;
  private reconnectTimer:  ReturnType<typeof setTimeout>   | null = null;
  private backoffMs  = INITIAL_BACKOFF;
  private active     = false; // true while the user is authenticated + unlocked

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Call when user is authenticated + DEK loaded (unlocked). */
  connect(): void {
    this.active = true;
    this._open();
  }

  /** Call on sign-out or lock — closes the socket and cancels reconnects. */
  disconnect(): void {
    this.active = false;
    this._cleanup();
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async _open(): Promise<void> {
    if (!this.active) return;

    // Already connected or in the process of connecting
    if (
      this.ws &&
      (this.ws.readyState === WS_OPEN || this.ws.readyState === WS_CONNECTING)
    ) return;

    const token = await getAccessToken();
    if (!token) return; // Not authenticated yet — wait for next connect() call

    const url = `${getWsBaseUrl()}/api/sync/ws?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        // Successful connection — reset backoff
        this.backoffMs = INITIAL_BACKOFF;
        this._startPing();
        // Pull any data we missed while disconnected / offline.
        // This is the key offline-resilience hook: when the network returns,
        // the WS reconnects and we immediately catch up with the server.
        const { dek, lastSyncAt } = useSyncStore.getState();
        if (dek) {
          import('./engine').then(({ pullAndMerge }) => {
            pullAndMerge(lastSyncAt).catch(() => {});
          });
          // Profile + circles are outside sync_records — fetch separately
          import('../../store/auth.store').then(({ useAuthStore }) => {
            const store  = useAuthStore.getState();
            const userId = store.user?.id;
            store.refreshProfile().catch(() => {});
            if (userId) {
              import('../../store/pools.store').then(({ useCirclesStore }) => {
                useCirclesStore.getState().syncFromServer(userId).catch(() => {});
              });
            }
          });
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string };
          if (msg.type === 'sync') {
            // Pull delta from server — bumpSyncVersion inside pullAndMerge
            // will silently notify all tab screens to reload
            const { lastSyncAt } = useSyncStore.getState();
            import('./engine').then(({ pullAndMerge }) => {
              pullAndMerge(lastSyncAt).catch(() => {});
            });
            import('../../store/auth.store').then(({ useAuthStore }) => {
              const store = useAuthStore.getState();
              const userId = store.user?.id;
              // Refresh profile (name + avatar) from server
              store.refreshProfile().catch(() => {});
              // Circles are outside sync_records — fetch separately
              if (userId) {
                import('../../store/pools.store').then(({ useCirclesStore }) => {
                  useCirclesStore.getState().syncFromServer(userId).catch(() => {});
                });
              }
            });
          }
          // 'pong' is implicit proof-of-life — no action needed
        } catch { /* ignore malformed frames */ }
      };

      ws.onclose = () => {
        this._cleanup(/* clearActive */ false);
        this._scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose always fires after onerror — let it handle reconnect
      };
    } catch {
      // new WebSocket() itself threw (e.g., bad URL in dev)
      this._scheduleReconnect();
    }
  }

  private _startPing(): void {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WS_OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL_MS);
  }

  private _stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private _scheduleReconnect(): void {
    if (!this.active) return;
    if (this.reconnectTimer) return; // already scheduled

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF);
      this._open();
    }, this.backoffMs);
  }

  private _cleanup(clearActive = true): void {
    if (clearActive) this.active = false;

    this._stopPing();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try { this.ws.close(); } catch { /* already closed */ }
      this.ws = null;
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const wsClient = new WsClient();
