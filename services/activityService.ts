import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Per-item action history ("Latest actions").
 *
 * Each bike and each component keeps its own short log of the last few
 * user actions, stored in an `activity` subcollection:
 *   - users/{uid}/bikes/{bikeId}/activity/{autoId}
 *   - users/{uid}/components/{componentId}/activity/{autoId}
 *
 * Kept in Firestore (not local) so the history syncs across devices, and
 * capped at MAX_ENTRIES per item so it never grows unbounded.
 *
 * A component event is logged to the component's own log AND (when it's on
 * a bike) to that bike's log, so the bike's detail page shows everything
 * that happened to it — including its components — while the component's
 * own page shows just its history.
 *
 * Logging is deliberately best-effort: every function swallows its own
 * errors. A failed history write must never break the underlying action
 * (adding a bike, retiring a part, …) or block the UI.
 */

export type ActivityAction =
  | 'bike_added'
  | 'bike_edited'
  | 'ride_added'
  | 'component_added'
  | 'component_edited'
  | 'component_installed'
  | 'component_retired'
  | 'component_stocked'
  | 'component_deleted';

export interface ActivityEntry {
  id: string;
  action: ActivityAction;
  /** Human-readable summary, pre-composed at log time. */
  label: string;
  /** Unix ms when the action happened. */
  at: number;
}

/** Most recent actions retained (and shown) per item. */
export const MAX_ACTIVITY_ENTRIES = 5;

type ActivityScope = 'bikes' | 'components';

function activityRef(userId: string, scope: ActivityScope, ownerId: string) {
  return collection(db, 'users', userId, scope, ownerId, 'activity');
}

async function pushActivity(
  userId: string,
  scope: ActivityScope,
  ownerId: string,
  action: ActivityAction,
  label: string
): Promise<void> {
  if (!userId || !ownerId) return;
  try {
    await addDoc(activityRef(userId, scope, ownerId), {
      action,
      label,
      at: Date.now(),
    });
    // Prune to the newest MAX_ACTIVITY_ENTRIES so the log stays "latest N".
    const snap = await getDocs(query(activityRef(userId, scope, ownerId), orderBy('at', 'desc')));
    const stale = snap.docs.slice(MAX_ACTIVITY_ENTRIES);
    if (stale.length > 0) {
      await Promise.all(stale.map((d) => deleteDoc(d.ref)));
    }
  } catch (e) {
    console.warn('logActivity failed (non-fatal):', e);
  }
}

export function logBikeActivity(
  userId: string,
  bikeId: string,
  action: ActivityAction,
  label: string
): Promise<void> {
  return pushActivity(userId, 'bikes', bikeId, action, label);
}

export function logComponentActivity(
  userId: string,
  componentId: string,
  action: ActivityAction,
  label: string
): Promise<void> {
  return pushActivity(userId, 'components', componentId, action, label);
}

/**
 * Log a component event to both the component's own history and (when it
 * belongs to a bike) that bike's history. `selfLabel` reads from the
 * component's perspective ("Retired"); `bikeLabel` names the component
 * ("Retired “KMC X11”") so it makes sense on the bike page.
 *
 * Pass `writeSelf: false` for deletions — the component (and its log) is
 * about to disappear, so only the bike-side "Removed …" entry is useful.
 */
export function logComponentEvent(
  userId: string,
  opts: {
    componentId: string;
    bikeId?: string | null;
    action: ActivityAction;
    selfLabel: string;
    bikeLabel: string;
    writeSelf?: boolean;
  }
): void {
  const { componentId, bikeId, action, selfLabel, bikeLabel, writeSelf = true } = opts;
  if (writeSelf) {
    void logComponentActivity(userId, componentId, action, selfLabel);
  }
  if (bikeId) {
    void logBikeActivity(userId, bikeId, action, bikeLabel);
  }
}

async function fetchActivity(
  userId: string,
  scope: ActivityScope,
  ownerId: string
): Promise<ActivityEntry[]> {
  if (!userId || !ownerId) return [];
  try {
    const snap = await getDocs(
      query(activityRef(userId, scope, ownerId), orderBy('at', 'desc'), limit(MAX_ACTIVITY_ENTRIES))
    );
    return snap.docs.map((d) => {
      const data = d.data() as { action: ActivityAction; label: string; at: number };
      return { id: d.id, action: data.action, label: data.label, at: data.at };
    });
  } catch (e) {
    console.warn('fetchActivity failed:', e);
    return [];
  }
}

export function fetchBikeActivity(userId: string, bikeId: string): Promise<ActivityEntry[]> {
  return fetchActivity(userId, 'bikes', bikeId);
}

export function fetchComponentActivity(
  userId: string,
  componentId: string
): Promise<ActivityEntry[]> {
  return fetchActivity(userId, 'components', componentId);
}
