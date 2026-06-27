import { Platform } from 'react-native';

export interface AppIconVariant {
  id:          string;   // used as the alternateIcon name on iOS, matches ios.alternateIcons key
  label:       string;
  description: string;
  bg:          string;   // hex for the preview swatch
  accent:      string;   // hex for the text/mark color in preview
  isDefault:   boolean;
}

export const APP_ICON_VARIANTS: AppIconVariant[] = [
  {
    id:          'default',
    label:       'Forest',
    description: 'The original. Deep forest green.',
    bg:          '#163A2F',
    accent:      '#C9A96A',
    isDefault:   true,
  },
  {
    id:          'aku-midnight',
    label:       'Midnight',
    description: 'Pure black. The night owl edition.',
    bg:          '#0F1110',
    accent:      '#C9A96A',
    isDefault:   false,
  },
  {
    id:          'aku-gold',
    label:       'Gold',
    description: 'Rich gold. For those who flex.',
    bg:          '#C9A96A',
    accent:      '#163A2F',
    isDefault:   false,
  },
  {
    id:          'aku-linen',
    label:       'Linen',
    description: 'Clean and bright. Minimal perfection.',
    bg:          '#FAFAF8',
    accent:      '#163A2F',
    isDefault:   false,
  },
  {
    id:          'aku-graphite',
    label:       'Graphite',
    description: 'Dark grey. Understated luxury.',
    bg:          '#2A2D2B',
    accent:      '#C9A96A',
    isDefault:   false,
  },
  {
    id:          'aku-coral',
    label:       'Coral',
    description: 'Warm terracotta. Bold and expressive.',
    bg:          '#E8734A',
    accent:      '#FAFAF8',
    isDefault:   false,
  },
];

/**
 * Returns the display-friendly name for the currently active icon.
 * On Android always returns 'Forest' since alternate icons aren't supported natively.
 */
export function getActiveIconLabel(activeId: string | null): string {
  if (Platform.OS !== 'ios') return 'Forest';
  const variant = APP_ICON_VARIANTS.find((v) => v.id === (activeId ?? 'default'));
  return variant?.label ?? 'Forest';
}
