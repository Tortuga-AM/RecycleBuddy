import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1A1A2E',
    background: '#F8F9FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E8F5E9',
    textSecondary: '#6B7280',
    tint: '#2E7D32',
    primary: '#2E7D32',
    primaryLight: '#4CAF50',
    primaryDark: '#1B5E20',
    accent: '#FF8F00',
    accentLight: '#FFB300',
    success: '#2E7D32',
    warning: '#FF8F00',
    error: '#C62828',
    special: '#E65100',
    notRecyclable: '#C62828',
    recyclable: '#2E7D32',
  },
  dark: {
    text: '#E8E8E8',
    background: '#121212',
    backgroundElement: '#1E1E1E',
    backgroundSelected: '#1B3A1D',
    textSecondary: '#9CA3AF',
    tint: '#4CAF50',
    primary: '#4CAF50',
    primaryLight: '#66BB6A',
    primaryDark: '#2E7D32',
    accent: '#FFB300',
    accentLight: '#FFD54F',
    success: '#4CAF50',
    warning: '#FFB300',
    error: '#EF5350',
    special: '#FF9800',
    notRecyclable: '#EF5350',
    recyclable: '#4CAF50',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const defaultWeights: Record<string, number> = {
  bottle: 0.15,
  can: 0.02,
  paper: 0.01,
  cardboard: 0.3,
  glass: 0.25,
  plastic: 0.05,
  bag: 0.01,
  cup: 0.03,
  carton: 0.04,
  box: 0.2,
  wrapper: 0.005,
  foil: 0.01,
  container: 0.08,
  peel: 0.05,
  core: 0.05,
  food: 0.1,
  mattress: 18,
  battery: 0.05,
  electronics: 1.5,
  phone: 0.2,
};

export function estimateWeight(label: string) {
  const lower = label.toLowerCase();
  for (const key of Object.keys(defaultWeights)) {
    if (lower.includes(key)) {
      return defaultWeights[key];
    }
  }
  return 0.05;
}
