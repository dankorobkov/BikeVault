# BikeVault — Theme + Icon update

A step-by-step guide for rolling out the new Carbon × Signal theme system, the Apex 28-icon set, and the new app icon. Follow it top to bottom; the whole thing should take about 15 minutes.

---

## 0. Before you start

Open a terminal in the project root:

```bash
cd ~/Documents/Claude/Projects/BikeVault
```

Commit your current state so you can roll back if anything looks off:

```bash
git add -A
git commit -m "snapshot before theme + icon update"
```

If you want to inspect the design before flipping the switch, open the live preview in a browser:

```bash
open theme-preview.html
```

Toggle **Dark** / **Light** in the top-right and scroll through the swatches, the 28 icons, and the Settings → Appearance mockup.

---

## 1. Install the new dependency

The Apex icons render via `react-native-svg`, which has been added to `package.json` but is not yet in `node_modules`. Install it the Expo-aware way so the version stays compatible with your SDK:

```bash
npx expo install react-native-svg
```

If you prefer plain npm:

```bash
npm install
```

You should see `react-native-svg@15.12.x` resolved. Nothing else needs installing — `@react-native-async-storage/async-storage` (used by the persisted theme) was already on your dependency list.

---

## 2. Type-check

Confirm the refactor compiles cleanly:

```bash
npx tsc --noEmit
```

Expected output: nothing. If you see errors, **stop here** and report them — don't proceed to a build until type-check passes.

---

## 3. Smoke-test on web

Web is the fastest dev loop, so do the first sanity pass there.

```bash
npx expo start --web
```

In the browser:

1. **Splash & login.** You should land on the login screen with the new bike icon (filled, Signal red on a tinted square) and the warm-bone background in light mode / wine-tinted graphite in dark mode.
2. **Sign in** (Google or anonymous).
3. **Bikes tab.** Cards should have a subtle border and the Apex add icon (`+`) in the header.
4. **Garage tab.** Component cards now use the new BikeIcon set — chain, brakes, wheel, etc. — with the focal Signal accent on the filled variant.
5. **Settings tab → APPEARANCE section** (first card). You should see a three-way segmented control: **Auto / Light / Dark**. Tap each:
   - **Auto** — should follow your OS appearance. Toggle your system theme (macOS: Settings → Appearance) and watch the app retint without a reload.
   - **Light** — forces warm-bone surfaces.
   - **Dark** — forces wine-tinted graphite.
6. **Reload the page.** The toggle choice should persist (it writes to AsyncStorage / localStorage on web).

If anything looks off, jump to the Troubleshooting section at the bottom.

---

## 4. Smoke-test on iOS / Android

Native is where the new app icon and splash screen actually appear. From the same `expo start` session:

- **iOS simulator:** press `i` in the terminal where Expo is running.
- **Android emulator:** press `a`.
- **Physical device:** scan the QR code with the Expo Go / dev-client app.

What to verify:

1. **App icon.** On iOS, look at the home screen — you should see the Apex Cut (forward-leaning Signal stripe with a horizontal vault slot on Obsidian). On Android, both the launcher icon and the round adaptive variant should match.
2. **Splash screen.** Cold-launch the app. Background is Obsidian `#0A0A12`, the brand mark sits centered, and the splash transitions cleanly into the app.
3. **Status bar.** Should switch automatically — light glyphs on dark theme, dark glyphs on light theme.
4. **Theme toggle.** Same flow as web: Auto follows the OS Dark Mode toggle.

---

## 5. Production build (when you're happy)

Once smoke tests pass, kick off a production build via EAS:

```bash
# iOS — App Store / TestFlight
eas build --platform ios --profile production

# Android — Play Store
eas build --platform android --profile production

# Both
eas build --platform all --profile production
```

If you don't have EAS set up, the local equivalents are:

```bash
# iOS
npx expo run:ios --configuration Release

# Android
npx expo run:android --variant release
```

---

## 6. What changed (cheat sheet)

If you want to know what to look at in code:

- **Theme system** — `constants/colors.ts`, `theme/ThemeProvider.tsx`. The `Colors` proxy still works for any inline JSX use; new code should call `useThemeColors()` and feed it into a `makeStyles(C)` factory.
- **Icon component** — `components/BikeIcon.tsx`. 28 icons × line/fill states. Use it like `<BikeIcon name="chain" variant="fill" size={24} />`. Color and accent default to the active theme but can be overridden.
- **Theme toggle** — `components/ThemeToggle.tsx`. Lives inside Settings → Appearance.
- **Icon assets** — `assets/icon.png`, `adaptive-icon.png`, `splash.png`, `favicon.png`, `notification-icon.png`. Generated from the Apex spec at `bikevault_apex_spec.md`.
- **Manifest** — `app.json`. `userInterfaceStyle` flipped from `"dark"` to `"automatic"` so `useColorScheme()` works on iOS. Splash and adaptive backgrounds are now Obsidian.

The Apex spec doc and the original sprite (`bikevault_icons.svg`) stay in the repo as the canonical references.

---

## Troubleshooting

**"Cannot find module 'react-native-svg'."**
You skipped step 1. Run `npx expo install react-native-svg` and restart the dev server (`r` in the Expo terminal).

**Theme toggle doesn't stick across reload.**
On native, this is AsyncStorage. On web, RN-AsyncStorage falls back to `localStorage`. If you're in an incognito window or have site data disabled, the choice resets — that's expected. Try a normal browser window.

**Auto mode doesn't follow the OS theme on iOS.**
Make sure you ran step 1 *and* did a full rebuild after `app.json` changed (`userInterfaceStyle` must be `"automatic"`). A Metro hot-reload won't pick up `app.json` changes — stop Expo and start it again.

**Old app icon still showing on iOS Simulator.**
iOS aggressively caches launcher icons. Long-press the app, delete it, then rebuild. On a real device, sometimes a simple device restart is enough.

**A specific component still looks off in light mode.**
Most likely a stylesheet wasn't refactored. Search the file for `Colors.` (capital C) — anything still using the old static reference will be locked to dark. Move that style block into a `makeStyles(C)` factory and read `C.X` instead.

**TypeScript complains about `as never` on routes.**
Unrelated to this change — the typed-routes generator regenerates on `npx expo start`. Run that once and the warnings go away.

---

## Rolling back

If something's badly broken and you want the old theme back:

```bash
git reset --hard HEAD~1   # if you committed before starting
```

Or surgically: revert just the assets and `app.json`:

```bash
git checkout HEAD~1 -- assets/icon.png assets/adaptive-icon.png assets/splash.png assets/favicon.png app.json
```

The theme system itself (`constants/colors.ts`, `theme/ThemeProvider.tsx`, `BikeIcon.tsx`) is additive — leaving those in won't hurt anything if you keep using the old Ionicons.
