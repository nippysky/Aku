/**
 * notif-history.store.ts
 *
 * Persists received push / local notifications to the `notifications` SQLite
 * table so the user can review them in the Notifications screen.
 *
 * Write path  → called from _layout.tsx notification listener
 * Read path   → consumed by notifications.tsx screen
 */
import { create } from 'zustand';
import { eq, desc } from 'drizzle-orm';
import { getDatabase, schema } from '../lib/database/client';
import { generateUUID } from '../lib/uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifHistoryItem = {
  id:          string;
  userId:      string;
  type:        string;
  title:       string;
  body:        string;
  referenceId: string | null;
  isRead:      boolean;
  createdAt:   string;
};

type State = {
  items:        NotifHistoryItem[];
  unreadCount:  number;
  isLoading:    boolean;
};

type Actions = {
  load:         (userId: string) => Promise<void>;
  add:          (data: Omit<NotifHistoryItem, 'id' | 'isRead' | 'createdAt'>) => Promise<void>;
  markRead:     (id: string) => Promise<void>;
  markAllRead:  (userId: string) => Promise<void>;
  clearAll:     (userId: string) => Promise<void>;
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useNotifHistoryStore = create<State & Actions>((set, get) => ({
  items:       [],
  unreadCount: 0,
  isLoading:   false,

  // ── Load last 100 items for this user ──────────────────────────────────
  load: async (userId) => {
    set({ isLoading: true });
    try {
      const db   = getDatabase();
      const rows = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, userId))
        .orderBy(desc(schema.notifications.createdAt))
        .limit(100);

      const items       = rows as NotifHistoryItem[];
      const unreadCount = items.filter((i) => !i.isRead).length;
      set({ items, unreadCount });
    } catch {
      // Non-critical — fail silently
    } finally {
      set({ isLoading: false });
    }
  },

  // ── Persist a new notification + prepend to in-memory list ─────────────
  add: async (data) => {
    try {
      const db  = getDatabase();
      const now = new Date().toISOString();

      const item: NotifHistoryItem = {
        id:          generateUUID(),
        isRead:      false,
        createdAt:   now,
        ...data,
      };

      await db.insert(schema.notifications).values({
        id:          item.id,
        userId:      item.userId,
        type:        item.type,
        title:       item.title,
        body:        item.body,
        referenceId: item.referenceId ?? null,
        isRead:      false,
        scheduledAt: null,
        createdAt:   now,
      });

      const items = [item, ...get().items].slice(0, 100);
      set({ items, unreadCount: get().unreadCount + 1 });
    } catch {
      // Non-critical
    }
  },

  // ── Mark single item read ──────────────────────────────────────────────
  markRead: async (id) => {
    try {
      const db = getDatabase();
      await db
        .update(schema.notifications)
        .set({ isRead: true })
        .where(eq(schema.notifications.id, id));

      const items = get().items.map((i) =>
        i.id === id ? { ...i, isRead: true } : i,
      );
      set({ items, unreadCount: Math.max(0, get().unreadCount - 1) });
    } catch {
      // Non-critical
    }
  },

  // ── Mark all read for this user ────────────────────────────────────────
  markAllRead: async (userId) => {
    try {
      const db = getDatabase();
      await db
        .update(schema.notifications)
        .set({ isRead: true })
        .where(eq(schema.notifications.userId, userId));

      const items = get().items.map((i) => ({ ...i, isRead: true }));
      set({ items, unreadCount: 0 });
    } catch {
      // Non-critical
    }
  },

  // ── Delete all history for this user ──────────────────────────────────
  clearAll: async (userId) => {
    try {
      const db = getDatabase();
      await db
        .delete(schema.notifications)
        .where(eq(schema.notifications.userId, userId));
      set({ items: [], unreadCount: 0 });
    } catch {
      // Non-critical
    }
  },
}));
