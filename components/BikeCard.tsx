import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { BIKE_TYPE_LABELS } from '../constants/componentTypes';
import { calcWearPercent, getWearLevel, type Bike, type BikeComponent } from '../types';

interface Props {
  bike: Bike;
  components: BikeComponent[];
  onPress: () => void;
}

export default function BikeCard({ bike, components, onPress }: Props) {
  const activeComponents = components.filter(
    (c) => c.bikeId === bike.id && c.status === 'active'
  );

  const wornComponents = activeComponents.filter((c) => {
    const pct = calcWearPercent(bike.totalDistance, c.installDistance, c.maxLifespan);
    return pct >= 80;
  });

  const criticalCount = activeComponents.filter((c) => {
    const pct = calcWearPercent(bike.totalDistance, c.installDistance, c.maxLifespan);
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
          {criticalCount > 0 && (
            <View style={styles.alertBadge}>
              <Ionicons name="warning" size={12} color={Colors.danger} />
              <Text style={styles.alertText}>{criticalCount}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Ionicons name="speedometer-outline" size={13} color={Colors.accent} />
            <Text style={styles.statValue}>{bike.totalDistance.toLocaleString()}</Text>
            <Text style={styles.statUnit}>km</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Ionicons name="construct-outline" size={13} color={Colors.textSecondary} />
            <Text style={styles.statValue}>{activeComponents.length}</Text>
            <Text style={styles.statUnit}>parts</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Ionicons
              name="alert-circle-outline"
              size={13}
              color={wornComponents.length > 0 ? Colors.warning : Colors.textSecondary}
            />
            <Text
              style={[
                styles.statValue,
                wornComponents.length > 0 && { color: Colors.warning },
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 12,
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
    color: Colors.text,
    letterSpacing: -0.3,
  },
  brand: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.dangerDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  alertText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.danger,
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
    color: Colors.text,
  },
  statUnit: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
  },
});
