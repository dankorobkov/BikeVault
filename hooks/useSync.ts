import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '../store/useAppStore';
import {
  getValidToken,
  clearStravaTokens,
  StravaAuthError,
  fetchActivitiesSince,
  fetchAllCyclingActivities,
  isCyclingActivity,
  resolveBikeForActivity,
} from '../services/stravaService';
import { updateBike } from '../services/bikesService';
import { updateComponent } from '../services/componentsService';
import { loadSyncState, saveSyncState } from '../services/syncStateService';
import type { Bike, BikeComponent, StravaActivity } from '../types';

const LAST_SYNC_KEY = 'bikevault_last_sync';

/**
 * Activity-based Strava sync.
 *
 * ## Design
 *
 * Earlier versions of BikeVault mirrored `athlete.bikes[i].distance`
 * (Strava's cumulative per-gear total) onto each linked BikeVault bike.
 * That broke for any ride the user didn't tag with a bike on Strava —
 * the gear counter never moved, so our totals stood still while the
 * user's odometer climbed. The fix is to import _activities_ and
 * attribute each one to a BikeVault bike ourselves.
 *
 * ## Attribution
 *
 * Attribution is handled by `resolveBikeForActivity`: gear_id match
 * first, then a fallback match on `bike.defaultActivity === sport_type`.
 * The app UI enforces uniqueness of `defaultActivity` per user so the
 * fallback is always deterministic.
 *
 * ## First run vs. steady state
 *
 * Tracked via `users/{uid}/syncState/main.migratedToV2`.
 *
 *   - **First run** (migratedToV2 === false): fetch the user's complete
 *     cycling history, recompute each bike's `totalDistance` from
 *     scratch, and rebase every active component's `installDistance` by
 *     the delta so the "already ridden" reading stays continuous. This
 *     runs exactly once — subsequent runs take the incremental path
 *     even if the user later disconnects and reconnects Strava.
 *
 *   - **Incremental** (migratedToV2 === true): fetch activities after
 *     `lastActivityStart`, attribute each one, and bump the owning
 *     bike's totalDistance by the imported km. No component rebase —
 *     wear moves forward naturally as totalDistance grows.
 */
export function useSync() {
  const {
    userId,
    stravaTokens,
    bikes,
    components,
    setIsSyncing,
    setLastSyncAt,
    setStravaTokens,
    updateBikeLocal,
    updateComponentLocal,
  } = useAppStore();

  const syncStrava = useCallback(async () => {
    if (!userId || !stravaTokens) return;
    setIsSyncing(true);
    try {
      let validTokens;
      try {
        validTokens = await getValidToken(userId, stravaTokens);
      } catch (e) {
        // Refresh rejected — user revoked the app on strava.com. Clear
        // stored tokens so the Settings screen drops back to the
        // Connect Strava button, and surface a clear message.
        if (e instanceof StravaAuthError) {
          try {
            await clearStravaTokens(userId);
          } catch {
            /* local state still updated below */
          }
          setStravaTokens(null);
          throw new Error(
            'Strava access was revoked. Please reconnect Strava in Settings.'
          );
        }
        throw e;
      }

      const state = await loadSyncState(userId);

      if (!state.migratedToV2) {
        await runMigration({
          userId,
          accessToken: validTokens.accessToken,
          bikes,
          components,
          updateBikeLocal,
          updateComponentLocal,
        });
      } else {
        await runIncrementalSync({
          userId,
          accessToken: validTokens.accessToken,
          bikes,
          lastActivityStart: state.lastActivityStart,
          updateBikeLocal,
        });
      }

      // Persist the sync timestamp regardless of whether any km were
      // actually imported — a successful API round-trip counts as a
      // sync so "Last synced" stays meaningful even on idle days.
      const now = Date.now();
      setLastSyncAt(now);
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(now));
    } catch (e) {
      if (e instanceof StravaAuthError) {
        try {
          await clearStravaTokens(userId);
        } catch {
          /* ignore */
        }
        setStravaTokens(null);
        throw new Error(
          'Strava access was revoked. Please reconnect Strava in Settings.'
        );
      }
      throw e;
    } finally {
      setIsSyncing(false);
    }
  }, [
    userId,
    stravaTokens,
    bikes,
    components,
    setIsSyncing,
    setLastSyncAt,
    setStravaTokens,
    updateBikeLocal,
    updateComponentLocal,
  ]);

  const loadLastSync = useCallback(async () => {
    const stored = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (stored) setLastSyncAt(Number(stored));
  }, [setLastSyncAt]);

  return { syncStrava, loadLastSync };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sum of a Strava activity's distance in km, rounded to the nearest km.
 * Strava returns meters as a float; rounding keeps our stored totals as
 * whole km to match the rest of the UI.
 */
function activityDistanceKm(a: StravaActivity): number {
  return a.distance / 1000;
}

