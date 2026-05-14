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
import { createUserProfile, getUserProfile } from '../services/userService';
import { scanAndNotify } from '../services/notifications';
import type { ColorPalette } from '../constants/colors';
import { DEMO_BIKES, DEMO_COMPONENTS } from '../constants/demoData';
import { DialogRoot } from '../components/AppDialog';
import BikeIcon from '../components/BikeIcon';
import { ThemeProvider, useTheme, useThemeColors } from '../theme/ThemeProvider';

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
          <BikeIcon name="bike" variant="fill" size={56} accent={C.accent} color={C.accent} />
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
        <Stack.Screen name="strava-callback" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="bike/[id]" options={{ headerShown: false }} />
      </Stack>
      {/* Global app-styled dialog — replaces Alert.alert / window.confirm. */}
      <DialogRoot />
    </>
  );
}

export default function RootLayout() {
  const {
    setUserId,
    setUserProfile,
    setHasProfile,
    setProfileChecked,
    setBikes,
    setComponents,
    setStravaTokens,
    setLoading,
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

        // ── Release splash right away ──────────────────────────────────────
        setLoading(false);
        SplashScreen.hideAsync();

        // ── Fetch data in the background ───────────────────────────────────
        if (user.isAnonymous) {
          // Anonymous users always have a "profile" (demo data)
          setHasProfile(true);
          setProfileChecked(true);
          setBikes(DEMO_BIKES);
          setComponents(DEMO_COMPONENTS);
        } else {
          setDataLoading(true);
          // Check profile first — gate the rest of the loading on having one,
          // so a first-time Google user doesn't hit Firestore-permission errors
          // while they're still on the invite-code screen.
          getUserProfile(user.uid)
            .then((profile) => {
              const has = profile !== null;
              setHasProfile(has);
              setProfileChecked(true);
              if (!has) {
                // New user — stop here; AuthGate will route to /invite-code.
                setDataLoading(false);
                return null;
              }
              return Promise.all([
                fetchBikes(user.uid),
                fetchAllComponents(user.uid),
                loadStravaTokens(user.uid),
              ]);
            })
            .then((result) => {
              if (!result) return;
              const [bikes, components, stravaTokens] = result;
              setBikes(bikes);
              setComponents(components);
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
