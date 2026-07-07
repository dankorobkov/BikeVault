import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Switch,
  Platform,
  Linking,
} from 'react-native';
import RefreshableScrollView from '../../components/RefreshableScrollView';
import { dialog } from '../../components/AppDialog';
import { useTopInset } from '../../hooks/useTopInset';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import BikeIcon from '../../components/BikeIcon';
import OnboardingVideoModal from '../../components/OnboardingVideoModal';
import ThemeToggle from '../../components/ThemeToggle';
import { useThemeColors } from '../../theme/ThemeProvider';
import type { ColorPalette } from '../../constants/colors';
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
import {
  exchangeWahooCode,
  clearWahooTokens,
  loadWahooTokens,
} from '../../services/wahooService';
import { savePrimaryProvider, saveWahooDefaultBike } from '../../services/syncStateService';
import { PROVIDERS, PROVIDER_ORDER } from '../../services/providers/registry';
import { deleteUserAccount } from '../../services/userService';
import { updateBike } from '../../services/bikesService';
import {
  getNotificationPermission,
  requestNotificationPermission,
  fireTestNotification,
} from '../../services/notifications';
import { STRAVA_CONFIG } from '../../config/strava';
import { WAHOO_CONFIG } from '../../config/wahoo';
import {
  STRAVA_ACTIVITY_LABELS,
  STRAVA_ACTIVITY_ICONS,
} from '../../constants/componentTypes';
import {
  defaultActivityForBikeType,
  type StravaActivityType,
  type ProviderId,
} from '../../types';
import { useSync } from '../../hooks/useSync';

dayjs.extend(relativeTime);
WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: STRAVA_CONFIG.authEndpoint,
  tokenEndpoint: STRAVA_CONFIG.tokenEndpoint,
};

const wahooDiscovery = {
  authorizationEndpoint: WAHOO_CONFIG.authEndpoint,
  tokenEndpoint: WAHOO_CONFIG.tokenEndpoint,
};

const STRAVA_CONFIGURED = PROVIDERS.strava.isConfigured;
const WAHOO_CONFIGURED = PROVIDERS.wahoo.isConfigured;

const STRAVA_ACTIVITIES = Object.entries(STRAVA_ACTIVITY_LABELS) as [
  StravaActivityType,
  string,
][];

