/**
 * Analytics service — wraps Firebase Analytics with typed helpers.
 *
 * Analytics is web-only (the Firebase JS SDK does not support native via
 * expo/react-native). All calls are no-ops on native builds or when the
 * measurementId env-var is missing.
 *
 * To activate: set EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID in .env
 * (Firebase Console → Project Settings → Your apps → Web app → measurementId)
 */

import { Platform } from 'react-native';
import { getAnalytics, logEvent, isSupported, type Analytics } from 'firebase/analytics';
import app from '../config/firebase';

// Lazily resolved analytics instance (null = not supported or not configured)
let analyticsInstance: Analytics | null = null;
let initPromise: Promise<Analytics | null> | null = null;

async function getInstance(): Promise<Analytics | null> {
  if (Platform.OS !== 'web') return null;
  if (analyticsInstance) return analyticsInstance;
  if (initPromise) return initPromise;

  initPromise = isSupported().then((supported) => {
    if (!supported) return null;
    // measurementId must be set in firebaseConfig — if missing, Analytics is a no-op
    try {
      analyticsInstance = getAnalytics(app);
      return analyticsInstance;
    } catch {
      return null;
    }
  });

  return initPromise;
}

async function track(eventName: string, params?: Record<string, unknown>) {
  const a = await getInstance();
  if (!a) return;
  logEvent(a, eventName, params as Record<string, string | number | boolean>);
}

// ─── Typed event helpers ────────────────────────────────────────────────────

export const Analytics = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  /** Fires when a user completes sign-in (matches Firebase's recommended event). */
  login(method: 'anonymous' | 'google') {
    track('login', { method });
  },

  // ── Bikes ─────────────────────────────────────────────────────────────────
  addBike(bikeType: string) {
    track('add_bike', { bike_type: bikeType });
  },

  editBike() {
    track('edit_bike');
  },

  deleteBike() {
    track('delete_bike');
  },

  // ── Components ────────────────────────────────────────────────────────────
  addComponent(category: string, isElectric: boolean) {
    track('add_component', { category, is_electric: isElectric });
  },

  editComponent(category: string) {
    track('edit_component', { category });
  },

  retireComponent(category: string) {
    track('retire_component', { category });
  },

  deleteComponent(category: string) {
    track('delete_component', { category });
  },

  moveToStock(category: string) {
    track('move_to_stock', { category });
  },

  installOnBike(category: string) {
    track('install_on_bike', { category });
  },

  // ── Navigation ────────────────────────────────────────────────────────────
  /**
   * Fires whenever the user navigates to a screen.
   * Use the Firebase-standard param names so the Analytics dashboard
   * automatically picks them up under Engagement → Screen views.
   */
  screenView(screenName: string) {
    track('screen_view', {
      firebase_screen: screenName,
      firebase_screen_class: screenName,
    });
  },
};
