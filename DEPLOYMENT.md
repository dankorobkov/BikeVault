# BikeVault deployment

BikeVault runs as **two apps on one domain**, sharing the same Firebase project (same auth, same Firestore data):

| URL                              | Branch       | `EXPO_PUBLIC_APP_ENV` | Invite-code gate |
| -------------------------------- | ------------ | --------------------- | ---------------- |
| `https://bikevault-627f4.web.app/`      | `production` | `prod`                | Off              |
| `https://bikevault-627f4.web.app/test/` | `test`       | `test`                | On               |

Replace `bikevault-627f4.web.app` with your actual hosting domain (custom domain or default `<project>.web.app`).

## How it works

Both bundles get built and deployed together to a **single Firebase Hosting site**:
- Prod bundle lives at `dist/` (root).
- Test bundle lives at `dist/test/`, built with `--base-url /test` so its asset URLs resolve correctly under the subpath.
- `firebase.json` rewrites `/test/**` to `/test/index.html` (test SPA), everything else to `/index.html` (prod SPA).

The `EXPO_PUBLIC_APP_ENV` variable is read at build time in `app/_layout.tsx`:
- `prod` → invite-code screen is skipped; profile is auto-created on first sign-in with `signupCode: 'PROD-AUTO'`.
- `test` (default) → existing invite-code flow.

## Workflow

**Day-to-day: push to `test`.** Every push to the `test` branch triggers a redeploy. The test app at `/test/` updates; the prod app at `/` rebuilds from its branch tip (unchanged content).

**Promoting to prod: PR `test` → `production`.** When test changes are ready for real users:

```bash
git checkout production
git merge test
git push origin production
```

Or via GitHub PR (preferred — easier to roll back). Pushing to `production` triggers the same workflow; the prod side rebuilds with the new code.

**Rollback.** Revert the merge commit on `production` and push; the workflow redeploys the previous prod state.

## Local builds & deploys

```bash
npm run build:prod    # builds dist/ with EXPO_PUBLIC_APP_ENV=prod
npm run build:test    # builds dist/test/ with EXPO_PUBLIC_APP_ENV=test, --base-url /test
npm run build:all     # both, in the right order
npm run deploy        # firebase deploy --only hosting (no rebuild)
npm run deploy:all    # build:all then deploy
```

For local builds, `EXPO_PUBLIC_APP_ENV` in `.env` is overridden by the script inline.

## One-time GitHub setup

1. **Branches.** Push `test` and `production` branches; set `test` as the default branch (Settings → Branches).
2. **Branch protection on `production`.** Settings → Branches → Add rule: require PR before merging, no direct pushes.
3. **Secrets** (Settings → Secrets and variables → Actions → New repository secret):
   - `FIREBASE_SERVICE_ACCOUNT_BIKEVAULT` — JSON key for a Firebase service account with Hosting deploy permission. Generate at Firebase Console → Project Settings → Service accounts → Generate new private key. Paste the entire JSON as the secret value.
   - `DOTENV` — full contents of your local `.env`. Paste it raw. The workflow writes it to `.env` before each build so `EXPO_PUBLIC_FIREBASE_*` etc. get baked into the bundle.

## One-time Firebase setup

Nothing — the existing hosting site, Firestore database, and rules are reused as-is.

## Verification

After first deploy:
- Visit `/` → no invite-code gate, can sign in directly.
- Visit `/test/` → invite-code gate shows after Google sign-in (private beta behavior).
- Sign in with the same account on both → same garage, same bikes, same Strava connection. Confirms shared database.
