import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Per-user Strava sync state.
 *
 * Lives at `users/{uid}/syncState/main`. Persisted so an activity-based
 * incremental sync can resume from the last activity we saw instead of
 * having to re-fetch history from scratch every run.
 *
 * `schemaVersion` gates the one-time historical backfill that runs the
 * first time a user syncs after a sync-logic change. Bumping
 * `CURRENT_SCHEMA_VERSION` in this file forces every user's next sync
 * to re-migrate — used when we change how `bike.totalDistance` and/or
 * `component.installDistance` are computed from activity history.
 *
 * Versions:
 *   1 — first activity-based sync. Recomputed totalDistance from
 *       activities and rebased component.installDistance by the per-bike
 *       delta. Preserved "already ridden" but cancelled out untagged
 *       rides for components installed just before the migration ran.
 *   2 — date-based component recompute. installDistance is set to the
 *       sum of cycling km on the bike with start_date < installDate,
 *       which makes "already ridden" equal "km ridden since install"
 *       independent of how rides were tagged on Strava.
 *   3 — same math as v2, but forced re-run. Earlier users ended up
 *       with schemaVersion=2 persisted even when the Firestore write
 *       path was partially broken (rules missing on syncState plus
 *       transient ITP blocks on Firestore's write channel). That left
 *       some back-dated components still anchored at the post-install
 *       bike total. Bumping to 3 guarantees one more clean pass over
 *       every bike's activity history.
 *   4 — fix mis-attribution in the back-date correction path. Earlier
 *       releases of `fetchBikeOdometerSnapshot` ran
 *       `resolveBikeForActivity(activity, [thisBike])` — passing only
 *       the target bike, so a ride gear-tagged to a *different* bike
 *       fell through to the defaultActivity rule and was falsely
 *       attributed here when sport_types overlapped. Components added
 *       or edited via that path got an `installDistance` that didn't
 *       match what the migration would compute, and the bike's
 *       `totalDistance` was inflated by the same write. Snapshot now
 *       attributes against the full bike list (matching the migration
 *       to the kilometre); bumping to 4 forces one clean rebase to
 *       wash out any polluted values from the bad path.
 */
export const CURRENT_SCHEMA_VERSION = 4;

export interface SyncState {
  /** Unix seconds of the most recent activity we've already imported. */
  lastActivityStart: number;
  /**
   * Schema version of the last successful migration. If this is below
   * `CURRENT_SCHEMA_VERSION`, the next sync will re-run the historical
   * backfill instead of taking the incremental path.
   */
  schemaVersion: number;
}

const DEFAULT_STATE: SyncState = {
  lastActivityStart: 0,
  schemaVersion: 0,
};

function syncStateDoc(userId: string) {
  return doc(db, 'users', userId, 'syncState', 'main');
}

export async function loadSyncState(userId: string): Promise<SyncState> {
  try {
    const snap = await getDoc(syncStateDoc(userId));
    if (!snap.exists()) return { ...DEFAULT_STATE };
    const data = snap.data();
    const lastActivityStartRaw = data.lastActivityStart;
    const lastActivityStart =
      lastActivityStartRaw instanceof Timestamp
        ? Math.floor(lastActivityStartRaw.toMillis() / 1000)
        : typeof lastActivityStartRaw === 'number'
        ? lastActivityStartRaw
        : 0;
    // Back-compat: pre-schemaVersion docs only had `migratedToV2: boolean`.
    // Treat them as schemaVersion 1 so the v2 date-based migration runs
    // exactly once for those users.
    const schemaVersion =
      typeof data.schemaVersion === 'number'
        ? data.schemaVersion
        : data.migratedToV2 === true
        ? 1
        : 0;
    return {
      lastActivityStart,
      schemaVersion,
    };
  } catch (e) {
    // If Firestore rules haven't been redeployed to allow the syncState
    // subcollection yet, this throws permission-denied. Don't kill the
    // whole sync over it — fall back to "fresh user" defaults so the
    // migration path runs. The recompute is idempotent (it derives every
    // bike/component value from activity history), so retrying it on the
    // next sync after rules deploy is safe.
    console.warn('loadSyncState failed, defaulting to schemaVersion=0:', e);
    return { ...DEFAULT_STATE };
  }
}

export async function saveSyncState(
  userId: string,
  state: SyncState
): Promise<void> {
  try {
    await setDoc(syncStateDoc(userId), state, { merge: true });
  } catch (e) {
    // Same reasoning as loadSyncState: don't blow up sync if we can't
    // persist the cursor. We'll re-derive everything from history on
    // the next sync attempt.
    console.warn('saveSyncState failed, sync will re-migrate next run:', e);
  }
}
