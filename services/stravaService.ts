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
  // Token refresh is the gateway for every other Strava call — if it
  // dies on a transient network blip, the entire sync flow fails before
  // it even starts. Use the same retry-with-backoff wrapper as
  // stravaGet so a single Safari "Load failed" doesn't bubble out as
  // "Sync failed: Load failed".
  //
  // Body format is `application/x-www-form-urlencoded` (Strava's
  // documented format), not JSON. Critically, form-encoded is a
  // CORS-simple Content-Type, which means the browser sends the POST
  // directly. JSON forces a preflight OPTIONS round-trip that iOS
  // Safari drops with "Load failed" on weak / low-power connections —
  // exactly the symptom this whole change is fixing.
  let res: Response;
  try {
    res = await fetchWithRetry(
      STRAVA_CONFIG.tokenEndpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: STRAVA_CONFIG.clientId,
          client_secret: STRAVA_CONFIG.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
        }).toString(),
      },
      describeCall('POST', '/oauth/token', { grant_type: 'refresh_token' })
    );
  } catch (e) {
    // fetchWithRetry already converts a 4xx into an Error with HTTP
    // context. The OAuth endpoint specifically returns 4xx for revoked
    // refresh tokens — translate those into StravaAuthError so callers
    // clear the stored tokens. Network/5xx errors stay as plain Errors.
    if (e instanceof StravaAuthError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/HTTP 4\d\d/.test(msg)) {
      throw new StravaAuthError('Strava refresh token is no longer valid');
    }
    throw e;
  }
  const data = await res.json();
  // Belt-and-braces: even on a 200 the body might omit access_token if
  // Strava's API contract changed. Treat that as auth failure too.
  if (!data.access_token) {
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
  // Same form-encoded + retry treatment as refreshStravaToken — this
  // endpoint hits the same iOS Safari preflight issue when the OAuth
  // callback POSTs the auth code back to Strava.
  const res = await fetchWithRetry(
    STRAVA_CONFIG.tokenEndpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: STRAVA_CONFIG.clientId,
        client_secret: STRAVA_CONFIG.clientSecret,
        code,
        grant_type: 'authorization_code',
      }).toString(),
    },
    describeCall('POST', '/oauth/token', { grant_type: 'authorization_code' })
  );
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

/**
 * How many times to attempt a single Strava API call before giving up.
 * Each retry waits `backoffMs(attempt)` (with jitter) — roughly 0.5s,
 * 1s, 2s, 4s. Total worst-case wall time per call: ~7.5s.
 *
 * Why we need retries at all: Safari (and to a lesser extent iOS
 * WebView) drops `fetch()` connections under load with the bare error
 * message "Load failed". With Firestore long-polling running in
 * parallel, a 20+ page activity backfill is almost guaranteed to hit
 * one such drop, which would kill the whole migration before retries.
 */
const MAX_ATTEMPTS = 4;

