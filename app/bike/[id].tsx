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
} from '../../services/componentsService';
import { deleteBike, updateBike } from '../../services/bikesService';
import { getValidToken } from '../../services/stravaService';
import { Colors } from '../../constants/colors';
import { BIKE_TYPE_LABELS, BRAKE_SYSTEM_LABELS } from '../../constants/componentTypes';
import ComponentCard from '../../components/ComponentCard';
import AddComponentModal from '../../components/AddComponentModal';
import EmptyState from '../../components/EmptyState';
import SuccessBanner from '../../components/SuccessBanner';
import type { ComponentCategory, StravaActivity } from '../../types';

const STRAVA_API = 'https://www.strava.com/api/v3';

export default function BikeDetailScreen() {
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
  const [showAddRide, setShowAddRide] = useState(false);
  const [rideKm, setRideKm] = useState('');
  const [rideName, setRideName] = useState('');
  const [addingRide, setAddingRide] = useState(false);

  const bike = bikes.find((b) => b.id === id);
  const bikeComponents = components.filter(
    (c) => c.bikeId === id && (showRetired ? true : c.status !== 'retired')
  );

  useEffect(() => {
    if (!bike?.stravaId || !stravaTokens || !userId) return;
    setLoadingRides(true);
    getValidToken(userId, stravaTokens)
      .then((tokens) =>
        fetch(
          STRAVA_API +
            '/athlete/activities?per_page=10&page=1',
          { headers: { Authorization: 'Bearer ' + tokens.accessToken } }
        )
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
    setSuccessName(newComp.name);
    setShowSuccess(true);
  };

  const handleRetire = async (componentId: string) => {
    if (!userId) return;
    await retireComponent(userId, componentId);
    updateComponentLocal(componentId, { status: 'retired', updatedAt: Date.now() });
  };

  const handleMoveToStock = async (componentId: string) => {
    if (!userId) return;
    await moveToStock(userId, componentId);
    updateComponentLocal(componentId, { bikeId: null, status: 'in-stock', updatedAt: Date.now() });
  };

  const handleDeleteComponent = async (componentId: string) => {
    if (!userId) return;
    await deleteComponent(userId, componentId);
    removeComponentLocal(componentId);
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
            router.back();
          },
        },
      ]
    );
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
    } finally {
      setAddingRide(false);
    }
  };

  const formatMovingTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
  };

  return (
    <View style={styles.root}>
      <SuccessBanner
        visible={showSuccess}
        title={successName + ' added!'}
        subtitle="Wear tracking has started."
        onHide={() => setShowSuccess(false)}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Back button (for web where the Stack header may not show) */}
        {Platform.OS === 'web' && (
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color={Colors.accent} />
            <Text style={styles.backText}>Bikes</Text>
          </TouchableOpacity>
        )}

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
              <TouchableOpacity style={styles.heroStat} onPress={() => setShowAddRide(true)}>
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
              onRetire={() => handleRetire(comp.id)}
              onMoveToStock={() => handleMoveToStock(comp.id)}
              onDelete={() => handleDeleteComponent(comp.id)}
            />
          ))
        )}
      </ScrollView>

      {/* Add Component modal */}
      <AddComponentModal
        visible={showAdd}
        bikeDistance={bike.totalDistance}
        brakeSystem={bike.brakeSystem}
        onClose={() => setShowAdd(false)}
        onAdd={handleAddComponent}
      />

      {/* Manual ride modal */}
      <Modal visible={showAddRide} animationType="fade" transparent onRequestClose={() => setShowAddRide(false)}>
        <View style={styles.overlay}>
          <View style={styles.rideModal}>
            <Text style={styles.rideModalTitle}>Add Ride</Text>
            <TextInput
              style={styles.rideInput}
              placeholder="Ride name (optional)"
              placeholderTextColor={Colors.textTertiary}
              value={rideName}
              onChangeText={setRideName}
            />
            <TextInput
              style={styles.rideInput}
              placeholder="Distance (km) *"
              placeholderTextColor={Colors.textTertiary}
              value={rideKm}
              onChangeText={setRideKm}
              keyboardType="numeric"
              autoFocus
            />
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
                    Add {rideKm ? Number(rideKm).toLocaleString() + ' km' : ''}
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
    paddingTop: 20,
    paddingBottom: 4,
  },
  backText: { fontSize: 15, color: Colors.accent, fontWeight: '500' },

  hero: {
    flexDirection: 'row',
    margin: 20,
    marginTop: Platform.OS === 'web' ? 8 : 100,
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
  deleteBtn: {
    width: 36,
    height: 36,
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
  rideList: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
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
    gap: 14,
  },
  rideModalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  rideInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  rideModalActions: { flexDirection: 'row', gap: 10 },
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