function maxStartDateSec(activities: StravaActivity[]): number {
  let max = 0;
  for (const a of activities) {
    const t = Math.floor(new Date(a.start_date).getTime() / 1000);
    if (t > max) max = t;
  }
  return max;
}

/**
 * One-time historical backfill.
 *
 * Fetches every cycling activity the user has on Strava, groups by
 * attributed bike, and replaces each bike's `totalDistance` with the
 * fresh sum. Components are rebased by the per-bike delta so the
 * user's perceived wear ("X km ridden on this chain") survives the
 * switch.
 *
 * Unattributed activities are just ignored — they can't be assigned to
 * a bike without user input.
 */
async function runMigration(args: {
  userId: string;
  accessToken: string;
  bikes: Bike[];
  components: BikeComponent[];
  updateBikeLocal: (id: string, updates: Partial<Bike>) => void;
  updateComponentLocal: (id: string, updates: Partial<BikeComponent>) => void;
}) {
  const { userId, accessToken, bikes, components, updateBikeLocal, updateComponentLocal } = args;

  const activities = await fetchAllCyclingActivities(accessToken);

  // Group distance-in-km per attributed bike id.
  const kmByBike = new Map<string, number>();
  for (const a of activities) {
    const bike = resolveBikeForActivity(a, bikes);
    if (!bike) continue;
    kmByBike.set(bike.id, (kmByBike.get(bike.id) ?? 0) + activityDistanceKm(a));
  }

  const now = Date.now();

  for (const bike of bikes) {
    const newTotal = Math.round(kmByBike.get(bike.id) ?? 0);
    const oldTotal = bike.totalDistance ?? 0;
    const delta = newTotal - oldTotal;

    // Rebase active components on this bike by the same delta so their
    // "already ridden" reading stays continuous across the migration.
    // Retired/in-stock components aren't affected — they don't display
    // wear against the live totalDistance.
    if (delta !== 0) {
      for (const c of components) {
        if (c.bikeId !== bike.id) continue;
        if (c.status !== 'active') continue;
        const newInstall = c.installDistance + delta;
        try {
          await updateComponent(userId, c.id, { installDistance: newInstall });
          updateComponentLocal(c.id, {
            installDistance: newInstall,
            updatedAt: now,
          });
        } catch (e) {
          console.warn('Component rebase failed:', c.id, e);
        }
      }
    }

    if (newTotal !== oldTotal) {
      try {
        await updateBike(userId, bike.id, { totalDistance: newTotal });
        updateBikeLocal(bike.id, { totalDistance: newTotal, updatedAt: now });
      } catch (e) {
        console.warn('Bike totalDistance update failed:', bike.id, e);
      }
    }
  }

  // Anchor the incremental cursor at the most recent activity we saw,
  // so the next sync doesn't re-process everything.
  const lastActivityStart = maxStartDateSec(activities);
  await saveSyncState(userId, {
    lastActivityStart,
    migratedToV2: true,
  });
}

/**
 * Steady-state incremental sync.
 *
 * Fetches activities since `lastActivityStart`, attributes each one,
 * and adds its distance to the owning bike's totalDistance. Unattributed
 * activities are skipped. The cursor is advanced to the most recent
 * activity seen in this batch (even if some of them couldn't be
 * attributed — we've still "seen" them).
 */
async function runIncrementalSync(args: {
  userId: string;
  accessToken: string;
  bikes: Bike[];
  lastActivityStart: number;
  updateBikeLocal: (id: string, updates: Partial<Bike>) => void;
}) {
  const { userId, accessToken, bikes, lastActivityStart, updateBikeLocal } = args;

  const activities = await fetchActivitiesSince(accessToken, lastActivityStart);
  const cycling = activities.filter(isCyclingActivity);

  if (activities.length === 0) {
    // Cursor still accurate; nothing to do.
    return;
  }

  const addKmByBike = new Map<string, number>();
  for (const a of cycling) {
    const bike = resolveBikeForActivity(a, bikes);
    if (!bike) continue;
    addKmByBike.set(
      bike.id,
      (addKmByBike.get(bike.id) ?? 0) + activityDistanceKm(a)
    );
  }

  const now = Date.now();

  for (const [bikeId, addKm] of addKmByBike) {
    const bike = bikes.find((b) => b.id === bikeId);
    if (!bike) continue;
    const rounded = Math.round(addKm);
    if (rounded <= 0) continue;
    const newTotal = (bike.totalDistance ?? 0) + rounded;
    try {
      await updateBike(userId, bike.id, { totalDistance: newTotal });
      updateBikeLocal(bike.id, { totalDistance: newTotal, updatedAt: now });
    } catch (e) {
      console.warn('Bike totalDistance update failed:', bike.id, e);
    }
  }

  const newCursor = Math.max(lastActivityStart, maxStartDateSec(activities));
  await saveSyncState(userId, {
    lastActivityStart: newCursor,
    migratedToV2: true,
  });
}
