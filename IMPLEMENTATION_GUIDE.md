# BikeVault — implementation guide: Strava 403 fix + Wahoo multi‑source

This walks through every change made, in the order to make them. Three
phases, each independently shippable:

1. **Strava 403 fix** — stop the "Sync failed → HTTP 403" dead‑end.
2. **Wahoo multi‑source** — link multiple providers, pick one primary.
3. **Wahoo catch‑all bike** — a fallback bike for un‑attributable Wahoo rides.

Conventions used below: paths are repo‑relative; "add" means insert new
code, "change" means edit existing. After each phase, run
`npx tsc --noEmit` — everything should stay green.

---

## Phase 0 — Prerequisites / context

- Stack: Expo Router + React Native (web target), Zustand store, Firebase
  (Auth + Firestore).
- Strava logic lives in `services/stravaService.ts`; sync orchestration in
  `hooks/useSync.ts`; per‑user cursor/flags in
  `services/syncStateService.ts`; UI in `app/(tabs)/settings.tsx`.
- **No Firestore rules change is needed** anywhere in this work — the
  existing recursive rule under `users/{uid}` already covers the new
  `wahoo/tokens` doc and the extra `syncState` fields.

---

## Phase 1 — Strava 403 fix

**Problem.** A `GET /athlete/activities` returning **403** fell into the
generic "other 4xx" branch of `fetchWithRetry`, which threw
`Strava … → HTTP 403` and did nothing else. Unlike a 401 it never cleared
tokens or guided a reconnect, so the app stayed "Connected" and 403'd on
every sync. The 403 body — the only thing that says *why* — was discarded.

### Step 1.1 — Handle 403 explicitly in `fetchWithRetry`

File: `services/stravaService.ts`. In `fetchWithRetry`, **before** the
generic `if (!res.ok)` branch, add:

```ts
// 403 = valid token, forbidden resource. Read the body — it's the only
// thing that says WHY (missing scope vs. connected-athlete limit).
if (res.status === 403) {
  let body: { message?: string; errors?: Array<{ field?: string; code?: string }> } | null =
    null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body — fall through to the generic message */
  }
  const missingScope = body?.errors?.some(
    (err) => err?.field?.includes('read_permission') || err?.code === 'missing'
  );
  if (missingScope) {
    // Same class of problem as a revoked token → route to reconnect.
    throw new StravaAuthError(
      'BikeVault can\'t read your Strava activities. Reconnect Strava and allow "View data about your activities".'
    );
  }
  const detail = body?.message ? `: ${body.message}` : '';
  throw new Error(`Strava ${describe} → HTTP 403${detail}`);
}
```

