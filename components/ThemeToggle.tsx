import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';
import BikeIcon, { type BikeIconName } from './BikeIcon';

/**
 * Three-way Auto / Light / Dark segmented control.
 *
 * - 'Auto' follows the OS appearance.
 * - 'Light' / 'Dark' force the corresponding scheme.
 * The choice is persisted across launches by ThemeProvider.
 */

const OPTIONS: { mode: ThemeMode; label: string; icon: BikeIconName }[] = [
  { mode: 'auto', label: 'Auto', icon: 'sync' },
  { mode: 'light', label: 'Light', icon: 'complete' },
  { mode: 'dark', label: 'Dark', icon: 'parts' },
];

export default function ThemeToggle() {
  const { mode, setMode, resolved } = useTheme();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  return (
    <View style={styles.wrap}>
      {OPTIONS.map((opt) => {
        const isActive = mode === opt.mode;
        return (
          <TouchableOpacity
            key={opt.mode}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => setMode(opt.mode)}
            activeOpacity={0.85}
          >
            <BikeIcon
              name={opt.icon}
              variant={isActive ? 'fill' : 'line'}
              size={16}
              color={isActive ? C.accent : C.textSecondary}
              accent={C.accent}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {opt.label}
            </Text>
            {opt.mode === 'auto' && isActive && (
              <Text style={styles.hint}>
                {' · '}
                {resolved === 'dark' ? 'Dark' : 'Light'}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      backgroundColor: C.surface,
      borderRadius: 12,
      padding: 4,
      gap: 4,
      margin: 16,
      marginTop: 4,
    },
    pill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 8,
      borderRadius: 9,
    },
    pillActive: {
      backgroundColor: C.accentDim,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: C.textSecondary,
    },
    labelActive: {
      color: C.accent,
    },
    hint: {
      fontSize: 11,
      color: C.textTertiary,
      fontWeight: '500',
    },
  });
