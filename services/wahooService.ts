import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { WAHOO_CONFIG } from '../config/wahoo';
import { StravaAuthError } from './stravaService';
import {
  wahooWorkoutTypeToActivityType,
  type StravaActivity,
  type WahooTokens,
  type WahooWorkout,
} from '../types';

/**
 * Wahoo Cloud API sync service.
 *
 * Deliberately mirrors `stravaService` so the two providers behave
 * symmetrically in `useSync` and the settings UI:
 *   - identical token-persistence shape (Firestore `users/{uid}/wahoo/tokens`)
 *   - the same `StravaAuthError` type on dead credentials, so callers'
 *     `instanceof StravaAuthError` branches work for either provider
 *   - the same retry-with-backoff wrapper for transient failures
 *
 * The one fundamental difference from Strava: **Wahoo has no per-bike
 * gear tag.** A workout can only be attributed to a bike by its activity
 * type, so every mapped activity here carries `gear_id: null` and relies
 * on the `defaultActivity` rule in `resolveBikeForActivity`.
 */

// ─── Firestore token persistence ─────────────────────────────────────────────

function wahooDoc(userId: string) {
  return doc(db, 'users', userId, 'wahoo', 'tokens');
}

export async function saveWahooTokens(userId: string, tokens: WahooTokens): Promise<void> {
  await setDoc(wahooDoc(userId), tokens);
}

export async function loadWahooTokens(userId: string): Promise<WahooTokens | null> {
  const snap = await getDoc(wahooDoc(userId));
  if (!snap.exists()) return null;
  return snap.data() as WahooTokens;
}

export async function clearWahooTokens(userId: string): Promise<void> {
  await deleteDoc(wahooDoc(userId));
}

// ─── Retry wrapper (same policy as stravaService.fetchWithRetry) ──────────────

const MAX_ATTEMPTS = 4;

function backoffMs(attempt: number): number {
  const base = 500 * Math.pow(2, attempt);
  const jitter = base * (Math.random() * 0.4 - 0.2);
  return Math.round(base + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeCall(method: string, endpoint: string, params?: Record<string, string>): string {
  if (!params) return `${method} ${endpoint}`;
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  return `${method} ${endpoint} (${qs})`;
}

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
      lastDetail = e instanceof Error ? e.message : String(e);
      if (attempt + 1 >= MAX_ATTEMPTS) {
        throw new Error(
          `Wahoo ${describe} failed after ${MAX_ATTEMPTS} attempts (${lastDetail})`
        );
      }
      await sleep(backoffMs(attempt));
      continue;
    }

    // 401 = token revoked/expired past refresh. Surface as auth error so
    // callers clear the stored connection.
    if (res.status === 401) {
      throw new StravaAuthError('Wahoo authorization is no longer valid');
    }

    // 403 = valid token, missing scope. Reconnect required.
    if (res.status === 403) {
      throw new StravaAuthError(
        'BikeVault can\'t read your Wahoo workouts. Reconnect Wahoo and grant workout access.'
      );
    }

    if (res.status === 429) {
      lastDetail = 'rate limited (429)';
      if (attempt + 1 >= MAX_ATTEMPTS) throw new Error(`Wahoo ${describe} ${lastDetail}`);
      const retryAfterSec = Number(res.headers.get('retry-after'));
      const wait =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? Math.min(retryAfterSec * 1000, 30_000)
          : backoffMs(attempt);
      await sleep(wait);
      continue;
    }

    if (res.status >= 500 && res.status < 600) {
      lastDetail = `HTTP ${res.status}`;
      if (attempt + 1 >= MAX_ATTEMPTS) throw new Error(`Wahoo ${describe} ${lastDetail}`);
      await sleep(backoffMs(attempt));
      continue;
    }

    if (!res.ok) {
      // Surface Wahoo's error body — a 400 on /oauth/token carries the real
      // reason (e.g. {"error":"invalid_grant"} for a redirect_uri/code
      // mismatch, or "invalid_client" for a bad secret). Without it the
      // dialog just says "HTTP 400" and we're guessing.
      let detail = '';
      try {
        const text = await res.text();
        if (text) detail = `: ${text.slice(0, 200)}`;
      } catch {
        /* body already consumed / unreadable */
      }
      throw new Error(`Wahoo ${describe} → HTTP ${res.status}${detail}`);
    }

    return res;
  }
  throw new Error(`Wahoo ${describe} retry budget exhausted (${lastDetail})`);
}