Why: a missing‑scope 403 now becomes a `StravaAuthError`, which `useSync`
already catches to clear the token and prompt reconnect. Any other 403
(e.g. an unapproved app's "connected athletes exceeded") surfaces Strava's
real message instead of a bare status code.

Run `npx tsc --noEmit`. Ship.

---

## Phase 2 — Wahoo multi‑source

Goal: let a user link Strava **and** Wahoo, and choose exactly one
**primary** source that feeds bike odometers. Switching primary keeps
existing totals and only adds new rides going forward. Strava's runtime
behaviour stays identical; Wahoo is additive behind a small provider layer.

Key API facts that shape the design (Wahoo Cloud API):
- OAuth 2.0. Authorize `https://api.wahooligan.com/oauth/authorize`, token
  `…/oauth/token`. Scopes are **space‑separated** (standard). Need
  `user_read workouts_read offline_data` (`offline_data` → refresh token).
- Token exchange requires `redirect_uri`; refresh **rotates both** tokens.
- Workouts: `GET /v1/workouts` (page‑based, newest first). Distance is in
  `workout_summary.distance_accum` **metres**; cycling identified by
  `workout_type_id` in the BIKING family.
- **No per‑bike/gear tag** — attribution is by activity type only.

### Step 2.1 — Types (`types/index.ts`)

After the `StravaTokens` interface, add:

- `export type ProviderId = 'strava' | 'wahoo';`
- `WahooTokens` (mirrors `StravaTokens`; `athleteAvatar` always `''`).
- `WahooWorkout` (only `id`, `starts`, `minutes`, `workout_type_id`,
  `workout_summary.distance_accum`).
- `WAHOO_CYCLING_WORKOUT_TYPE_IDS` = `new Set([0,11,12,13,14,15,16,17,49,61,64,68,70])`
  and `isWahooCyclingWorkout(w)`.
- `wahooWorkoutTypeToActivityType(id): StravaActivityType | null` — maps
  BIKING types onto the existing bike activity enum (mtb→MountainBikeRide,
  cyclecross→GravelRide, ebike→EBikeRide, indoor/virtual→VirtualRide, rest→Ride).

### Step 2.2 — Wahoo config (`config/wahoo.ts`, new)

Mirror `config/strava.ts`:

```ts
export const WAHOO_CONFIG = {
  clientId: process.env.EXPO_PUBLIC_WAHOO_CLIENT_ID ?? '',
  clientSecret: process.env.EXPO_PUBLIC_WAHOO_CLIENT_SECRET ?? '',
  authEndpoint: 'https://api.wahooligan.com/oauth/authorize',
  tokenEndpoint: 'https://api.wahooligan.com/oauth/token',
  apiBase: 'https://api.wahooligan.com/v1',
  scopes: ['user_read', 'workouts_read', 'offline_data'],
};
```

### Step 2.3 — Wahoo service (`services/wahooService.ts`, new)

Mirror the *shape* of `stravaService.ts` so both providers behave
symmetrically. Include:

- Token persistence at `users/{uid}/wahoo/tokens`
  (`saveWahooTokens` / `loadWahooTokens` / `clearWahooTokens`).
- A `fetchWithRetry` copy with the same backoff, **reusing** the existing
  `StravaAuthError` (import it) so `useSync`'s `instanceof` checks work for
  both providers. Map Wahoo **401 → StravaAuthError**, **403 → StravaAuthError**
  (missing scope), 429/5xx → retry.
- `exchangeWahooCode(userId, code, redirectUri)` — form‑encoded POST with
  `grant_type=authorization_code`; then `GET /v1/user` for the name;
  compute `expiresAt = created_at + expires_in`.
- `refreshWahooToken` — `grant_type=refresh_token`; **persist the new
  refresh_token** (Wahoo rotates it).
- `getValidWahooToken` (refresh when <5 min left) and `validateWahooTokens`
  (probe `/v1/user`; clear on `StravaAuthError`).
- `fetchWahooActivitiesSince(accessToken, afterSec)` — page `/v1/workouts`
  newest‑first, stop once you cross the cursor, and **map each workout into
  the existing `StravaActivity` shape**:

```ts
function mapWorkoutToActivity(w: WahooWorkout): StravaActivity {
  const distanceMeters = Number(w.workout_summary?.distance_accum ?? 0) || 0;
  const activityType = wahooWorkoutTypeToActivityType(w.workout_type_id);
  return {
    id: w.id, name: '', distance: distanceMeters,
    moving_time: (w.minutes ?? 0) * 60, start_date: w.starts,
    gear_id: null,                 // Wahoo has no gear tagging
    type: activityType ?? '',      // '' → filtered out by isCyclingActivity
  };
}
```

This reuse is the crux: Wahoo rides now flow through the *same*
`resolveBikeForActivity` + accumulation code as Strava.

### Step 2.4 — Provider registry (`services/providers/registry.ts`, new)

A network‑free descriptor map the UI loops over:

```ts
export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  strava: { id:'strava', displayName:'Strava', brandColor:'#FC4C02',
    icon:'fitness-outline', callbackPath:'strava-callback', …,
    isConfigured: !!STRAVA_CONFIG.clientId && STRAVA_CONFIG.clientId !== 'your_strava_client_id',
    scopeParam: [STRAVA_CONFIG.scopes.join(',')],   // Strava: comma-joined
    tagline: 'Rides, gear tags & full history' },
  wahoo:  { id:'wahoo', displayName:'Wahoo', brandColor:'#2C6BED',
    icon:'speedometer-outline', callbackPath:'wahoo-callback', …,
    isConfigured: !!WAHOO_CONFIG.clientId && WAHOO_CONFIG.clientId !== 'your_wahoo_client_id',
    scopeParam: WAHOO_CONFIG.scopes,                 // Wahoo: space-separated
    tagline: 'ELEMNT & KICKR workouts' },
};
export const PROVIDER_ORDER: ProviderId[] = ['strava', 'wahoo'];
```

### Step 2.5 — Sync state (`services/syncStateService.ts`)

- Add to `SyncState`: `primaryProvider?: ProviderId` and
  `wahooLastActivityStart?: number` (Wahoo's own cursor; `lastActivityStart`
  stays the Strava cursor for back‑compat). Parse both in `loadSyncState`.
- Change `saveSyncState`'s param to `Partial<SyncState>` (it already
  merge‑writes) so partial cursor updates are cheap.
