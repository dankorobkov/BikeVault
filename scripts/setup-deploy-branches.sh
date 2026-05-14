#!/usr/bin/env bash
# One-time setup: commit the test/prod-split changes, push main as a safety
# snapshot, then create `test` and `production` branches both pointing at the
# same commit. After this runs you'll do the GitHub-side default-branch +
# protection + secrets steps.
#
# Run from repo root:  bash scripts/setup-deploy-branches.sh

set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Clean up any stale lock file (from earlier sandbox attempts).
if [ -f .git/index.lock ]; then
  echo "Removing stale .git/index.lock…"
  rm -f .git/index.lock
fi

# 2. Drop the firebase hosting cache change — it's a build artifact, not code.
git checkout -- .firebase/hosting.ZGlzdA.cache 2>/dev/null || true

# 3. Stage all the env-split changes (idempotent — already-staged files are fine).
git add \
  .env.example \
  app/_layout.tsx \
  firebase.json \
  package.json \
  .github/ \
  DEPLOYMENT.md \
  scripts/setup-deploy-branches.sh

# 4. Commit (skip if nothing to commit — re-running is safe).
if ! git diff --cached --quiet; then
  git commit -m "feat: split into test (gated) and prod (open) environments

- Read EXPO_PUBLIC_APP_ENV in AuthGate; prod auto-creates profile and skips
  invite gate. Test path unchanged.
- firebase.json: /test/** rewrites to dist/test/index.html; everything else
  goes to dist/index.html.
- Add build:prod, build:test, build:all, deploy, deploy:all npm scripts.
  Test bundle is built with --base-url /test so its assets resolve under
  the subpath.
- .github/workflows/deploy.yml: on push to test or production, checks out
  both branches, builds each into its slot, deploys combined dist/.
- DEPLOYMENT.md documents workflow and one-time setup."
else
  echo "Nothing to commit (already committed)."
fi

# 5. Push current branch (main) as a safety snapshot.
echo "Pushing current branch…"
git push origin HEAD

# 6. Create test and production branches at the same commit. Skip if exist.
git rev-parse --verify test >/dev/null 2>&1 || git branch test
git rev-parse --verify production >/dev/null 2>&1 || git branch production

# 7. Push both with upstream set.
git push -u origin test
git push -u origin production

echo ""
echo "✅ Branches set up. Next steps on GitHub:"
echo "  1. Settings → Branches → Default branch → switch to 'test'"
echo "  2. Settings → Branches → Add rule for 'production': require PR before merging"
echo "  3. Settings → Secrets and variables → Actions:"
echo "       FIREBASE_SERVICE_ACCOUNT_BIKEVAULT  (paste JSON key)"
echo "       DOTENV                              (paste full .env contents)"
echo ""
echo "After 'test' is the default, you can optionally delete old 'main' on"
echo "GitHub from the Branches page."
