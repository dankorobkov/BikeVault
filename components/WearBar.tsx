import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import { getWearLevel, type WearLevel } from '../types';

const WEAR_COLORS: Record<WearLevel, string> = {
  good: Colors.good,
  warning: Colors.warning,
  critical: Colors.critical,
  overdue: Colors.danger,
};

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
  const level = getWearLevel(percent);
  const color = WEAR_COLORS[level];
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

const styles = StyleSheet.create({
  container: { gap: 4 },
  track: {
    backgroundColor: Colors.border,
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
