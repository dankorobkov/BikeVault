import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';
import { useAppStore } from '../store/useAppStore';
import { markOnboardingSeen } from '../services/userService';
import { ONBOARDING_HTML } from '../constants/onboardingHtml';

// react-native-webview is the cross-platform WebView used on native.
// On web (react-native-web) there's no first-class WebView, so we
// render an <iframe srcDoc> directly via a platform guard below.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebView =
  Platform.OS === 'web'
    ? null
    : (require('react-native-webview').WebView as React.ComponentType<{
        source: { html: string; baseUrl?: string };
        style?: object;
        originWhitelist?: string[];
        scrollEnabled?: boolean;
        bounces?: boolean;
        javaScriptEnabled?: boolean;
        domStorageEnabled?: boolean;
        allowsInlineMediaPlayback?: boolean;
        mediaPlaybackRequiresUserAction?: boolean;
        onMessage?: (event: { nativeEvent: { data: string } }) => void;
      }>);

/**
 * Seconds the Skip button stays visible-but-disabled before the user
 * is allowed to dismiss a first-time presentation. Tuned with the
 * animation length so the user sees enough to know what BikeVault is.
 */
const SKIP_DELAY_SECONDS = 5;

interface Props {
  visible: boolean;
  /**
   * `first-time` — apply the 5-second Skip countdown and write
   * `hasSeenOnboarding: true` on close.
   * `replay` — Skip enabled from second zero, no Firestore write.
   */
  mode: 'first-time' | 'replay';
  onClose: () => void;
}

/**
 * Renders the bundled onboarding HTML (constants/onboardingHtml.ts)
 * in a full-screen modal. The HTML drives all the animation, so the
 * modal's only jobs are:
 *  - own the Skip / Done affordance with its 5s countdown
 *  - listen for `onboarding-cycle-done` postMessages from the HTML
 *    so the Skip label flips to "Done" once a full cycle has played
 *  - persist `hasSeenOnboarding: true` on first-time close
 */
export default function OnboardingVideoModal({
  visible,
  mode,
  onClose,
}: Props) {
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { userId, setHasSeenOnboarding } = useAppStore();

  const [secondsRemaining, setSecondsRemaining] = useState<number>(
    mode === 'first-time' ? SKIP_DELAY_SECONDS : 0
  );
  // Flipped true once the HTML has completed at least one full cycle.
  // Drives the Skip → Done relabel.
  const [cycleDone, setCycleDone] = useState(false);
  // Guards against double-close (e.g. tap Skip just as cycle-done
  // posts) writing markOnboardingSeen twice.
  const closedRef = useRef(false);

  // Reset state every time the modal opens. Without this, a user who
  // sees the modal in Settings and then signs in fresh on the same
  // device might see the previous "Done" label on a fresh first-time
  // presentation.
  useEffect(() => {
    if (visible) {
      setSecondsRemaining(mode === 'first-time' ? SKIP_DELAY_SECONDS : 0);
      setCycleDone(false);
      closedRef.current = false;
    }
  }, [visible, mode]);

  // ── Skip countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    if (mode !== 'first-time') return;
    if (secondsRemaining <= 0) return;
    const id = setInterval(() => {
      setSecondsRemaining((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [visible, mode, secondsRemaining]);

  // ── postMessage from the HTML — cycle complete ────────────────────
  // On web (iframe), we listen on `window.message`. On native, the
  // WebView calls `onMessage` and we wire that into the same handler.
  useEffect(() => {
    if (!visible) return;
    if (Platform.OS !== 'web') return;
    const handler = (ev: MessageEvent) => {
      // The iframe shares the same origin (srcDoc) so ev.origin is
      // 'null' in some browsers — don't filter on origin.
      try {
        const data =
          typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        if (data && data.type === 'onboarding-cycle-done') {
          setCycleDone(true);
        }
      } catch {
        /* ignore non-JSON messages from unrelated postMessages */
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [visible]);

  const onNativeMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data && data.type === 'onboarding-cycle-done') {
        setCycleDone(true);
      }
    } catch {
      /* ignore */
    }
  };

  const handleClose = async () => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (mode === 'first-time' && userId) {
      // Optimistic local update so the hook re-evaluates immediately.
      setHasSeenOnboarding(true);
      try {
        await markOnboardingSeen(userId);
      } catch (e) {
        // Non-fatal — they've seen it; we just couldn't record it.
        console.warn('markOnboardingSeen failed:', e);
      }
    }
    onClose();
  };

  const skipEnabled = secondsRemaining <= 0;
  const skipLabel = skipEnabled
    ? cycleDone
      ? 'Done'
      : 'Skip'
    : 'Skip in ' + secondsRemaining + 's';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={() => {
        // Android hardware-back — only honour once Skip is enabled,
        // so the user doesn't bail out before the countdown completes.
        if (skipEnabled) handleClose();
      }}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {Platform.OS === 'web' ? (
          // eslint-disable-next-line react-native/no-inline-styles
          <iframe
            srcDoc={ONBOARDING_HTML}
            // sandbox without `allow-same-origin` so the iframe stays
            // origin-isolated, but with `allow-scripts` so the animation
            // can run. `allow-popups` left off — nothing should pop.
            sandbox="allow-scripts"
            style={{
              border: 'none',
              width: '100%',
              height: '100%',
              background: '#000',
            }}
            title="BikeVault onboarding"
          />
        ) : WebView ? (
          <WebView
            source={{ html: ONBOARDING_HTML, baseUrl: 'about:blank' }}
            style={styles.webview}
            // The HTML is local + sandboxed; allow file:// + about:blank.
            originWhitelist={['*']}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled
            domStorageEnabled={false}
            // Auto-play CSS animations don't need user gesture, but
            // these flags also disable iOS's default tap-to-play overlay
            // on any <video> element we might add later.
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            onMessage={onNativeMessage}
          />
        ) : null}

        <View style={styles.skipBar} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => skipEnabled && handleClose()}
            disabled={!skipEnabled}
            style={[styles.skipBtn, !skipEnabled && styles.skipBtnDisabled]}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.skipText,
                !skipEnabled && styles.skipTextDisabled,
              ]}
            >
              {skipLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (_C: ColorPalette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      // Always black regardless of theme — the HTML's stage is dark
      // anyway, and a neutral letterbox keeps any aspect-ratio gap
      // from clashing with the theme.
      backgroundColor: '#000',
    },
    webview: {
      flex: 1,
      backgroundColor: '#000',
    },
    skipBar: {
      position: 'absolute',
      // Clear the notch / status bar without depending on
      // SafeAreaProvider being mounted above the Modal.
      top: Platform.select({ ios: 56, android: 36, default: 24 }),
      right: 16,
    },
    skipBtn: {
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 99,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
      minWidth: 96,
      alignItems: 'center',
    },
    skipBtnDisabled: {
      opacity: 0.6,
    },
    skipText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    skipTextDisabled: {
      color: 'rgba(255,255,255,0.85)',
    },
  });
