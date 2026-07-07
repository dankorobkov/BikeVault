import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { dialog } from '../components/AppDialog';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import { useAppStore } from '../store/useAppStore';
import { exchangeWahooCode } from '../services/wahooService';
import { savePrimaryProvider } from '../services/syncStateService';
import { useSync } from '../hooks/useSync';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';

/**
 * Wahoo OAuth callback landing page (web).
 *
 * Mirrors `strava-callback`. On web, Wahoo does a full-page redirect to
 * `https://<host>/wahoo-callback?code=...`. We exchange the code for
 * tokens (Wahoo requires the SAME redirect_uri on exchange, so we
 * recompute it exactly as the authorize request did), then bounce back
 * to Settings.
 *
 * On native, `expo-auth-session` resolves the response inside Settings
 * and this route is never hit.
 */
export default function WahooCallback() {
  const router = useRouter();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  const { userId, setWahooTokens, setPrimaryProvider, stravaTokens } = useAppStore();
  const { syncStrava } = useSync();

  useEffect(() => {
    let cancelled = false;

    const goBack = () => {
      if (!cancelled) router.replace('/(tabs)/settings');
    };

    if (!userId) {
      const t = setTimeout(goBack, 2000);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    if (params.error) {
      dialog.alert({
        title: 'Wahoo connection cancelled',
        message: params.error_description ?? params.error,
        tone: 'warning',
      });
      goBack();
      return () => {
        cancelled = true;
      };
    }

    if (!params.code) {
      goBack();
      return () => {
        cancelled = true;
      };
    }

    // Wahoo requires the token-exchange redirect_uri to match the authorize
    // step EXACTLY. Recomputing it with makeRedirectUri can drift under the
    // /test/ base path (a `/test` prefix or trailing slash difference), which
    // Wahoo rejects with HTTP 400. On web the current page IS the URI Wahoo
    // redirected to, so `origin + pathname` is guaranteed to match what
    // authorize sent. Native keeps the scheme-based value.
    const redirectUri =
      Platform.OS === 'web'
        ? window.location.origin + window.location.pathname
        : AuthSession.makeRedirectUri({ scheme: 'bikevault', path: 'wahoo-callback' });

    exchangeWahooCode(userId, params.code, redirectUri)
      .then(async (tokens) => {
        if (cancelled) return;
        setWahooTokens(tokens);
        // If Wahoo is the user's first data source, make it primary right
        // away and seed the cursor to "now" (keep-totals policy). If
        // Strava is already linked, leave the current primary as-is —
        // the user picks the primary explicitly in Settings.
        if (!stravaTokens) {
          try {
            await savePrimaryProvider(userId, 'wahoo', Math.floor(Date.now() / 1000));
            setPrimaryProvider('wahoo');
          } catch {
            /* non-fatal — user can set primary in Settings */
          }
        }
        return syncStrava().catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : 'Initial sync failed';
          dialog.alert({
            title: 'Wahoo connected, but sync failed',
            message: msg,
            tone: 'warning',
          });
        });
      })
      .then(() => {
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
          title: 'Wahoo connection failed',
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
        <Ionicons name="speedometer-outline" size={44} color={C.accent} />
      </View>
      <Text style={styles.title}>Connecting Wahoo…</Text>
      <Text style={styles.sub}>Exchanging authorization with Wahoo.</Text>
      <ActivityIndicator color={C.accent} style={{ marginTop: 16 }} />
    </View>
  );
}

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: C.bg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 24,
    },
    logoBox: {
      width: 84,
      height: 84,
      borderRadius: 24,
      backgroundColor: C.accentDim,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    title: { fontSize: 22, fontWeight: '800', color: C.text },
    sub: { fontSize: 14, color: C.textSecondary, textAlign: 'center' },
  });
