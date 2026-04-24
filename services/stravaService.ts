import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { STRAVA_CONFIG } from '../config/strava';
import type {
  Bike,
  StravaAthlete,
  StravaActivity,
  StravaActivityType,
  StravaTokens,
  StravaBike,
} from '../types';

/**
 * Strava `sport_type` values that represent a ride on a bicycle.
 *
 * We ignore every other sport_type (Run, Hike, Swim, AlpineSki, …) when
 * importing activities — they can't advance a bike's odometer no matter
 * how the user tagged them.
 */
export const CYCLING_SPORT_TYPES: ReadonlySet<StravaActivityType> = new Set<StravaActivityType>([
  'Ride',
  'VirtualRide',
  'MountainBikeRide',
  'GravelRide',
  'EBikeRide',
  'EMountainBikeRide',
]);

export function isCyclingActivity(activity: StravaActivity): boolean {
  return CYCLING_SPORT_TYPES.has(activity.type as StravaActivityType);
}

/**
 * Attribute a Strava activity to one of the user's bikes.
 *
 * Two-step resolution:
 *   1. If the activity carries a `gear_id` that matches a bike's
 *      `stravaId`, we trust that match — user explicitly tagged it on
 *      Strava.
 *   2. Otherwise, fall back to the bike whose `defaultActivity` matches
 *      the activity's `sport_type`. The app enforces uniqueness of
 *      `defaultActivity` per user, so this match is deterministic.
 *
 * Returns `null` when the activity is not cycling, or when no bike owns
 * the activity's sport_type and no gear match is found.
 */
export function resolveBikeForActivity(
  activity: StravaActivity,
  bikes: Bike[]
): Bike | null {
  if (!isCyclingActivity(activity)) return null;

  if (activity.gear_id) {
    const gearMatch = bikes.find((b) => b.stravaId === activity.gear_id);
    if (gearMatch) return gearMatch;
  }

  const activityType = activity.type as StravaActivityType;
  const typeMatch = bikes.find((b) => b.defaultActivity === activityType);
  return typeMatch ?? null;
}

/**
 * Thrown when Strava rejects our credentials — usually because the user
 * hit "Revoke Access" at strava.com/settings/apps, but also possible if
 * the refresh token has expired or the app's API keys were rotated.
 *
 * Callers should treat this as "the stored tokens are dead" and clear
 * them so the UI drops back to the Connect Strava button.
 */
export class StravaAuthError extends Error {
  constructor(message = 'Strava authorization is no longer valid') {
    super(message);
    this.name = 'StravaAuthError';
  }
}

// ─── Firestore token persistence ─────────────────────────────────────────────

function stravaDoc(userId: string) {
  return doc(db, 'users', userId, 'strava', 'tokens');
}

export async function saveStravaTokens(userId: string, tokens: StravaTokens): Promise<void> {
  await setDoc(stravaDoc(userId), tokens);
}

export async function loadStravaTokens(userId: string): Promise<StravaTokens | null> {
  const snap = await getDoc(stravaDoc(userId));
  if (!snap.exists()) return null;
  return snap.data() as StravaTokens;
}

/**
 * Checks stored tokens against Strava's `/athlete` endpoint and clears
 * them if they've been revoked. Returns the still-valid tokens, or
 * `null` if they were invalid (and have been deleted from Firestore).
 *
 * Called at app boot so the UI doesn't get stuck showing "Connected"
 * for tokens the user revoked at strava.com.
 */
export async function validateStravaTokens(
  userId: string,
  tokens: StravaTokens
): Promise<StravaTokens | null> {
  try {
    const valid = await getValidToken(userId, tokens);
    // Cheap probe — /athlete is a single HTTP call; no bikes parsed here.
    await fetchAthlete(valid.accessToken);
    return valid;
  } catch (e) {
    if (e instanceof StravaAuthError) {
      // Dead token — clear it so the Settings screen shows Connect again.
      try {
        await clearStravaTokens(userId);
      } catch {
        /* swallow: Safari ITP etc. can block the delete; local state is
           still updated by the caller */
      }
      return null;
    }
    // Network error / Strava outage — keep the tokens, let the user retry
    // manually. Returning the original tokens means we don't thrash on a
    // transient failure.
    return tokens;
  }
}

export async function clearStravaTokens(userId: string): Promise<void> {
  await deleteDoc(stravaDoc(userId));
}

// ─── Token refresh ────────────────────────────────────────────────────────────

export async function refreshStravaToken(
  userId: string,
  tokens: StravaTokens
): Promise<StravaTokens> {
  const res = await fetch(STRAVA_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CONFIG.clientId,
      client_secret: STRAVA_CONFIG.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    }),
  });
  const data = await res.json();
  // Strava returns 4xx + an errors array when the refresh token is
  // invalid (typically because the user revoked the app on strava.com).
  if (!res.ok || !data.access_token) {
    throw new StravaAuthError(
      data?.message ?? 'Strava refresh token is no longer valid'
    );
  }
  const updated: StravaTokens = {
    ...tokens,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
  await saveStravaTokens(userId, updated);
  return updated;
}

export async function getValidToken(
  userId: string,
  tokens: StravaTokens
): Promise<StravaTokens> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt - nowSec < 300) {
    return refreshStravaToken(userId, tokens);
  }
  return tokens;
}

