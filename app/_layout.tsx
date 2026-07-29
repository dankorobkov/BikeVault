import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAppStore } from '../store/useAppStore';
import { fetchBikes } from '../services/bikesService';
import { fetchAllComponents } from '../services/componentsService';
import { loadStravaTokens, validateStravaTokens } from '../services/stravaService';
import { loadWahooTokens, validateWahooTokens } from '../services/wahooService';
import { loadSyncState } from '../services/syncStateService';
import {
  createUserProfile,
  getUserProfile,
  isSubscriptionExpired,
  unsubscribeUser,
  setOverLimitSince as persistOverLimitSince,
  type UserProfile,
} from '../services/userService';
import { isOverFreeLimits, isGracePeriodExpired } from '../constants/subscription';
import { fetchFeatureFlags } from '../services/featureFlagsService';
import { scanAndNotify } from '../services/notifications';
import type { ColorPalette } from '../constants/colors';
import { DEMO_BIKES, DEMO_COMPONENTS } from '../constants/demoData';
import { DialogRoot } from '../components/AppDialog';
import OnboardingVideoModal from '../components/OnboardingVideoModal';
import BrandMark from '../components/BrandMark';
import { ThemeProvider, useTheme, useThemeColors } from '../theme/ThemeProvider';
import { useShouldShowOnboarding } from '../hooks/useShouldShowOnboarding';

SplashScreen.preventAutoHideAsync();

// Single source of truth for the test-vs-prod switch. Baked at build time by
// EAS / `expo export`; missing value defaults to `test` to keep the invite
// gate on for safety.
const IS_PROD = process.env.EXPO_PUBLIC_APP_ENV === 'prod';

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const {
    userId,
    isAnonymous,
    hasProfile,
    profileChecked,
    isLoading,
    userDisplayName,
    userEmail,
    userPhotoUrl,
    setHasProfile,
    overLimitSince,
  } = useAppStore();

  // Guards the prod auto-create so this effect doesn't fire it twice while
  // the Firestore write is in flight (the effect re-runs on every store
  // change, and we don't want N duplicate `setDoc` round-trips).
  const autoCreateInFlight = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    const current = segments[0] as string | undefined;
    const onLogin = current === 'login';
    const onInvite = current === 'invite-code';
    const onTrim = current === 'trim-selection';

    if (!userId) {
      if (!onLogin) router.replace('/login');
      return;
    }

    // Signed in — but Google users must have a profile to proceed.
    if (!isAnonymous && profileChecked && !hasProfile) {
      if (IS_PROD) {
        // Prod: no invite-code gate. Auto-create the profile with a sentinel
        // signupCode so `getUserProfile` recognises it as a real profile.
        // `setDoc` uses `merge:true`, so retries are safe.
        if (!autoCreateInFlight.current) {
          autoCreateInFlight.current = true;
          createUserProfile(userId, {
            email: userEmail,
            displayName: userDisplayName,
            photoUrl: userPhotoUrl,
            signupCode: 'PROD-AUTO',
          })
            .then(() => setHasProfile(true))
            .catch((e) => {
              console.error('Auto profile creation failed:', e);
              autoCreateInFlight.current = false; // allow a retry
            });
        }
        return;
      }
      // Test: keep the existing invite-code gate.
      // Cast: the typed-routes generator re-runs on `expo start` and will
      // learn about /invite-code then. Cast keeps TS happy in the meantime.
      if (!onInvite) router.replace('/invite-code' as never);
      return;
    }

    // Signed in, has a profile, over the free-tier limits, and the
    // 30-day grace period has run out — force the trim-selection flow
    // before letting them anywhere else in the app. Doesn't apply to
    // anonymous/demo sessions: their data is local-only, so there's
    // nothing to persist a grace period against.
    const graceExpired =
      !isAnonymous && hasProfile && overLimitSince !== null && isGracePeriodExpired(overLimitSince);
    if (graceExpired) {
      if (!onTrim) router.replace('/trim-selection' as never);
      return;
    }
    // They resolved it (resubscribed / trimmed down / signed out and
    // back in) but the route is still on the trim screen — release them.
    if (onTrim) {
      router.replace('/(tabs)');
      return;
    }

    // Signed in and allowed into the app.
    if (onLogin || onInvite) {
      router.replace('/(tabs)');
    }
  }, [
    userId,
    isAnonymous,
    hasProfile,
    profileChecked,
    isLoading,
    segments,
    userEmail,
    userDisplayName,
    userPhotoUrl,
    setHasProfile,
    overLimitSince,
  ]);

  return null;
}

