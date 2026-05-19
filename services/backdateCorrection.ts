import {
  fetchBikeOdometerSnapshot,
  getValidToken,
  StravaAuthError,
} from './stravaService';
import { updateBike } from './bikesService';
import type { Bike, StravaTokens } from '../types';

/**
 * When the user back-dates an install, the modal's `installDistance =
 * currentBikeKm` is wrong: the rides between `installDate` and today
 * are already part of `currentBikeKm`, so they'd disappear from the
 * "km on this bike since install" computation (since install is
 * anchored to a value newer than installDate).
 *
 * `correctBackdatedInstall` re-derives the correct anchor — the bike's
 * odometer reading at `installDate` — from a single pass over the full
 * Strava activity history, attributed against the user's whole bike
 * list (same rules as `useSync.runMigration`).
 *
 * As of v8, `priorWear` is its own column on the component and is
 * forwarded untouched by the caller — this function only deals with the
 * install anchor and the bike's current total. It no longer needs to
 * subtract a recovered "prior" out of the snapshot, which simplifies
 * the math considerably and removes a class of off-by-prior bugs in
 * the add/edit flow.
 *
 * Output:
 *   installDistance     = sum of cycling km on this bike with
 *                          start_date < installDate (bike's true
 *                          odometer at install)
 *   bikeTotalDistance   = sum of cycling km on this bike across the
 *                          full history
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
  /** Selected install date in unix ms. */
  installDate: number;
}

export async function correctBackdatedInstall(
  input: BackdateCorrectionInput
): Promise<BackdateCorrection> {
  const { userId, bike, allBikes, stravaTokens, installDate } = input;

  if (!bike || !stravaTokens) return { ok: false };
  if (Date.now() - installDate < BACKDATE_THRESHOLD_MS) return { ok: false };

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
    // Install anchor = bike's odometer reading at installDate. priorWear
    // is the caller's responsibility — it's its own column now, not
    // baked into this number.
    installDistance: snap.installDistance,
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
