// ─── Akù Spacing System ────────────────────────────────────────────────────
// 4-point base grid. All spacing values are multiples of 4.

export const Spacing = {
  0:   0,
  0.5: 2,
  1:   4,
  1.5: 6,
  2:   8,
  2.5: 10,
  3:   12,
  4:   16,
  5:   20,
  6:   24,
  7:   28,
  8:   32,
  10:  40,
  12:  48,
  14:  56,
  16:  64,
  20:  80,
  24:  96,
} as const;

export const Radius = {
  xs:   6,
  sm:   10,
  md:   14,
  lg:   18,
  xl:   22,
  '2xl': 28,
  full: 999,
} as const;

export const Shadow = {
  none: {},
  sm: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius:  3,
    elevation:     1,
  },
  md: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius:  8,
    elevation:     3,
  },
  lg: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius:  16,
    elevation:     6,
  },
} as const;

// ─── Layout Constants ─────────────────────────────────────────────────────
export const Layout = {
  // Horizontal padding used on all screens
  screenPadding:     Spacing[6],
  // Bottom tab bar height (accounts for safe area)
  tabBarHeight:      64,
  // Sheet handle height
  sheetHandle:       4,
  // Card border radius
  cardRadius:        Radius.lg,
  // Input height
  inputHeight:       52,
  // Button heights
  buttonHeightLg:    56,
  buttonHeightMd:    48,
  buttonHeightSm:    38,
  // Header heights
  headerHeight:      56,
  // Icon sizes
  iconSm:            16,
  iconMd:            20,
  iconLg:            24,
  iconXl:            32,
  // Avatar sizes
  avatarSm:          32,
  avatarMd:          44,
  avatarLg:          64,
  // Progress ring
  progressRingSize:  120,
  progressRingSm:    80,
} as const;