// ─── Code exchange ────────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(
  userId: string,
  code: string
): Promise<StravaTokens> {
  const res = await fetch(STRAVA_CONFIG.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CONFIG.clientId,
      client_secret: STRAVA_CONFIG.clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (data.errors || !data.access_token) {
    throw new Error(data.message ?? 'Token exchange failed');
  }
  const tokens: StravaTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: data.athlete?.id,
    athleteName: `${data.athlete?.firstname ?? ''} ${data.athlete?.lastname ?? ''}`.trim(),
    athleteAvatar: data.athlete?.profile ?? '',
  };
  await saveStravaTokens(userId, tokens);
  return tokens;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function stravaGet<T>(
  endpoint: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${STRAVA_CONFIG.apiBase}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 401 means the token was revoked on Strava's side (user hit "Revoke
  // Access" in strava.com settings). Surface as a distinct error so the
  // caller can clear stored tokens instead of treating it like a network
  // blip.
  if (res.status === 401) {
    throw new StravaAuthError();
  }
  if (!res.ok) throw new Error(`Strava API ${res.status}: ${endpoint}`);
  return res.json() as Promise<T>;
}

// ─── Athlete & bikes ──────────────────────────────────────────────────────────

export async function fetchAthlete(accessToken: string): Promise<StravaAthlete> {
  return stravaGet<StravaAthlete>('/athlete', accessToken);
}

// ─── Activities ───────────────────────────────────────────────────────────────

export async function fetchActivitiesPage(
  accessToken: string,
  page: number,
  perPage = 100
): Promise<StravaActivity[]> {
  return stravaGet<StravaActivity[]>('/athlete/activities', accessToken, {
    page: String(page),
    per_page: String(perPage),
  });
}

/**
 * Fetches all activities since `afterTimestamp` (unix seconds) —
 * `afterTimestamp = 0` returns the user's complete activity history.
 *
 * Paginates automatically until Strava returns a short page. Returns
 * every activity, regardless of sport_type or gear tag — filtering and
 * attribution happen at the caller.
 */
export async function fetchActivitiesSince(
  accessToken: string,
  afterTimestamp: number
): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];
  let page = 1;
  while (true) {
    const params: Record<string, string> = {
      page: String(page),
      per_page: '100',
    };
    // `after=0` works but is noise on the wire — skip it so the first-run
    // backfill call looks like a plain history fetch in the request log.
    if (afterTimestamp > 0) params.after = String(afterTimestamp);
    const batch = await stravaGet<StravaActivity[]>(
      '/athlete/activities',
      accessToken,
      params
    );
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

/**
 * Convenience wrapper: fetches the user's complete cycling activity
 * history. Used by the one-time V2 migration to rebuild every bike's
 * totalDistance from scratch.
 */
export async function fetchAllCyclingActivities(
  accessToken: string
): Promise<StravaActivity[]> {
  const all = await fetchActivitiesSince(accessToken, 0);
  return all.filter(isCyclingActivity);
}

/**
 * Sum of km ridden on `bike` since `sinceMs` (unix milliseconds).
 *
 * Used when a component is added or edited with a back-dated
 * `installDate`. The naive `installDistance = bike.totalDistance` math
 * would mark the component as fitted at today's odometer, which already
 * includes any ride between `installDate` and today — so "Already
 * ridden" would show 0 even though the bike was clearly ridden during
 * the back-date window. Subtracting this value from the current bike
 * total puts `installDistance` at the bike's odometer reading on
 * `installDate`, and "Already ridden" correctly equals the km ridden
 * since the part went on.
 *
 * Returns 0 on any failure — callers should treat this as best-effort
 * correction layered on top of the manual "prior distance" input.
 */
export async function fetchKmRiddenOnBikeSince(
  accessToken: string,
  bike: Bike,
  sinceMs: number
): Promise<number> {
  try {
    const sinceSec = Math.floor(sinceMs / 1000);
    const activities = await fetchActivitiesSince(accessToken, sinceSec);
    let km = 0;
    for (const a of activities) {
      if (!isCyclingActivity(a)) continue;
      // Use the same attribution rules the sync uses, so a ride only
      // counts towards a bike under the same circumstances both code
      // paths agree on (gear_id match, then defaultActivity match).
      if (resolveBikeForActivity(a, [bike]) !== bike) continue;
      // Defensive: Strava's `after` filter is exclusive but its
      // resolution is seconds, so a ride that started in the same
      // second can leak in. Filter again on the millisecond timestamp.
      if (new Date(a.start_date).getTime() < sinceMs) continue;
      km += a.distance / 1000;
    }
    return km;
  } catch (e) {
    console.warn('fetchKmRiddenOnBikeSince failed, returning 0:', e);
    return 0;
  }
}

/**
 * Compute per-bike distance totals from Strava athlete bikes array.
 * Strava returns cumulative totals in meters.
 *
 * Defensive against an undefined/missing `bikes` field — the athlete
 * summary representation (returned when the token lacks profile:read_all)
 * has no bikes array at all, and we don't want that to throw.
 */
export function buildBikeDistanceMap(
  stravaBikes: StravaBike[] | undefined | null
): Record<string, number> {
  const map: Record<string, number> = {};
  if (!stravaBikes) return map;
  for (const b of stravaBikes) {
    map[b.id] = Math.round(b.distance / 1000); // convert to km
  }
  return map;
}
