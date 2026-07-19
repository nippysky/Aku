// ─── Akù Color System ──────────────────────────────────────────────────────
// Brand: Forest (#163A2F) · Gold (#C9A96A) · Linen (#FAFAF8) · Obsidian (#0F1110)

export const Palette = {
  // Brand
  forest:      '#163A2F',
  forestLight: '#1E4D3D',
  forestMuted: '#2A6350',
  gold:        '#C9A96A',
  goldLight:   '#D9BC8A',
  goldMuted:   '#A8864A',
  linen:       '#FAFAF8',
  obsidian:    '#0F1110',

  // Neutrals
  white:       '#FFFFFF',
  black:       '#000000',

  // Grays (light mode scale)
  gray50:  '#F7F7F5',
  gray100: '#EFEFEB',
  gray200: '#E0DDD8',
  gray300: '#C8C5BE',
  gray400: '#9A9793',
  gray500: '#6B6865',
  gray600: '#4A4845',
  gray700: '#333230',
  gray800: '#1F1E1C',
  gray900: '#111110',

  // Semantic
  success:        '#1B7A4E',
  successLight:   '#EAF5EE',
  successMuted:   '#2A9E66',
  warning:        '#C47F00',
  warningLight:   '#FEF5E0',
  warningMuted:   '#F0A800',
  danger:         '#C0392B',
  dangerLight:    '#FDECEB',
  dangerMuted:    '#E74C3C',
  info:           '#1A6FA8',
  infoLight:      '#E8F3FB',
} as const;

export const LightColors = {
  // Backgrounds
  background:          Palette.linen,
  backgroundSecondary: Palette.gray50,
  backgroundTertiary:  Palette.gray100,
  card:                Palette.white,
  cardElevated:        Palette.white,

  // Text
  text:                '#111111',
  textSecondary:       '#555552',
  textTertiary:        '#888885',
  textInverse:         Palette.white,
  textOnForest:        Palette.linen,
  textOnGold:          Palette.forest,

  // Brand
  primary:             Palette.forest,
  primaryLight:        Palette.forestLight,
  accent:              Palette.gold,
  accentLight:         Palette.goldLight,

  // Borders
  border:              Palette.gray200,
  borderLight:         Palette.gray100,
  borderStrong:        Palette.gray300,

  // Tab bar
  tabBar:              Palette.white,
  tabBarBorder:        Palette.gray100,
  tabActive:           Palette.forest,
  tabInactive:         Palette.gray400,

  // Inputs
  inputBackground:     Palette.gray50,
  inputBorder:         Palette.gray200,
  inputFocusBorder:    Palette.forest,
  inputPlaceholder:    Palette.gray400,

  // Semantic
  success:             Palette.success,
  successBg:           Palette.successLight,
  warning:             Palette.warning,
  warningBg:           Palette.warningLight,
  danger:              Palette.danger,
  dangerBg:            Palette.dangerLight,

  // Bill status
  statusUpcoming:      Palette.warning,
  statusUpcomingBg:    Palette.warningLight,
  statusDueToday:      Palette.danger,
  statusDueTodayBg:    Palette.dangerLight,
  statusPaid:          Palette.success,
  statusPaidBg:        Palette.successLight,
  statusOverdue:       '#8B1A0E',
  statusOverdueBg:     '#FDEDEC',

  // Overlay
  overlay:             'rgba(0,0,0,0.35)',
  overlayLight:        'rgba(0,0,0,0.12)',
  shimmer1:            Palette.gray100,
  shimmer2:            Palette.gray50,
} as const;

export const DarkColors = {
  // Backgrounds
  background:          Palette.obsidian,
  backgroundSecondary: '#171A18',
  backgroundTertiary:  '#1F2421',
  card:                '#171A18',
  cardElevated:        '#1F2421',

  // Text
  text:                '#F4F4F2',
  textSecondary:       '#A8A8A5',
  textTertiary:        '#6E6E6B',
  textInverse:         '#111111',
  textOnForest:        Palette.linen,
  textOnGold:          Palette.obsidian,

  // Brand
  primary:             '#2A6350',
  primaryLight:        '#3A8060',
  accent:              Palette.gold,
  accentLight:         Palette.goldLight,

  // Borders
  border:              '#2A2D2B',
  borderLight:         '#222522',
  borderStrong:        '#3A3D3B',

  // Tab bar
  tabBar:              '#111310',
  tabBarBorder:        '#222522',
  tabActive:           Palette.gold,
  tabInactive:         '#5A5D5B',

  // Inputs
  inputBackground:     '#1A1D1B',
  inputBorder:         '#2A2D2B',
  inputFocusBorder:    Palette.gold,
  inputPlaceholder:    '#5A5D5B',

  // Semantic
  success:             '#34C47A',
  successBg:           '#0D2A1A',
  warning:             '#F0B429',
  warningBg:           '#2A1E00',
  danger:              '#F05C4E',
  dangerBg:            '#2A0B08',

  // Bill status
  statusUpcoming:      '#F0B429',
  statusUpcomingBg:    '#2A1E00',
  statusDueToday:      '#F05C4E',
  statusDueTodayBg:    '#2A0B08',
  statusPaid:          '#34C47A',
  statusPaidBg:        '#0D2A1A',
  statusOverdue:       '#FF6B6B',
  statusOverdueBg:     '#3A0D0A',

  // Overlay
  overlay:             'rgba(0,0,0,0.6)',
  overlayLight:        'rgba(0,0,0,0.3)',
  shimmer1:            '#1F2421',
  shimmer2:            '#171A18',
} as const;

export type ColorScheme = typeof LightColors;
