import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import BikeIcon, { type BikeIconName } from './BikeIcon';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';
import { formatNumber } from '../constants/units';
import { COMPONENT_TYPES, COMPONENT_BIKE_ICON } from '../constants/componentTypes';
import { CHAIN_LUBE_TYPES } from '../constants/chainLube';
import WearBar from './WearBar';
import {
  calcWearPercent,
  calcRemainingKm,
  getWearLevel,
  formatWeight,
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

export default function ComponentCard({
  component,
  bikeDistance,
  onPress,
  onEdit,
  onRetire,
  onMoveToStock,
  onDelete,
}: Props) {
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const typeInfo = COMPONENT_TYPES[component.category] ?? {
    label: component.category,
    icon: 'construct-outline',
    defaultLifespan: 5000,
    group: 'other',
  };

  // Map this component's category to one of the new Apex BikeIcon
  // glyphs. Falls back to the wrench (service) icon for anything not
  // explicitly mapped.
  const bikeIconName = (COMPONENT_BIKE_ICON[component.category] ??
    'wrench') as BikeIconName;

  const isActive = component.status === 'active';
  const isInStock = component.status === 'in-stock';
  const isRetired = component.status === 'retired';

  const percent = isActive
    ? calcWearPercent(
        bikeDistance,
        component.installDistance,
        component.maxLifespan,
        component.priorWear ?? 0
      )
    : 0;
  const remaining = isActive
    ? calcRemainingKm(
        bikeDistance,
        component.installDistance,
        component.maxLifespan,
        component.priorWear ?? 0
      )
    : 0;
  const level = getWearLevel(percent);

  // Wear-tinted background for the icon — derived from the live palette
  // so it retints with the theme.
  const wearBgMap: Record<string, string> = {
    good: C.goodDim,
    warning: C.warningDim,
    critical: C.criticalDim,
    overdue: C.dangerDim,
  };
  const wearBg = isInStock ? C.surface : wearBgMap[level];

  const wearTint =
    isInStock
      ? C.textSecondary
      : level === 'good'
      ? C.good
      : level === 'warning'
      ? C.warning
      : level === 'critical'
      ? C.critical
      : C.danger;

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
        <BikeIcon
          name={bikeIconName}
          variant="fill"
          size={22}
          color={wearTint}
          accent={wearTint}
          hole={C.card}
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
                <Ionicons name="flash" size={12} color={C.warning} />
              )}
            </View>
            <Text style={styles.meta}>
              {typeInfo.label}
              {component.brand ? ' · ' + component.brand : ''}
              {' · '}
              {dayjs(component.installDate).format('MMM YYYY')}
              {typeof component.weight === 'number' && component.weight > 0
                ? ' · ' + formatWeight(component.weight)
                : ''}
            </Text>
          </View>

          {isInStock && (
            <View style={[styles.statusBadge, styles.stockBadge]}>
              <Text style={[styles.statusBadgeText, { color: C.accent }]}>In Stock</Text>
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
            <Ionicons name="time-outline" size={11} color={C.textTertiary} />
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
              color={lubeStatus.dueIn <= 0 ? C.danger : C.textTertiary}
            />
            <Text
              style={[
                styles.lubeText,
                lubeStatus.dueIn <= 0 && { color: C.danger, fontWeight: '600' },
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
              color={batteryPctLabel < 20 ? C.danger : C.warning}
            />
            <Text
              style={[
                styles.batteryText,
                { color: batteryPctLabel < 20 ? C.danger : C.textSecondary },
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

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    card: {
      backgroundColor: C.card,
      borderRadius: 14,
      flexDirection: 'row',
      padding: 14,
      gap: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.border,
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
    name: { fontSize: 15, fontWeight: '600', color: C.text, letterSpacing: -0.2 },
    meta: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    stockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusBadge: {
      backgroundColor: C.border,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 99,
    },
    stockBadge: { backgroundColor: C.accentDim },
    statusBadgeText: { fontSize: 11, fontWeight: '600', color: C.textSecondary },
    remaining: { fontSize: 11, color: C.textSecondary },
    attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    attentionText: { fontSize: 11, color: C.textTertiary },
    lubeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    lubeText: { fontSize: 11, color: C.textTertiary },
    batteryRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    batteryText: { fontSize: 12 },
  });
