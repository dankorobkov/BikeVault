# Wahoo integration — manual setup (test environment first)

BikeVault now supports **multiple linked data sources**. A user can link
Strava and Wahoo (and more later), but exactly **one is the *primary*
source** — the only provider whose activities advance bike odometers.
Switching primary keeps existing totals and only adds new rides going
forward.

The **code** for all of this is already done and type-checks. What's left
is the account/credential setup only you can do. Do it against the **test
build** first (`EXPO_PUBLIC_APP_ENV=test`), confirm it works, then repeat
the two values for production.

---

## What the code already does

- New Wahoo service, provider registry, store fields (`wahooTokens`,
  `primaryProvider`), sync cursor, and a `/wahoo-callback` route.
- Settings screen redesigned into a **Data Sources** section: per-provider
  Connect/Disconnect, a **Primary source** selector, and one Sync button
  that syncs whichever provider is primary.
- Strava's behaviour is unchanged — Wahoo is additive.
- Wahoo attribution is **by activity type only** (Wahoo has no per-bike
  gear tag), reusing the existing "Default Activities" mapping.

You do **not** need to touch Firestore rules — the existing recursive
rule under `users/{uid}` already permits the new `wahoo/tokens` doc.

---

## Step 1 — Create a Wahoo Cloud API app

1. Go to **https://developers.wahooligan.com/** and sign in with a Wahoo
   account (create one if needed).
2. Open the **Cloud API** section and **create a new application**.
3. Fill in the app details (name: e.g. "BikeVault (test)", description,
   your contact email).
4. Set the **redirect URIs** (add all of these — one per line if allowed):
   - `bikevault://wahoo-callback` — native app flow.
   - Your **web** callback, matching exactly how Strava's already works in
     this project. BikeVault serves the test build under a `/test/` base,
     so register the Wahoo equivalent of your Strava redirect, e.g.
     `https://bikevault-627f4.web.app/test/wahoo-callback` (test) and
     `https://bikevault-627f4.web.app/wahoo-callback` (prod).
   - ⚠️ The redirect URI must match **character-for-character**. Easiest
     check: look at what you registered for Strava and swap
     `strava-callback` → `wahoo-callback`.
5. Request scopes: **`user_read`**, **`workouts_read`**, **`offline_data`**.
   `offline_data` is required — without it Wahoo won't issue a refresh
   token and sync dies after ~2 hours.
6. Save. Copy the app's **Client ID** and **Client Secret**.

> Note on approval: like Strava, a brand-new Wahoo app may start with a
> limited number of connected athletes until Wahoo approves it for wider
> use. That's fine for testing with your own account.

---

## Step 2 — Add the credentials to `.env`

In the project root `.env`, replace the placeholders:

```
EXPO_PUBLIC_WAHOO_CLIENT_ID=<your Wahoo client id>
EXPO_PUBLIC_WAHOO_CLIENT_SECRET=<your Wahoo client secret>
```

(`.env.example` already documents these.) Until real values are present,
the Settings screen shows the Wahoo row with "Credentials missing" and the
Connect button disabled — so you can ship the UI safely before credentials
land.

Restart the dev server / rebuild so Expo picks up the new env vars
(`EXPO_PUBLIC_*` values are inlined at build time):

```
npx expo start -c        # -c clears the cache so new env is read
```

---

## Step 3 — Test the flow (test build)

1. Open the **test** app, sign in, go to **Settings → Data Sources**.
2. Tap **Connect** on the Wahoo row → authorize on Wahoo's consent screen
   (make sure the workouts permission is granted).
3. You should return to Settings with Wahoo showing **Connected** and the
   athlete's name.
4. If Strava wasn't connected, Wahoo becomes **primary** automatically. If
   both are linked, use the **Primary source** selector to choose which one
   feeds distances.
5. Tap **Sync Activities**. Record a Wahoo ride (or have one in history
   after the switch point) and sync again — the bike whose Default Activity
   matches the ride type should gain the distance.

### Expected behaviour to verify
- Switching primary **keeps** existing bike totals (no recompute); only new
  rides after the switch are added from the new source.
- Disconnecting the primary provider falls back to the other linked one (if
  any) so sync keeps working.
- A Wahoo token that loses the workouts scope surfaces a clear "reconnect
  Wahoo" message rather than a raw HTTP error.

---

## Step 4 — Promote to production

Once test looks good, add the **same two** `EXPO_PUBLIC_WAHOO_*` values to
your production environment/secrets and ensure the **prod** redirect URI
(`.../wahoo-callback` without `/test/`) is registered on the Wahoo app.
Deploy as usual (`npm run deploy`). No Firestore or rules changes needed.

---

## Known limitation (by design)

Wahoo's API has **no per-bike/gear tag** on workouts, so a Wahoo ride can
only be attributed to a bike by its **activity type** (one bike per type,
via Default Activities). If you have several bikes of the same type and
Wahoo is primary, rides land on whichever bike owns that activity type.
Strava (with gear tags) remains the more precise source for multi-bike,
same-type setups — which is exactly why linking both and choosing a primary
is useful.

To handle the leftovers, Settings → Data Sources has a **Wahoo catch-all
bike** picker (shown when Wahoo is linked). Any cycling workout that
doesn't match a bike by activity type — an unmapped type, or a same-type
collision — is credited to the bike you pick here instead of being dropped.
Tap the selected bike again to clear it (unmatched rides go back to being
skipped).
