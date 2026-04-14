import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useAppStore } from '../../store/useAppStore';
import {
  addComponent,
  retireComponent,
  deleteComponent,
} from '../../services/componentsService';
import { deleteBike } from '../../services/bikesService';
import { Colors } from '../../constants/colors';
import { BIKE_TYPE_LABELS } from '../../constants/componentTypes';
import ComponentCard from '../../components/ComponentCard';
import AddComponentModal from '../../components/AddComponentModal';
import EmptyState from '../../components/EmptyState';
import type { ComponentCategory } from '../../types';

export default function BikeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    userId,
    bikes,
    components,
    addComponentLocal,
    updateComponentLocal,
    removeComponentLocal,
    removeBikeLocal,
  } = useAppStore();

  const [showAdd, setShowAdd] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  const bike = bikes.find((b) => b.id === id);
  const bikeComponents = components.filter(
    (c) => c.bikeId === id && (showRetired ? true : c.status === 'active')
  );

  if (!bike) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Bike not found</Text>
      </View>
    );
  }

  const activeCount = components.filter((c) => c.bikeId === id && c.status === 'active').length;
  const retiredCount = components.filter((c) => c.bikeId === id && c.status === 'retired').length;

  const handleAddComponent = async (data: {
    name: string;
    category: ComponentCategory;
    brand: string;
    installDistance: number;
    maxLifespan: number;
    notes: string;
  }) => {
    if (!userId) return;
    const newComp = await addComponent(userId, {
      bikeId: id,
      name: data.name,
      category: data.category,
      brand: data.brand || undefined,
      installDate: Date.now(),
      installDistance: data.installDistance,
      maxLifespan: data.maxLifespan,
      status: 'active',
      notes: data.notes || undefined,
    });
    addComponentLocal(newComp);
  };

  const handleRetire = async (componentId: string) => {
    if (!userId) return;
    await retireComponent(userId, componentId);
    updateComponentLocal(componentId, { status: 'retired', updatedAt: Date.now() });
  };

  const handleDeleteComponent = async (componentId: string) => {
    if (!userId) return;
    await deleteComponent(userId, componentId);
    removeComponentLocal(componentId);
  };

  const handleDeleteBike = () => {
    Alert.alert(
      'Delete Bike',
      `Delete "${bike.name}" and all its components? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            await deleteBike(userId, id);
            removeBikeLocal(id);
            router.back();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Bike hero */}
        <View style={styles.hero}>
          <View style={[styles.colorBar, { backgroundColor: bike.color }]} />
          <View style={styles.heroBody}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.bikeName}>{bike.name}</Text>
                <Text style={styles.bikeMeta}>
                  {bike.brand ? `${bike.brand} · ` : ''}
                  {BIKE_TYPE_LABELS[bike.type]}
                </Text>
              </View>
              <TouchableOpacity onPress={handleDeleteBike} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={18} color={Colors.danger} />
              </TouchableOpacity>
            </View>

            {/* Stats */}
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>
                  {bike.totalDistance.toLocaleString()}
                </Text>
                <Text style={styles.heroStatLabel}>total km</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>{activeCount}</Text>
                <Text style={styles.heroStatLabel}>active parts</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>
                  {dayjs(bike.createdAt).format('MMM YYYY')}
                </Text>
                <Text style={styles.heroStatLabel}>added</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Components header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Components</Text>
          <View style={styles.sectionActions}>
            {retiredCount > 0 && (
              <TouchableOpacity
                onPress={() => setShowRetired((v) => !v)}
                style={styles.retiredToggle}
              >
                <Text style={styles.retiredToggleText}>
                  {showRetired ? 'Hide retired' : `+${retiredCount} retired`}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setShowAdd(true)} style={styles.addBtn}>
              <Ionicons name="add" size={18} color={Colors.accent} />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {bikeComponents.length === 0 ? (
          <EmptyState
            icon="construct-outline"
            title="No components yet"
            subtitle="Add your first component to start tracking wear."
          />
        ) : (
          bikeComponents.map((comp) => (
            <ComponentCard
              key={comp.id}
              component={comp}
              bikeDistance={bike.totalDistance}
              onRetire={() => handleRetire(comp.id)}
              onDelete={() => handleDeleteComponent(comp.id)}
            />
          ))
        )}
      </ScrollView>

      <AddComponentModal
        visible={showAdd}
        bikeDistance={bike.totalDistance}
        onClose={() => setShowAdd(false)}
        onAdd={handleAddComponent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: Colors.textSecondary, fontSize: 16 },
  content: { paddingBottom: 40 },

  hero: {
    flexDirection: 'row',
    margin: 20,
    marginTop: 100,
    backgroundColor: Colors.card,
    borderRadius: 20,
    overflow: 'hidden',
  },
  colorBar: { width: 5 },
  heroBody: { flex: 1, padding: 18, gap: 16 },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bikeName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  bikeMeta: { fontSize: 14, color: Colors.textSecondary, marginTop: 3 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.dangerDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStats: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 18, fontWeight: '700', color: Colors.text },
  heroStatLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  heroStatDivider: { width: 1, height: 32, backgroundColor: Colors.border },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  retiredToggle: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: Colors.surface,
  },
  retiredToggleText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: Colors.accentDim,
  },
  addBtnText: { fontSize: 14, fontWeight: '600', color: Colors.accent },

  componentsList: { paddingHorizontal: 20, gap: 10 },
});
