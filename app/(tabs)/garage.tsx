import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import { retireComponent, deleteComponent } from '../../services/componentsService';
import { Colors } from '../../constants/colors';
import { calcWearPercent, getWearLevel } from '../../types';
import ComponentCard from '../../components/ComponentCard';
import EmptyState from '../../components/EmptyState';

type Filter = 'all' | 'attention' | 'retired';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs Attention' },
  { key: 'retired', label: 'Retired' },
];

export default function GarageScreen() {
  const { userId, bikes, components, updateComponentLocal, removeComponentLocal } = useAppStore();
  const [filter, setFilter] = useState<Filter>('all');

  const getBike = (bikeId: string) => bikes.find((b) => b.id === bikeId);

  const filtered = components.filter((c) => {
    const bike = getBike(c.bikeId);
    if (!bike) return false;

    if (filter === 'retired') return c.status === 'retired';
    if (filter === 'attention') {
      if (c.status !== 'active') return false;
      const pct = calcWearPercent(bike.totalDistance, c.installDistance, c.maxLifespan);
      return pct >= 60;
    }
    return c.status === 'active';
  });

  // Sort: attention first, then by wear desc
  const sorted = [...filtered].sort((a, b) => {
    const bikeA = getBike(a.bikeId);
    const bikeB = getBike(b.bikeId);
    const pctA = bikeA ? calcWearPercent(bikeA.totalDistance, a.installDistance, a.maxLifespan) : 0;
    const pctB = bikeB ? calcWearPercent(bikeB.totalDistance, b.installDistance, b.maxLifespan) : 0;
    return pctB - pctA;
  });

  // Count attention components
  const attentionCount = components.filter((c) => {
    if (c.status !== 'active') return false;
    const bike = getBike(c.bikeId);
    if (!bike) return false;
    const pct = calcWearPercent(bike.totalDistance, c.installDistance, c.maxLifespan);
    return pct >= 60;
  }).length;

  const handleRetire = async (componentId: string) => {
    if (!userId) return;
    await retireComponent(userId, componentId);
    updateComponentLocal(componentId, { status: 'retired', updatedAt: Date.now() });
  };

  const handleDelete = async (componentId: string) => {
    if (!userId) return;
    await deleteComponent(userId, componentId);
    removeComponentLocal(componentId);
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Garage</Text>
        {attentionCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{attentionCount} need attention</Text>
          </View>
        )}
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {sorted.length === 0 ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title={
              filter === 'attention'
                ? 'All components look good!'
                : filter === 'retired'
                ? 'No retired components'
                : 'No components yet'
            }
            subtitle={
              filter === 'all'
                ? 'Add bikes and components to start tracking wear.'
                : undefined
            }
          />
        ) : (
          sorted.map((comp) => {
            const bike = getBike(comp.bikeId);
            if (!bike) return null;
            return (
              <View key={comp.id}>
                <Text style={styles.bikeLabel}>{bike.name}</Text>
                <ComponentCard
                  component={comp}
                  bikeDistance={bike.totalDistance}
                  onRetire={() => handleRetire(comp.id)}
                  onDelete={() => handleDelete(comp.id)}
                />
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
    gap: 6,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.warningDim,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.warning,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: Colors.surface,
  },
  filterTabActive: { backgroundColor: Colors.accentDim },
  filterText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  filterTextActive: { color: Colors.accent, fontWeight: '600' },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexGrow: 1,
  },
  bikeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 4,
    marginTop: 8,
    textTransform: 'uppercase',
  },
});
