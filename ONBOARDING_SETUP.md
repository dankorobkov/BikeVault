# Onboarding rollout — step-by-step setup

This guide walks through everything needed to turn the onboarding sequence on
in the **test** build. The code has already been wired in; what's left is the
package install, the Firestore flag doc, and a verification pass.

All paths are relative to the `BikeVault/` repo root.

---

## 1. Install the WebView package

The modal renders the bundled onboarding HTML through `react-native-webview`
on iOS/Android (web falls back to an `<iframe>`, no extra dependency).

```bash
npx expo install react-native-webview
```

Commit the resulting `package.json` / lockfile change. The next build will
pick up the native module — if you're on a dev client, rebuild it:

```bash
eas build --profile development --platform ios   # or android
```

If you're only testing on web for now, no native rebuild is needed.

---

## 2. Create the feature-flag document in Firestore

Open the Firebase console for the BikeVault project → **Firestore Database**.

Create a new collection called `config`, with a single document ID
`featureFlags`. Add two fields:

| Field                         | Type      | Value                                                         |
| ----------------------------- | --------- | ------------------------------------------------------------- |
| `onboardingVideoEnabled`      | boolean   | `false` (you'll flip to `true` in step 5, after verification) |
| `onboardingMinSignupTime`     | timestamp | Click **Now** — captures the rollout cutoff                   |

The cutoff timestamp is what protects your existing test users: only accounts
whose Firebase Auth `creationTime` is at or after this moment are eligible
for the onboarding. Existing users get nothing.

---

## 3. Lock down the flag doc with security rules

In **Firestore Database → Rules**, add the following block (anywhere inside
`service cloud.firestore` → `match /databases/{database}/documents`):

```
match /config/{flag} {
  allow read:  if request.auth != null;
  allow write: if false;
}
```

Reads are gated to signed-in users (so the client can fetch flags); writes
are blocked from the client entirely. You'll edit the flag from the Firebase
console, not from the app.

Click **Publish**.

---

## 4. Verify the wiring locally before flipping the flag

Run the app pointed at the test backend, signed in as any account that pre-dates
your cutoff (any existing tester). The modal should **not** appear — the cutoff
disqualifies them, and `onboardingVideoEnabled` is still `false` anyway.

Open Settings → About. You should see the **Watch onboarding** row. Tap it:
the modal opens, the Skip button is enabled immediately (this is "replay"
mode, no countdown), the HTML plays, and dismissing it does not write
anything to Firestore. This proves the bundled HTML loads correctly on your
device / browser.

If the modal stays black or the HTML doesn't render:

- **Native**: confirm `react-native-webview` is in `package.json` and that you
  rebuilt the dev client after installing it.
- **Web**: open DevTools, check the console for an `iframe sandbox` warning.
  Confirm `constants/onboardingHtml.ts` exists and is non-empty.

---

## 5. Turn on the first-time gate

Back in the Firebase console, flip `onboardingVideoEnabled` to `true`.

Then, in the app, sign up a **brand-new** Google account (or use the test
account flow with an unused invite code). The expected sequence:

1. Land on the invite-code screen, redeem a code, profile created.
2. Routed into the `(tabs)` group.
3. The modal opens full-screen, video starts, Skip shows `Skip in 5s`.
4. After 5 seconds, Skip becomes tappable.
5. After one full ~42-second cycle, Skip relabels to **Done**.
6. Tap Skip or Done — the modal closes; `hasSeenOnboarding: true` lands on
   the user's Firestore profile; the modal does not re-appear on this account.

Re-launch the app while still signed in — the modal should stay closed.

---

## 6. Confirm the replay path still works post-completion

For the same account that just completed onboarding, open Settings → About →
**Watch onboarding**. The modal opens in replay mode. Skip is enabled
immediately. Dismissing it does **not** clear `hasSeenOnboarding` — refresh
the user doc in Firestore to confirm the field stays `true`.

This proves the two entry points (first-time gate vs Settings) are properly
isolated.

---

## 7. Kill-switch and rollback

If anything misbehaves once the flag is on:

- **Kill switch**: flip `onboardingVideoEnabled` back to `false` in the
  Firestore console. Effective on next app boot — no shipping required. Users
  who haven't completed onboarding will simply never see it; users who have
  are unaffected.
- **Move the cutoff forward**: bump `onboardingMinSignupTime` to a future
  moment. New signups before that time become ineligible.
- **Reset a single user for testing**: in Firestore, open
  `users/{uid}` and set `hasSeenOnboarding: false` (or delete the field).
  Next time they enter `(tabs)`, the modal appears again.

---

## 8. Editing the HTML later

The onboarding HTML lives in `bikevault_onboarding.html` at the repo root
(the original mockup). The runtime constant is in
`constants/onboardingHtml.ts`, generated from that file.

If you edit the HTML and want the change to appear in the app:

```bash
node scripts/gen-onboarding-html.js
```

Then commit both files. Native users will get the change with the next
build; web users get it on next deploy.

---

## 9. Promoting to production

The rollout strategy in prod is identical to test:

1. In the **production** Firebase project, create the same `config/featureFlags`
   document with `onboardingVideoEnabled: false` and `onboardingMinSignupTime`
   set to the moment you want eligibility to begin.
2. Add the same security rule.
3. Verify on a fresh prod account as in step 4–6.
4. Flip `onboardingVideoEnabled` to `true`.

The `IS_PROD` branch in `app/_layout.tsx` already auto-creates user profiles
without an invite code, so production users will land in `(tabs)` immediately
after Google sign-in and see the modal there — exactly the slot we designed
for.

---

## Cleanup

There's a leftover artifact from the earlier MP4 approach. Remove it:

```bash
rm assets/onboarding.mp4
```

It's no longer referenced anywhere — the modal sources the bundled HTML.
