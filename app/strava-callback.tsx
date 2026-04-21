import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { exchangeCodeForTokens } from '../services/stravaService';
import { useSync } from '../hooks/useSync';
import { Colors } from '../constants/colors';

/**
 * Strava OAuth callback landing page (web).
 *
 * On native, `expo-auth-session` intercepts the custom-scheme redirect and
 * resolves the `useAuthRequest` hook's `response` inside the Settings screen
 * — this file is never hit.
 *
 * On web, Strava does a full-page redirect to
 * `https://<host>/strava-callback?code=...&state=...`. We pull the code out,
 * exchange it for tokens, kick off an initial sync, and bounce the user back
 * to Settings where the connected state is now live.
 */
export default function StravaCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  const { userId, setStravaTokens } = useAppStore();
  const { syncStrava } = useSync();

  useEffect(() => {
    let cancelled = false;

    const goBack = () => {
      if (!cancelled) router.replace('/(tabs)/settings');
    };

    // Wait for auth to resolve before we exchange. Without a userId we'd
    // write tokens to the wrong Firestore path.
    if (!userId) {
      // Give auth a moment; if still no user, bail.
      const t = setTimeout(goBack, 2000);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    if (params.error) {
      Alert.alert(
        'Strava connection cancelled',
        params.error_description ?? params.error
      );
      goBack();
      return () => {
        cancelled = true;
      };
    }

    if (!params.code) {
      // No code and no error — stale URL. Just bounce.
      goBack();
      return () => {
        cancelled = true;
      };
    }

    exchangeCodeForTokens(userId, params.code)
      .then((tokens) => {
        if (cancelled) return;
        setStravaTokens(tokens);
        // Best-effort initial sync — non-fatal if it fails; user can retry
        // from the Sync Activities button.
        return syncStrava().catch(() => undefined);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Token exchange failed';
        Alert.alert('Strava connection failed', msg);
      })
      .finally(goBack);

    return () => {
      cancelled = true;
    };
  }, [userId, params.code, params.error]);

  return (
    <View style={styles.root}>
      <View style={styles.logoBox}>
        <Ionicons name="fitness-outline" size={44} color={Colors.accent} />
      </View>
      <Text style={styles.title}>Connecting Strava…</Text>
      <Text style={styles.sub}>Exchanging authorization with Strava.</Text>
      <ActivityIndicator color={Colors.accent} style={{ marginTop: 16 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  logoBox: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: Colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text },
  sub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
});
