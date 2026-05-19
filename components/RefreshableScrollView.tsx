import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
} from 'react-native';

/**
 * A ScrollView with iOS-style pull-to-refresh on every platform we ship to.
 *
 * Why this exists instead of just using ScrollView + RefreshControl:
 *   - On iOS / Android, RN's `RefreshControl` is the right primitive.
 *   - On web, `RefreshControl` is a no-op stub (rendered to nothing).
 *     Browsers do have a native "pull to reload" gesture, but it reloads
 *     the page — which kills our in-memory state and is the opposite of
 *     what we want. We need to capture the pull, suppress the browser's
 *     bounce, and call our own `onRefresh`.
 *
 * Web visual model (matches iOS UIRefreshControl):
 *   - As the user pulls down past the top, the scroll content moves
 *     down with the gesture (dampened by `PULL_DAMPING`).
 *   - A spinner is revealed in the gap that opens above the content.
 *   - Past `PULL_THRESHOLD`, release triggers `onRefresh()` and the
 *     content snaps to a locked offset of `SPINNER_AREA_HEIGHT` so the
 *     spinner stays visible (and spinning) while the refresh runs.
 *   - When `refreshing` flips back to false, the content animates
 *     back up to its resting position.
 *
 * Web implementation notes:
 *   - We attach DOM touch listeners to the ScrollView's underlying
 *     scrollable node (`getScrollableNode()` from react-native-web's
 *     ScrollView).
 *   - The pull only counts when `scrollTop === 0`, so users still get
 *     normal in-content scrolling away from the top.
 *   - During a pull we preventDefault on touchmove (with passive:false)
 *     so the browser's own pull-to-reload doesn't fire alongside ours.
 *   - The outer container has overflow:hidden, so when the inner
 *     ScrollView wrapper translates down the bottom edge is clipped
 *     instead of overflowing into the AppTabBar.
 *   - Desktop browsers have no touch input here; the gesture simply
 *     never fires, which is fine — the Settings → Sync button is the
 *     desktop affordance.
 */

const PULL_THRESHOLD = 60;          // dampened-px the user must pull before release triggers refresh
const SPINNER_AREA_HEIGHT = 60;     // height of the spinner well, and the locked offset while refreshing
const PULL_MAX = 110;               // visual cap on pull translation
const PULL_DAMPING = 0.5;           // how much of the raw drag we mirror in the visual
const SNAP_DURATION_MS = 180;       // animate to locked / back-to-0 in this much time
const FADE_BACK_DURATION_MS = 220;  // animate to 0 after refresh completes

export interface RefreshableScrollViewProps extends ScrollViewProps {
  refreshing: boolean;
  onRefresh: () => void;
  /** Spinner colour; falls back to the platform default. */
  tintColor?: string;
}

