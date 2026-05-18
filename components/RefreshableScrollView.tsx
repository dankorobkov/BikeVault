import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
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
 *   - The visual: a thin progress bar pinned to the very top of the
 *     scroll view. It fills left→right with pull distance (so the user
 *     can see they're approaching the trigger), then switches to an
 *     indeterminate "knight rider" segment that slides across while
 *     `refreshing` is true, then fades out. Much less visually noisy
 *     than a circular spinner popping in on top of content.
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

/** How wide the indeterminate sliding segment is, as a fraction of the bar. */
const INDETERMINATE_SEGMENT = 0.35;
/** One full pass of the indeterminate animation, in ms. */
const INDETERMINATE_DURATION = 1100;
/** How long to fade the bar out after refresh completes, in ms. */
const FADE_OUT_DURATION = 220;

const RefreshableScrollView = forwardRef<ScrollView, RefreshableScrollViewProps>(
  ({ refreshing, onRefresh, tintColor, children, ...rest }, ref) => {
    const innerRef = useRef<ScrollView | null>(null);
    useImperativeHandle(ref, () => innerRef.current as ScrollView);

    const [pullY, setPullY] = useState(0);
    // Track container width so the indeterminate segment can be sized in
    // px (Animated's transform interpolations need numeric inputs, not %).
    const [trackWidth, setTrackWidth] = useState(0);
    // Drives the sliding segment during refresh.
    const slideAnim = useRef(new Animated.Value(0)).current;
    // Drives the fade-out after refresh completes.
    const opacityAnim = useRef(new Animated.Value(0)).current;

    // Drive the visual states off `refreshing` + `pullY`. Three phases:
    //   1. Pulling but not refreshing — bar opacity follows pullY, fill
    //      width is determinate (`pullY / threshold`). Slide anim is idle.
    //   2. Refreshing — bar fully visible, fill switches to indeterminate
    //      sliding segment (looping translateX).
    //   3. Just finished refreshing — bar fades out smoothly so the user
    //      sees "done" rather than a sudden snap to invisible.
    useEffect(() => {
      if (refreshing) {
        opacityAnim.setValue(1);
        slideAnim.setValue(0);
        const loop = Animated.loop(
          Animated.timing(slideAnim, {
            toValue: 1,
            duration: INDETERMINATE_DURATION,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        );
        loop.start();
        return () => loop.stop();
      }
      // Not refreshing. Fade out (or stay invisible if we never showed).
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: FADE_OUT_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
      return undefined;
    }, [refreshing, opacityAnim, slideAnim]);

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

    // Web progress-bar state. The bar is visible whenever the user is
    // mid-pull or the refresh is in-flight, plus during the fade-out
    // (opacityAnim animates 1 → 0 over FADE_OUT_DURATION).
    const isWeb = Platform.OS === 'web';
    const pullFraction = Math.min(1, pullY / PULL_THRESHOLD);
    // During pull-only phase, set opacity directly from pullY so it
    // tracks the gesture in real time. While refreshing or fading out
    // we delegate to opacityAnim (set to 1 then animated down on stop).
    const barOpacity = refreshing
      ? opacityAnim
      : pullY > 0
      ? pullFraction
      : opacityAnim;
    // Indeterminate segment translateX: slide from -segmentWidth to
    // trackWidth. We need trackWidth measured before this can run; if
    // it's 0 (initial mount) we just keep the segment off-screen.
    const segmentWidth = trackWidth * INDETERMINATE_SEGMENT;
    const segmentTranslate = slideAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-segmentWidth, trackWidth],
    });
    const accent = tintColor ?? '#888';

    return (
      <View style={styles.root}>
        {isWeb && (
          <Animated.View
            pointerEvents="none"
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
            style={[styles.barTrack, { opacity: barOpacity }]}
          >
            {refreshing ? (
              // Indeterminate slide: a short coloured segment loops
              // across the bar so the user knows work is in progress
              // without a stationary spinner glyph.
              <Animated.View
                style={[
                  styles.barSegment,
                  {
                    backgroundColor: accent,
                    width: segmentWidth,
                    transform: [{ translateX: segmentTranslate }],
                  },
                ]}
              />
            ) : (
              // Determinate fill while pulling: width grows with the
              // pull distance so the user can see they're approaching
              // the trigger threshold.
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: accent,
                    width: `${pullFraction * 100}%`,
                  },
                ]}
              />
            )}
          </Animated.View>
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
  // The track is the whole-width strip pinned to the top of the
  // scroll view. It's deliberately thin (2 px) and overlaid via
  // absolute positioning so it doesn't push content down or fight
  // the existing screen header for vertical real estate.
  barTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    overflow: 'hidden',
    zIndex: 10,
  },
  // The pull-phase determinate fill: width animates with pullY.
  barFill: {
    height: '100%',
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
  },
  // The refresh-phase indeterminate sliding segment.
  barSegment: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 1,
  },
});
