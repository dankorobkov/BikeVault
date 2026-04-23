import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTopInset } from '../../hooks/useTopInset';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store/useAppStore';
import {
  retireComponent,
  deleteComponent,
  moveToStock,
  addComponent,
  updateComponent,
  installOnBike,
} from '../../services/componentsService';
import { Analytics } from '../../services/analytics';
import { Colors } from '../../constants/colors';
import { calcWearPercent } from '../../types';
import type { BikeComponent } from '../../types';
import ComponentCard from '../../components/ComponentCard';
import AddComponentModal from '../../components/AddComponentModal';
import EditComponentModal from '../../components/EditComponentModal';
import EmptyState from '../../components/EmptyState';
import SuccessBanner from '../../components/SuccessBanner';

type Filter = 'all' | 'in-stock' | 'attention' | 'retired';
type SortMode = 'wear' | 'bike';

const FILTERS: { key: Filter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'layers-outline' },
  { key: 'in-stock', label: 'In Stock', icon: 'archive-outline' },
  { key: 'attention', label: 'Attention', icon: 'warning-outline' },
  { key: 'retired', label: 'Retired', icon: 'checkmark-done-outline' },
];

export default function GarageScreen() {
  const topInset = useTopInset();
  const { userId, bikes, components, isDataLoading, updateComponentLocal, removeComponentLocal, addComponentLocal } =
    useAppStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('wear');
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(null); // null = all bikes
  const [showAddStock, setShowAddStock] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successName, setSuccessName] = useState('');
  const [editingComponent, setEditingComponent] = useState<BikeComponent | null>(null);

  const getBike = (bikeId: string | null) =>
    bikeId ? bikes.find((b) => b.id === bikeId) : undefined;

  // Reset bike filter when switching to tabs where it doesn't apply
  const bikeFilterApplies = filter === 'all' || filter === 'attention';

  const filtered = components.filter((c) => {
    // Bike filter (only when applicable)
    if (bikeFilterApplies && selectedBikeId !== null && c.bikeId !== selectedBikeId) return false;

    if (filter === 'retired') return c.status === 'retired';
    if (filter === 'in-stock') return c.status === 'in-stock';
    if (filter === 'attention') {
      if (c.status !== 'active') return false;
      const bike = getBike(c.bikeId);
      if (!bike) return false;
      const pct = calcWearPercent(bike.totalDistance, c.installDistance, c.maxLifespan);
      return pct >= 60;
    }
    // 'all': active + in-stock
    return c.status === 'active' || c.status === 'in-stock';
  });

  // Group by bike when no specific bike is selected; otherwise sort by wear
  const groupByBike = bikeFilterApplies && selectedBikeId === null;

  const sorted = [...filtered].sort((a, b) => {
    const bikeA = getBike(a.bikeId);
    const bikeB = getBike(b.bikeId);

    if (groupByBike || sortMode === 'bike') {
      // In-stock floats to bottom in grouped view
      if (a.status === 'in-stock' && b.status !== 'in-stock') return 1;
      if (b.status === 'in-stock' && a.status !== 'in-stock') return -1;
      const nameA = bikeA?.name ?? '';
      const nameB = bikeB?.name ?? '';
      const nameCmp = nameA.localeCompare(nameB);
      if (nameCmp !== 0) return nameCmp;
    }
    const pctA = bikeA ? calcWearPercent(bikeA.totalDistance, a.installDistance, a.maxLifespan) : 0;
    const pctB = bikeB ? calcWearPercent(bikeB.totalDistance, b.installDistance, b.maxLifespan) : 0;
    return pctB - pctA;
  });

  const attentionCount = components.filter((c) => {
    if (c.status !== 'active') return false;
    const bike = getBike(c.bikeId);
    if (!bike) return false;
    return calcWearPercent(bike.totalDistance, c.installDistance, c.maxLifespan) >= 60;
  }).length;

  const inStockCount = components.filter((c) => c.status === 'in-stock').length;

  const handleRetire = async (componentId: string) => {
    if (!userId) return;
    const comp = components.find((c) => c.id === componentId);
    await retireComponent(userId, componentId);
    updateComponentLocal(componentId, { status: 'retired', updatedAt: Date.now() });
    if (comp) Analytics.retireComponent(comp.category);
  };

  const handleMoveToStock = async (componentId: string) => {
    if (!userId) return;
    const comp = components.find((c) => c.id === componentId);
    await moveToStock(userId, componentId);
    updateComponentLocal(componentId, { bikeId: null, status: 'in-stock', updatedAt: Date.now() });
    if (comp) Analytics.moveToStock(comp.category);
  };

  const handleDelete = async (componentId: string) => {
    if (!userId) return;
    const comp = components.find((c) => c.id === componentId);
    await deleteComponent(userId, componentId);
    removeComponentLocal(componentId);
    if (comp) Analytics.deleteComponent(comp.category);
  };

  const handleEditSave = async (
    componentId: string,
    updates: Partial<Omit<BikeComponent, 'id' | 'createdAt'>>
  ) => {
    if (!userId) return;
    await updateComponent(userId, componentId, updates);
    updateComponentLocal(componentId, { ...updates, updatedAt: Date.now() });
    const comp = components.find((c) => c.id === componentId);
    if (comp) Analytics.editComponent(updates.category ?? comp.category);
  };

  const handleEditInstallOnBike = async (
    componentId: string,
    targetBikeId: string,
    dist: number
  ) => {
    if (!userId) return;
    const comp = components.find((c) => c.id === componentId);
    await installOnBike(userId, componentId, targetBikeId, dist);
    updateComponentLocal(componentId, {
      bikeId: targetBikeId,
      status: 'active',
      installDistance: dist,
      updatedAt: Date.now(),
    });
    if (comp) Analytics.installOnBike(comp.category);
  };

  const handleAddToStock = async (data: {
    name: string;
    category: any;
    brand: string;
    installDate: number;
    installDistance: number;
    maxLifespan: number;
    attentionFrequency?: number;
    notes: string;
    isElectric: boolean;
    lastCharged?: number;
    chargeIntervalDays?: number;
    lubeType?: any;
    lastLubedAt?: number;
    lubeIntervalKm?: number;
  }) => {
    if (!userId) return;
    const newComp = await addComponent(userId, {
      bikeId: null,
      name: data.name,
      category: data.category,
      brand: data.brand || undefined,
      installDate: data.installDate,
      installDistance: 0,
      maxLifespan: data.maxLifespan,
      attentionFrequency: data.attentionFrequency,
      status: 'in-stock',
      notes: data.notes || undefined,
      isElectric: data.isElectric,
      lastCharged: data.lastCharged,
      chargeIntervalDays: data.chargeIntervalDays,
      lubeType: data.lubeType,
      lastLubedAt: data.lastLubedAt,
      lubeIntervalKm: data.lubeIntervalKm,
      // Parts added to stock haven't been ridden since the lube was
      // applied, so km-since-lube starts at 0.
      lubeDistanceAtLastLube: data.lubeType ? 0 : undefined,
    });
    addComponentLocal(newComp);
    Analytics.addComponent(data.category, data.isElectric);
    setSuccessName(newComp.name);
    setShowSuccess(true);
  };

  return (
    <View style={styles.root}>
      <SuccessBanner
        visible={showSuccess}
        title={successName + ' added to stock!'}
        subtitle="Install it on a bike from the Bikes tab."
        onHide={() => setShowSuccess(false)}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset, backgroundColor: Colors.bg }]}>
        <View>
          <Text style={styles.title}>Garage</Text>
        </View>
        <View style={styles.headerRight}>
          {/* Sort toggle */}
          <View style={styles.sortToggle}>
            <TouchableOpacity
              style={[styles.sortBtn, sortMode === 'wear' && styles.sortBtnActive]}
              onPress={() => setSortMode('wear')}
            >
              <Text style={[styles.sortBtnText, sortMode === 'wear' && styles.sortBtnTextActive]}>
                Wear
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortBtn, sortMode === 'bike' && styles.sortBtnActive]}
              onPress={() => setSortMode('bike')}
            >
              <Text style={[styles.sortBtnText, sortMode === 'bike' && styles.sortBtnTextActive]}>
                Bike
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddStock(true)}>
            <Ionicons name="add" size={20} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter tabs — wrapped in a View to prevent RNW from applying flex:1
           to the ScrollView's outer container, which causes it to fight the
           flex-column layout and overlap the header above it. */}
      <View style={styles.filterWrapper}>
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
      </View>

      {/* Bike filter pills — shown for All and Attention tabs */}
      {bikeFilterApplies && bikes.length > 1 && (
        <View style={styles.bikeFilterWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.bikeFilterRow}
          >
            <TouchableOpacity
              style={[styles.bikePill, selectedBikeId === null && styles.bikePillActive]}
              onPress={() => setSelectedBikeId(null)}
            >
              <Text style={[styles.bikePillText, selectedBikeId === null && styles.bikePillTextActive]}>
                All Bikes
              </Text>
            </TouchableOpacity>
            {bikes.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.bikePill, selectedBikeId === b.id && styles.bikePillActive]}
                onPress={() => setSelectedBikeId(selectedBikeId === b.id ? null : b.id)}
              >
                <Text style={[styles.bikePillText, selectedBikeId === b.id && styles.bikePillTextActive]}>
                  {b.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {sorted.length === 0 ? (
          isDataLoading ? (
            // Data is still fetching in the background — show a spinner instead
            // of the empty state so it doesn't flash misleadingly.
            <View style={styles.loadingCenter}>
              <ActivityIndicator size="large" color={Colors.accent} />
            </View>
          ) : (
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
                  ? 'All components look good!'
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
          )
        ) : (
          sorted.map((comp, idx) => {
            const bike = comp.bikeId ? getBike(comp.bikeId) : undefined;
            const prev = idx > 0 ? sorted[idx - 1] : null;
            // Show group header only when the bike group changes
            const showHeader =
              idx === 0 ||
              (comp.status === 'in-stock' && prev?.status !== 'in-stock') ||
              (comp.status !== 'in-stock' && comp.bikeId !== prev?.bikeId);
            return (
              <View key={comp.id}>
                {showHeader && (
                  comp.status === 'in-stock' ? (
                    <Text style={styles.bikeLabel}>In Stock</Text>
                  ) : bike ? (
                    <Text style={styles.bikeLabel}>{bike.name}</Text>
                  ) : null
                )}
                <ComponentCard
                  component={comp}
                  bikeDistance={bike?.totalDistance ?? 0}
                  onPress={() => setEditingComponent(comp)}
                  onEdit={() => setEditingComponent(comp)}
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

      <EditComponentModal
        visible={editingComponent !== null}
        component={editingComponent}
        bikes={bikes}
        onClose={() => setEditingComponent(null)}
        onSave={handleEditSave}
        onRetire={handleRetire}
        onMoveToStock={handleMoveToStock}
        onInstallOnBike={handleEditInstallOnBike}
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
    paddingBottom: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  sortToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 2,
  },
  sortBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sortBtnActive: { backgroundColor: Colors.accentDim },
  sortBtnText: { fontSize: 12, fontWeight: '500', color: Colors.textSecondary },
  sortBtnTextActive: { color: Colors.accent, fontWeight: '600' },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterWrapper: {
    flexShrink: 0,
    flexGrow: 0,
  },
  filterScroll: {
    flexShrink: 0,
  },
  bikeFilterWrapper: {
    flexShrink: 0,
    flexGrow: 0,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  bikeFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  bikePill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bikePillActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  bikePillText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  bikePillTextActive: { color: Colors.accent, fontWeight: '600' },
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
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
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
