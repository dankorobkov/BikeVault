import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BikeIcon from './BikeIcon';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';
import { BIKE_TYPE_LABELS, BIKE_TYPE_ICONS } from '../constants/componentTypes';
import { formatNumber } from '../constants/units';
import {
  calcWearPercent,
  isIndoorBike,
  type Bike,
  type BikeComponent,
} from '../types';

interface Props {
  bike: Bike;
  components: BikeComponent[];
  onPress: () => void;
}

export default function BikeCard({ bike, components, onPress }: Props) {
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const activeComponents = components.filter(
    (c) => c.bikeId === bike.id && c.status === 'active'
  );

  const wornComponents = activeComponents.filter((c) => {
    const pct = calcWearPercent(
      bike.totalDistance,
      c.installDistance,
      c.maxLifespan,
      c.priorWear ?? 0
    );
    return pct >= 80;
  });

  const criticalCount = activeComponents.filter((c) => {
    const pct = calcWearPercent(
      bike.totalDistance,
      c.installDistance,
      c.maxLifespan,
      c.priorWear ?? 0
    );
    return pct >= 100;
  }).length;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.card}>
      {/* Color strip */}
      <View style={[styles.colorStrip, { backgroundColor: bike.color }]} />

      <View style={styles.body}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.name} numberOfLines={1}>{bike.name}</Text>
            <Text style={styles.brand}>{bike.brand || BIKE_TYPE_LABELS[bike.type]}</Text>
          </View>
          {isIndoorBike(bike.type) && (
            <View style={styles.indoorBadge}>
              <Ionicons
                name={BIKE_TYPE_ICONS[bike.type] as any}
                size={11}
                color={C.accent}
              />
              <Text style={styles.indoorText}>Indoor</Text>
            </View>
          )}
          {criticalCount > 0 && (
            <View style={styles.alertBadge}>
              <BikeIcon name="overdue" variant="fill" size={12} accent={C.danger} />
              <Text style={styles.alertText}>{criticalCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Ionicons name="speedometer-outline" size={13} color={C.accent} />
            <Text style={styles.statValue}>{formatNumber(bike.totalDistance)}</Text>
            <Text style={styles.statUnit}>km</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <BikeIcon name="wrench" variant="line" size={13} color={C.textSecondary} />
            <Text style={styles.statValue}>{activeComponents.length}</Text>
            <Text style={styles.statUnit}>parts</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Ionicons
              name="alert-circle-outline"
              size={13}
              color={wornComponents.length > 0 ? C.warning : C.textSecondary}
            />
            <Text
              style={[
                styles.statValue,
                wornComponents.length > 0 && { color: C.warning },
              ]}
            >
              {wornComponents.length}
            </Text>
            <Text style={styles.statUnit}>worn</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderRadius: 16,
      flexDirection: 'row',
      overflow: 'hidden',
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    colorStrip: {
      width: 4,
    },
    body: {
      flex: 1,
      padding: 16,
      gap: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    titleBlock: {
      flex: 1,
    },
    name: {
      fontSize: 17,
      fontWeight: '700',
      color: C.text,
      letterSpacing: -0.3,
    },
    brand: {
      fontSize: 13,
      color: C.textSecondary,
      marginTop: 2,
    },
    indoorBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: C.accentDim,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 99,
    },
    indoorText: {
      fontSize: 11,
      fontWeight: '600',
      color: C.accent,
      letterSpacing: 0.3,
    },
    alertBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: C.dangerDim,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 99,
    },
    alertText: {
      fontSize: 12,
      fontWeight: '700',
      color: C.danger,
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    stat: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    statValue: {
      fontSize: 14,
      fontWeight: '600',
      color: C.text,
    },
    statUnit: {
      fontSize: 12,
      color: C.textSecondary,
    },
    divider: {
      width: 1,
      height: 16,
      backgroundColor: C.border,
      marginHorizontal: 8,
    },
  });
