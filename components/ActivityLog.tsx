import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';
import type { ActivityAction, ActivityEntry } from '../services/activityService';

dayjs.extend(relativeTime);

/**
 * "Latest actions" — a compact, read-only history of the last few user
 * actions on a bike or component. Data comes from `activityService`; this
 * component is purely presentational.
 */

const ICONS: Record<ActivityAction, keyof typeof Ionicons.glyphMap> = {
  bike_added: 'add-circle-outline',
  bike_edited: 'create-outline',
  ride_added: 'bicycle-outline',
  component_added: 'add-circle-outline',
  component_edited: 'create-outline',
  component_installed: 'construct-outline',
  component_retired: 'archive-outline',
  component_stocked: 'cube-outline',
  component_deleted: 'trash-outline',
};

interface Props {
  entries: ActivityEntry[];
  title?: string;
}

export default function ActivityLog({ entries, title = 'Latest actions' }: Props) {
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      <View style={styles.card}>
        {entries.length === 0 ? (
          <View style={styles.emptyRow}>
            <Ionicons name="time-outline" size={16} color={C.textTertiary} />
            <Text style={styles.empty}>No recent actions yet</Text>
          </View>
        ) : (
          entries.map((e, i) => (
            <View key={e.id}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.row}>
                <View style={styles.iconBox}>
                  <Ionicons name={ICONS[e.action] ?? 'ellipse-outline'} size={15} color={C.accent} />
                </View>
                <Text style={styles.label} numberOfLines={2}>
                  {e.label}
                </Text>
                <Text style={styles.time}>{dayjs(e.at).fromNow()}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    wrap: { gap: 10 },
    title: {
      fontSize: 11,
      fontWeight: '600',
      color: C.textSecondary,
      letterSpacing: 1,
    },
    card: { backgroundColor: C.card, borderRadius: 16, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
    iconBox: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: C.accentDim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { flex: 1, fontSize: 14, color: C.text },
    time: { fontSize: 12, color: C.textTertiary },
    divider: { height: 1, backgroundColor: C.border, marginLeft: 14 },
    emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
    empty: { fontSize: 13, color: C.textTertiary },
  });
