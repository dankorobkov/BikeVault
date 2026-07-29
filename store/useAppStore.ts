import { create } from 'zustand';
import type {
  Bike,
  BikeComponent,
  StravaTokens,
  WahooTokens,
  ProviderId,
  NotificationPrefs,
} from '../types';
import type { FeatureFlags } from '../services/featureFlagsService';
import type { SubscriptionStatus } from '../services/userService';

interface AppState {
  // Auth
  userId: string | null;
  isAnonymous: boolean;
  userDisplayName: string | null;
  userEmail: string | null;
  userPhotoUrl: string | null;
  // True once the authenticated user has redeemed an invite code and has
  // a profile document in Firestore. Always true for anonymous users.
  hasProfile: boolean;
  // null = we haven't checked yet (show loader); true/false = known state.
  profileChecked: boolean;
  // Mirror of the `hasSeenOnboarding` flag from the Firestore profile.
  // null = unknown (profile not loaded yet, or legacy profile without
  // the field); true/false = explicit. The onboarding gate treats null
  // as "not seen" but the signup-time cutoff in the feature flag stops
  // it surfacing to legacy users.
  hasSeenOnboarding: boolean | null;

  // ── Subscription ─────────────────────────────────────────────────────────
  // Mirrors the Firestore profile fields (see services/userService.ts).
  // Defaults to 'free' with no dates until the profile loads. Anonymous
  // (demo) users are always 'free' with no grace period — their data is
  // local-only and never persisted, so a lockout flow doesn't apply to
  // them.
  subscriptionStatus: SubscriptionStatus;
  subscriptionPurchasedAt: number | null;
  subscriptionExpiresAt: number | null;
  // ms timestamp the account first went over free-tier limits, or null
  // when under the limits / subscribed. Drives the 30-day grace period.
  overLimitSince: number | null;

  // Data
  bikes: Bike[];
  components: BikeComponent[];

  // Activity data sources
  // Each provider's connection is stored independently so the user can
  // link several at once. `primaryProvider` decides which one actually
  // feeds bike distances (see useSync). Legacy state: Strava only.
  stravaTokens: StravaTokens | null;
  wahooTokens: WahooTokens | null;
  primaryProvider: ProviderId;
  // Optional catch-all bike for Wahoo rides that don't attribute by
  // activity type. null = drop unmatched rides.
  wahooDefaultBikeId: string | null;
  lastSyncAt: number | null;
  isSyncing: boolean;

  // Preferences
  notificationPrefs: NotificationPrefs;
  useMetric: boolean;

  // Feature flags — server-controlled, fetched once at boot. null until
  // the first read resolves; consumers should treat null as "don't
  // assume any feature is on" and wait for the value.
  featureFlags: FeatureFlags | null;

  // UI
  isLoading: boolean;
  isDataLoading: boolean; // true while Firestore data is being fetched in the background

  // ─── Actions ──────────────────────────────────────────────────────────────
  setUserId: (id: string | null) => void;
  setUserProfile: (profile: {
    isAnonymous: boolean;
    displayName: string | null;
    email: string | null;
    photoUrl: string | null;
  }) => void;
  setHasProfile: (v: boolean) => void;
  setProfileChecked: (v: boolean) => void;
  setHasSeenOnboarding: (v: boolean | null) => void;
  setFeatureFlags: (flags: FeatureFlags | null) => void;
  setSubscription: (info: {
    status: SubscriptionStatus;
    purchasedAt: number | null;
    expiresAt: number | null;
    overLimitSince: number | null;
  }) => void;
  setOverLimitSinceLocal: (ts: number | null) => void;
  signOut: () => void;

  setBikes: (bikes: Bike[]) => void;
  addBikeLocal: (bike: Bike) => void;
  updateBikeLocal: (id: string, updates: Partial<Bike>) => void;
  removeBikeLocal: (id: string) => void;

  setComponents: (components: BikeComponent[]) => void;
  addComponentLocal: (component: BikeComponent) => void;
  updateComponentLocal: (id: string, updates: Partial<BikeComponent>) => void;
  removeComponentLocal: (id: string) => void;

  setStravaTokens: (tokens: StravaTokens | null) => void;
  setWahooTokens: (tokens: WahooTokens | null) => void;
  setPrimaryProvider: (provider: ProviderId) => void;
  setWahooDefaultBikeId: (bikeId: string | null) => void;
  setLastSyncAt: (ts: number) => void;
  setIsSyncing: (v: boolean) => void;

