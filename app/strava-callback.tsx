import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { dialog } from '../components/AppDialog';
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
      dialog.alert({
        title: 'Strava connection cancelled',
        message: params.error_description ?? params.error,
        tone: 'warning',
      });
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
        // Initial sync after connect. Surface any error so the user knows
        // why distances / timestamps aren't updating (most common cause is
        // a missing scope on an old token reused by Strava).
        return syncStrava().catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : 'Initial sync failed';
          dialog.alert({
            title: 'Strava connected, but sync failed',
            message: msg,
            tone: 'warning',
          });
        });
      })
      .then(() => {
        // Let any other tab with BikeVault open (typically the Settings
        // tab that kicked off the OAuth flow) know we just connected, so
        // it can refresh its Zustand state without a manual page reload.
        // Zustand stores are per-tab — no cross-tab sync out of the box.
        if (typeof BroadcastChannel !== 'undefined') {
          try {
            const bc = new BroadcastChannel('bikevault-strava');
            bc.postMessage({ type: 'connected' });
            bc.close();
          } catch {
            /* browser too old — falls back to manual reload */
          }
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Token exchange failed';
        dialog.alert({
          title: 'Strava connection failed',
          message: msg,
          tone: 'destructive',
        });
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
