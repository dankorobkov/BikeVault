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
  Switch,
  Platform,
} from 'react-native';
import { useTopInset } from '../../hooks/useTopInset';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { useAppStore } from '../../store/useAppStore';
import {
  exchangeCodeForTokens,
  clearStravaTokens,
  loadStravaTokens,
} from '../../services/stravaService';
import { deleteUserAccount } from '../../services/userService';
import { STRAVA_CONFIG } from '../../config/strava';
import { Colors } from '../../constants/colors';
import { useSync } from '../../hooks/useSync';

dayjs.extend(relativeTime);
WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: STRAVA_CONFIG.authEndpoint,
  tokenEndpoint: STRAVA_CONFIG.tokenEndpoint,
};

const STRAVA_CONFIGURED = !!STRAVA_CONFIG.clientId && STRAVA_CONFIG.clientId !== 'your_strava_client_id';

export default function SettingsScreen() {
  const topInset = useTopInset();
  const {
    userId,
    isAnonymous,
    userDisplayName,
    userEmail,
    userPhotoUrl,
    stravaTokens,
    setStravaTokens,
    lastSyncAt,
    isSyncing,
    notificationPrefs,
    setNotificationPrefs,
    signOut,
  } = useAppStore();
  const { syncStrava, loadLastSync } = useSync();
  const [connecting, setConnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [athleteAvatar, setAthleteAvatar] = useState<string | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'bikevault',
    path: 'strava-callback',
  });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: STRAVA_CONFIG.clientId,
      // Strava's OAuth requires COMMA-separated scopes, not the OAuth 2.0
      // standard space-separated list. If we pass the scopes as a normal
      // array, expo-auth-session joins them with spaces and Strava
      // responds with "Bad Request / field: scope / code: invalid".
      // Packing them into a single array element keeps the library from
      // splitting them, and the comma lands literally in the query string.
      scopes: [STRAVA_CONFIG.scopes.join(',')],
      redirectUri,
      usePKCE: false,
      // `force` makes Strava re-show the consent screen on every connect.
      // This matters when scopes change (e.g. we added profile:read_all)
      // — with `auto`, Strava can silently reuse the previously-granted
      // scope set and hand back a token missing the new permission.
      extraParams: { approval_prompt: 'force' },
    },
    discovery
  );

  useEffect(() => { loadLastSync(); }, []);

  useEffect(() => {
    if (stravaTokens?.athleteAvatar) setAthleteAvatar(stravaTokens.athleteAvatar);
  }, [stravaTokens]);

  // Cross-tab update: the OAuth popup lands on /strava-callback in its
  // own tab, writes tokens to Firestore, and broadcasts "connected".
  // Without this, the Settings tab that initiated the flow still shows
  // the Connect button until the user manually reloads, because each
  // tab has its own in-memory Zustand store.
  useEffect(() => {
    if (Platform.OS !== 'web' || !userId) return;
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel('bikevault-strava');
    bc.onmessage = async (ev: MessageEvent) => {
      if (ev.data?.type !== 'connected') return;
      try {
        const tokens = await loadStravaTokens(userId);
        if (tokens) {
          setStravaTokens(tokens);
          if (tokens.athleteAvatar) setAthleteAvatar(tokens.athleteAvatar);
          // Kick off a sync so the "Last synced" timestamp updates
          // without a manual tap.
          syncStrava().catch(() => undefined);
          // Refresh the locally-stored last-sync timestamp too, in case
          // the callback tab wrote it.
          loadLastSync();
        }
      } catch (e) {
        console.warn('Cross-tab Strava refresh failed:', e);
      }
    };
    return () => bc.close();
  }, [userId, setStravaTokens, syncStrava, loadLastSync]);

  useEffect(() => {
    // On web, the OAuth flow redirects to /strava-callback which handles
    // the token exchange itself — this effect only fires on native, where
    // expo-auth-session surfaces the response in-place via `useAuthRequest`.
    if (Platform.OS === 'web') return;
    if (response?.type === 'success' && userId) {
      const { code } = response.params;
      setConnecting(true);
      exchangeCodeForTokens(userId, code)
        .then((tokens) => {
          setStravaTokens(tokens);
          setAthleteAvatar(tokens.athleteAvatar);
          // Kick off an initial sync so distances show up immediately.
          return syncStrava().catch(() => {
            /* initial sync failure is non-fatal; user can retry from button */
          });
        })
        .catch((e) => Alert.alert('Connection failed', e.message))
        .finally(() => setConnecting(false));
    } else if (response?.type === 'error') {
      Alert.alert('Strava error', response.error?.message ?? 'Unknown error');
    }
  }, [response]);

  const handleConnectStrava = () => {
    if (!STRAVA_CONFIGURED) {
      Alert.alert(
        'Strava not configured',
        'Strava API credentials are missing from this build. Add EXPO_PUBLIC_STRAVA_CLIENT_ID and EXPO_PUBLIC_STRAVA_CLIENT_SECRET to .env.'
      );
      return;
    }
    promptAsync();
  };

  const doDisconnect = async () => {
    if (!userId) return;
    // Clear Firestore first, but never let a failure (e.g. Safari ITP
    // blocking the Firestore channel) leave the user stuck with a dead
    // connection they can't remove. Local state is the source of truth
    // for the UI, so we always null it even if the server delete fails.
    try {
      await clearStravaTokens(userId);
    } catch (e) {
      console.warn('clearStravaTokens failed (continuing with local disconnect):', e);
    }
    setStravaTokens(null);
  };

  const handleDisconnect = () => {
    // Alert.alert button callbacks are unreliable on RN Web, so branch
    // on platform the same way we do for Sign Out below.
    if (Platform.OS === 'web') {
      if (!window.confirm('Disconnect Strava? This will stop automatic distance sync.')) return;
      doDisconnect();
    } else {
      Alert.alert('Disconnect Strava', 'This will stop automatic distance sync. Continue?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: doDisconnect },
      ]);
    }
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

  const handleSignOut = async () => {
    // Alert.alert button callbacks are unreliable on React Native Web,
    // so use window.confirm on web and Alert.alert on native.
    if (Platform.OS === 'web') {
      const label = isAnonymous ? 'Leave this anonymous session?' : 'Are you sure you want to sign out?';
      if (!window.confirm(label)) return;
      await firebaseSignOut(auth);
      signOut();
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await firebaseSignOut(auth);
            signOut();
          },
        },
      ]);
    }
  };

  // ── Delete account (two-step confirmation) ────────────────────────────────
  const performDelete = async () => {
    if (!userId || !auth.currentUser) return;
    setDeleting(true);
    try {
      await deleteUserAccount(userId, auth.currentUser);
      signOut();
      // deleteUser also signs the Firebase session out, so the AuthGate
      // in _layout will route back to /login automatically.
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : 'Could not delete account';
      // Firebase returns auth/requires-recent-login if the token is stale.
      if (msg.includes('requires-recent-login')) {
        msg =
          'For security, please sign out and sign back in, then try deleting your account again.';
      }
      Alert.alert('Delete failed', msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAccount = () => {
    const primary =
      'Delete your BikeVault account?';
    const secondary =
      'This permanently removes all your bikes, components, and Strava connection. This cannot be undone.';

    if (Platform.OS === 'web') {
      if (!window.confirm(primary + '\n\n' + secondary)) return;
      if (!window.confirm('Really delete everything? This cannot be undone.')) return;
      performDelete();
    } else {
      Alert.alert(primary, secondary, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'All your data will be permanently deleted. You cannot undo this.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete forever',
                  style: 'destructive',
                  onPress: performDelete,
                },
              ]
            );
          },
        },
      ]);
    }
  };

  const isConnected = !!stravaTokens;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: topInset }]}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.card}>
            <View style={styles.accountRow}>
              {userPhotoUrl ? (
                <Image source={{ uri: userPhotoUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={22} color={Colors.accent} />
                </View>
              )}
              <View style={styles.accountInfo}>
                {isAnonymous ? (
                  <>
                    <Text style={styles.accountName}>Anonymous</Text>
                    <Text style={styles.accountEmail}>Data is not saved to the cloud</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.accountName}>{userDisplayName ?? 'User'}</Text>
                    <Text style={styles.accountEmail}>{userEmail ?? ''}</Text>
                  </>
                )}
              </View>
              {!isAnonymous && (
                <View style={styles.googleBadge}>
                  <Ionicons name="logo-google" size={12} color={Colors.textSecondary} />
                  <Text style={styles.googleBadgeText}>Google</Text>
                </View>
              )}
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.row} onPress={handleSignOut}>
              <View style={styles.rowLeft}>
                <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
                <Text style={[styles.rowTitle, { color: Colors.danger }]}>
                  {isAnonymous ? 'Leave Anonymous Session' : 'Sign Out'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Strava section — only for signed-in users (Firestore-backed) */}
        {!isAnonymous && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>STRAVA</Text>
            <View style={styles.card}>
              {isConnected ? (
                <>
                  <View style={styles.stravaRow}>
                    <View style={styles.stravaLogo}>
                      {athleteAvatar ? (
                        <Image source={{ uri: athleteAvatar }} style={styles.stravaAvatar} />
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

                  <TouchableOpacity style={styles.row} onPress={handleSync} disabled={isSyncing}>
                    <View style={styles.rowLeft}>
                      <Ionicons name="sync-outline" size={20} color={Colors.accent} />
                      <View>
                        <Text style={styles.rowTitle}>Sync Activities</Text>
                        <Text style={styles.rowSub}>
                          {lastSyncAt
                            ? 'Last synced ' + dayjs(lastSyncAt).fromNow() + ' · ' + dayjs(lastSyncAt).format('D MMM YYYY, HH:mm')
                            : 'Never synced'}
                        </Text>
                      </View>
                    </View>
                    {isSyncing ? (
                      <ActivityIndicator color={Colors.accent} size="small" />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                    )}
                  </TouchableOpacity>

                  <View style={styles.divider} />

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
                <View style={styles.connectBox}>
                  <View style={styles.stravaIconBox}>
                    <Ionicons name="fitness-outline" size={28} color={Colors.accent} />
                  </View>
                  <Text style={styles.connectTitle}>Connect Strava</Text>
                  <Text style={styles.connectSub}>
                    Link your Strava account to automatically sync bike distances and track component wear.
                  </Text>
                  <TouchableOpacity
                    style={[styles.connectBtn, (connecting || !request) && styles.connectBtnDisabled]}
                    onPress={handleConnectStrava}
                    disabled={connecting || !request}
                  >
                    {connecting ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <>
                        <Ionicons name="flash-outline" size={18} color={Colors.white} />
                        <Text style={styles.connectBtnText}>Connect with Strava</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {!STRAVA_CONFIGURED && (
                    <Text style={styles.connectComingSoon}>
                      Strava credentials missing — see .env
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Notifications section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
          <View style={styles.card}>
            {/* Master toggle */}
            <View style={styles.switchRow}>
              <View style={styles.rowLeft}>
                <Ionicons name="notifications-outline" size={20} color={Colors.accent} />
                <View>
                  <Text style={styles.rowTitle}>Enable Notifications</Text>
                  <Text style={styles.rowSub}>Reminders for wear, maintenance & batteries</Text>
                </View>
              </View>
              <Switch
                value={notificationPrefs.enabled}
                onValueChange={(v) => setNotificationPrefs({ enabled: v })}
                trackColor={{ true: Colors.accent, false: Colors.border }}
                thumbColor={Colors.white}
              />
            </View>

            {notificationPrefs.enabled && (
              <>
                <View style={styles.divider} />
                <View style={styles.switchRow}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="water-outline" size={20} color={Colors.textSecondary} />
                    <View>
                      <Text style={styles.rowTitle}>Chain Lube Reminder</Text>
                      <Text style={styles.rowSub}>When less than 100 km to next service</Text>
                    </View>
                  </View>
                  <Switch
                    value={notificationPrefs.chainLube}
                    onValueChange={(v) => setNotificationPrefs({ chainLube: v })}
                    trackColor={{ true: Colors.accent, false: Colors.border }}
                    thumbColor={Colors.white}
                  />
                </View>

                <View style={styles.divider} />
                <View style={styles.switchRow}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="warning-outline" size={20} color={Colors.textSecondary} />
                    <View>
                      <Text style={styles.rowTitle}>Component Wear Alert</Text>
                      <Text style={styles.rowSub}>When less than 100 km lifespan remaining</Text>
                    </View>
                  </View>
                  <Switch
                    value={notificationPrefs.componentWear}
                    onValueChange={(v) => setNotificationPrefs({ componentWear: v })}
                    trackColor={{ true: Colors.accent, false: Colors.border }}
                    thumbColor={Colors.white}
                  />
                </View>

                {/* Battery Low Alert is hidden — the feature isn't wired up
                    to a real charge-estimate yet. Stub remains in the data
                    model (NotificationPrefs.batteryLow) so we can surface
                    it again once component charge tracking ships. */}
              </>
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
              <Text style={styles.rowSub}>v0.2</Text>
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
            Wear is based on the distance ridden since a component was installed. Connect Strava to sync automatically, or add rides manually.
          </Text>
        </View>

        {/* Danger zone — delete account (only for signed-in users) */}
        {!isAnonymous && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DANGER ZONE</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.row}
                onPress={handleDeleteAccount}
                disabled={deleting}
              >
                <View style={styles.rowLeft}>
                  <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: Colors.danger }]}>
                      Delete Account & Data
                    </Text>
                    <Text style={styles.rowSub}>
                      Permanently remove your profile, bikes, components, and Strava connection
                    </Text>
                  </View>
                </View>
                {deleting ? (
                  <ActivityIndicator color={Colors.danger} size="small" />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              Deletion is immediate and irreversible. Your invite code cannot be reused.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 34, fontWeight: '700', color: Colors.text, letterSpacing: -0.5 },
  content: { padding: 20, gap: 24, paddingBottom: 40 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, letterSpacing: 1 },
  card: { backgroundColor: Colors.card, borderRadius: 16, overflow: 'hidden' },

  accountRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: { flex: 1 },
  accountName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  accountEmail: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  googleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
  },
  googleBadgeText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },

  stravaRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  stravaLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentDim,
  },
  stravaAvatar: { width: 44, height: 44 },
  stravaInfo: { flex: 1, gap: 4 },
  stravaName: { fontSize: 16, fontWeight: '600', color: Colors.text },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 99, backgroundColor: Colors.good },
  connectedText: { fontSize: 13, color: Colors.good, fontWeight: '500' },

  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '500', color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  connectBox: { padding: 24, alignItems: 'center', gap: 10 },
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
  connectSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
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
  connectComingSoon: { fontSize: 12, color: Colors.textTertiary, textAlign: 'center', marginTop: 2 },

  hint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, paddingHorizontal: 4 },
});
