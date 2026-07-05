import { create } from 'zustand';
import { getSQLiteDatabase } from '../lib/database/client';
import { generateUUID } from '../lib/uuid';
import type { CurrencyOption } from '../lib/currencies';
import { DEFAULT_CURRENCY, CURRENCIES } from '../lib/currencies';

// ─── Persistence keys (SQLite app_state table) ────────────────────────────────
const KEY_THEME    = 'aku_theme_mode';
const KEY_CURRENCY = 'aku_currency_code';
const KEY_BASE_CCY = 'aku_base_currency';

// ─── SQLite app_state helpers ─────────────────────────────────────────────────
// Non-sensitive UI prefs live in SQLite (not SecureStore — Keychain is for secrets).

function appStateGet(key: string): string | null {
  try {
    const sqlite = getSQLiteDatabase();
    const row = sqlite.getFirstSync<{ value: string }>(
      'SELECT value FROM app_state WHERE key = ?', [key],
    );
    return row?.value ?? null;
  } catch { return null; }
}

function appStateSet(key: string, value: string): void {
  try {
    const sqlite = getSQLiteDatabase();
    sqlite.runSync(
      'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  } catch { /* ignore */ }
}

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Toast {
  id:      string;
  type:    'success' | 'error' | 'info' | 'warning';
  message: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface UIState {
  // Toast notifications
  toasts:          Toast[];

  // Global loading overlay (for auth transitions)
  isGlobalLoading: boolean;

  // Actions — Toasts
  showToast:   (type: Toast['type'], message: string) => void;
  removeToast: (id: string) => void;

  // Actions — Loading
  setGlobalLoading: (v: boolean) => void;

  // Currency
  currency:         CurrencyOption;
  baseCurrencyCode: string;
  setCurrency:      (currency: CurrencyOption) => void;

  // Exchange rates (relative to USD — fetched from exchangerate-api.com)
  exchangeRates:    Record<string, number> | null;
  ratesFetchedAt:   number | null;
  fetchExchangeRates: () => Promise<void>;

  // Theme mode override
  themeMode:    ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;

  // Persist + rehydrate settings from SQLite
  loadSettings: () => Promise<void>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>()((set, get) => ({
  toasts:           [],
  isGlobalLoading:  false,
  currency:         DEFAULT_CURRENCY,
  // Initialise to the app's default so amounts entered before any explicit
  // currency change are correctly identified as being in DEFAULT_CURRENCY.
  baseCurrencyCode: DEFAULT_CURRENCY.code,
  exchangeRates:    null,
  ratesFetchedAt:   null,
  themeMode:        'system',

  showToast: (type, message) => {
    const id = generateUUID();
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    // Auto-dismiss after 3.5s
    setTimeout(() => {
      get().removeToast(id);
    }, 3500);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setGlobalLoading: (v) => set({ isGlobalLoading: v }),

  setCurrency: (currency) =>
    set((s) => {
      const baseCurrencyCode = s.baseCurrencyCode || DEFAULT_CURRENCY.code;
      appStateSet(KEY_CURRENCY, currency.code);
      if (!s.baseCurrencyCode) {
        appStateSet(KEY_BASE_CCY, baseCurrencyCode);
      }
      return {
        currency,
        // baseCurrencyCode locks in the ENTRY currency. Only set it once.
        baseCurrencyCode,
      };
    }),

  fetchExchangeRates: async () => {
    const { ratesFetchedAt } = get();
    // Re-use cached rates if fetched within the last hour
    if (ratesFetchedAt && Date.now() - ratesFetchedAt < 3_600_000) return;
    try {
      const res   = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const json  = await res.json() as { rates: Record<string, number> };
      set({ exchangeRates: json.rates, ratesFetchedAt: Date.now() });
    } catch {
      // Silently fail — formatters fall back to raw kobo if rates are null
    }
  },

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    appStateSet(KEY_THEME, mode);
  },

  loadSettings: async () => {
    try {
      const themeSaved   = appStateGet(KEY_THEME);
      const currencyCode = appStateGet(KEY_CURRENCY);
      const baseCCY      = appStateGet(KEY_BASE_CCY);

      const updates: Partial<UIState> = {};

      if (themeSaved === 'dark' || themeSaved === 'light' || themeSaved === 'system') {
        updates.themeMode = themeSaved;
      }
      if (currencyCode) {
        const found = CURRENCIES.find((c) => c.code === currencyCode);
        if (found) updates.currency = found;
      }
      if (baseCCY) {
        updates.baseCurrencyCode = baseCCY;
      }

      if (Object.keys(updates).length > 0) set(updates);
    } catch {
      // Fail silently — store defaults are fine
    }
  },
}));
