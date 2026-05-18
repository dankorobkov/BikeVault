import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
} from 'react-native';

/**
 * A ScrollView that supports pull-to-refresh on every platform we ship to.
 *
 * Why this exists instead of just using ScrollView + RefreshControl:
 *   - On iOS / Android, RN's `RefreshControl` is the right primitive.
 *   - On web, `RefreshControl` is a no-op stub (rendered to nothing).
 *     Browsers do have a native "pull to reload" gesture, but it reloads
 *     the page — which kills our in-memory state and is the opposite of
 *     what we want. We need to capture the pull, suppress the browser's
 *     bounce, and call our own `onRefresh`.
 *
 * Web implementation notes:
 *   - We attach DOM touch listeners to the ScrollView's underlying
 *     scrollable node (`getScrollableNode()` from react-native-web's
 *     ScrollView).
 *   - The pull only counts when `scrollTop === 0`, so users still get
 *     normal in-content scrolling away from the top.
 *   - During a pull we preventDefault on touchmove (with passive:false)
 *     to keep Safari/Chrome from running their own browser-level
 *     refresh on top of ours.
 *   - The visual is a small ActivityIndicator that fades + translates
 *     in proportion to the pull distance, then locks at the top while
 *     `refreshing` is true. It's overlaid via absolute positioning so
 *     it doesn't perturb the scroll content layout.
 *   - Desktop browsers have no touch input here; the gesture simply
 *     never fires, which is fine — the Settings → Sync button is the
 *     desktop affordance.
 */

const PULL_THRESHOLD = 70;        // px the user must pull before release triggers refresh
const PULL_MAX = 120;             // visual cap on the spinner's translateY
const PULL_DAMPING = 0.5;         // how much of the raw drag we mirror in the visual
const NO_STRAVA_FLASH_MS = 500;   // intentionally unused here; callers decide

export interface RefreshableScrollViewProps extends ScrollViewProps {
  refreshing: boolean;
  onRefresh: () => void;
  /** Colour of the spinner; defaults to the parent ActivityIndicator default. */
  tintColor?: string;
}

const RefreshableScrollView = forwardRef<ScrollView, RefreshableScrollViewProps>(
  ({ refreshing, onRefresh, tintColor, children, ...rest }, ref) => {
    const innerRef = useRef<ScrollView | null>(null);
    useImperativeHandle(ref, () => innerRef.current as ScrollView);

    const [pullY, setPullY] = useState(0);

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
        // Only start tracking when the user is already at the top —
        // otherwise this is a normal scroll gesture inside the content.
        if (node.scrollTop > 0) return;
        if (refreshing) return;
        startY = e.touches[0].clientY;
        pulling = true;
        lastDy = 0;
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (!pulling) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0 && node.scrollTop === 0) {
          // Mirror the drag with damping so it feels resistive, capped
          // so a very long pull doesn't push the spinner off-screen.
          const damped = Math.min(dy * PULL_DAMPING, PULL_MAX);
          setPullY(damped);
          lastDy = damped;
          // Suppress Safari / Chrome's own pull-to-reload during our
          // gesture. Only effective when the listener is registered as
          // non-passive (see addEventListener below).
          if (e.cancelable) e.preventDefault();
        } else if (dy <= 0) {
          // User reversed direction or scrolled back into content —
          // abandon the pull without firing.
          setPullY(0);
          lastDy = 0;
          pulling = false;
        }
      };

      const handleTouchEnd = () => {
        if (!pulling) return;
        pulling = false;
        if (lastDy >= PULL_THRESHOLD) {
          onRefresh();
        }
        setPullY(0);
        lastDy = 0;
      };

      node.addEventListener('touchstart', handleTouchStart, { passive: true });
      // touchmove MUST be non-passive so preventDefault() actually
      // suppresses the browser's pull-to-reload.
      node.addEventListener('touchmove', handleTouchMove, { passive: false });
      node.addEventListener('touchend', handleTouchEnd, { passive: true });
      node.addEventListener('touchcancel', handleTouchEnd, { passive: true });
      return () => {
        node.removeEventListener('touchstart', handleTouchStart);
        node.removeEventListener('touchmove', handleTouchMove);
        node.removeEventListener('touchend', handleTouchEnd);
        node.removeEventListener('touchcancel', handleTouchEnd);
      };
    }, [refreshing, onRefresh]);

    // The web spinner: visible when refreshing OR when the user is
    // mid-pull. Opacity / translateY animate with the pull distance so
    // the gesture feels responsive instead of just snapping in.
    const showWebSpinner = Platform.OS === 'web' && (refreshing || pullY > 0);
    const spinnerTranslate = refreshing ? 24 : Math.max(0, pullY - 24);
    const spinnerOpacity = refreshing
      ? 1
      : Math.min(1, pullY / PULL_THRESHOLD);

    return (
      <View style={styles.root}>
        {showWebSpinner && (
          <View
            pointerEvents="none"
            style={[
              styles.spinnerWrap,
              {
                opacity: spinnerOpacity,
                transform: [{ translateY: spinnerTranslate }],
              },
            ]}
          >
            <ActivityIndicator size="small" color={tintColor} />
          </View>
        )}
        <ScrollView
          ref={innerRef}
          {...rest}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
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
      </View>
    );
  }
);

RefreshableScrollView.displayName = 'RefreshableScrollView';
export default RefreshableScrollView;
// Re-exported so callers that haven't migrated keep working.
export { NO_STRAVA_FLASH_MS };

const styles = StyleSheet.create({
  root: { flex: 1 },
  spinnerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 4,
    zIndex: 10,
  },
});
