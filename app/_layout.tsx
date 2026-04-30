import React, { useEffect, useMemo } from 'react';
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
import { getUserProfile } from '../services/userService';
import { scanAndNotify } from '../services/notifications';
import type { ColorPalette } from '../constants/colors';
import { DEMO_BIKES, DEMO_COMPONENTS } from '../constants/demoData';
import { DialogRoot } from '../components/AppDialog';
import BikeIcon from '../components/BikeIcon';
import { ThemeProvider, useTheme, useThemeColors } from '../theme/ThemeProvider';

SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { userId, isAnonymous, hasProfile, profileChecked, isLoading } = useAppStore();

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
      // Cast: the typed-routes generator re-runs on `expo start` and will
      // learn about /invite-code then. Cast keeps TS happy in the meantime.
      if (!onInvite) router.replace('/invite-code' as never);
      return;
    }

    // Signed in and allowed into the app.
    if (onLogin || onInvite) {
      router.replace('/(tabs)');
    }
  }, [userId, isAnonymous, hasProfile, profileChecked, isLoading, segments]);

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
 */
function ThemedLayout() {
  const { resolved } = useTheme();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { isLoading } = useAppStore();
  const [fontsLoaded, fontError] = useFonts({
    Ionicons: require('../assets/fonts/Ionicons.ttf'),
  });

  // Allow the app to proceed if fonts errored — icons degrade gracefully
  // rather than the user being stuck on the splash screen forever.
  if (isLoading || (!fontsLoaded && !fontError)) {
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
