import { create } from 'zustand';
import { generateUUID } from '../lib/uuid';
import type { CurrencyOption } from '../lib/currencies';
import { DEFAULT_CURRENCY } from '../lib/currencies';

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
  currency:    CurrencyOption;
  setCurrency: (currency: CurrencyOption) => void;

  // Theme mode override
  themeMode:    ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>()((set, get) => ({
  activeSheet:     null,
  sheetData:       {},
  toasts:          [],
  isGlobalLoading: false,
  currency:        DEFAULT_CURRENCY,
  themeMode:       'system',

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

  setCurrency: (currency) => set({ currency }),

  setThemeMode: (mode) => set({ themeMode: mode }),
}));
