import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  darkColors,
  lightColors,
  _setActiveScheme,
  type ColorPalette,
} from '../constants/colors';

/**
 * Theme system.
 *
 * `mode` is what the user picks in Settings:
 *   - 'auto'   — follow the device's system appearance
 *   - 'light'  — force light theme
 *   - 'dark'   — force dark theme
 *
 * `resolved` is the final 'light' | 'dark' the app actually paints with —
 * derived from `mode` and the device's `useColorScheme()`.
 *
 * The provider keeps the live Colors proxy in sync (so JSX reads always
 * see the current scheme), and components can subscribe to theme changes
 * via `useThemeColors()` to get a stable palette object that triggers a
 * re-render on switch.
 */

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ResolvedScheme = 'light' | 'dark';

const STORAGE_KEY = 'theme.mode.v1';

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  resolved: ResolvedScheme;
  C: ColorPalette;
  /** True until the persisted mode has been read from AsyncStorage. */
  hydrated: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'auto',
  setMode: () => {},
  resolved: 'dark',
  C: darkColors,
  hydrated: false,
});

interface Props {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: Props) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('auto');
  const [hydrated, setHydrated] = useState(false);

  // Resolve the final scheme. Default to dark if the system hasn't
  // reported one yet (web on first render can return null briefly).
  const resolved: ResolvedScheme =
    mode === 'auto' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;

  // Keep the global Colors proxy aligned BEFORE paint so the first
  // render matches. Without this layout effect, JSX that reads
  // Colors.accent from the proxy could see the old scheme for one
  // frame after a switch.
  useLayoutEffect(() => {
    _setActiveScheme(resolved);
  }, [resolved]);

  // Hydrate persisted mode on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (cancelled) return;
        if (v === 'auto' || v === 'light' || v === 'dark') {
          setModeState(v);
        }
      })
      .catch(() => {
        // Storage failure is non-fatal — we just stay on 'auto'.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {
      // Persistence failure is silent — the in-memory choice still
      // applies for this session.
    });
  }, []);

  const C = resolved === 'dark' ? darkColors : lightColors;

  const value = useMemo(
    () => ({ mode, setMode, resolved, C, hydrated }),
    [mode, setMode, resolved, C, hydrated]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Returns the resolved palette for the current theme. Components should
 * call this and feed the result into a `makeStyles(C)` factory inside
 * `useMemo(() => makeStyles(C), [C])`. That way the component's styles
 * recompute whenever the theme changes.
 */
export function useThemeColors(): ColorPalette {
  return useContext(ThemeContext).C;
}
