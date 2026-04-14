export const Colors = {
  // Backgrounds
  bg: '#0a0a0a',
  surface: '#141414',
  card: '#1c1c1e',
  border: '#2c2c2e',

  // Accent
  accent: '#FF6B35',
  accentDim: 'rgba(255, 107, 53, 0.15)',

  // Status
  good: '#30D158',
  goodDim: 'rgba(48, 209, 88, 0.15)',
  warning: '#FFD60A',
  warningDim: 'rgba(255, 214, 10, 0.15)',
  critical: '#FF9F0A',
  criticalDim: 'rgba(255, 159, 10, 0.15)',
  danger: '#FF453A',
  dangerDim: 'rgba(255, 69, 58, 0.15)',

  // Text
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  textTertiary: '#48484A',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export type ColorKey = keyof typeof Colors;
