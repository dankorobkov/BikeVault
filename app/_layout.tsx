import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../config/firebase';
import { useAppStore } from '../store/useAppStore';
import { fetchBikes } from '../services/bikesService';
import { fetchAllComponents } from '../services/componentsService';
import { loadStravaTokens } from '../services/stravaService';
import { Colors } from '../constants/colors';
import { DEMO_BIKES, DEMO_COMPONENTS } from '../constants/demoData';

SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { userId, isLoading } = useAppStore();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === 'login';
    if (!userId && !inAuthGroup) {
      router.replace('/login');
    } else if (userId && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [userId, isLoading, segments]);

  return null;
}

export default function RootLayout() {
  const { setUserId, setUserProfile, setBikes, setComponents, setStravaTokens, setLoading, isLoading } =
    useAppStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        setUserProfile({
          isAnonymous: user.isAnonymous,
          displayName: user.displayName,
          email: user.email,
          photoUrl: user.photoURL,
        });
        try {
          if (user.isAnonymous) {
            // Load demo data for anonymous/guest users
            setBikes(DEMO_BIKES);
            setComponents(DEMO_COMPONENTS);
          } else {
            const [bikes, components, stravaTokens] = await Promise.all([
              fetchBikes(user.uid),
              fetchAllComponents(user.uid),
              loadStravaTokens(user.uid),
            ]);
            setBikes(bikes);
            setComponents(components);
            if (stravaTokens) setStravaTokens(stravaTokens);
          }
        } catch (e) {
          console.error('Init load error:', e);
        } finally {
          setLoading(false);
          SplashScreen.hideAsync();
        }
      } else {
        setUserId(null);
        setLoading(false);
        SplashScreen.hideAsync();
      }
    });
    return unsub;
  }, []);

  if (isLoading) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <View style={styles.splashLogo}>
          <Ionicons name="bicycle" size={56} color={Colors.accent} />
        </View>
        <Text style={styles.splashTitle}>BikeVault</Text>
        <Text style={styles.splashSub}>Loading your garage…</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <AuthGate />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.bg },
          headerTintColor: Colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="bike/[id]"
          options={{
            title: '',
            headerStyle: { backgroundColor: Colors.bg },
            headerTintColor: Colors.accent,
            headerBackTitle: 'Back',
          }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  splashLogo: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: Colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  splashTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -1,
  },
  splashSub: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
});
