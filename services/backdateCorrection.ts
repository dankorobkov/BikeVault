import {
  fetchBikeOdometerSnapshot,
  getValidToken,
  StravaAuthError,
} from './stravaService';
import { updateBike } from './bikesService';
import type { Bike, StravaTokens } from '../types';

/**
 * The modal computes `installDistance = currentBikeKm − priorRiddenKm`,
 * which is correct when installDate = "now" but wrong as soon as the
 * user back-dates it: any rides between `installDate` and today are
 * already baked into `currentBikeKm`, so "Already ridden" comes out as
 * just `priorRiddenKm` instead of `priorRiddenKm + km-since-install`.
 *
 * `correctBackdatedInstall` re-derives the correct `installDistance`
 * (and the bike's true `totalDistance`) from a single pass over the
 * full Strava activity history, attributed against the user's whole
 * bike list — same rules as `useSync.runMigration` so create/edit and
 * the next sync can't disagree.
 *
 * Output:
 *   installDistance     = (sum of cycling km on this bike with
 *                          start_date < installDate) − priorRiddenKm
 *   bikeTotalDistance   = sum of cycling km on this bike across the
 *                          full history
 *
 * With those, `ridden = bikeTotal − install = priorRiddenKm + (km on
 * this bike since installDate)`, which is exactly what the UI claims.
 *
 * Returns `{ ok: false }` on any failure (no Strava, install date
 * basically "now", network error, …) so callers fall back to the
 * modal's pre-computed value rather than persisting half-derived
 * numbers. Failing closed is the safer default.
 */

/**
 * If the user picked "today" in the date picker, the timestamp lands
 * within minutes of `Date.now()` after rounding for time zones. We
 * skip the correction in that window — the modal's value is already
 * correct, and a Strava round-trip every Save would just make the UI
 * sluggish.
 */
const BACKDATE_THRESHOLD_MS = 60_000;

export type BackdateCorrection =
  | { ok: false }
  | { ok: true; installDistance: number; bikeTotalDistance: number };

export interface BackdateCorrectionInput {
  userId: string;
  bike: Bike | undefined;
  /**
   * Every bike the user owns. Required for correct activity
   * attribution — passing only the target bike causes gear-tagged
   * rides on other bikes to be falsely claimed here when their
   * sport_type matches this bike's `defaultActivity`.
   */
  allBikes: Bike[];
  stravaTokens: StravaTokens | null;
  /** The modal's pre-correction `installDistance`. */
  rawInstallDistance: number;
  /** The bike total at the moment Save was tapped. */
  staleBikeTotal: number;
  /** Selected install date in unix ms. */
  installDate: number;
}

export async function correctBackdatedInstall(
  input: BackdateCorrectionInput
): Promise<BackdateCorrection> {
  const {
    userId,
    bike,
    allBikes,
    stravaTokens,
    rawInstallDistance,
    staleBikeTotal,
    installDate,
  } = input;

  if (!bike || !stravaTokens) return { ok: false };
  if (Date.now() - installDate < BACKDATE_THRESHOLD_MS) return { ok: false };

  // Recover the user's "Already ridden" input from the modal's
  // formula `installDistance = bikeKm - prior`. We re-add it after
  // resolving the bike's odometer at installDate so the part keeps
  // its declared prior wear.
  const prior = Math.max(0, staleBikeTotal - rawInstallDistance);

  let accessToken: string;
  try {
    const tokens = await getValidToken(userId, stravaTokens);
    accessToken = tokens.accessToken;
  } catch (e) {
    if (!(e instanceof StravaAuthError)) {
      console.warn('Back-date correction: token refresh failed:', e);
    }
    return { ok: false };
  }

  const snap = await fetchBikeOdometerSnapshot(
    accessToken,
    bike,
    allBikes,
    installDate
  );
  if (!snap) return { ok: false };

  return {
    ok: true,
    // Floor at 0 — a part installed before the user's earliest tracked
    // ride should never read as "negative wear".
    installDistance: Math.max(0, snap.installDistance - prior),
    bikeTotalDistance: snap.totalDistance,
  };
}

/**
 * Persist the corrected bike total to Firestore + Zustand if it's
 * actually different from the stored value. Skipping the no-op write
 * avoids a round-trip on every Save. Failures are non-fatal — the next
 * full sync will rebuild the total anyway.
 */
export async function applyBikeTotalSnapshot(args: {
  userId: string;
  bike: Bike;
  newTotalKm: number;
  updateBikeLocal: (id: string, updates: Partial<Bike>) => void;
}): Promise<void> {
  const { userId, bike, newTotalKm, updateBikeLocal } = args;
  if (newTotalKm === (bike.totalDistance ?? 0)) return;
  try {
    await updateBike(userId, bike.id, { totalDistance: newTotalKm });
    updateBikeLocal(bike.id, { totalDistance: newTotalKm, updatedAt: Date.now() });
  } catch (e) {
    console.warn('applyBikeTotalSnapshot failed:', e);
  }
}
