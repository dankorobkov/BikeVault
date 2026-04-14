import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAppStore } from '../../store/useAppStore';
import {
  exchangeCodeForTokens,
  clearStravaTokens,
  getValidToken,
  fetchAthlete,
} from '../../services/stravaService';
import { STRAVA_CONFIG } from '../../config/strava';
import { Colors } from '../../constants/colors';
import { useSync } from '../../hooks/useSync';

dayjs.extend(relativeTime);
WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: STRAVA_CONFIG.authEndpoint,
  tokenEndpoint: STRAVA_CONFIG.tokenEndpoint,
};

export default function SettingsScreen() {
  const { userId, stravaTokens, setStravaTokens, lastSyncAt, isSyncing } = useAppStore();
  const { syncStrava, loadLastSync } = useSync();
  const [connecting, setConnecting] = useState(false);
  const [athleteAvatar, setAthleteAvatar] = useState<string | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'bikevault',
    path: 'strava-callback',
  });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: STRAVA_CONFIG.clientId,
      scopes: STRAVA_CONFIG.scopes,
      redirectUri,
      usePKCE: false,
      extraParams: { approval_prompt: 'auto' },
    },
    discovery
  );

  useEffect(() => {
    loadLastSync();
  }, []);

  useEffect(() => {
    if (stravaTokens?.athleteAvatar) {
      setAthleteAvatar(stravaTokens.athleteAvatar);
    }
  }, [stravaTokens]);

  useEffect(() => {
    if (response?.type === 'success' && userId) {
      const { code } = response.params;
      setConnecting(true);
      exchangeCodeForTokens(userId, code)
        .then((tokens) => {
          setStravaTokens(tokens);
          setAthleteAvatar(tokens.athleteAvatar);
        })
        .catch((e) => Alert.alert('Connection failed', e.message))
        .finally(() => setConnecting(false));
    } else if (response?.type === 'error') {
      Alert.alert('Strava error', response.error?.message ?? 'Unknown error');
    }
  }, [response]);

  const handleConnectStrava = () => promptAsync();

  const handleDisconnect = () => {
    Alert.alert('Disconnect Strava', 'This will stop automatic distance sync. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          if (!userId) return;
          await clearStravaTokens(userId);
          setStravaTokens(null);
        },
      },
    ]);
  };

  const handleSync = async () => {
    try {
      await syncStrava();
      Alert.alert('Sync complete', 'Bike distances updated from Strava.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sync failed';
      Alert.alert('Sync failed', msg);
    }
  };

  const isConnected = !!stravaTokens;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Strava section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>STRAVA</Text>
          <View style={styles.card}>
            {isConnected ? (
              <>
                {/* Connected state */}
                <View style={styles.stravaRow}>
                  <View style={styles.stravaLogo}>
                    {athleteAvatar ? (
                      <Image source={{ uri: athleteAvatar }} style={styles.avatar} />
                    ) : (
                      <Ionicons name="person-circle-outline" size={36} color={Colors.accent} />
                    )}
                  </View>
                  <View style={styles.stravaInfo}>
                    <Text style={styles.stravaName}>{stravaTokens.athleteName}</Text>
                    <View style={styles.connectedBadge}>
                      <View style={styles.dot} />
                      <Text style={styles.connectedText}>Connected</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Sync row */}
                <TouchableOpacity
                  style={styles.row}
                  onPress={handleSync}
                  disabled={isSyncing}
                >
                  <View style={styles.rowLeft}>
                    <Ionicons name="sync-outline" size={20} color={Colors.accent} />
                    <View>
                      <Text style={styles.rowTitle}>Sync Activities</Text>
                      {lastSyncAt && (
                        <Text style={styles.rowSub}>
                          Last synced {dayjs(lastSyncAt).fromNow()}
                        </Text>
                      )}
                    </View>
                  </View>
                  {isSyncing ? (
                    <ActivityIndicator color={Colors.accent} size="small" />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                  )}
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Disconnect */}
                <TouchableOpacity style={styles.row} onPress={handleDisconnect}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="unlink-outline" size={20} color={Colors.danger} />
                    <Text style={[styles.rowTitle, { color: Colors.danger }]}>
                      Disconnect Strava
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                </TouchableOpacity>
              </>
            ) : (
              /* Disconnected state */
              <View style={styles.connectBox}>
                <View style={styles.stravaIconBox}>
                  <Ionicons name="fitness-outline" size={28} color={Colors.accent} />
                </View>
                <Text style={styles.connectTitle}>Connect Strava</Text>
                <Text style={styles.connectSub}>
                  Link your Strava account to automatically sync bike distances and track
                  component wear.
                </Text>
                <TouchableOpacity
                  style={[styles.connectBtn, (!request || connecting) && styles.connectBtnDisabled]}
                  onPress={handleConnectStrava}
                  disabled={!request || connecting}
                >
                  {connecting ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <>
                      <Ionicons name="logo-strava" size={18} color={Colors.white} />
                      <Text style={styles.connectBtnText}>Connect with Strava</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* About section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="bicycle-outline" size={20} color={Colors.accent} />
                <Text style={styles.rowTitle}>BikeVault</Text>
              </View>
              <Text style={styles.rowSub}>v1.0.0</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.rowTitle}>How wear is calculated</Text>
              </View>
            </View>
          </View>
          <Text style={styles.hint}>
            Component wear is based on the distance your bike has traveled since a component
            was installed. Connect Strava to sync distances automatically, or update them
            manually.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  content: { padding: 20, gap: 24, paddingBottom: 40 },
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    overflow: 'hidden',
  },
  stravaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  stravaLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentDim,
  },
  avatar: { width: 44, height: 44 },
  stravaInfo: { flex: 1, gap: 4 },
  stravaName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: Colors.good,
  },
  connectedText: { fontSize: 13, color: Colors.good, fontWeight: '500' },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontSize: 15, fontWeight: '500', color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  connectBox: {
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  stravaIconBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: Colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  connectTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  connectSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 6,
  },
  connectBtnDisabled: { opacity: 0.5 },
  connectBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  hint: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
});
