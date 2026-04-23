import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { Colors } from '../constants/colors';
import { formatNumber } from '../constants/units';
import { COMPONENT_TYPES } from '../constants/componentTypes';
import { CHAIN_LUBE_TYPES } from '../constants/chainLube';
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
  onPress?: () => void;
  onEdit?: () => void;
  onRetire?: () => void;
  onMoveToStock?: () => void;
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
  onPress,
  onEdit,
  onRetire,
  onMoveToStock,
  onDelete,
}: Props) {
  const typeInfo = COMPONENT_TYPES[component.category] ?? {
    label: component.category,
    icon: 'construct-outline',
    defaultLifespan: 5000,
    group: 'other',
  };

  const isActive = component.status === 'active';
  const isInStock = component.status === 'in-stock';
  const isRetired = component.status === 'retired';

  const percent = isActive
    ? calcWearPercent(bikeDistance, component.installDistance, component.maxLifespan)
    : 0;
  const remaining = isActive
    ? calcRemainingKm(bikeDistance, component.installDistance, component.maxLifespan)
    : 0;
  const level = getWearLevel(percent);
  const wearBg = isInStock ? Colors.surface : WEAR_BG[level];

  // Electric battery estimation
  const batteryPctLabel = (() => {
    if (!component.isElectric || !component.lastCharged || !component.chargeIntervalDays) return null;
    const daysSinceCharge = (Date.now() - component.lastCharged) / 86400000;
    const pct = Math.max(0, Math.round(100 - (daysSinceCharge / component.chargeIntervalDays) * 100));
    return pct;
  })();

  // Chain-lube estimation — km since last lube compared to configured
  // interval. Renders "Next lube in ~X km" / "Lube due" beneath the card.
  const lubeStatus = (() => {
    if (component.category !== 'chain') return null;
    if (!component.lubeType || !isActive) return null;
    const meta = CHAIN_LUBE_TYPES[component.lubeType];
    const intervalKm = component.lubeIntervalKm ?? meta.defaultIntervalKm;
    const baseline = component.lubeDistanceAtLastLube ?? component.installDistance;
    const kmSince = Math.max(0, bikeDistance - baseline);
    const dueIn = intervalKm - kmSince;
    return { meta, intervalKm, kmSince, dueIn };
  })();

  return (
    <TouchableOpacity
      style={[styles.card, isRetired && styles.retired]}
      onPress={onPress ?? onEdit}
      activeOpacity={onPress || onEdit ? 0.75 : 1}
    >
      {/* Icon */}
      <View style={[styles.iconBox, { backgroundColor: wearBg }]}>
        <Ionicons
          name={typeInfo.icon as React.ComponentProps<typeof Ionicons>['name']}
          size={20}
          color={
            isInStock
              ? Colors.textSecondary
              : level === 'good'
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
        {/* Title row */}
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {component.name}
              </Text>
              {component.isElectric && (
                <Ionicons name="flash" size={12} color={Colors.warning} />
              )}
            </View>
            <Text style={styles.meta}>
              {typeInfo.label}
              {component.brand ? ' · ' + component.brand : ''}
              {' · '}
              {dayjs(component.installDate).format('MMM YYYY')}
            </Text>
          </View>

          {isInStock && (
            <View style={[styles.statusBadge, styles.stockBadge]}>
              <Text style={[styles.statusBadgeText, { color: Colors.accent }]}>In Stock</Text>
            </View>
          )}
        </View>

        {/* Wear bar (active only) */}
        {isActive && (
          <>
            <WearBar percent={percent} showLabel showPercent height={5} />
            <Text style={styles.remaining}>
              {remaining > 0
                ? '~' + formatNumber(remaining) + ' km remaining'
                : formatNumber(Math.abs(remaining)) + ' km overdue'}
            </Text>
          </>
        )}

        {/* Attention frequency notice */}
        {isActive && component.attentionFrequency && (
          <View style={styles.attentionRow}>
            <Ionicons name="time-outline" size={11} color={Colors.textTertiary} />
            <Text style={styles.attentionText}>
              Service every {formatNumber(component.attentionFrequency)} km
            </Text>
          </View>
        )}

        {/* Chain lube status */}
        {lubeStatus && (
          <View style={styles.lubeRow}>
            <Ionicons
              name={lubeStatus.meta.icon}
              size={11}
              color={lubeStatus.dueIn <= 0 ? Colors.danger : Colors.textTertiary}
            />
            <Text
              style={[
                styles.lubeText,
                lubeStatus.dueIn <= 0 && { color: Colors.danger, fontWeight: '600' },
              ]}
            >
              {lubeStatus.dueIn <= 0
                ? lubeStatus.meta.shortLabel +
                  ' · lube due (' +
                  formatNumber(Math.round(-lubeStatus.dueIn)) +
                  ' km over)'
                : lubeStatus.meta.shortLabel +
                  ' · next lube in ~' +
                  formatNumber(Math.round(lubeStatus.dueIn)) +
                  ' km'}
            </Text>
          </View>
        )}

        {/* Electric battery indicator */}
        {component.isElectric && batteryPctLabel !== null && (
          <View style={styles.batteryRow}>
            <Ionicons
              name="battery-half-outline"
              size={13}
              color={batteryPctLabel < 20 ? Colors.danger : Colors.warning}
            />
            <Text
              style={[
                styles.batteryText,
                { color: batteryPctLabel < 20 ? Colors.danger : Colors.textSecondary },
              ]}
            >
              ~{batteryPctLabel}% battery · last charged{' '}
              {dayjs(component.lastCharged).fromNow()}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
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
  retired: { opacity: 0.5 },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleBlock: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 15, fontWeight: '600', color: Colors.text, letterSpacing: -0.2 },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusBadge: {
    backgroundColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  stockBadge: { backgroundColor: Colors.accentDim },
  statusBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  remaining: { fontSize: 11, color: Colors.textSecondary },
  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  attentionText: { fontSize: 11, color: Colors.textTertiary },
  lubeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lubeText: { fontSize: 11, color: Colors.textTertiary },
  batteryRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  batteryText: { fontSize: 12 },
});