export default function SettingsScreen() {
  const topInset = useTopInset();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const {
    userId,
    isAnonymous,
    userDisplayName,
    userEmail,
    userPhotoUrl,
    stravaTokens,
    setStravaTokens,
    wahooTokens,
    setWahooTokens,
    primaryProvider,
    setPrimaryProvider,
    wahooDefaultBikeId,
    setWahooDefaultBikeId,
    lastSyncAt,
    isSyncing,
    notificationPrefs,
    setNotificationPrefs,
    signOut,
    bikes,
    updateBikeLocal,
  } = useAppStore();
  // Drives the "Watch onboarding video" entry. Independent of the
  // first-time gate — opens in replay mode so it never re-writes the
  // hasSeenOnboarding flag and Skip is enabled from second zero.
  const [replayOnboarding, setReplayOnboarding] = useState(false);
  const { syncStrava, loadLastSync } = useSync();
  const [connecting, setConnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [athleteAvatar, setAthleteAvatar] = useState<string | null>(null);
  // Which bike is expanded in the Default Activities section. Only one
  // can be open at a time to keep the scroll length manageable on
  // larger garages.
  const [expandedBikeId, setExpandedBikeId] = useState<string | null>(null);
  // Live-tracked browser permission state. Initialised from the Notifications
  // API and re-read after every request so the UI doesn't lag reality.
  const [notifPermission, setNotifPermission] = useState<
    'granted' | 'denied' | 'default' | 'unsupported'
  >(getNotificationPermission());
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Pull-to-refresh handler for Settings. Same intent as the explicit
   * "Sync now" button just below — re-pull from Strava so the last-sync
   * timestamp and connection state on this page reflect reality. When
   * Strava isn't connected there's nothing to fetch, so we just flash
   * the spinner for ~500 ms so the gesture feels acknowledged.
   *
   * Errors are silent here on purpose: the Sync button surface owns
   * the explicit error dialog. Pull-to-refresh should never throw an
   * alert at the user when they didn't ask for one.
   */
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (stravaTokens || wahooTokens) {
        await syncStrava();
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch {
      /* surfaced via the Sync button */
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleNotifications = async (v: boolean) => {
    setNotificationPrefs({ enabled: v });
    if (!v) return;
    // User just turned notifications on — ask the browser for permission.
    // If they've already denied once, browsers won't re-prompt; surface
    // that to the user so they know to flip it back in their browser
    // settings.
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'denied') {
      dialog.alert({
        title: 'Notifications blocked',
        message:
          'Your browser is blocking notifications for BikeVault. Enable them in site settings (padlock icon in the address bar) to get reminders.',
        tone: 'warning',
      });
    } else if (perm === 'unsupported') {
      dialog.alert({
        title: 'Not supported here',
        message:
          'Browser notifications aren\u2019t available on this platform yet. We\u2019ll show in-app reminders instead.',
        tone: 'info',
      });
    }
  };

  const handleTestNotification = () => {
    const ok = fireTestNotification();
    if (!ok) {
      dialog.alert({
        title: 'Could not send test',
        message:
          notifPermission === 'denied'
            ? 'Notifications are blocked for this site. Enable them in your browser settings to test.'
            : 'Your browser did not allow the notification. Try again after granting permission.',
        tone: 'warning',
      });
    }
  };

  const handleSetActivity = async (bikeId: string, activity: StravaActivityType) => {
    if (!userId) return;
    // Enforce uniqueness — a default activity can only belong to one
    // bike at a time so activity-based Strava attribution stays
    // deterministic. The picker greys disabled chips, but defend in
    // depth here against double-taps and stale prop snapshots.
    const conflict = bikes.find(
      (b) =>
        b.id !== bikeId &&
        (b.defaultActivity ?? defaultActivityForBikeType(b.type)) === activity
    );
    if (conflict) {
      dialog.alert({
        title: 'Activity already used',
        message:
          '"' +
          STRAVA_ACTIVITY_LABELS[activity] +
          '" is the default activity for ' +
          conflict.name +
          '. Change that bike first to free it up.',
        tone: 'warning',
      });
      return;
    }
    // Optimistic local update first so the tap feels instant even on
    // slow Firestore writes (web long-polling can take a second).
    updateBikeLocal(bikeId, { defaultActivity: activity, updatedAt: Date.now() });
    try {
      await updateBike(userId, bikeId, { defaultActivity: activity });
    } catch (e) {
      console.warn('Failed to update default activity:', e);
    }
  };

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

  const wahooRedirectUri = AuthSession.makeRedirectUri({
    scheme: 'bikevault',
    path: 'wahoo-callback',
  });

  const [wahooRequest, wahooResponse, wahooPromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: WAHOO_CONFIG.clientId,
      // Wahoo takes the OAuth-standard space-separated scope list, so we
      // pass the array as-is (expo-auth-session joins with spaces) —
      // unlike Strava, which needs a comma-joined single element.
      scopes: WAHOO_CONFIG.scopes,
      redirectUri: wahooRedirectUri,
      usePKCE: false,
    },
    wahooDiscovery
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
        // The callback tab could have connected EITHER provider — reload
        // both so whichever one changed reflects here.
        const [stravaT, wahooT] = await Promise.all([
          loadStravaTokens(userId),
          loadWahooTokens(userId),
        ]);
        if (stravaT) {
          setStravaTokens(stravaT);
          if (stravaT.athleteAvatar) setAthleteAvatar(stravaT.athleteAvatar);
        }
        if (wahooT) setWahooTokens(wahooT);
        if (stravaT || wahooT) {
          // Kick off a sync so the "Last synced" timestamp updates
          // without a manual tap.
          syncStrava().catch(() => undefined);
          // Refresh the locally-stored last-sync timestamp too, in case
          // the callback tab wrote it.
          loadLastSync();
        }
      } catch (e) {
        console.warn('Cross-tab data-source refresh failed:', e);
      }
    };
    return () => bc.close();
  }, [userId, setStravaTokens, setWahooTokens, syncStrava, loadLastSync]);

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
        .catch((e) => dialog.alert({ title: 'Connection failed', message: e.message, tone: 'destructive' }))
        .finally(() => setConnecting(false));
    } else if (response?.type === 'error') {
      dialog.alert({
        title: 'Strava error',
        message: response.error?.message ?? 'Unknown error',
        tone: 'destructive',
      });
    }
  }, [response]);

  // Wahoo native OAuth response (mirrors the Strava effect above). Web
  // uses the /wahoo-callback route instead.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (wahooResponse?.type === 'success' && userId) {
      const { code } = wahooResponse.params;
      setConnecting(true);
      exchangeWahooCode(userId, code, wahooRedirectUri)
        .then(async (tokens) => {
          setWahooTokens(tokens);
          // First data source? make Wahoo primary + seed cursor to now.
          if (!stravaTokens) {
            try {
              await savePrimaryProvider(userId, 'wahoo', Math.floor(Date.now() / 1000));
              setPrimaryProvider('wahoo');
            } catch {
              /* user can set primary manually */
            }
          }
          return syncStrava().catch(() => {
            /* initial sync failure is non-fatal; user can retry */
          });
        })
        .catch((e) =>
          dialog.alert({ title: 'Connection failed', message: e.message, tone: 'destructive' })
        )
        .finally(() => setConnecting(false));
    } else if (wahooResponse?.type === 'error') {
      dialog.alert({
        title: 'Wahoo error',
        message: wahooResponse.error?.message ?? 'Unknown error',
        tone: 'destructive',
      });
    }
  }, [wahooResponse]);

  // ── Provider link / unlink / primary ───────────────────────────────────────

  const providerConnected = (id: ProviderId): boolean =>
    id === 'strava' ? !!stravaTokens : !!wahooTokens;

  const connectedProviderIds = PROVIDER_ORDER.filter(providerConnected);

  const handleConnectProvider = (id: ProviderId) => {
    const configured = id === 'strava' ? STRAVA_CONFIGURED : WAHOO_CONFIGURED;
    if (!configured) {
      const P = PROVIDERS[id];
      const envPrefix = id === 'strava' ? 'STRAVA' : 'WAHOO';
      dialog.alert({
        title: `${P.displayName} not configured`,
        message: `${P.displayName} API credentials are missing from this build. Add EXPO_PUBLIC_${envPrefix}_CLIENT_ID and EXPO_PUBLIC_${envPrefix}_CLIENT_SECRET to .env.`,
        tone: 'warning',
      });
      return;
    }
    setConnecting(true);
    if (id === 'strava') promptAsync();
    else wahooPromptAsync();
  };

  const handleSetPrimary = async (id: ProviderId) => {
    if (!userId || primaryProvider === id) return;
    if (!providerConnected(id)) return;
    setPrimaryProvider(id);
    try {
      // Switching to Wahoo seeds its cursor to now → "keep totals, add new
      // only". Switching to Strava needs no seed (it has its own cursor +
      // historical backfill).
      await savePrimaryProvider(
        userId,
        id,
        id === 'wahoo' ? Math.floor(Date.now() / 1000) : undefined
      );
    } catch (e) {
      console.warn('Failed to persist primary provider:', e);
    }
    // Reflect the change immediately.
    syncStrava().catch(() => undefined);
  };

  const handleSetWahooDefaultBike = async (bikeId: string | null) => {
    if (!userId) return;
    // Toggle off if tapping the already-selected bike.
    const next = wahooDefaultBikeId === bikeId ? null : bikeId;
    setWahooDefaultBikeId(next);
    try {
      await saveWahooDefaultBike(userId, next);
    } catch (e) {
      console.warn('Failed to persist Wahoo default bike:', e);
    }
  };

  const doDisconnect = async (id: ProviderId) => {
    if (!userId) return;
    // Clear Firestore first, but never let a failure (e.g. Safari ITP
    // blocking the Firestore channel) leave the user stuck with a dead
    // connection they can't remove. Local state is the source of truth
    // for the UI, so we always null it even if the server delete fails.
    try {
      if (id === 'strava') await clearStravaTokens(userId);
      else await clearWahooTokens(userId);
    } catch (e) {
      console.warn(`clear ${id} tokens failed (continuing with local disconnect):`, e);
    }
    if (id === 'strava') {
      setStravaTokens(null);
      setAthleteAvatar(null);
    } else {
      setWahooTokens(null);
    }
    // If we just unlinked the primary source, fall back to whichever other
    // provider is still connected so odometers keep updating from something.
    if (primaryProvider === id) {
      const fallback = PROVIDER_ORDER.find((p) => p !== id && providerConnected(p));
      if (fallback) {
        setPrimaryProvider(fallback);
        try {
          await savePrimaryProvider(
            userId,
            fallback,
            fallback === 'wahoo' ? Math.floor(Date.now() / 1000) : undefined
          );
        } catch {
          /* non-fatal */
        }
      }
    }
  };

  const handleDisconnectProvider = async (id: ProviderId) => {
    const P = PROVIDERS[id];
    const ok = await dialog.confirm({
      title: `Disconnect ${P.displayName}`,
      message:
        primaryProvider === id
          ? `${P.displayName} is your primary data source. Disconnecting stops automatic distance sync (another linked source, if any, becomes primary). Continue?`
          : 'This will unlink the account. Continue?',
      confirmLabel: 'Disconnect',
      tone: 'destructive',
    });
    if (ok) doDisconnect(id);
  };

  const handleSync = async () => {
    if (connectedProviderIds.length === 0) return;
    try {
      await syncStrava();
      dialog.alert({
        title: 'Sync complete',
        message: `Bike distances updated from ${PROVIDERS[primaryProvider].displayName}.`,
        tone: 'info',
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sync failed';
      dialog.alert({ title: 'Sync failed', message: msg, tone: 'destructive' });
    }
  };

  const handleSignOut = async () => {
    const ok = await dialog.confirm({
      title: isAnonymous ? 'Leave anonymous session' : 'Sign Out',
      message: isAnonymous
        ? 'Your anonymous session data is only kept on this device and will be discarded.'
        : 'Are you sure you want to sign out?',
      confirmLabel: isAnonymous ? 'Leave' : 'Sign Out',
      tone: 'destructive',
    });
    if (!ok) return;
    await firebaseSignOut(auth);
    signOut();
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
      dialog.alert({ title: 'Delete failed', message: msg, tone: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  // Open an external URL (mailto:, https://, tg:, etc.). Wrapped so we can
  // surface a friendly dialog if the device has no handler for the scheme
  // (e.g. no mail client configured) instead of silently no-op'ing.
  const openExternal = async (url: string, friendlyName: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        dialog.alert({
          title: 'Cannot open ' + friendlyName,
          message: 'No app on this device can handle this link. You can copy it manually: ' + url,
          tone: 'warning',
        });
        return;
      }
      await Linking.openURL(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      dialog.alert({
        title: 'Could not open link',
        message: msg,
        tone: 'destructive',
      });
    }
  };

  const handleDeleteAccount = async () => {
    const first = await dialog.confirm({
      title: 'Delete your BikeVault account?',
      message:
        'This permanently removes all your bikes, components, and Strava connection. This cannot be undone.',
      confirmLabel: 'Continue',
      tone: 'destructive',
    });
    if (!first) return;
    const second = await dialog.confirm({
      title: 'Are you absolutely sure?',
      message: 'All your data will be permanently deleted. You cannot undo this.',
      confirmLabel: 'Delete forever',
      tone: 'destructive',
    });
    if (!second) return;
    performDelete();
  };

  const anyConnected = connectedProviderIds.length > 0;
  const lastSyncLabel = lastSyncAt
    ? 'Last synced ' +
      dayjs(lastSyncAt).fromNow() +
      ' · ' +
      dayjs(lastSyncAt).format('D MMM YYYY, HH:mm')
    : 'Never synced';

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: topInset }]}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <RefreshableScrollView
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={C.accent}
      >

        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.card}>
            <View style={styles.accountRow}>
              {userPhotoUrl ? (
                <Image source={{ uri: userPhotoUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={22} color={C.accent} />
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
                  <Ionicons name="logo-google" size={12} color={C.textSecondary} />
                  <Text style={styles.googleBadgeText}>Google</Text>
                </View>
              )}
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.row} onPress={handleSignOut}>
              <View style={styles.rowLeft}>
                <Ionicons name="log-out-outline" size={20} color={C.danger} />
                <Text style={[styles.rowTitle, { color: C.danger }]}>
                  {isAnonymous ? 'Leave Anonymous Session' : 'Sign Out'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Data Sources — link one or more activity providers, pick the
            one that feeds bike distances. Signed-in users only. */}
        {!isAnonymous && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DATA SOURCES</Text>
            <View style={styles.card}>
              {/* Primary-source selector + Sync — only meaningful once at
                  least one provider is linked. */}
              {anyConnected && (
                <>
                  <View style={styles.primaryHeader}>
                    <Text style={styles.rowTitle}>Primary source</Text>
                    <Text style={styles.rowSub}>
                      Where bike distances are pulled from
                    </Text>
                  </View>
                  <View style={styles.segment}>
                    {PROVIDER_ORDER.map((pid) => {
                      const connected = providerConnected(pid);
                      const active = primaryProvider === pid;
                      return (
                        <TouchableOpacity
                          key={pid}
                          disabled={!connected || active}
                          onPress={() => handleSetPrimary(pid)}
                          style={[
                            styles.segmentBtn,
                            active && styles.segmentBtnActive,
                            !connected && styles.segmentBtnDisabled,
                          ]}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name={PROVIDERS[pid].icon as any}
                            size={15}
                            color={active ? C.white : connected ? C.text : C.textTertiary}
                          />
                          <Text
                            style={[
                              styles.segmentText,
                              active && styles.segmentTextActive,
                              !connected && styles.segmentTextDisabled,
                            ]}
                          >
                            {PROVIDERS[pid].displayName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {primaryProvider === 'wahoo' && (
                    <Text style={styles.sourceNote}>
                      Wahoo has no per-bike tags, so rides are matched to bikes by
                      activity type (see Default Activities below).
                    </Text>
                  )}

                  <View style={styles.divider} />

                  <TouchableOpacity style={styles.row} onPress={handleSync} disabled={isSyncing}>
                    <View style={styles.rowLeft}>
                      <Ionicons name="sync-outline" size={20} color={C.accent} />
                      <View style={styles.rowTextCol}>
                        <Text style={styles.rowTitle}>Sync Activities</Text>
                        <Text style={styles.rowSub}>{lastSyncLabel}</Text>
                      </View>
                    </View>
                    {isSyncing ? (
                      <ActivityIndicator color={C.accent} size="small" />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* One row per provider: connected → athlete + Disconnect;
                  otherwise → a Connect action. */}
              {PROVIDER_ORDER.map((pid) => {
                const P = PROVIDERS[pid];
                const connected = providerConnected(pid);
                const tokens = pid === 'strava' ? stravaTokens : wahooTokens;
                const isPrimary = primaryProvider === pid;
                const configured = pid === 'strava' ? STRAVA_CONFIGURED : WAHOO_CONFIGURED;
                const canConnect = pid === 'strava' ? !!request : !!wahooRequest;
                const avatarUri =
                  pid === 'strava' ? athleteAvatar ?? tokens?.athleteAvatar : null;
                return (
                  <View key={pid}>
                    {(anyConnected || pid !== PROVIDER_ORDER[0]) && (
                      <View style={styles.divider} />
                    )}
                    <View style={styles.providerRow}>
                      <View style={[styles.providerIcon, { backgroundColor: P.brandColor + '22' }]}>
                        {avatarUri ? (
                          <Image source={{ uri: avatarUri }} style={styles.providerAvatar} />
                        ) : (
                          <Ionicons name={P.icon as any} size={22} color={P.brandColor} />
                        )}
                      </View>
                      <View style={styles.providerInfo}>
                        <View style={styles.providerNameRow}>
                          <Text style={styles.rowTitle}>{P.displayName}</Text>
                          {isPrimary && (
                            <View style={styles.primaryBadge}>
                              <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                            </View>
                          )}
                        </View>
                        {connected ? (
                          <View style={styles.connectedBadge}>
                            <View style={styles.dot} />
                            <Text style={styles.connectedText} numberOfLines={1}>
                              {tokens?.athleteName || 'Connected'}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.rowSub}>
                            {configured ? P.tagline : 'Credentials missing — see .env'}
                          </Text>
                        )}
                      </View>
                      {connected ? (
                        <TouchableOpacity
                          onPress={() => handleDisconnectProvider(pid)}
                          hitSlop={8}
                          style={styles.providerAction}
                        >
                          <Ionicons name="unlink-outline" size={18} color={C.danger} />
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.providerConnectBtn,
                            (connecting || !configured || !canConnect) &&
                              styles.connectBtnDisabled,
                          ]}
                          onPress={() => handleConnectProvider(pid)}
                          disabled={connecting || !configured || !canConnect}
                        >
                          <Text style={styles.providerConnectText}>Connect</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Wahoo catch-all bike — shown when Wahoo is linked and
                  there are bikes to choose from. Because Wahoo rides can't
                  carry a gear tag, any cycling workout that doesn't match a
                  bike by activity type lands on the bike picked here (tap
                  again to clear). */}
              {providerConnected('wahoo') && bikes.length > 0 && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.primaryHeader}>
                    <Text style={styles.rowTitle}>Wahoo catch-all bike</Text>
                    <Text style={styles.rowSub}>
                      Wahoo rides that don’t match a bike by activity type go here
                    </Text>
                  </View>
                  <View style={styles.activityChipWrap}>
                    {bikes.map((b) => {
                      const active = wahooDefaultBikeId === b.id;
                      return (
                        <TouchableOpacity
                          key={b.id}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => handleSetWahooDefaultBike(b.id)}
                          activeOpacity={0.7}
                        >
                          <View
                            style={[
                              styles.bikeDot,
                              { backgroundColor: b.color ?? C.accent, marginRight: 6 },
                            ]}
                          />
                          <Text
                            style={[styles.chipText, active && styles.chipTextActive]}
                            numberOfLines={1}
                          >
                            {b.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
            <Text style={styles.hint}>
              Link any accounts you use; only your primary source updates bike
              distances. Switch primary anytime — existing totals are kept.
            </Text>
          </View>
        )}

        {/* Appearance — theme picker. 'Auto' follows the device's
            system appearance; 'Light' / 'Dark' force a scheme. The
            choice is persisted across launches. Sits below Account
            and Strava because those are the most-touched settings;
            theme is set-and-forget. */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>APPEARANCE</Text>
          <View style={styles.card}>
            <View style={styles.themeRow}>
              <View style={styles.rowLeft}>
                <View style={styles.themeIconBox}>
                  <BikeIcon
                    name="parts"
                    variant="fill"
                    size={20}
                    color={C.accent}
                    accent={C.accent}
                    hole={C.card}
                  />
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitle}>Theme</Text>
                  <Text style={styles.rowSub}>
                    Auto follows your device. Light and Dark force a scheme.
                  </Text>
                </View>
              </View>
            </View>
            <ThemeToggle />
          </View>
        </View>

        {/* Notifications section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
          <View style={styles.card}>
            {/* Master toggle */}
            <View style={styles.switchRow}>
              <View style={styles.rowLeft}>
                <Ionicons name="notifications-outline" size={20} color={C.accent} />
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowTitle}>Enable Notifications</Text>
                  <Text style={styles.rowSub}>Reminders for wear, maintenance & batteries</Text>
                </View>
              </View>
              <Switch
                value={notificationPrefs.enabled}
                onValueChange={handleToggleNotifications}
                trackColor={{ true: C.accent, false: C.border }}
                thumbColor={C.white}
              />
            </View>

            {notificationPrefs.enabled && (
              <>
                {/* Permission banner — shown only when the browser hasn't
                    granted permission yet (denied / default / unsupported).
                    Masked entirely when everything's ready so the UI stays
                    quiet in the happy path. */}
                {notifPermission !== 'granted' && (
                  <>
                    <View style={styles.divider} />
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => handleToggleNotifications(true)}
                      activeOpacity={notifPermission === 'denied' ? 1 : 0.7}
                      disabled={notifPermission === 'denied' || notifPermission === 'unsupported'}
                    >
                      <View style={styles.rowLeft}>
                        <Ionicons
                          name={
                            notifPermission === 'denied'
                              ? 'close-circle-outline'
                              : notifPermission === 'unsupported'
                              ? 'alert-circle-outline'
                              : 'help-circle-outline'
                          }
                          size={20}
                          color={
                            notifPermission === 'denied'
                              ? C.danger
                              : C.warning
                          }
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>
                            {notifPermission === 'denied'
                              ? 'Blocked by your browser'
                              : notifPermission === 'unsupported'
                              ? 'Not supported on this device'
                              : 'Permission needed'}
                          </Text>
                          <Text style={styles.rowSub}>
                            {notifPermission === 'denied'
                              ? 'Enable in your browser\u2019s site settings to get reminders.'
                              : notifPermission === 'unsupported'
                              ? 'We\u2019ll show in-app reminders instead.'
                              : 'Tap to grant notification permission.'}
                          </Text>
                        </View>
                      </View>
                      {notifPermission === 'default' && (
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={C.textTertiary}
                        />
                      )}
                    </TouchableOpacity>
                  </>
                )}

                <View style={styles.divider} />
                <View style={styles.switchRow}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="water-outline" size={20} color={C.textSecondary} />
                    <View style={styles.rowTextCol}>
                      <Text style={styles.rowTitle}>Chain Lube Reminder</Text>
                      <Text style={styles.rowSub}>When a chain passes its re-lube interval</Text>
                    </View>
                  </View>
                  <Switch
                    value={notificationPrefs.chainLube}
                    onValueChange={(v) => setNotificationPrefs({ chainLube: v })}
                    trackColor={{ true: C.accent, false: C.border }}
                    thumbColor={C.white}
                  />
                </View>

                <View style={styles.divider} />
                <View style={styles.switchRow}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="warning-outline" size={20} color={C.textSecondary} />
                    <View style={styles.rowTextCol}>
                      <Text style={styles.rowTitle}>Wear & Service Alerts</Text>
                      <Text style={styles.rowSub}>
                        Nearing end of life, overdue replacement, service intervals
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={notificationPrefs.componentWear}
                    onValueChange={(v) => setNotificationPrefs({ componentWear: v })}
                    trackColor={{ true: C.accent, false: C.border }}
                    thumbColor={C.white}
                  />
                </View>

                {/* Test button — only enabled when permission is granted.
                    Helps users confirm that OS-level delivery is set up
                    without needing to wait for a real alert. */}
                {notifPermission === 'granted' && (
                  <>
                    <View style={styles.divider} />
                    <TouchableOpacity style={styles.row} onPress={handleTestNotification}>
                      <View style={styles.rowLeft}>
                        <Ionicons
                          name="send-outline"
                          size={20}
                          color={C.accent}
                        />
                        <Text style={styles.rowTitle}>Send test notification</Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={C.textTertiary}
                      />
                    </TouchableOpacity>
                  </>
                )}

                {/* Battery Low Alert is hidden — the feature isn't wired up
                    to a real charge-estimate yet. Stub remains in the data
                    model (NotificationPrefs.batteryLow) so we can surface
                    it again once component charge tracking ships. */}
              </>
            )}
          </View>
        </View>

        {/* Default activities — only render if there are bikes to configure */}
        {bikes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DEFAULT ACTIVITIES</Text>
            <View style={styles.card}>
              {bikes.map((bike, idx) => {
                const current =
                  bike.defaultActivity ?? defaultActivityForBikeType(bike.type);
                const expanded = expandedBikeId === bike.id;
                return (
                  <View key={bike.id}>
                    {idx > 0 && <View style={styles.divider} />}
                    <TouchableOpacity
                      style={styles.activityRow}
                      onPress={() =>
                        setExpandedBikeId(expanded ? null : bike.id)
                      }
                      activeOpacity={0.7}
                    >
                      <View style={styles.rowLeft}>
                        <View
                          style={[
                            styles.bikeDot,
                            { backgroundColor: bike.color ?? C.accent },
                          ]}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {bike.name}
                          </Text>
                          <Text style={styles.rowSub}>
                            {STRAVA_ACTIVITY_LABELS[current]}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.activityCurrent}>
                        <Ionicons
                          name={STRAVA_ACTIVITY_ICONS[current] as any}
                          size={14}
                          color={C.accent}
                        />
                        <Ionicons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={C.textTertiary}
                        />
                      </View>
                    </TouchableOpacity>
                    {expanded && (
                      <View style={styles.activityChipWrap}>
                        {STRAVA_ACTIVITIES.map(([key, label]) => {
                          const active = current === key;
                          // Owned by a DIFFERENT bike → can't pick it.
                          // Activities owned by THIS bike (`active`)
                          // are obviously fine.
                          const taken =
                            !active &&
                            bikes.some(
                              (b) =>
                                b.id !== bike.id &&
                                (b.defaultActivity ??
                                  defaultActivityForBikeType(b.type)) === key
                            );
                          return (
                            <TouchableOpacity
                              key={key}
                              disabled={taken}
                              style={[
                                styles.chip,
                                active && styles.chipActive,
                                taken && styles.chipDisabled,
                              ]}
                              onPress={() => handleSetActivity(bike.id, key)}
                            >
                              <Ionicons
                                name={STRAVA_ACTIVITY_ICONS[key] as any}
                                size={13}
                                color={
                                  active
                                    ? C.accent
                                    : taken
                                    ? C.textTertiary
                                    : C.textSecondary
                                }
                                style={styles.chipIcon}
                              />
                              <Text
                                style={[
                                  styles.chipText,
                                  active && styles.chipTextActive,
                                  taken && styles.chipTextDisabled,
                                ]}
                              >
                                {label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            <Text style={styles.hint}>
              Used when logging manual rides and matching Strava activities to
              the right bike.
            </Text>
          </View>
        )}

        {/* About section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="bicycle-outline" size={20} color={C.accent} />
                <Text style={styles.rowTitle}>BikeVault</Text>
              </View>
              <Text style={styles.rowSub}>Version 0.5</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name="information-circle-outline" size={20} color={C.textSecondary} />
                <Text style={styles.rowTitle}>How wear is calculated</Text>
              </View>
            </View>
            {/* Watch onboarding — bundled in the app, always available
                to signed-in users on demand. Independent of the
                `onboardingVideoEnabled` master switch so admins can
                disable the first-time gate without removing the replay
                affordance. Hidden for anonymous users (they aren't
                part of the rollout). */}
            {!isAnonymous ? (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setReplayOnboarding(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowLeft}>
                    <Ionicons name="play-circle-outline" size={20} color={C.accent} />
                    <Text style={styles.rowTitle}>Watch onboarding</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
                </TouchableOpacity>
              </>
            ) : null}
          </View>
          <Text style={styles.hint}>
            Wear is based on the distance ridden since a component was installed. Connect Strava to sync automatically, or add rides manually.
          </Text>
        </View>

        {/* Replay player — mounted at the screen root so it overlays
            everything. Opens in `replay` mode so dismissing it doesn't
            re-write the hasSeenOnboarding flag. The HTML is bundled,
            so there's no external dependency to gate on. */}
        <OnboardingVideoModal
          visible={replayOnboarding}
          mode="replay"
          onClose={() => setReplayOnboarding(false)}
        />

        {/* Developer — credits + contact links. Sits below About so the
            version + "how wear is calculated" rows stay together as core
            product info, and the developer block reads as a separate
            "from the maker" footer. */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DEVELOPER</Text>
          <View style={styles.card}>
            <View style={styles.devBlurbRow}>
              <View style={styles.devIconBox}>
                <Ionicons name="code-slash-outline" size={20} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Daniel Korobkov</Text>
                <Text style={styles.rowSub}>
                  BikeVault was developed in 2026 for fellow cyclists. Got a
                  bug, idea, or just want to say hi? Drop me a note below.
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.row}
              onPress={() => openExternal('mailto:dankorobkov@gmail.com', 'mail')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Ionicons name="mail-outline" size={20} color={C.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Email</Text>
                  <Text style={styles.rowSub}>dankorobkov@gmail.com</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.row}
              onPress={() => openExternal('https://t.me/danielkorobkov', 'Telegram')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Ionicons name="paper-plane-outline" size={20} color={C.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Telegram</Text>
                  <Text style={styles.rowSub}>t.me/danielkorobkov</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                openExternal('https://www.strava.com/athletes/6877963', 'Strava')
              }
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Ionicons name="fitness-outline" size={20} color={C.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Strava</Text>
                  <Text style={styles.rowSub}>Follow my rides</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Support — optional donation link. Opens the external donatr.ee
            page in the browser. Mirrors the gradient pill button from the
            web marketing surface (purple #6C5CE7 → #A855F7 with a glow). */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SUPPORT</Text>
          <View style={styles.card}>
            <View style={styles.donateBox}>
              <Text style={styles.donateBlurb}>
                BikeVault is free. If it keeps your drivetrain honest, you can
                chip in to support development.
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() =>
                  openExternal('https://donatr.ee/danielkorobkov', 'the donation page')
                }
              >
                <LinearGradient
                  colors={['#6C5CE7', '#A855F7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.donateBtn}
                >
                  <Text style={styles.donateBtnText}>Donate to BikeVault</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
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
                  <Ionicons name="trash-outline" size={20} color={C.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: C.danger }]}>
                      Delete Account & Data
                    </Text>
                    <Text style={styles.rowSub}>
                      Permanently remove your profile, bikes, components, and Strava connection
                    </Text>
                  </View>
                </View>
                {deleting ? (
                  <ActivityIndicator color={C.danger} size="small" />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              Deletion is immediate and irreversible. Your invite code cannot be reused.
            </Text>
          </View>
        )}
      </RefreshableScrollView>
    </View>
  );
}

const makeStyles = (C: ColorPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 34, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  content: { padding: 20, gap: 24, paddingBottom: 40 },
  section: { gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: C.textSecondary, letterSpacing: 1 },
  card: { backgroundColor: C.card, borderRadius: 16, overflow: 'hidden' },

  accountRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: { flex: 1 },
  accountName: { fontSize: 16, fontWeight: '600', color: C.text },
  accountEmail: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  googleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
  },
  googleBadgeText: { fontSize: 11, color: C.textSecondary, fontWeight: '500' },

  stravaRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  stravaLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentDim,
  },
  stravaAvatar: { width: 44, height: 44 },
  stravaInfo: { flex: 1, gap: 4 },
  stravaName: { fontSize: 16, fontWeight: '600', color: C.text },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 99, backgroundColor: C.good },
  connectedText: { fontSize: 13, color: C.good, fontWeight: '500' },

  divider: { height: 1, backgroundColor: C.border, marginLeft: 16 },
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
  // Title + subtitle column inside a row. Needs `flex: 1` so the
  // subtitle wraps within the available row width instead of overflowing
  // off the screen — affects rows where the subtitle is long enough to
  // exceed the device width (Theme, Wear & Service Alerts, etc.).
  rowTextCol: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '500', color: C.text },
  rowSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },

  connectBox: { padding: 24, alignItems: 'center', gap: 10 },
  stravaIconBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  connectTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  connectSub: { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.accent,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 6,
  },
  connectBtnDisabled: { opacity: 0.5 },
  connectBtnText: { fontSize: 15, fontWeight: '700', color: C.white },
  connectComingSoon: { fontSize: 12, color: C.textTertiary, textAlign: 'center', marginTop: 2 },

  // ── Data Sources ───────────────────────────────────────────────────────────
  primaryHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  segment: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  segmentBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  segmentBtnDisabled: { opacity: 0.4 },
  segmentText: { fontSize: 14, fontWeight: '600', color: C.text },
  segmentTextActive: { color: C.white },
  segmentTextDisabled: { color: C.textTertiary },
  sourceNote: {
    fontSize: 12,
    color: C.textSecondary,
    lineHeight: 17,
    paddingHorizontal: 16,
    paddingBottom: 14,
    marginTop: -4,
  },
  providerRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  providerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerAvatar: { width: 44, height: 44 },
  providerInfo: { flex: 1, gap: 4 },
  providerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBadge: {
    backgroundColor: C.accentDim,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  primaryBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: C.accent,
  },
  providerAction: { padding: 6 },
  providerConnectBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  providerConnectText: { fontSize: 13, fontWeight: '700', color: C.white },

  hint: { fontSize: 13, color: C.textSecondary, lineHeight: 18, paddingHorizontal: 4 },

  // Default-activity picker rows
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 12,
  },
  bikeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.border,
  },
  activityCurrent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activityChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipIcon: { marginRight: 6 },
  chipActive: { backgroundColor: C.accentDim, borderColor: C.accent },
  chipDisabled: { opacity: 0.35 },
  chipText: { fontSize: 13, fontWeight: '500', color: C.textSecondary },
  chipTextActive: { color: C.accent },
  chipTextDisabled: { color: C.textTertiary },

  // Developer section
  devBlurbRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  devIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Support section
  donateBox: { padding: 20, alignItems: 'center', gap: 14 },
  donateBlurb: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  donateBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    // Glow, mirroring the web button's box-shadow.
    shadowColor: '#6C5CE7',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  donateBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Appearance section
  themeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 0,
  },
  themeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