- Add helper `savePrimaryProvider(userId, provider, seedWahooCursorSec?)` —
  when switching **to Wahoo**, pass `seedWahooCursorSec = now` so we start
  counting from the switch point ("keep totals, add new only").

### Step 2.6 — Store (`store/useAppStore.ts`)

Add state `wahooTokens: WahooTokens | null`, `primaryProvider: ProviderId`
(default `'strava'`), plus setters `setWahooTokens` / `setPrimaryProvider`.
Reset both in `signOut`. (Keep `stravaTokens` exactly as is.)

### Step 2.7 — Boot loader (`app/_layout.tsx`)

In the post‑auth data load, add `loadWahooTokens(uid)` and `loadSyncState(uid)`
to the `Promise.all`, then:

```ts
setPrimaryProvider(syncState.primaryProvider ?? 'strava');
if (wahooTokens) {
  setWahooTokens(wahooTokens);
  validateWahooTokens(uid, wahooTokens).then(v => { if (!v) setWahooTokens(null); … });
}
```

(Mirror the existing optimistic‑then‑validate pattern used for Strava.)

### Step 2.8 — Sync hook (`hooks/useSync.ts`)

Refactor so the exported `syncStrava` syncs **the primary provider**
(name kept to avoid touching callers):

- Extract the current Strava body verbatim into `runStravaSync` (migration
  on schema bump, else incremental) — **unchanged behaviour**.
- Add `runWahooSync`: get a valid Wahoo token; read `wahooLastActivityStart`;
  if unseeded, seed to `now` and return (add‑new‑only); else run a shared
  incremental helper. Catch `StravaAuthError` → clear Wahoo + reconnect msg.
- Add `runProviderIncrementalSync({ fetchSince, cursor, persistCursor, … })`
  — the same attribute‑and‑accumulate loop as Strava's incremental, but
  parameterised over fetch + cursor so any provider can reuse it.
- `syncStrava` now branches on `primaryProvider`, wraps in the
  `setIsSyncing` / `setLastSyncAt` bookkeeping, and no‑ops if the primary
  provider isn't linked.

### Step 2.9 — Web callback route (`app/wahoo-callback.tsx`, new)

Copy `app/strava-callback.tsx`; swap in `exchangeWahooCode(userId, code,
redirectUri)` where `redirectUri = AuthSession.makeRedirectUri({ scheme:
'bikevault', path: 'wahoo-callback' })` (must match the authorize request).
If Strava isn't linked, make Wahoo primary + seed the cursor. Expo Router
auto‑registers the route from the filename — no manual wiring.

### Step 2.10 — Settings redesign (`app/(tabs)/settings.tsx`)

Replace the single **STRAVA** section with a **DATA SOURCES** section:

- Add a second `AuthSession.useAuthRequest` for Wahoo (space‑separated
  scopes, `wahoo-callback` redirect) alongside the existing Strava one, and
  a native `wahooResponse` effect mirroring the Strava one.
- Generic handlers: `handleConnectProvider(id)`, `handleDisconnectProvider(id)`
  (falls primary back to the other linked provider), `handleSetPrimary(id)`
  (persists + seeds Wahoo cursor + re‑syncs).
- UI: a **Primary source** segmented selector (only linked providers
  selectable), one **Sync** row, and one row per provider (Connected +
  athlete / Disconnect, or a Connect button / "Credentials missing"). Note
  under the selector when Wahoo is primary that attribution is by type.
- Broaden the pull‑to‑refresh guard and the cross‑tab BroadcastChannel
  handler to consider both providers.

### Step 2.11 — Other on‑focus sync guards

In `app/(tabs)/index.tsx` and `app/(tabs)/garage.tsx`, change the
pull‑to‑refresh check `if (stravaTokens)` → `if (stravaTokens || wahooTokens)`
(and add `wahooTokens` to the store destructure).

