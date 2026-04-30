import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';
import { getWearLevel, type WearLevel } from '../types';

const WEAR_LABELS: Record<WearLevel, string> = {
  good: 'Good',
  warning: 'Monitor',
  critical: 'Replace Soon',
  overdue: 'Overdue',
};

interface Props {
  percent: number;
  showLabel?: boolean;
  showPercent?: boolean;
  height?: number;
}

export default function WearBar({
  percent,
  showLabel = false,
  showPercent = true,
  height = 6,
}: Props) {
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  // Look up wear-level color from the live palette so it retints with
  // the theme (status colors are tuned per scheme for AA contrast).
  const wearColors: Record<WearLevel, string> = {
    good: C.good,
    warning: C.warning,
    critical: C.critical,
    overdue: C.danger,
  };

  const level = getWearLevel(percent);
  const color = wearColors[level];
  const filled = Math.min(percent, 100);

  return (
    <View style={styles.container}>
      <View style={[styles.track, { height }]}>
        <View
          style={[
            styles.fill,
            { width: `${filled}%`, backgroundColor: color, height },
          ]}
        />
      </View>
      {(showLabel || showPercent) && (
        <View style={styles.row}>
          {showLabel && (
            <Text style={[styles.label, { color }]}>{WEAR_LABELS[level]}</Text>
          )}
          {showPercent && (
            <Text style={[styles.percent, { color }]}>{percent}%</Text>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    container: { gap: 4 },
    track: {
      backgroundColor: C.border,
      borderRadius: 99,
      overflow: 'hidden',
    },
    fill: {
      borderRadius: 99,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    label: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.3,
    },
    percent: {
      fontSize: 11,
      fontWeight: '700',
    },
  });
