import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { generateUUID } from '../lib/uuid';
import type { CurrencyOption } from '../lib/currencies';
import { DEFAULT_CURRENCY, CURRENCIES } from '../lib/currencies';

// ─── Persistence keys ─────────────────────────────────────────────────────────
const KEY_THEME    = 'aku_theme_mode';
const KEY_CURRENCY = 'aku_currency_code';
const KEY_BASE_CCY = 'aku_base_currency';

export type ThemeMode = 'system' | 'light' | 'dark';

// ─── UI Store ─────────────────────────────────────────────────────────────
// Tracks transient UI state: sheets, loading, toasts.

export type SheetName =
  | 'add-expense'
  | 'add-bill'
  | 'add-goal'
  | 'add-contribution'
  | 'edit-bill'
  | 'edit-expense'
  | 'edit-goal'
  | 'category-picker'
  | 'date-picker'
  | 'frequency-picker'
  | null;

export interface Toast {
  id:      string;
  type:    'success' | 'error' | 'info' | 'warning';
  message: string;
}

// ─── State ────────────────────────────────────────────────────────────────

interface UIState {
  // Sheets
  activeSheet:     SheetName;
  sheetData:       Record<string, unknown>;

  // Toast notifications
  toasts:          Toast[];

  // Global loading overlay (for auth transitions)
  isGlobalLoading: boolean;

  // Actions — Sheets
  openSheet:   (name: SheetName, data?: Record<string, unknown>) => void;
  closeSheet:  () => void;

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

  // Persist + rehydrate settings from SecureStore
  loadSettings: () => Promise<void>;
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>()((set, get) => ({
  activeSheet:      null,
  sheetData:        {},
  toasts:           [],
  isGlobalLoading:  false,
  currency:         DEFAULT_CURRENCY,
  // Initialise to the app's default so amounts entered before any explicit
  // currency change are correctly identified as being in DEFAULT_CURRENCY.
  baseCurrencyCode: DEFAULT_CURRENCY.code,
  exchangeRates:    null,
  ratesFetchedAt:   null,
  themeMode:        'system',

  openSheet: (name, data = {}) =>
    set({ activeSheet: name, sheetData: data }),

  closeSheet: () =>
    set({ activeSheet: null, sheetData: {} }),

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
      // Persist both selections
      SecureStore.setItemAsync(KEY_CURRENCY, currency.code).catch(() => {});
      if (!s.baseCurrencyCode) {
        SecureStore.setItemAsync(KEY_BASE_CCY, baseCurrencyCode).catch(() => {});
      }
      return {
        currency,
        // baseCurrencyCode locks in the ENTRY currency.  Only set it once.
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
    SecureStore.setItemAsync(KEY_THEME, mode).catch(() => {});
  },

  loadSettings: async () => {
    try {
      const [themeSaved, currencyCode, baseCCY] = await Promise.all([
        SecureStore.getItemAsync(KEY_THEME),
        SecureStore.getItemAsync(KEY_CURRENCY),
        SecureStore.getItemAsync(KEY_BASE_CCY),
      ]);

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
