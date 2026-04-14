import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { Colors } from '../constants/colors';
import { COMPONENT_TYPES } from '../constants/componentTypes';
import WearBar from './WearBar';
import {
  calcWearPercent,
  calcRemainingKm,
  getWearLevel,
  type BikeComponent,
} from '../types';

interface Props {
  component: BikeComponent;
  bikeDistance: number;
  onRetire?: () => void;
  onDelete?: () => void;
}

const WEAR_BG: Record<string, string> = {
  good: Colors.goodDim,
  warning: Colors.warningDim,
  critical: Colors.criticalDim,
  overdue: Colors.dangerDim,
};

export default function ComponentCard({
  component,
  bikeDistance,
  onRetire,
  onDelete,
}: Props) {
  const typeInfo = COMPONENT_TYPES[component.category];
  const percent = calcWearPercent(
    bikeDistance,
    component.installDistance,
    component.maxLifespan
  );
  const remaining = calcRemainingKm(
    bikeDistance,
    component.installDistance,
    component.maxLifespan
  );
  const level = getWearLevel(percent);
  const wearBg = WEAR_BG[level];

  const handleOptions = () => {
    if (component.status === 'retired') return;
    Alert.alert(component.name, 'What would you like to do?', [
      {
        text: 'Mark as Retired',
        onPress: onRetire,
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete Component', `Delete "${component.name}"? This cannot be undone.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onDelete },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={[styles.card, component.status === 'retired' && styles.retired]}>
      <View style={[styles.iconBox, { backgroundColor: wearBg }]}>
        <Ionicons
          name={typeInfo.icon as React.ComponentProps<typeof Ionicons>['name']}
          size={20}
          color={
            level === 'good'
              ? Colors.good
              : level === 'warning'
              ? Colors.warning
              : level === 'critical'
              ? Colors.critical
              : Colors.danger
          }
        />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.name} numberOfLines={1}>
              {component.name}
            </Text>
            <Text style={styles.meta}>
              {typeInfo.label}
              {component.brand ? ` · ${component.brand}` : ''}
              {' · '}
              {dayjs(component.installDate).format('MMM YYYY')}
            </Text>
          </View>

          {component.status === 'active' ? (
            <TouchableOpacity onPress={handleOptions} hitSlop={8} style={styles.moreBtn}>
              <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.retiredBadge}>
              <Text style={styles.retiredText}>Retired</Text>
            </View>
          )}
        </View>

        {component.status === 'active' && (
          <>
            <WearBar percent={percent} showLabel showPercent height={5} />
            <Text style={styles.remaining}>
              {remaining > 0
                ? `~${remaining.toLocaleString()} km remaining`
                : `${Math.abs(remaining)} km overdue`}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    marginBottom: 10,
  },
  retired: {
    opacity: 0.5,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  titleBlock: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  moreBtn: {
    padding: 2,
  },
  remaining: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  retiredBadge: {
    backgroundColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  retiredText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