function backoffMs(attempt: number): number {
  // 500ms · 2^attempt with ±20% jitter so concurrent calls don't all
  // wake up at the same instant after a shared upstream blip.
  const base = 500 * Math.pow(2, attempt);
  const jitter = base * (Math.random() * 0.4 - 0.2);
  return Math.round(base + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Format a call for error messages: "GET /athlete/activities (page=7, per_page=100)". */
function describeCall(method: string, endpoint: string, params?: Record<string, string>): string {
  if (!params) return `${method} ${endpoint}`;
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  return `${method} ${endpoint} (${qs})`;
}

/**
 * Run a fetch with retry-on-transient-failure.
 *
 * Retries on:
 *   - Network errors (`fetch` throwing — covers Safari "Load failed",
 *     DNS, TLS, dropped connections)
 *   - HTTP 429 (rate limited — honors Retry-After header if present)
 *   - HTTP 5xx (transient server errors)
 *
 * Does NOT retry on:
 *   - HTTP 401 — surfaces as `StravaAuthError` so callers can clear
 *     the stored tokens instead of treating it like a network blip
 *   - Other HTTP 4xx — these are deterministic client errors, retrying
 *     won't help. Re-thrown with the call signature for context
 *
 * On exhaustion, throws an Error whose message includes the endpoint,
 * params, attempt count, and the underlying failure — far more useful
 * than the bare browser "Load failed" the old wrapper surfaced.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  describe: string
): Promise<Response> {
  let lastDetail = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (e) {
      // Network-level failure — retry until budget runs out.
      lastDetail = e instanceof Error ? e.message : String(e);
      if (attempt + 1 >= MAX_ATTEMPTS) {
        throw new Error(
          `Strava ${describe} failed after ${MAX_ATTEMPTS} attempts (${lastDetail})`
        );
      }
      await sleep(backoffMs(attempt));
      continue;
    }

    // 401 = token revoked. Don't retry.
    if (res.status === 401) {
      throw new StravaAuthError();
    }

    // 429 = rate limited. Respect Retry-After if Strava sent one,
    // otherwise fall back to exponential backoff. Capped at 30s so a
    // mis-configured upstream can't park us forever.
    if (res.status === 429) {
      lastDetail = 'rate limited (429)';
      if (attempt + 1 >= MAX_ATTEMPTS) {
        throw new Error(`Strava ${describe} ${lastDetail}`);
      }
      const retryAfterSec = Number(res.headers.get('retry-after'));
      const wait =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? Math.min(retryAfterSec * 1000, 30_000)
          : backoffMs(attempt);
      await sleep(wait);
      continue;
    }

    // 5xx = transient server error.
    if (res.status >= 500 && res.status < 600) {
      lastDetail = `HTTP ${res.status}`;
      if (attempt + 1 >= MAX_ATTEMPTS) {
        throw new Error(`Strava ${describe} ${lastDetail}`);
      }
      await sleep(backoffMs(attempt));
      continue;
    }

    // Other 4xx = client error, surface with context (don't retry).
    if (!res.ok) {
      throw new Error(`Strava ${describe} → HTTP ${res.status}`);
    }

    return res;
  }
  // Unreachable — every path inside the loop either returns or throws,
  // but TypeScript can't see that.
  throw new Error(`Strava ${describe} retry budget exhausted (${lastDetail})`);
}

async function stravaGet<T>(
  endpoint: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${STRAVA_CONFIG.apiBase}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetchWithRetry(
    url.toString(),
    { headers: { Authorization: `Bearer ${accessToken}` } },
    describeCall('GET', endpoint, params)
  );
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
 * Derive both the bike's current total distance AND the distance it
 * had on its odometer at `installDate` from a single pass over the
 * full activity history.
 *
 * Used when a component is added or edited with a back-dated
 * installDate. Deriving both values from the same activity set means:
 *   - The install anchor is exactly the bike's odometer reading on
 *     installDate (sum of km on the bike with start_date < installDate).
 *   - The bike total is brought fully up to date in the same call, so
 *     "Already ridden" = totalDistance − installDistance can't
 *     double-count a ride that was also landing through an incremental
 *     sync.
 *
 * **Attribution must match the migration.** `resolveBikeForActivity`
 * runs gear-id match first, then falls back to `defaultActivity`. If
 * we pass only the target bike here, an activity gear-tagged to a
 * *different* bike fails the gear match and falls through to the
 * default-activity rule — and if its sport_type happens to be this
 * bike's default activity, it gets falsely attributed here. Result:
 * an inflated total, plus a back-dated installDistance that doesn't
 * match what `useSync.runMigration` would compute. Passing all of the
 * user's bikes lets the gear match steal those activities away to
 * their real owners, so the snapshot agrees with the migration to the
 * kilometre.
 *
 * Returns `null` on any failure — callers should fall back to
 * whatever values they had and try again on the next sync. Failing
 * closed is safer than returning partial numbers that could be
 * persisted as truth.
 */
export async function fetchBikeOdometerSnapshot(
  accessToken: string,
  bike: Bike,
  allBikes: Bike[],
  installDate: number
): Promise<{ totalDistance: number; installDistance: number } | null> {
  try {
    const activities = await fetchAllCyclingActivities(accessToken);
    let total = 0;
    let before = 0;
    // Attribute against the full bike list so gear-tagged rides on
    // other bikes are claimed by their real owner instead of falling
    // through to a defaultActivity match on this bike.
    for (const a of activities) {
      const owner = resolveBikeForActivity(a, allBikes);
      if (!owner || owner.id !== bike.id) continue;
      const km = a.distance / 1000;
      total += km;
      if (new Date(a.start_date).getTime() < installDate) {
        before += km;
      }
    }
    return {
      totalDistance: Math.round(total),
      installDistance: Math.round(before),
    };
  } catch (e) {
    console.warn('fetchBikeOdometerSnapshot failed:', e);
    return null;
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
