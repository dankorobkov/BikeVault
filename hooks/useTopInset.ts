import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Reads safe-area-inset-top reliably across all environments:
 *
 *  • Native iOS/Android  – useSafeAreaInsets() works correctly
 *  • Web / iOS PWA       – useSafeAreaInsets() always returns 0 on web even
 *                          with viewport-fit=cover, so we read the CSS env()
 *                          value directly via a temporary DOM element.
 *                          We do this inside requestAnimationFrame so the
 *                          browser has finished its first layout pass and
 *                          env() is fully resolved.
 *                          If env() still returns 0 (older Safari quirk) we
 *                          fall back to 44 px on iPhone, 0 elsewhere.
 */

function readCssEnvTop(): number {
  if (typeof document === 'undefined') return 0;
  const div = document.createElement('div');
  div.style.cssText =
    'position:fixed;top:0;left:0;' +
    'pointer-events:none;opacity:0;' +
    'padding-top:env(safe-area-inset-top,0px)';
  document.documentElement.appendChild(div);
  const val = parseFloat(getComputedStyle(div).paddingTop) || 0;
  div.remove();
  return val;
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function useTopInset(base = 8): number {
  const insets = useSafeAreaInsets(); // correct on native; always 0 on web
  const [webTop, setWebTop] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // First attempt: synchronous read (may still be 0 on initial load)
    const immediate = readCssEnvTop();
    if (immediate > 0) {
      setWebTop(immediate);
      return;
    }

    // Second attempt: after browser has painted and env() is resolved
    const raf = requestAnimationFrame(() => {
      const afterPaint = readCssEnvTop();
      if (afterPaint > 0) {
        setWebTop(afterPaint);
      } else if (isIosDevice()) {
        // Fallback for iOS PWA when env() measurement still returns 0
        // 44 px covers all notch iPhones; Dynamic Island models need ~59 px
        // Use 54 as a safe midpoint that clears every modern iPhone.
        setWebTop(54);
      }
    });

    return () => cancelAnimationFrame(raf);
  }, []);

  if (Platform.OS === 'web') {
    return Math.max(webTop + base, 20);
  }
  return insets.top + base;
}