  setNotificationPrefs: (prefs: Partial<NotificationPrefs>) => void;
  setUseMetric: (v: boolean) => void;

  setLoading: (v: boolean) => void;
  setDataLoading: (v: boolean) => void;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  chainLube: true,
  componentWear: true,
  batteryLow: true,
};

export const useAppStore = create<AppState>((set) => ({
  userId: null,
  isAnonymous: true,
  userDisplayName: null,
  userEmail: null,
  userPhotoUrl: null,
  hasProfile: false,
  profileChecked: false,
  hasSeenOnboarding: null,
  featureFlags: null,
  subscriptionStatus: 'free',
  subscriptionPurchasedAt: null,
  subscriptionExpiresAt: null,
  overLimitSince: null,
  bikes: [],
  components: [],
  stravaTokens: null,
  wahooTokens: null,
  primaryProvider: 'strava',
  wahooDefaultBikeId: null,
  lastSyncAt: null,
  isSyncing: false,
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  useMetric: true,
  isLoading: true,
  isDataLoading: false,

  setUserId: (id) => set({ userId: id }),
  setUserProfile: (p) =>
    set({
      isAnonymous: p.isAnonymous,
      userDisplayName: p.displayName,
      userEmail: p.email,
      userPhotoUrl: p.photoUrl,
    }),
  setHasProfile: (v) => set({ hasProfile: v }),
  setProfileChecked: (v) => set({ profileChecked: v }),
  setHasSeenOnboarding: (v) => set({ hasSeenOnboarding: v }),
  // Feature flags are app-wide, not per-user — intentionally NOT
  // cleared on signOut so we don't have to refetch them when a different
  // user signs in on the same device.
  setFeatureFlags: (flags) => set({ featureFlags: flags }),
  setSubscription: (info) =>
    set({
      subscriptionStatus: info.status,
      subscriptionPurchasedAt: info.purchasedAt,
      subscriptionExpiresAt: info.expiresAt,
      overLimitSince: info.overLimitSince,
    }),
  setOverLimitSinceLocal: (ts) => set({ overLimitSince: ts }),
  signOut: () =>
    set({
      userId: null,
      isAnonymous: true,
      userDisplayName: null,
      userEmail: null,
      userPhotoUrl: null,
      hasProfile: false,
      profileChecked: false,
      // Reset to null so the next signed-in user starts from an
      // unknown state — their own profile load decides true/false.
      hasSeenOnboarding: null,
      subscriptionStatus: 'free',
      subscriptionPurchasedAt: null,
      subscriptionExpiresAt: null,
      overLimitSince: null,
      bikes: [],
      components: [],
      stravaTokens: null,
      wahooTokens: null,
      primaryProvider: 'strava',
      wahooDefaultBikeId: null,
      lastSyncAt: null,
    }),

  setBikes: (bikes) => set({ bikes }),
  addBikeLocal: (bike) => set((s) => ({ bikes: [bike, ...s.bikes] })),
  updateBikeLocal: (id, updates) =>
    set((s) => ({
      bikes: s.bikes.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    })),
  removeBikeLocal: (id) =>
    set((s) => ({
      bikes: s.bikes.filter((b) => b.id !== id),
      components: s.components.filter((c) => c.bikeId !== id),
    })),

  setComponents: (components) => set({ components }),
  addComponentLocal: (component) =>
    set((s) => ({ components: [component, ...s.components] })),
  updateComponentLocal: (id, updates) =>
    set((s) => ({
      components: s.components.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),
  removeComponentLocal: (id) =>
    set((s) => ({ components: s.components.filter((c) => c.id !== id) })),

  setStravaTokens: (tokens) => set({ stravaTokens: tokens }),
  setWahooTokens: (tokens) => set({ wahooTokens: tokens }),
  setPrimaryProvider: (provider) => set({ primaryProvider: provider }),
  setWahooDefaultBikeId: (bikeId) => set({ wahooDefaultBikeId: bikeId }),
  setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
  setIsSyncing: (v) => set({ isSyncing: v }),

  setNotificationPrefs: (prefs) =>
    set((s) => ({ notificationPrefs: { ...s.notificationPrefs, ...prefs } })),
  setUseMetric: (v) => set({ useMetric: v }),

  setLoading: (v) => set({ isLoading: v }),
  setDataLoading: (v) => set({ isDataLoading: v }),
}));
