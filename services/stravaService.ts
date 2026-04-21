import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { STRAVA_CONFIG } from '../config/strava';
import type { StravaAthlete, StravaActivity, StravaTokens, StravaBike } from '../types';

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
 * Fetches all activities since `afterTimestamp` (unix seconds).
 * Returns activities with valid gear_id only.
 */
export async function fetchActivitiesSince(
  accessToken: string,
  afterTimestamp: number
): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];
  let page = 1;
  while (true) {
    const batch = await stravaGet<StravaActivity[]>('/athlete/activities', accessToken, {
      after: String(afterTimestamp),
      page: String(page),
      per_page: '100',
    });
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return all;
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
