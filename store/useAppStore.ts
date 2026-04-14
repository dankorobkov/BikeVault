import { create } from 'zustand';
import type { Bike, BikeComponent, StravaTokens } from '../types';

interface AppState {
  // Auth
  userId: string | null;

  // Data
  bikes: Bike[];
  components: BikeComponent[];

  // Strava
  stravaTokens: StravaTokens | null;
  lastSyncAt: number | null; // timestamp
  isSyncing: boolean;

  // UI
  isLoading: boolean;

  // ─── Actions ──────────────────────────────────────────────────────────────
  setUserId: (id: string | null) => void;

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

  setLoading: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  userId: null,
  bikes: [],
  components: [],
  stravaTokens: null,
  lastSyncAt: null,
  isSyncing: false,
  isLoading: true,

  setUserId: (id) => set({ userId: id }),

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
      components: s.components.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  removeComponentLocal: (id) =>
    set((s) => ({ components: s.components.filter((c) => c.id !== id) })),

  setStravaTokens: (tokens) => set({ stravaTokens: tokens }),
  setLastSyncAt: (ts) => set({ lastSyncAt: ts }),
  setIsSyncing: (v) => set({ isSyncing: v }),

  setLoading: (v) => set({ isLoading: v }),
}));
