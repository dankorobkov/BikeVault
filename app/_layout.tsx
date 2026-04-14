import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAppStore } from '../store/useAppStore';
import { fetchBikes } from '../services/bikesService';
import { fetchAllComponents } from '../services/componentsService';
import { loadStravaTokens } from '../services/stravaService';
import { Colors } from '../constants/colors';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { setUserId, setBikes, setComponents, setStravaTokens, setLoading } = useAppStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        try {
          const [bikes, components, stravaTokens] = await Promise.all([
            fetchBikes(user.uid),
            fetchAllComponents(user.uid),
            loadStravaTokens(user.uid),
          ]);
          setBikes(bikes);
          setComponents(components);
          if (stravaTokens) setStravaTokens(stravaTokens);
        } catch (e) {
          console.error('Init load error:', e);
        } finally {
          setLoading(false);
          SplashScreen.hideAsync();
        }
      } else {
        // Auto sign in anonymously
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error('Auth error:', e);
          setLoading(false);
          SplashScreen.hideAsync();
        }
      }
    });
    return unsub;
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.bg },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="bike/[id]"
          options={{
            headerBackTitle: 'Bikes',
            title: '',
            headerTransparent: true,
            headerBlurEffect: 'dark',
          }}
        />
      </Stack>
    </>
  );
}