### Step 2.12 — Env vars

Add to `.env` and `.env.example`:

```
EXPO_PUBLIC_WAHOO_CLIENT_ID=your_wahoo_client_id
EXPO_PUBLIC_WAHOO_CLIENT_SECRET=your_wahoo_client_secret
```

Then run `npx tsc --noEmit`. The account/credential setup (creating the
Wahoo app, redirect URIs, scopes) is in **`WAHOO_SETUP.md`**.

---

## Phase 3 — Wahoo catch‑all bike

**Problem.** Because Wahoo rides carry no gear tag, a cycling workout that
matches no bike's default activity (unmapped type, or several bikes share a
type) attributes to nothing and is dropped. Fix: an optional user‑chosen
"catch‑all" bike claims those rides.

### Step 3.1 — Sync state (`services/syncStateService.ts`)

Add `wahooDefaultBikeId?: string | null` to `SyncState`; parse it in
`loadSyncState` (default `null`); add `saveWahooDefaultBike(userId, bikeId)`.

### Step 3.2 — Store (`store/useAppStore.ts`)

Add `wahooDefaultBikeId: string | null` (default `null`) + setter; reset in
`signOut`.

### Step 3.3 — Boot loader (`app/_layout.tsx`)

`setWahooDefaultBikeId(syncState.wahooDefaultBikeId ?? null);`

### Step 3.4 — Apply the fallback (`hooks/useSync.ts`)

Give `runProviderIncrementalSync` an optional `fallbackBikeId`, and change
the attribution line to fall through only for cycling rides that match
nothing:

```ts
const fallbackBike = fallbackBikeId != null
  ? bikes.find((b) => b.id === fallbackBikeId) ?? null : null;
// …inside the loop:
const bike = resolveBikeForActivity(a, bikes) ?? fallbackBike;
```

Pass `fallbackBikeId: wahooDefaultBikeId` from `runWahooSync` only (Strava
keeps precise, tag‑based attribution — no catch‑all).

### Step 3.5 — Settings picker (`app/(tabs)/settings.tsx`)

When Wahoo is linked and there are bikes, render a **Wahoo catch‑all bike**
chip row (one chip per bike). `handleSetWahooDefaultBike(bikeId)` toggles
the selection (tap the active one to clear) and persists via
`saveWahooDefaultBike`. Off by default → no behaviour change until a bike
is picked.

Run `npx tsc --noEmit`.

---

## Verification checklist

- [ ] `npx tsc --noEmit` is clean after each phase.
- [ ] Strava: revoke/scope‑strip a token → sync shows a reconnect prompt,
      not a raw `HTTP 403`.
- [ ] Wahoo: Connect → shows athlete + Connected; primary selector works;
      Sync credits the right bike; switching primary keeps totals.
- [ ] Disconnecting the primary falls back to the other linked source.
- [ ] Catch‑all: set a bike, record a Wahoo ride of an unowned type → it
      lands on that bike; clear it → such rides are skipped again.

## File change summary

| File | Phase | Change |
| --- | --- | --- |
| `services/stravaService.ts` | 1 | 403 handler in `fetchWithRetry` |
| `types/index.ts` | 2 | Provider/Wahoo types + workout mapping |
| `config/wahoo.ts` | 2 | new — Wahoo OAuth config |
| `services/wahooService.ts` | 2 | new — Wahoo OAuth + workouts fetch |
| `services/providers/registry.ts` | 2 | new — provider descriptors |
| `services/syncStateService.ts` | 2,3 | primary + cursors + catch‑all field |
| `store/useAppStore.ts` | 2,3 | wahooTokens, primaryProvider, catch‑all |
| `app/_layout.tsx` | 2,3 | boot‑load + validate Wahoo, primary, catch‑all |
| `hooks/useSync.ts` | 2,3 | primary‑driven sync + shared incremental + fallback |
| `app/wahoo-callback.tsx` | 2 | new — web OAuth callback |
| `app/(tabs)/settings.tsx` | 2,3 | Data Sources UI + catch‑all picker |
| `app/(tabs)/index.tsx`, `garage.tsx` | 2 | broaden refresh guard |
| `.env`, `.env.example` | 2 | Wahoo env vars |

See **`WAHOO_SETUP.md`** for the one‑time Wahoo account/credential setup you
have to do by hand.