const RefreshableScrollView = forwardRef<ScrollView, RefreshableScrollViewProps>(
  ({ refreshing, onRefresh, tintColor, children, style, ...rest }, ref) => {
    const innerRef = useRef<ScrollView | null>(null);
    useImperativeHandle(ref, () => innerRef.current as ScrollView);

    // Single source of truth for "how far the content is currently
    // offset down from its resting position". Drives the ScrollView
    // wrapper translateY AND the spinner reveal. Native driver-safe
    // (only transform / opacity ever read from it).
    const offsetY = useRef(new Animated.Value(0)).current;
    // Mirror of the latest offsetY value, sampled into a ref so the
    // touch-end branch can decide "trigger or snap back" without
    // round-tripping through React state.
    const offsetValueRef = useRef(0);

    useEffect(() => {
      const sub = offsetY.addListener(({ value }) => {
        offsetValueRef.current = value;
      });
      return () => offsetY.removeListener(sub);
    }, [offsetY]);

    // Drive the locked / released state from the `refreshing` prop.
    // refreshing=true  -> animate to SPINNER_AREA_HEIGHT and hold
    // refreshing=false -> animate back to 0 (resting)
    // We always animate (rather than setValue) so the transition is
    // smooth even when the parent flips the prop synchronously.
    useEffect(() => {
      Animated.timing(offsetY, {
        toValue: refreshing ? SPINNER_AREA_HEIGHT : 0,
        duration: refreshing ? SNAP_DURATION_MS : FADE_BACK_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, [refreshing, offsetY]);

    // Web touch handlers. Native (iOS/Android) goes through
    // RefreshControl below and skips this entirely.
    useEffect(() => {
      if (Platform.OS !== 'web') return;
      const inst = innerRef.current as unknown as
        | { getScrollableNode?: () => HTMLElement }
        | null;
      const node = inst?.getScrollableNode?.();
      if (!node) return;

      let startY = 0;
      let pulling = false;
      let lastDy = 0;

      const handleTouchStart = (e: TouchEvent) => {
        // Only start tracking when the user is at the top — otherwise
        // this is normal in-content scrolling. Ignore while a refresh
        // is already in flight.
        if (node.scrollTop > 0 || refreshing) return;
        startY = e.touches[0].clientY;
        pulling = true;
        lastDy = 0;
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (!pulling) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0 && node.scrollTop === 0) {
          // Dampened drag — feels resistive, capped so a wild pull
          // can't shove content off the bottom of the viewport.
          const damped = Math.min(dy * PULL_DAMPING, PULL_MAX);
          offsetY.setValue(damped);
          lastDy = damped;
          // Suppress Safari / Chrome's native pull-to-reload while our
          // gesture owns the touch. Only effective when touchmove was
          // registered with passive:false.
          if (e.cancelable) e.preventDefault();
        } else if (dy <= 0) {
          // Direction reversed — abandon the pull and snap back.
          Animated.timing(offsetY, {
            toValue: 0,
            duration: 120,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
          pulling = false;
          lastDy = 0;
        }
      };

      const handleTouchEnd = () => {
        if (!pulling) return;
        pulling = false;
        if (lastDy >= PULL_THRESHOLD) {
          // Fire the refresh. The parent will flip `refreshing` to
          // true; the effect above animates offsetY to its locked
          // value so the spinner stays revealed.
          onRefresh();
        } else {
          // Didn't pull far enough — snap back to resting.
          Animated.timing(offsetY, {
            toValue: 0,
            duration: SNAP_DURATION_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
        }
        lastDy = 0;
      };

      node.addEventListener('touchstart', handleTouchStart, { passive: true });
      // touchmove MUST be non-passive so preventDefault() suppresses
      // the browser's pull-to-reload.
      node.addEventListener('touchmove', handleTouchMove, { passive: false });
      node.addEventListener('touchend', handleTouchEnd, { passive: true });
      node.addEventListener('touchcancel', handleTouchEnd, { passive: true });
      return () => {
        node.removeEventListener('touchstart', handleTouchStart);
        node.removeEventListener('touchmove', handleTouchMove);
        node.removeEventListener('touchend', handleTouchEnd);
        node.removeEventListener('touchcancel', handleTouchEnd);
      };
    }, [refreshing, onRefresh, offsetY]);

    const isWeb = Platform.OS === 'web';
    // The spinner well is positioned just above the resting top of the
    // scroll view: at translateY = (offsetY - SPINNER_AREA_HEIGHT).
    //   - At offsetY = 0 (resting), spinner sits at -SPINNER_AREA_HEIGHT
    //     (entirely off-screen above the visible area).
    //   - At offsetY = SPINNER_AREA_HEIGHT (refreshing or fully pulled),
    //     spinner sits at translateY = 0 (top of the visible area).
    // Opacity ramps in over the first portion of the pull so it's not a
    // hard pop-in once the user starts dragging.
    const spinnerTranslateY = Animated.subtract(offsetY, SPINNER_AREA_HEIGHT);
    const spinnerOpacity = offsetY.interpolate({
      inputRange: [0, SPINNER_AREA_HEIGHT * 0.3, SPINNER_AREA_HEIGHT],
      outputRange: [0, 0.6, 1],
      extrapolate: 'clamp',
    });

    return (
      <View style={[styles.root, style]}>
        {isWeb && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.spinnerWell,
              {
                opacity: spinnerOpacity,
                transform: [{ translateY: spinnerTranslateY }],
              },
            ]}
          >
            <ActivityIndicator size="small" color={tintColor} />
          </Animated.View>
        )}
        <Animated.View
          style={[
            styles.scrollWrap,
            // Only translate on web — native already moves content via
            // its RefreshControl integration.
            isWeb && { transform: [{ translateY: offsetY }] },
          ]}
        >
          <ScrollView
            ref={innerRef}
            {...rest}
            refreshControl={
              isWeb ? undefined : (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={tintColor}
                />
              )
            }
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    );
  }
);

RefreshableScrollView.displayName = 'RefreshableScrollView';
export default RefreshableScrollView;

const styles = StyleSheet.create({
  // overflow:hidden so the translated ScrollView's bottom edge is
  // clipped at the container, not at the screen — keeps it from
  // bleeding over the AppTabBar while pulled.
  root: { flex: 1, overflow: 'hidden' },
  // The spinner sits at the very top of the container, full width.
  // Its height defines how much of a "well" appears above the
  // content when fully pulled / refreshing.
  spinnerWell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SPINNER_AREA_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scrollWrap: { flex: 1 },
});
