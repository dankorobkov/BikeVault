import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Per-user Strava sync state.
 *
 * Lives at `users/{uid}/syncState/main`. Persisted so an activity-based
 * incremental sync can resume from the last activity we saw instead of
 * having to re-fetch history from scratch every run.
 *
 * `migratedToV2` gates the one-time historical backfill + component
 * `installDistance` rebase that runs the first time a user with pre-V2
 * tokens syncs after the activity-based rewrite. Once true, subsequent
 * syncs take the cheap incremental path using `lastActivityStart`.
 */
export interface SyncState {
  /** Unix seconds of the most recent activity we've already imported. */
  lastActivityStart: number;
  /** True once the one-time historical backfill + rebase has completed. */
  migratedToV2: boolean;
}

const DEFAULT_STATE: SyncState = {
  lastActivityStart: 0,
  migratedToV2: false,
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
  return {
    lastActivityStart,
    migratedToV2: Boolean(data.migratedToV2),
  };
}

export async function saveSyncState(
  userId: string,
  state: SyncState
): Promise<void> {
  await setDoc(syncStateDoc(userId), state, { merge: true });
}