/**
 * Inner layout — has access to the theme context.
 *
 * Stack screens are keyed by `resolved` so the entire navigator
 * remounts on theme switch. This forces every screen and component
 * inside to re-create its memoised StyleSheet against the new palette.
 * Without this, components that were already mounted before the
 * switch would keep their old, dark-baked styles.
 *
 * The Stack is gated on `hydrated` so the navigator only mounts
 * once — after AsyncStorage has reported the persisted theme. Without
 * this gate, the navigator would mount with the default theme on first
 * paint and then remount via the `key={resolved}` pattern when
 * hydration flipped the resolved value. That double mount is the most
 * expensive thing the boot path can do, since every screen's
 * `makeStyles(C)` and BikeIcon SVG tree gets rebuilt twice.
 */
function ThemedLayout() {
  const { resolved, hydrated } = useTheme();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { isLoading } = useAppStore();
  // Ionicons is still used by every screen built before the Apex icon
  // set (settings, bike detail, every modal), so the font has to load
  // before we drop the splash — without it those glyphs render as
  // empty PUA boxes. fontError is captured so a missing/blocked asset
  // can't freeze the splash forever; icons just degrade gracefully.
  const [fontsLoaded, fontError] = useFonts({
    Ionicons: require('../assets/fonts/Ionicons.ttf'),
  });

  // Hold the splash until: (1) auth resolves, (2) the theme hydrates
  // from AsyncStorage so the Stack mounts only once with the correct
  // palette, and (3) the Ionicons font finishes loading (or errors).
  if (isLoading || !hydrated || (!fontsLoaded && !fontError)) {
    return (
      <View style={styles.splash}>
        <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
        <View style={styles.splashLogo}>
          <BrandMark size={56} color={C.accent} />
        </View>
        <Text style={styles.splashTitle}>BikeVault</Text>
        <Text style={styles.splashSub}>Loading your garage…</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <AuthGate />
      <Stack
        // Force a full navigator remount on theme switch so every
        // memoised StyleSheet inside re-runs with the new palette.
        key={resolved}
        screenOptions={{
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="invite-code" options={{ headerShown: false }} />
        <Stack.Screen name="trim-selection" options={{ headerShown: false }} />
        <Stack.Screen name="strava-callback" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="bike/[id]" options={{ headerShown: false }} />
      </Stack>
      {/* Global app-styled dialog — replaces Alert.alert / window.confirm. */}
      <DialogRoot />
      {/* First-time onboarding video. Self-gating: renders null unless
          the user qualifies AND the flag is on AND the route is (tabs). */}
      <OnboardingHost />
    </>
  );
}

/**
 * Tiny host so `useShouldShowOnboarding` (which calls `useSegments`)
 * runs inside the navigator subtree. Keeping it separate from
 * ThemedLayout means a re-render driven by the segments / store
 * doesn't force the whole layout to recompute its styles.
 */
function OnboardingHost() {
  const shouldShow = useShouldShowOnboarding();
  // `visible` is driven entirely by the hook — the hook flips to false
  // as soon as `hasSeenOnboarding` becomes true, which the modal does
  // via `setHasSeenOnboarding(true)` before its async write. So there's
  // no separate "dismissed" local state to manage here.
  return (
    <OnboardingVideoModal
      visible={shouldShow}
      mode="first-time"
      onClose={() => {
        /* state-driven; nothing to do here */
      }}
    />
  );
}

export default function RootLayout() {
  const {
    setUserId,
    setUserProfile,
    setHasProfile,
    setProfileChecked,
    setHasSeenOnboarding,
    setFeatureFlags,
    setBikes,
    setComponents,
    setStravaTokens,
    setWahooTokens,
    setPrimaryProvider,
    setWahooDefaultBikeId,
    setLoading,
    setSubscription,
  } = useAppStore();

  useEffect(() => {
    const { setDataLoading } = useAppStore.getState();

    // Safety net: if Firebase auth takes more than 5 s (slow network / cold start),
    // drop the splash anyway so the user isn't stuck on a blank screen forever.
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
      SplashScreen.hideAsync();
    }, 5000);

    const unsub = onAuthStateChanged(auth, (user) => {
      // Auth state is resolved — clear the safety timeout and release the splash
      // immediately. Firestore data will be fetched in the background so the user
      // reaches the app screen without waiting for network round-trips.
      clearTimeout(safetyTimeout);

      if (user) {
        setUserId(user.uid);
        setUserProfile({
          isAnonymous: user.isAnonymous,
          displayName: user.displayName,
          email: user.email,
          photoUrl: user.photoURL,
        });

        // Kick off the feature-flag fetch as soon as auth resolves —
        // it's a single Firestore read, independent of profile load,
        // and the result is needed before the onboarding modal can be
        // gated correctly. Errors are swallowed in the service.
        fetchFeatureFlags()
          .then((flags) => setFeatureFlags(flags))
          .catch(() => {
            /* fetchFeatureFlags returns defaults on failure */
          });

        // ── Release splash right away ──────────────────────────────────────
        setLoading(false);
        SplashScreen.hideAsync();

        // ── Fetch data in the background ───────────────────────────────────
        if (user.isAnonymous) {
          // Anonymous users always have a "profile" (demo data). Free-tier
          // limits still apply to demo mode, but there's no persistence and
          // no grace period — the sample garage is trimmed to fit the caps
          // exactly, so this is just "no subscribe option, no lockout".
          setHasProfile(true);
          setProfileChecked(true);
          setBikes(DEMO_BIKES);
          setComponents(DEMO_COMPONENTS);
          setSubscription({
            status: 'free',
            purchasedAt: null,
            expiresAt: null,
            overLimitSince: null,
          });
        } else {
          setDataLoading(true);
          // Captured here so the second `.then` (which has the bike/component
          // counts needed to evaluate the free-tier limits) can still see
          // the profile's subscription fields without re-fetching.
          let loadedProfile: UserProfile | null = null;
          // Check profile first — gate the rest of the loading on having one,
          // so a first-time Google user doesn't hit Firestore-permission errors
          // while they're still on the invite-code screen.
          getUserProfile(user.uid)
            .then((profile) => {
              const has = profile !== null;
              loadedProfile = profile;
              setHasProfile(has);
              setProfileChecked(true);
              // Mirror the persisted onboarding state into the store
              // so `useShouldShowOnboarding` can read it synchronously.
              // null when the profile is missing OR the field hasn't
              // been written yet (legacy users / new-and-not-yet-shown).
              setHasSeenOnboarding(profile?.hasSeenOnboarding ?? null);
              if (!has) {
                // New user — stop here; AuthGate will route to /invite-code.
                setDataLoading(false);
                return null;
              }
              // A previously-subscribed account whose mock expiry has
              // passed gets auto-downgraded to free. Fire-and-forget the
              // Firestore write; the local `loadedProfile.subscriptionStatus`
              // override below is what actually drives the UI this session.
              if (isSubscriptionExpired(profile)) {
                unsubscribeUser(user.uid).catch((e) =>
                  console.warn('Auto-downgrade on expiry failed:', e)
                );
              }
              return Promise.all([
                fetchBikes(user.uid),
                fetchAllComponents(user.uid),
                loadStravaTokens(user.uid),
                loadWahooTokens(user.uid),
                loadSyncState(user.uid),
              ]);
            })
            .then((result) => {
              if (!result) return;
              const [bikes, components, stravaTokens, wahooTokens, syncState] = result;
              // Primary data source (which provider feeds odometers).
              // Defaults to 'strava' for legacy users with no stored value.
              setPrimaryProvider(syncState.primaryProvider ?? 'strava');
              setWahooDefaultBikeId(syncState.wahooDefaultBikeId ?? null);
              setBikes(bikes);
              setComponents(components);

              // ── Subscription status + free-tier over-limit detection ──────
              const profile = loadedProfile;
              if (profile) {
                const effectiveStatus = isSubscriptionExpired(profile)
                  ? 'free'
                  : profile.subscriptionStatus;
                const isSubscribedNow = effectiveStatus === 'subscribed';
                const over = !isSubscribedNow && isOverFreeLimits(bikes.length, components.length);
                let overLimitSince = profile.overLimitSince ?? null;
                if (over && overLimitSince === null) {
                  // Just dropped over the limit (e.g. unsubscribed with
                  // more bikes/components than the free tier allows) —
                  // start the 30-day grace-period clock.
                  overLimitSince = Date.now();
                  persistOverLimitSince(user.uid, overLimitSince).catch((e) =>
                    console.warn('Failed to persist overLimitSince:', e)
                  );
                } else if (!over && overLimitSince !== null) {
                  // Back under the limit (resubscribed or trimmed down) —
                  // clear the clock.
                  overLimitSince = null;
                  persistOverLimitSince(user.uid, null).catch((e) =>
                    console.warn('Failed to clear overLimitSince:', e)
                  );
                }
                setSubscription({
                  status: effectiveStatus,
                  purchasedAt: profile.subscriptionPurchasedAt ?? null,
                  expiresAt: isSubscribedNow ? profile.subscriptionExpiresAt ?? null : null,
                  overLimitSince,
                });
              }
              // Scan for anything needing attention (chain lube due,
              // components past 80%, service intervals). Safe no-op if
              // permission hasn't been granted or the user turned
              // notifications off. Deferred so it doesn't block the
              // splash→app transition.
              setTimeout(() => {
                try {
                  const { notificationPrefs } = useAppStore.getState();
                  scanAndNotify(bikes, components, notificationPrefs);
                } catch (e) {
                  console.warn('scanAndNotify failed:', e);
                }
              }, 500);
              if (stravaTokens) {
                // Set optimistically so the UI shows "Connected" while we
                // validate — then probe /athlete and clear if the token
                // has been revoked at strava.com.
                setStravaTokens(stravaTokens);
                validateStravaTokens(user.uid, stravaTokens)
                  .then((valid) => {
                    if (!valid) setStravaTokens(null);
                    else if (valid !== stravaTokens) setStravaTokens(valid);
                  })
                  .catch((e) => console.warn('Strava token validation failed:', e));
              }
              if (wahooTokens) {
                // Same optimistic-then-validate pattern as Strava, against
                // Wahoo's /v1/user probe.
                setWahooTokens(wahooTokens);
                validateWahooTokens(user.uid, wahooTokens)
                  .then((valid) => {
                    if (!valid) setWahooTokens(null);
                    else if (valid !== wahooTokens) setWahooTokens(valid);
                  })
                  .catch((e) => console.warn('Wahoo token validation failed:', e));
              }
            })
            .catch((e) => {
              console.error('Init load error:', e);
              // Don't leave the user stuck on a splash if profile fetch blew up.
              setProfileChecked(true);
            })
            .finally(() => setDataLoading(false));
        }
      } else {
        setUserId(null);
        setHasProfile(false);
        setProfileChecked(false);
        setLoading(false);
        SplashScreen.hideAsync();
      }
    });

    return () => {
      unsub();
      clearTimeout(safetyTimeout);
    };
  }, []);

  return (
    <ThemeProvider>
      <ThemedLayout />
    </ThemeProvider>
  );
}

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    splash: {
      flex: 1,
      backgroundColor: C.bg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    },
    splashLogo: {
      width: 100,
      height: 100,
      borderRadius: 28,
      backgroundColor: C.accentDim,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    splashTitle: {
      fontSize: 32,
      fontWeight: '800',
      color: C.text,
      letterSpacing: -1,
    },
    splashSub: {
      fontSize: 15,
      color: C.textSecondary,
    },
  });
