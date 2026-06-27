import { create } from 'zustand';
import { generateUUID } from '../lib/uuid';
import type { CurrencyOption } from '../lib/currencies';
import { DEFAULT_CURRENCY } from '../lib/currencies';

export type ThemeMode = 'system' | 'light' | 'dark';

// ─── UI Store ─────────────────────────────────────────────────────────────
// Tracks transient UI state: sheets, loading, toasts, tour guide.

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

interface TourStep {
  key:     string;
  title:   string;
  body:    string;
  target?: string; // ref key of the element to highlight
}

const TOUR_STEPS: TourStep[] = [
  {
    key:   'home',
    title: 'Your command center',
    body:  'Every morning, Akù shows you exactly what\'s due, what you\'ve spent, and how close you are to your goals.',
  },
  {
    key:   'bills-widget',
    title: 'Upcoming bills',
    body:  'Bills due in the next 14 days appear here. Tap to see all obligations.',
  },
  {
    key:   'quick-actions',
    title: 'Add in seconds',
    body:  'Tap here to log an expense, add a bill, or create a goal. It takes less than 10 seconds.',
  },
  {
    key:   'bottom-nav',
    title: 'Five sections',
    body:  'Home · Bills · Expenses · Goals · Profile. Everything you need, nothing you don\'t.',
  },
  {
    key:   'profile',
    title: 'Your household',
    body:  'Manage your household, notifications, and security settings here.',
  },
];

// ─── State ────────────────────────────────────────────────────────────────

interface UIState {
  // Sheets
  activeSheet:     SheetName;
  sheetData:       Record<string, unknown>;

  // Toast notifications
  toasts:          Toast[];

  // Tour guide
  isTourActive:    boolean;
  tourStep:        number;
  tourSteps:       TourStep[];
  hasSeenTour:     boolean;

  // Global loading overlay (for auth transitions)
  isGlobalLoading: boolean;

  // Actions — Sheets
  openSheet:   (name: SheetName, data?: Record<string, unknown>) => void;
  closeSheet:  () => void;

  // Actions — Toasts
  showToast:   (type: Toast['type'], message: string) => void;
  removeToast: (id: string) => void;

  // Actions — Tour
  startTour:   () => void;
  nextStep:    () => void;
  skipTour:    () => void;
  completeTour:() => void;

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
  isTourActive:    false,
  tourStep:        0,
  tourSteps:       TOUR_STEPS,
  hasSeenTour:     false,
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

  startTour: () =>
    set({ isTourActive: true, tourStep: 0 }),

  nextStep: () => {
    const { tourStep, tourSteps } = get();
    if (tourStep >= tourSteps.length - 1) {
      get().completeTour();
    } else {
      set({ tourStep: tourStep + 1 });
    }
  },

  skipTour:    () => set({ isTourActive: false, hasSeenTour: true }),
  completeTour:() => set({ isTourActive: false, hasSeenTour: true }),

  setGlobalLoading: (v) => set({ isGlobalLoading: v }),

  setCurrency: (currency) => set({ currency }),

  setThemeMode: (mode) => set({ themeMode: mode }),
}));
