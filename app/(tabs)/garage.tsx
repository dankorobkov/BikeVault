import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store/useAppStore';
import {
  retireComponent,
  deleteComponent,
  moveToStock,
  addComponent,
} from '../../services/componentsService';
import { Colors } from '../../constants/colors';
import { calcWearPercent } from '../../types';
import ComponentCard from '../../components/ComponentCard';
import AddComponentModal from '../../components/AddComponentModal';
import EmptyState from '../../components/EmptyState';
import SuccessBanner from '../../components/SuccessBanner';

type Filter = 'all' | 'in-stock' | 'attention' | 'retired';

const FILTERS: { key: Filter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'layers-outline' },
  { key: 'in-stock', label: 'In Stock', icon: 'archive-outline' },
  { key: 'attention', label: 'Attention', icon: 'warning-outline' },
  { key: 'retired', label: 'Retired', icon: 'checkmark-done-outline' },
];

export default function GarageScreen() {
  const { userId, bikes, components, updateComponentLocal, removeComponentLocal, addComponentLocal } =
    useAppStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [showAddStock, setShowAddStock] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successName, setSuccessName] = useState('');

  const getBike = (bikeId: string | null) =>
    bikeId ? bikes.find((b) => b.id === bikeId) : undefined;

  const filtered = components.filter((c) => {
    if (filter === 'retired') return c.status === 'retired';
    if (filter === 'in-stock') return c.status === 'in-stock';
    if (filter === 'attention') {
      if (c.status \!== 'active') return false;
      const bike = getBike(c.bikeId);
      if (\!bike) return false;
      const pct = calcWearPercent(bike.totalDistance, c.installDistance, c.maxLifespan);
      return pct >= 60;
    }
    // 'all': active + in-stock
    return c.status === 'active' || c.status === 'in-stock';
  });

  const sorted = [...filtered].sort((a, b) => {
    // In-stock at the top of "all" view
    if (filter === 'all') {
      if (a.status === 'in-stock' && b.status \!== 'in-stock') return -1;
      if (b.status === 'in-stock' && a.status \!== 'in-stock') return 1;
    }
    const bikeA = getBike(a.bikeId);
    const bikeB = getBike(b.bikeId);
    const pctA = bikeA ? calcWearPercent(bikeA.totalDistance, a.installDistance, a.maxLifespan) : 0;
    const pctB = bikeB ? calcWearPercent(bikeB.totalDistance, b.installDistance, b.maxLifespan) : 0;
    return pctB - pctA;
  });

  const attentionCount = components.filter((c) => {
    if (c.status \!== 'active') return false;
    const bike = getBike(c.bikeId);
    if (\!bike) return false;
    return calcWearPercent(bike.totalDistance, c.installDistance, c.maxLifespan) >= 60;
  }).length;

  const inStockCount = components.filter((c) => c.status === 'in-stock').length;

  const handleRetire = async (componentId: string) => {
    if (\!userId) return;
    await retireComponent(userId, componentId);
    updateComponentLocal(componentId, { status: 'retired', updatedAt: Date.now() });
  };

  const handleMoveToStock = async (componentId: string) => {
    if (\!userId) return;
    await moveToStock(userId, componentId);
    updateComponentLocal(componentId, { bikeId: null, status: 'in-stock', updatedAt: Date.now() });
  };

  const handleDelete = async (componentId: string) => {
    if (\!userId) return;
    await deleteComponent(userId, componentId);
    removeComponentLocal(componentId);
  };

  const handleAddToStock = async (data: {
    name: string;
    category: any;
    brand: string;
    installDistance: number;
    maxLifespan: number;
    attentionFrequency?: number;
    notes: string;
    isElectric: boolean;
    lastCharged?: number;
    chargeIntervalDays?: number;
  }) => {
    if (\!userId) return;
    const newComp = await addComponent(userId, {
      bikeId: null,
      name: data.name,
      category: data.category,
      brand: data.brand || undefined,
      installDate: Date.now(),
      installDistance: 0,
      maxLifespan: data.maxLifespan,
      attentionFrequency: data.attentionFrequency,
      status: 'in-stock',
      notes: data.notes || undefined,
      isElectric: data.isElectric,
      lastCharged: data.lastCharged,
      chargeIntervalDays: data.chargeIntervalDays,
    });
    addComponentLocal(newComp);
    setSuccessName(newComp.name);
    setShowSuccess(true);
  };

  return (
    <View style={styles.root}>
      <SuccessBanner
        visible={showSuccess}
        title={successName + ' added to stock\!'}
        subtitle="Install it on a bike from the Bikes tab."
        onHide={() => setShowSuccess(false)}
      />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Garage</Text>
          {attentionCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{attentionCount} need attention</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddStock(true)}>
          <Ionicons name="add" size={20} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const badge = f.key === 'attention' ? attentionCount : f.key === 'in-stock' ? inStockCount : 0;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
              onPress={() => setFilter(f.key)}
            >
              <Ionicons
                name={f.icon as any}
                size={14}
                color={filter === f.key ? Colors.accent : Colors.textSecondary}
              />
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
              {badge > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content}>
        {sorted.length === 0 ? (
          <EmptyState
            icon={
              filter === 'attention'
                ? 'checkmark-circle-outline'
                : filter === 'retired'
                ? 'archive-outline'
                : filter === 'in-stock'
                ? 'archive-outline'
                : 'construct-outline'
            }
            title={
              filter === 'attention'
                ? 'All components look good\!'
                : filter === 'retired'
                ? 'No retired components'
                : filter === 'in-stock'
                ? 'No components in stock'
                : 'No components yet'
            }
            subtitle={
              filter === 'all'
                ? 'Add bikes and components to start tracking wear.'
                : filter === 'in-stock'
                ? 'Tap + to add a component to your stock.'
                : undefined
            }
          />
        ) : (
          sorted.map((comp) => {
            const bike = comp.bikeId ? getBike(comp.bikeId) : undefined;
            return (
              <View key={comp.id}>
                {comp.status === 'in-stock' ? (
                  <Text style={styles.bikeLabel}>In Stock</Text>
                ) : bike ? (
                  <Text style={styles.bikeLabel}>{bike.name}</Text>
                ) : null}
                <ComponentCard
                  component={comp}
                  bikeDistance={bike?.totalDistance ?? 0}
                  onRetire={comp.status === 'active' ? () => handleRetire(comp.id) : undefined}
                  onMoveToStock={comp.status === 'active' ? () => handleMoveToStock(comp.id) : undefined}
                  onDelete={() => handleDelete(comp.id)}
                />
              </View>
            );
          })
        )}
      </ScrollView>

      <AddComponentModal
        visible={showAddStock}
        bikeDistance={0}
        inStockMode
        onClose={() => setShowAddStock(false)}
        onAdd={handleAddToStock}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 60,
    paddingBottom: 12,
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
    marginTop: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: Colors.warning },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  filterScroll: { maxHeight: 52 },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: Colors.surface,
  },
  filterTabActive: { backgroundColor: Colors.accentDim },
  filterText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  filterTextActive: { color: Colors.accent, fontWeight: '600' },
  filterBadge: {
    backgroundColor: Colors.warning,
    borderRadius: 99,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  filterBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.black },
  content: { paddingHorizontal: 20, paddingBottom: 24, flexGrow: 1 },
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
