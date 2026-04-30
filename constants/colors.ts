/**
 * BikeVault — Carbon palette
 *
 * Two-theme color system: dark (default) + light. Both share the same
 * Signal-red accent (#FF4936) that the Apex brand mark and the line/fill
 * icon set are baked with — keeping the icons coherent across themes.
 *
 * Dark theme: wine-tinted graphite + Bone (warm off-white) text.
 * Light theme: warm off-white + soft pink-tinted shadows.
 *
 * Status colors (good / warning / critical / danger) are tuned per theme
 * so contrast stays AA-comfortable on each background.
 *
 * The exported `Colors` is a live Proxy that always reflects the
 * currently-active theme. Use it in JSX (re-evaluated on every render).
 * For StyleSheet.create — which captures values eagerly — components
 * should read the resolved palette via `useThemeColors()` from
 * ../theme/ThemeProvider and call a `makeStyles(C)` factory instead of
 * a module-scope StyleSheet.
 */

export type ColorPalette = {
  // Backgrounds
  bg: string;
  surface: string;
  card: string;
  border: string;

  // Accent — Signal red (constant across themes)
  accent: string;
  accentDim: string;
  accentDeep: string;
  onAccent: string;

  // Status
  good: string;
  goodDim: string;
  warning: string;
  warningDim: string;
  critical: string;
  criticalDim: string;
  danger: string;
  dangerDim: string;

  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;

  // Misc
  white: string;
  black: string;
  transparent: string;

  // Brand-mark constants (used for the app icon, never re-themed)
  obsidian: string;
  signal: string;
};

// ─── DARK (Carbon × Signal) ────────────────────────────────────────────────
export const darkColors: ColorPalette = {
  bg: '#0F0A0E',
  surface: '#1B131A',
  card: '#221920',
  border: '#332530',

  accent: '#FF4936',
  accentDim: 'rgba(255, 73, 54, 0.16)',
  accentDeep: '#C0331E',
  onAccent: '#FFFFFF',

  good: '#34D17A',
  goodDim: 'rgba(52, 209, 122, 0.15)',
  warning: '#FFB700',
  warningDim: 'rgba(255, 183, 0, 0.15)',
  critical: '#FF7A2C',
  criticalDim: 'rgba(255, 122, 44, 0.15)',
  danger: '#FF425A',
  dangerDim: 'rgba(255, 66, 90, 0.18)',

  text: '#FBF4F7',
  textSecondary: '#978189',
  textTertiary: '#524248',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  obsidian: '#0A0A12',
  signal: '#FF4936',
};

// ─── LIGHT (Bone × Signal) ─────────────────────────────────────────────────
export const lightColors: ColorPalette = {
  bg: '#FFF7F8',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  border: '#F0DDE3',

  accent: '#E03A28',
  accentDim: 'rgba(224, 58, 40, 0.10)',
  accentDeep: '#A02517',
  onAccent: '#FFFFFF',

  good: '#1FAB60',
  goodDim: 'rgba(31, 171, 96, 0.12)',
  warning: '#B58400',
  warningDim: 'rgba(181, 132, 0, 0.14)',
  critical: '#DC5F0E',
  criticalDim: 'rgba(220, 95, 14, 0.13)',
  danger: '#DD1A3D',
  dangerDim: 'rgba(221, 26, 61, 0.13)',

  text: '#1A0A11',
  textSecondary: '#6F505A',
  textTertiary: '#B49AA3',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  obsidian: '#0A0A12',
  signal: '#FF4936',
};

// ─── Live-binding Proxy ────────────────────────────────────────────────────
// Active scheme is mutated by the ThemeProvider. Reading any property on
// `Colors` always returns the current scheme's value, which makes JSX
// (re-evaluated on every render) pick up theme changes for free. Static
// StyleSheet.create() calls capture values eagerly, so theme-reactive
// components need to use makeStyles(C) inside the component instead.

let activeScheme: 'dark' | 'light' = 'dark';

/** Set by ThemeProvider — don't call elsewhere. */
export function _setActiveScheme(scheme: 'dark' | 'light') {
  activeScheme = scheme;
}

/** Read by ThemeProvider for hydration. */
export function _getActiveScheme(): 'dark' | 'light' {
  return activeScheme;
}

export const Colors: ColorPalette = new Proxy({} as ColorPalette, {
  get(_target, key: string) {
    const palette = activeScheme === 'dark' ? darkColors : lightColors;
    return (palette as Record<string, string>)[key];
  },
});

export type ColorKey = keyof ColorPalette;
