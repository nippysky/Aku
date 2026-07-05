/**
 * Akù Sync Store
 *
 * Holds the in-memory Data Encryption Key (DEK) and sync metadata.
 * The DEK is NEVER written to AsyncStorage or SQLite — it lives only in:
 *   1. Memory (this store) — cleared on app restart / lock.
 *   2. SecureStore (device Keychain) — read on every unlock, deleted on sign-out.
 *
 * The sync engine (engine.ts) reads the DEK from here to encrypt/decrypt.
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { encodeDEK, decodeDEK } from '../lib/sync/crypto';

// ─── SecureStore key ──────────────────────────────────────────────────────────

export const DEK_STORE_KEY = 'aku_dek';

// ─── State ────────────────────────────────────────────────────────────────────

interface SyncState {
  /** 32-byte AES-256 key — in memory only, never serialized to disk. */
  dek:         Uint8Array | null;
  /** ISO timestamp of the last successful full sync. Stored in SecureStore. */
  lastSyncAt:  string | null;
  isSyncing:   boolean;
  syncError:   string | null;

  // Actions
  /** Called after PIN setup or PIN verification. Derives + persists the DEK. */
  setDek:            (dek: Uint8Array) => Promise<void>;
  /** Load DEK from SecureStore into memory (called after biometric unlock). */
  loadDek:           () => Promise<boolean>;
  /** Wipe DEK from memory and SecureStore (called on sign-out). */
  clearDek:          () => Promise<void>;
  /** Update last-sync timestamp after a successful sync. */
  setLastSyncAt:     (ts: string) => void;
  /** Load lastSyncAt from SecureStore on app start. */
  loadLastSyncAt:    () => Promise<void>;
  setSyncing:        (v: boolean) => void;
  setSyncError:      (e: string | null) => void;
}

const LAST_SYNC_KEY = 'aku_last_sync_at';

export const useSyncStore = create<SyncState>()((set, get) => ({
  dek:        null,
  lastSyncAt: null,
  isSyncing:  false,
  syncError:  null,

  setDek: async (dek: Uint8Array) => {
    // Persist to SecureStore so the next unlock can load it without re-deriving.
    await SecureStore.setItemAsync(DEK_STORE_KEY, encodeDEK(dek));
    set({ dek });
  },

  loadDek: async () => {
    try {
      const hex = await SecureStore.getItemAsync(DEK_STORE_KEY);
      if (!hex) return false;
      set({ dek: decodeDEK(hex) });
      return true;
    } catch {
      return false;
    }
  },

  clearDek: async () => {
    try {
      await SecureStore.deleteItemAsync(DEK_STORE_KEY);
      await SecureStore.deleteItemAsync(LAST_SYNC_KEY);
    } catch { /* ignore */ }
    set({ dek: null, lastSyncAt: null, syncError: null });
  },

  setLastSyncAt: (ts: string) => {
    set({ lastSyncAt: ts });
    SecureStore.setItemAsync(LAST_SYNC_KEY, ts).catch(() => {});
  },

  loadLastSyncAt: async () => {
    try {
      const ts = await SecureStore.getItemAsync(LAST_SYNC_KEY);
      if (ts) set({ lastSyncAt: ts });
    } catch { /* ignore */ }
  },

  setSyncing:   (v) => set({ isSyncing: v }),
  setSyncError: (e) => set({ syncError: e }),
}));
