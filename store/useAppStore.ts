import { create } from 'zustand';
import type { Bike, BikeComponent, StravaTokens, NotificationPrefs } from '../types';

interface AppState {
  // Auth
  userId: string | null;
  isAnonymous: boolean;
  userDisplayName: string | null;
  userEmail: string | null;
  userPhotoUrl: string | null;

  // Data
  bikes: Bike[];
  components: BikeComponent[];

  // Strava
  stravaTokens: StravaTokens | null;
  lastSyncAt: number | null;
  isSyncing: boolean;

  // Preferences
  notificationPrefs: NotificationPrefs;
  useMetric: boolean;

  // UI
  isLoading: boolean;

  // ─── Actions ──────────────────────────────────────────────────────────────
  setUserId: (id: string | null) => void;
  setUserProfile: (profile: {
    isAnonymous: boolean;
    displayName: string | null;
    email: string | null;
    photoUrl: string | null;
  }) => void;
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
  setLastSyncAt: (ts: number) => void;
  setIsSyncing: (v: boolean) => void;

  setNotificationPrefs: (prefs: Partial<NotificationPrefs>) => void;
  setUseMetric: (v: boolean) => void;

  setLoading: (v: boolean) => void;
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
  bikes: [],
  components: [],
  stravaTokens: null,
  lastSyncAt: null,
  isSyncing: false,
  notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
  useMetric: true,
  isLoading: true,

  setUserId: (id) => set({ userId: id }),
  setUserProfile: (p) =>
    set({
      isAnonymous: p.isAnonymous,
      userDisplayName: p.displayName,
      userEmail: p.email,
      userPhotoUrl: p.photoUrl,
    }),
  signOut: () =>
    set({
      userId: null,
      isAnonymous: true,
      userDisplayName: null,
      userEmail: null,
      userPhotoUrl: null,
      bikes: [],
      components: [],
      stravaTokens: null,
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
  setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
  setIsSyncing: (v) => set({ isSyncing: v }),

  setNotificationPrefs: (prefs) =>
    set((s) => ({ notificationPrefs: { ...s.notificationPrefs, ...prefs } })),
  setUseMetric: (v) => set({ useMetric: v }),

  setLoading: (v) => set({ isLoading: v }),
}));
