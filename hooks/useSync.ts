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
import {
  loadSyncState,
  saveSyncState,
  CURRENT_SCHEMA_VERSION,
} from '../services/syncStateService';
import type { Bike, BikeComponent, StravaActivity } from '../types';

const LAST_SYNC_KEY = 'bikevault_last_sync';

/**
 * Activity-based Strava sync.
 *
 * ## Why activity-based
 *
 * Earlier versions mirrored `athlete.bikes[i].distance` (Strava's
 * cumulative per-gear total). That broke for any ride the user didn't
 * tag with a bike on Strava — the gear counter never moved, so our
 * totals stood still while the user's odometer climbed. We now import
 * activities and attribute each one to a BikeVault bike ourselves
 * (`resolveBikeForActivity`).
 *
 * ## First run vs. steady state
 *
 * Tracked via `users/{uid}/syncState/main.schemaVersion`. When that is
 * below `CURRENT_SCHEMA_VERSION` the migration path runs: full
 * cycling history is fetched, each bike's `totalDistance` is
 * recomputed from scratch, and each active component's
 * `installDistance` is recomputed from the activity timeline (sum of
 * km on the same bike with `start_date < installDate`). This is the
 * key bit — it makes "already ridden" equal "rides since install"
 * without depending on whether the user tagged the bike on Strava.
 *
 * Steady-state syncs only fetch activities since `lastActivityStart`,
 * attribute each one, and bump the owning bike's `totalDistance`. No
 * component rebase is needed in that path: components installed after
 * the last migration already have an `installDistance` set to the
 * correct totalDistance at install time.
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

      if (state.schemaVersion < CURRENT_SCHEMA_VERSION) {
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

/** Distance of a Strava activity in km (rounding deferred to the caller). */
function activityDistanceKm(a: StravaActivity): number {
  return a.distance / 1000;
}

/** Activity start_date as unix milliseconds. */
function activityStartMs(a: StravaActivity): number {
  return new Date(a.start_date).getTime();
}

function maxStartDateSec(activities: StravaActivity[]): number {
  let max = 0;
  for (const a of activities) {
    const t = Math.floor(activityStartMs(a) / 1000);
    if (t > max) max = t;
  }
  return max;
}

/**
 * One-time historical backfill (schemaVersion bump path).
 *
 * For each bike:
 *   - Recomputes `totalDistance` as the sum of attributed cycling
 *     activities.
 *   - Walks the bike's activities (sorted by start_date) and, for each
 *     active component, sets `installDistance` to the cumulative km
 *     accrued before that component's `installDate`. Then
 *     `already_ridden = totalDistance - installDistance` automatically
 *     equals "rides on this bike since install" — which is what the
 *     "Already ridden" UI is supposed to show.
 *
 * Components installed before the user's earliest cycling activity get
 * `installDistance = 0`, which means they'll show the bike's full
 * Strava-imported total as "already ridden". That's the best we can
 * do without pre-Strava history; users in that situation can edit the
 * component's install distance manually if needed.
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

  // Group activities per attributed bike id (id → activities sorted asc).
  const activitiesByBike = new Map<string, StravaActivity[]>();
  for (const a of activities) {
    const bike = resolveBikeForActivity(a, bikes);
    if (!bike) continue;
    const list = activitiesByBike.get(bike.id) ?? [];
    list.push(a);
    activitiesByBike.set(bike.id, list);
  }
  for (const list of activitiesByBike.values()) {
    list.sort((a, b) => activityStartMs(a) - activityStartMs(b));
  }

  const now = Date.now();

  for (const bike of bikes) {
    const bikeActivities = activitiesByBike.get(bike.id) ?? [];
    const newTotal = Math.round(
      bikeActivities.reduce((sum, a) => sum + activityDistanceKm(a), 0)
    );

    // Recompute installDistance for each active component on this bike
    // by walking the bike's activities chronologically and capturing
    // the cumulative km at the moment of the component's installDate.
    const activeOnBike = components.filter(
      (c) => c.bikeId === bike.id && c.status === 'active'
    );

    if (activeOnBike.length > 0) {
      // Capture the bike's pre-migration total. Legacy `priorWear`
      // recovery needs the "currently displayed ridden" value, which
      // depends on the bike total as it stood BEFORE we rewrite it
      // further down. Reading from the stored `bike` object is safe
      // here — we haven't called updateBike for this bike yet.
      const oldBikeTotal = bike.totalDistance ?? 0;

      for (const c of activeOnBike) {
        let cumulativeBeforeInstall = 0;
        for (const a of bikeActivities) {
          if (activityStartMs(a) >= c.installDate) break;
          cumulativeBeforeInstall += activityDistanceKm(a);
        }
        const newInstall = Math.round(cumulativeBeforeInstall);

        // priorWear is preserved across every migration. We only touch
        // it once — for pre-v8 components that don't have the column
        // yet — to recover the user's original "Already ridden" input
        // from the implicit encoding the old code used.
        //
        // Recovery formula:
        //   oldRidden               = oldBikeTotal − oldInstallDistance
        //   newRidesSinceInstall    = newBikeTotal − newCumulativeBeforeInstall
        //   priorWear_recovered     = max(0, oldRidden − newRidesSinceInstall)
        //
        // This is exact when the old bike total was correct under the
        // old attribution rules; it under-recovers (drops to 0) when
        // an earlier buggy migration had already zeroed out the
        // implicit prior delta (e.g. components installed "today" got
        // installDistance = bike.totalDistance during the v5/v6/v7
        // rebases, which destroyed the recoverable signal).
        const updates: Partial<BikeComponent> = {};
        let touched = false;
        if (c.priorWear === undefined) {
          const oldRidden = Math.max(0, oldBikeTotal - c.installDistance);
          const newRidesSinceInstall = Math.max(0, newTotal - newInstall);
          const recovered = Math.max(0, Math.round(oldRidden - newRidesSinceInstall));
          if (recovered > 0) {
            updates.priorWear = recovered;
            touched = true;
          }
        }
        if (newInstall !== c.installDistance) {
          updates.installDistance = newInstall;
          touched = true;
        }
        if (touched) {
          try {
            await updateComponent(userId, c.id, updates);
            updateComponentLocal(c.id, { ...updates, updatedAt: now });
          } catch (e) {
            console.warn('Component rebase failed:', c.id, e);
          }
        }
      }
    }

    if (newTotal !== (bike.totalDistance ?? 0)) {
      try {
        await updateBike(userId, bike.id, { totalDistance: newTotal });
        updateBikeLocal(bike.id, { totalDistance: newTotal, updatedAt: now });
      } catch (e) {
        console.warn('Bike totalDistance update failed:', bike.id, e);
      }
    }
  }

  const lastActivityStart = maxStartDateSec(activities);
  await saveSyncState(userId, {
    lastActivityStart,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
}

/**
 * Steady-state incremental sync.
 *
 * Fetches activities since `lastActivityStart`, attributes each one,
 * and adds its distance to the owning bike's totalDistance. Unattributed
 * activities are skipped. The cursor is advanced to the most recent
 * activity seen in this batch (even if some couldn't be attributed —
 * we've still "seen" them).
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
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
}