async function wahooGet<T>(
  endpoint: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${WAHOO_CONFIG.apiBase}${endpoint}`);
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

// ─── Token exchange & refresh ─────────────────────────────────────────────────

interface WahooUser {
  id: number;
  first?: string;
  last?: string;
  email?: string;
}

interface WahooTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  created_at?: number;
  errors?: unknown;
  error?: string;
}

function tokenExpiryFrom(data: WahooTokenResponse): number {
  const created =
    typeof data.created_at === 'number' ? data.created_at : Math.floor(Date.now() / 1000);
  // Wahoo access tokens live ~2h; default defensively if expires_in is absent.
  return created + (typeof data.expires_in === 'number' ? data.expires_in : 7200);
}

export async function fetchWahooUser(accessToken: string): Promise<WahooUser> {
  return wahooGet<WahooUser>('/user', accessToken);
}

/**
 * Exchange an authorization `code` for tokens. `redirectUri` MUST match
 * the one used in the authorize request — Wahoo validates it on exchange.
 */
export async function exchangeWahooCode(
  userId: string,
  code: string,
  redirectUri: string
): Promise<WahooTokens> {
  const res = await fetchWithRetry(
    WAHOO_CONFIG.tokenEndpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: WAHOO_CONFIG.clientId,
        client_secret: WAHOO_CONFIG.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    },
    describeCall('POST', '/oauth/token', { grant_type: 'authorization_code' })
  );
  const data = (await res.json()) as WahooTokenResponse;
  if (data.errors || data.error || !data.access_token || !data.refresh_token) {
    throw new Error('Wahoo token exchange failed');
  }

  let user: WahooUser | null = null;
  try {
    user = await fetchWahooUser(data.access_token);
  } catch {
    /* name is cosmetic — don't fail the whole link if /user hiccups */
  }
  const name = `${user?.first ?? ''} ${user?.last ?? ''}`.trim();

  const tokens: WahooTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: tokenExpiryFrom(data),
    athleteId: user?.id ?? 0,
    athleteName: name || user?.email || 'Wahoo athlete',
    athleteAvatar: '', // Wahoo has no profile photo field
  };
  await saveWahooTokens(userId, tokens);
  return tokens;
}

export async function refreshWahooToken(
  userId: string,
  tokens: WahooTokens
): Promise<WahooTokens> {
  let res: Response;
  try {
    res = await fetchWithRetry(
      WAHOO_CONFIG.tokenEndpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: WAHOO_CONFIG.clientId,
          client_secret: WAHOO_CONFIG.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
        }).toString(),
      },
      describeCall('POST', '/oauth/token', { grant_type: 'refresh_token' })
    );
  } catch (e) {
    if (e instanceof StravaAuthError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/HTTP 4\d\d/.test(msg)) {
      throw new StravaAuthError('Wahoo refresh token is no longer valid');
    }
    throw e;
  }
  const data = (await res.json()) as WahooTokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new StravaAuthError('Wahoo refresh token is no longer valid');
  }
  // Wahoo rotates BOTH tokens on refresh and revokes the old pair on the
  // next API call, so we must persist the new refresh_token too.
  const updated: WahooTokens = {
    ...tokens,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: tokenExpiryFrom(data),
  };
  await saveWahooTokens(userId, updated);
  return updated;
}

export async function getValidWahooToken(
  userId: string,
  tokens: WahooTokens
): Promise<WahooTokens> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (tokens.expiresAt - nowSec < 300) {
    return refreshWahooToken(userId, tokens);
  }
  return tokens;
}

/**
 * Boot-time probe: verify the stored Wahoo tokens still work and clear
 * them if not. Same contract as `validateStravaTokens`.
 */
export async function validateWahooTokens(
  userId: string,
  tokens: WahooTokens
): Promise<WahooTokens | null> {
  try {
    const valid = await getValidWahooToken(userId, tokens);
    await fetchWahooUser(valid.accessToken);
    return valid;
  } catch (e) {
    if (e instanceof StravaAuthError) {
      try {
        await clearWahooTokens(userId);
      } catch {
        /* swallow — local state cleared by caller */
      }
      return null;
    }
    return tokens; // transient — keep and let the user retry
  }
}

// ─── Activities ───────────────────────────────────────────────────────────────

/**
 * Map a Wahoo workout into the `StravaActivity` shape the rest of the
 * app already understands. This lets Wahoo rides flow through the exact
 * same `resolveBikeForActivity` / accumulation code as Strava, with two
 * Wahoo-specific facts baked in:
 *   - `gear_id: null` — Wahoo can't tag a bike, so attribution falls to
 *     the `defaultActivity` rule.
 *   - `type` — the mapped activity type (or '' for non-cycling, which
 *     `isCyclingActivity` then filters out).
 *   - `distance` — metres, parsed from `workout_summary.distance_accum`
 *     (0 when the workout has no summary, e.g. a planned-only entry).
 */
function mapWorkoutToActivity(w: WahooWorkout): StravaActivity {
  const distanceMeters = Number(w.workout_summary?.distance_accum ?? 0) || 0;
  const activityType = wahooWorkoutTypeToActivityType(w.workout_type_id);
  return {
    id: w.id,
    name: '',
    distance: distanceMeters,
    moving_time: (w.minutes ?? 0) * 60,
    start_date: w.starts,
    gear_id: null,
    type: activityType ?? '',
  };
}

interface WahooWorkoutsResponse {
  workouts?: WahooWorkout[];
}

/**
 * Fetch Wahoo workouts started after `afterSec` (unix seconds), newest
 * first, mapped into `StravaActivity` shape. `afterSec = 0` would return
 * the full history, but the sync path never asks for that — Wahoo uses
 * "keep totals, add new only", so the cursor is always a real timestamp.
 *
 * Wahoo returns workouts sorted by `starts` DESC and offers no `after`
 * query param, so we page from the newest and stop as soon as we cross
 * the cursor (everything past that point is older).
 */
export async function fetchWahooActivitiesSince(
  accessToken: string,
  afterSec: number
): Promise<StravaActivity[]> {
  const out: StravaActivity[] = [];
  const perPage = 200;
  let page = 1;
  while (true) {
    const data = await wahooGet<WahooWorkoutsResponse>('/workouts', accessToken, {
      page: String(page),
      per_page: String(perPage),
    });
    const batch = data.workouts ?? [];
    if (batch.length === 0) break;

    let reachedOld = false;
    for (const w of batch) {
      const startSec = Math.floor(new Date(w.starts).getTime() / 1000);
      if (afterSec > 0 && startSec <= afterSec) {
        reachedOld = true;
        continue;
      }
      out.push(mapWorkoutToActivity(w));
    }
    // Sorted DESC: once we've seen anything at/older than the cursor, the
    // remaining pages are all older too.
    if (reachedOld) break;
    if (batch.length < perPage) break;
    page++;
  }
  return out;
}
