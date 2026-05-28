import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

/**
 * Approximate vertical footprint of the floating action button, used
 * by callers to pad the bottom of their scroll content so the last
 * form field isn't hidden underneath. Conservative: 56px button +
 * 16px bottom inset (worst-case web) + 24px breathing room.
 */
export const PRIMARY_ACTION_BAR_HEIGHT = 96;

/**
 * Centered pill anchored to the bottom of the screen, designed to sit
 * at the foot of every form modal (Add/Edit Bike, Add/Edit Component).
 * Replaces the older top-right text-link affordance so the primary
 * commit action stays reachable without scrolling back up to the
 * header.
 *
 * Behaviour notes:
 *  - `position: absolute` with `bottom: <safe-area>`. The parent
 *    KeyboardAvoidingView (behavior='padding' on iOS) adds bottom
 *    padding when the keyboard opens, which transitively shifts this
 *    button up because its `bottom` is measured from the inner edge.
 *  - The outer wrap uses `pointerEvents="box-none"` so taps on either
 *    side of the pill fall through to the scroll content underneath.
 */
export default function PrimaryActionButton({
  label,
  onPress,
  loading,
  disabled,
}: Props) {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);

  // On native, insets.bottom captures the home-indicator height (iOS)
  // or 0 (most Android). On web, insets.bottom returns 0 outside of an
  // installed PWA, so fall back to a comfortable 16px margin from the
  // viewport bottom.
  const bottomInset =
    Platform.OS === 'web' ? 16 : Math.max(insets.bottom, 12);

  const isDisabled = disabled || loading;

  return (
    <View
      style={[styles.wrap, { bottom: bottomInset }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.btn, isDisabled && styles.btnDisabled]}
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {loading ? (
          <ActivityIndicator color={C.white} />
        ) : (
          <Text style={styles.text}>{label}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    btn: {
      width: '75%',
      minHeight: 52,
      backgroundColor: C.accent,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 99,
      alignItems: 'center',
      justifyContent: 'center',
      // Soft drop shadow so the floating affordance reads against the
      // form content on light themes. Native-only via shadow* props;
      // elevation does the same on Android. No-op on web outside of
      // RN web's polyfill, but the colour contrast carries.
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    btnDisabled: {
      opacity: 0.4,
    },
    text: {
      fontSize: 16,
      fontWeight: '700',
      color: C.white,
      letterSpacing: 0.2,
    },
  });
