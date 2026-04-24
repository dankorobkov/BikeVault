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
 */
export const CURRENT_SCHEMA_VERSION = 2;

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
}

export async function saveSyncState(
  userId: string,
  state: SyncState
): Promise<void> {
  await setDoc(syncStateDoc(userId), state, { merge: true });
}
