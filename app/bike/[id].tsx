import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useAppStore } from '../../store/useAppStore';
import {
  addComponent,
  retireComponent,
  deleteComponent,
  moveToStock,
  updateComponent,
  installOnBike,
} from '../../services/componentsService';
import { deleteBike, updateBike } from '../../services/bikesService';
import { getValidToken } from '../../services/stravaService';
import { Analytics } from '../../services/analytics';
import { Colors } from '../../constants/colors';
import { BIKE_TYPE_LABELS, BRAKE_SYSTEM_LABELS, COMPONENT_TYPES } from '../../constants/componentTypes';
import ComponentCard from '../../components/ComponentCard';
import AddComponentModal from '../../components/AddComponentModal';
import EditBikeModal from '../../components/EditBikeModal';
import EditComponentModal from '../../components/EditComponentModal';
import EmptyState from '../../components/EmptyState';
import SuccessBanner from '../../components/SuccessBanner';
import AppTabBar from '../../components/AppTabBar';
import { useTopInset } from '../../hooks/useTopInset';
import type { BikeComponent, ComponentCategory, StravaActivity, BikeType, BrakeSystem } from '../../types';

const STRAVA_API = 'https://www.strava.com/api/v3';

export default function BikeDetailScreen() {
  const topInset = useTopInset();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    userId,
    bikes,
    components,
    stravaTokens,
    addComponentLocal,
    updateComponentLocal,
    removeComponentLocal,
    removeBikeLocal,
    updateBikeLocal,
  } = useAppStore();

  const [showAdd, setShowAdd] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successName, setSuccessName] = useState('');
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [loadingRides, setLoadingRides] = useState(false);

  // Add Ride modal
  const [showAddRide, setShowAddRide] = useState(false);
  const [rideKm, setRideKm] = useState('');
  const [rideName, setRideName] = useState('');
  const [rideDate, setRideDate] = useState('');
  const [addingRide, setAddingRide] = useState(false);

  // Edit Bike modal
  const [showEditBike, setShowEditBike] = useState(false);

  // Edit Component modal
  const [editingComponent, setEditingComponent] = useState<BikeComponent | null>(null);

  const bike = bikes.find((b) => b.id === id);
  const bikeComponents = components.filter(
    (c) => c.bikeId === id && (showRetired ? true : c.status !== 'retired')
  );

  useEffect(() => {
    if (!bike?.stravaId || !stravaTokens || !userId) return;
    setLoadingRides(true);
    getValidToken(userId, stravaTokens)
      .then((tokens) =>
        fetch(STRAVA_API + '/athlete/activities?per_page=10&page=1', {
          headers: { Authorization: 'Bearer ' + tokens.accessToken },
        })
      )
      .then((r) => r.json())
      .then((data: StravaActivity[]) => {
        const bikeRides = data.filter((a) => a.gear_id === bike.stravaId);
        setActivities(bikeRides.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setLoadingRides(false));
  }, [bike?.stravaId, stravaTokens]);

  if (!bike) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Bike not found</Text>
      </View>
    );
  }

  const activeCount = components.filter((c) => c.bikeId === id && c.status === 'active').length;
  const retiredCount = components.filter((c) => c.bikeId === id && c.status === 'retired').length;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const doAddComponent = async (data: {
    name: string;
    category: ComponentCategory;
    brand: string;
    installDistance: number;
    maxLifespan: number;
    attentionFrequency?: number;
    notes: string;
    isElectric: boolean;
    lastCharged?: number;
    chargeIntervalDays?: number;
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
      attentionFrequency: data.attentionFrequency,
      status: 'active',
      notes: data.notes || undefined,
      isElectric: data.isElectric,
      lastCharged: data.lastCharged,
      chargeIntervalDays: data.chargeIntervalDays,
    });
    addComponentLocal(newComp);
    Analytics.addComponent(data.category, data.isElectric);
    setSuccessName(newComp.name);
    setShowSuccess(true);
  };

  const handleAddComponent = async (data: {
    name: string;
    category: ComponentCategory;
    brand: string;
    installDistance: number;
    maxLifespan: number;
    attentionFrequency?: number;
    notes: string;
    isElectric: boolean;
    lastCharged?: number;
    chargeIntervalDays?: number;
  }) => {
    if (!userId) return;

    // Check for an existing active component of the same category on this bike
    const existing = components.find(
      (c) => c.bikeId === id && c.status === 'active' && c.category === data.category
    );

    if (existing) {
      const typeLabel = COMPONENT_TYPES[data.category]?.label ?? data.category;
      Alert.alert(
        typeLabel + ' already installed',
        `"${existing.name}" is currently on this bike. What should happen to it?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Move to Stock',
            onPress: async () => {
              await moveToStock(userId, existing.id);
              updateComponentLocal(existing.id, { bikeId: null, status: 'in-stock', updatedAt: Date.now() });
              await doAddComponent(data);
            },
          },
          {
            text: 'Retire It',
            style: 'destructive',
            onPress: async () => {
              await retireComponent(userId, existing.id);
              updateComponentLocal(existing.id, { status: 'retired', updatedAt: Date.now() });
              await doAddComponent(data);
            },
          },
        ]
      );
      return;
    }

    await doAddComponent(data);
  };

  const handleEditSave = async (
    componentId: string,
    updates: Partial<Omit<BikeComponent, 'id' | 'createdAt'>>
  ) => {
    if (!userId) return;
    await updateComponent(userId, componentId, updates);
    updateComponentLocal(componentId, { ...updates, updatedAt: Date.now() });
    if (updates.category) Analytics.editComponent(updates.category);
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

  const handleDeleteComponent = async (componentId: string) => {
    if (!userId) return;
    const comp = components.find((c) => c.id === componentId);
    await deleteComponent(userId, componentId);
    removeComponentLocal(componentId);
    if (comp) Analytics.deleteComponent(comp.category);
  };

  const handleDeleteBike = () => {
    Alert.alert(
      'Delete Bike',
      'Delete "' + bike.name + '" and all its components? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            await deleteBike(userId, id);
            removeBikeLocal(id);
            Analytics.deleteBike();
            router.back();
          },
        },
      ]
    );
  };

  const handleSaveBike = async (data: {
    name: string;
    brand: string;
    type: BikeType;
    brakeSystem: BrakeSystem;
    color: string;
  }) => {
    if (!userId) return;
    await updateBike(userId, id, data);
    updateBikeLocal(id, { ...data, updatedAt: Date.now() });
    Analytics.editBike();
  };

  const handleAddRide = async () => {
    const km = Number(rideKm);
    if (!km || !userId) return;
    setAddingRide(true);
    try {
      const newDist = bike.totalDistance + km;
      await updateBike(userId, id, { totalDistance: newDist });
      updateBikeLocal(id, { totalDistance: newDist, updatedAt: Date.now() });
      setShowAddRide(false);
      setRideKm('');
      setRideName('');
      setRideDate('');
    } finally {
      setAddingRide(false);
    }
  };

  const openAddRide = () => {
    setRideDate(dayjs().format('D MMM YYYY'));
    setShowAddRide(true);
  };

  const formatMovingTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <SuccessBanner
        visible={showSuccess}
        title={successName + ' added!'}
        subtitle="Wear tracking has started."
        onHide={() => setShowSuccess(false)}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* Back button */}
        <TouchableOpacity
          style={[styles.backBtn, { paddingTop: topInset }]}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
        >
          <Ionicons name="arrow-back" size={18} color={Colors.accent} />
          <Text style={styles.backText}>Bikes</Text>
        </TouchableOpacity>

        {/* Bike hero */}
        <View style={styles.hero}>
          <View style={[styles.colorBar, { backgroundColor: bike.color }]} />
          <View style={styles.heroBody}>
            <View style={styles.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bikeName}>{bike.name}</Text>
                <Text style={styles.bikeMeta}>
                  {bike.brand ? bike.brand + ' · ' : ''}
                  {BIKE_TYPE_LABELS[bike.type]}
                  {' · '}
                  {BRAKE_SYSTEM_LABELS[bike.brakeSystem] ?? 'Disc'}
                </Text>
                <Text style={styles.bikeDate}>
                  Added {dayjs(bike.createdAt).format('D MMM YYYY')}
                </Text>
              </View>
              {/* Edit + Delete buttons */}
              <View style={styles.heroBtns}>
                <TouchableOpacity
                  onPress={() => setShowEditBike(true)}
                  style={styles.editBtn}
                >
                  <Ionicons name="pencil-outline" size={16} color={Colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeleteBike} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
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
              <TouchableOpacity style={styles.heroStat} onPress={openAddRide}>
                <Ionicons name="add-circle-outline" size={22} color={Colors.accent} />
                <Text style={styles.heroStatLabel}>add ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Last rides from Strava */}
        {bike.stravaId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last Rides</Text>
            {loadingRides ? (
              <ActivityIndicator color={Colors.accent} style={{ marginTop: 12 }} />
            ) : activities.length === 0 ? (
              <Text style={styles.noRides}>No recent Strava rides found for this bike.</Text>
            ) : (
              <View style={styles.rideList}>
                {activities.map((act) => (
                  <View key={act.id} style={styles.rideRow}>
                    <View style={styles.rideIcon}>
                      <Ionicons name="bicycle-outline" size={16} color={Colors.accent} />
                    </View>
                    <View style={styles.rideInfo}>
                      <Text style={styles.rideName} numberOfLines={1}>
                        {act.name}
                      </Text>
                      <Text style={styles.rideMeta}>
                        {Math.round(act.distance / 1000)} km
                        {' · '}
                        {formatMovingTime(act.moving_time)}
                        {' · '}
                        {dayjs(act.start_date).format('D MMM')}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

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
                  {showRetired ? 'Hide retired' : '+' + retiredCount + ' retired'}
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
              onPress={() => setEditingComponent(comp)}
              onEdit={() => setEditingComponent(comp)}
              onRetire={() => handleRetire(comp.id)}
              onMoveToStock={() => handleMoveToStock(comp.id)}
              onDelete={() => handleDeleteComponent(comp.id)}
            />
          ))
        )}
      </ScrollView>

      <AppTabBar active="bikes" />

      {/* Add Component modal */}
      <AddComponentModal
        visible={showAdd}
        bikeDistance={bike.totalDistance}
        brakeSystem={bike.brakeSystem}
        onClose={() => setShowAdd(false)}
        onAdd={handleAddComponent}
      />

      {/* Edit Bike modal */}
      <EditBikeModal
        visible={showEditBike}
        bike={bike}
        onClose={() => setShowEditBike(false)}
        onSave={handleSaveBike}
      />

      {/* Edit Component modal */}
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

      {/* Manual Add Ride modal */}
      <Modal
        visible={showAddRide}
        animationType="fade"
        transparent
        onRequestClose={() => setShowAddRide(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.rideModal}>
            <Text style={styles.rideModalTitle}>Add Ride</Text>

            {/* Date */}
            <View style={styles.rideFieldRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
              <TextInput
                style={[styles.rideInput, { flex: 1 }]}
                placeholder="Date — e.g. 15 Apr 2026"
                placeholderTextColor={Colors.textTertiary}
                value={rideDate}
                onChangeText={setRideDate}
              />
            </View>

            {/* Name */}
            <View style={styles.rideFieldRow}>
              <Ionicons name="text-outline" size={16} color={Colors.textSecondary} />
              <TextInput
                style={[styles.rideInput, { flex: 1 }]}
                placeholder="Ride name (optional)"
                placeholderTextColor={Colors.textTertiary}
                value={rideName}
                onChangeText={setRideName}
              />
            </View>

            {/* Distance */}
            <View style={styles.rideFieldRow}>
              <Ionicons name="speedometer-outline" size={16} color={Colors.textSecondary} />
              <TextInput
                style={[styles.rideInput, { flex: 1 }]}
                placeholder="Distance in km *"
                placeholderTextColor={Colors.textTertiary}
                value={rideKm}
                onChangeText={setRideKm}
                keyboardType="numeric"
                autoFocus
              />
            </View>

            <View style={styles.rideModalActions}>
              <TouchableOpacity
                style={styles.rideModalCancel}
                onPress={() => setShowAddRide(false)}
              >
                <Text style={{ color: Colors.textSecondary, fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rideModalSave, !rideKm && styles.rideModalSaveDisabled]}
                onPress={handleAddRide}
                disabled={!rideKm || addingRide}
              >
                {addingRide ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 15 }}>
                    {rideKm ? 'Add ' + Number(rideKm).toLocaleString() + ' km' : 'Add Ride'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: Colors.textSecondary, fontSize: 16 },
  content: { paddingBottom: 40 },

  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backText: { fontSize: 15, color: Colors.accent, fontWeight: '500' },

  hero: {
    flexDirection: 'row',
    margin: 20,
    marginTop: 4,
    backgroundColor: Colors.card,
    borderRadius: 20,
    overflow: 'hidden',
  },
  colorBar: { width: 5 },
  heroBody: { flex: 1, padding: 18, gap: 14 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bikeName: { fontSize: 22, fontWeight: '700', color: Colors.text, letterSpacing: -0.5 },
  bikeMeta: { fontSize: 13, color: Colors.textSecondary, marginTop: 3 },
  bikeDate: { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },
  heroBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.dangerDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStats: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, alignItems: 'center', gap: 3 },
  heroStatValue: { fontSize: 18, fontWeight: '700', color: Colors.text },
  heroStatLabel: { fontSize: 11, color: Colors.textSecondary },
  heroStatDivider: { width: 1, height: 32, backgroundColor: Colors.border },

  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 12 },
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

  noRides: { fontSize: 13, color: Colors.textSecondary },
  rideList: { backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden' },
  rideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rideIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideInfo: { flex: 1 },
  rideName: { fontSize: 14, fontWeight: '500', color: Colors.text },
  rideMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  rideModal: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    gap: 12,
  },
  rideModalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  rideFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  rideInput: {
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  rideModalActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  rideModalCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.surface,
  },
  rideModalSave: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.accent,
  },
  rideModalSaveDisabled: { opacity: 0.4 },
});
