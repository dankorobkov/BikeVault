import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import RefreshableScrollView from '../../components/RefreshableScrollView';
import { dialog } from '../../components/AppDialog';
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
import {
  logBikeActivity,
  logComponentEvent,
  fetchBikeActivity,
  type ActivityEntry,
} from '../../services/activityService';
import { getValidToken } from '../../services/stravaService';
import {
  correctBackdatedInstall,
  applyBikeTotalSnapshot,
} from '../../services/backdateCorrection';
import { Analytics } from '../../services/analytics';
import { useThemeColors } from '../../theme/ThemeProvider';
import type { ColorPalette } from '../../constants/colors';
import { formatNumber } from '../../constants/units';
import { BIKE_TYPE_LABELS, BRAKE_SYSTEM_LABELS, COMPONENT_TYPES } from '../../constants/componentTypes';
import { canAddComponent, FREE_COMPONENT_LIMIT } from '../../constants/subscription';
import ComponentCard from '../../components/ComponentCard';
import AddComponentModal from '../../components/AddComponentModal';
import EditBikeModal from '../../components/EditBikeModal';
import EditComponentModal from '../../components/EditComponentModal';
import EmptyState from '../../components/EmptyState';
import SuccessBanner from '../../components/SuccessBanner';
import AppTabBar from '../../components/AppTabBar';
import ActivityLog from '../../components/ActivityLog';
import { useSync } from '../../hooks/useSync';
import { useTopInset } from '../../hooks/useTopInset';
import {
  isIndoorBike,
  hiddenComponentCategoriesForBike,
  defaultActivityForBikeType,
  effectiveBikeWeight,
  sumComponentWeights,
  formatWeight,
  type BikeComponent,
  type ComponentCategory,
  type ChainLubeType,
  type StravaActivity,
  type BikeType,
  type BrakeSystem,
  type BikeWeightMode,
  type StravaActivityType,
} from '../../types';

const STRAVA_API = 'https://www.strava.com/api/v3';

export default function BikeDetailScreen() {
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const topInset = useTopInset();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    userId,
    bikes,
    components,
    stravaTokens,
    isDataLoading,
    addComponentLocal,
    updateComponentLocal,
    removeComponentLocal,
    removeBikeLocal,
    updateBikeLocal,
    subscriptionStatus,
  } = useAppStore();
  const isSubscribed = subscriptionStatus === 'subscribed';

  const [showAdd, setShowAdd] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successName, setSuccessName] = useState('');
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [loadingRides, setLoadingRides] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { syncStrava } = useSync();

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

  // Latest actions — this bike's history (its own edits + its components').
  const [actionLog, setActionLog] = useState<ActivityEntry[]>([]);

  const bike = bikes.find((b) => b.id === id);
  const bikeComponents = components.filter(
    (c) => c.bikeId === id && (showRetired ? true : c.status !== 'retired')
  );

  // Load the "Latest actions" log on mount, and re-pull shortly after any
  // change to this bike or its components — the log write is async and
  // best-effort, so a small delayed refetch catches the newest entry.
  const activitySig =
    `${bike?.updatedAt ?? 0}:${components.length}:` +
    components
      .filter((c) => c.bikeId === id)
      .map((c) => `${c.id}@${c.updatedAt}`)
      .join('|');
  useEffect(() => {
    if (!userId || !id) return;
    let active = true;
    const load = () =>
      fetchBikeActivity(userId, id)
        .then((a) => {
          if (active) setActionLog(a);
        })
        .catch(() => undefined);
    load();
    const t = setTimeout(load, 900);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [userId, id, activitySig]);

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
    // While Firestore is still hydrating the store we can't know yet
    // whether this bike exists. Show a loader instead of a jarring
    // "Bike not found" flash that disappears once data arrives.
    if (isDataLoading) {
      return (
        <View style={styles.notFound}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      );
    }
    return (
      <View style={styles.notFound}>
        <Ionicons
          name="bicycle-outline"
          size={44}
          color={C.textTertiary}
          style={{ marginBottom: 12 }}
        />
        <Text style={styles.notFoundText}>Bike not found</Text>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)')}
          style={styles.notFoundBtn}
        >
          <Ionicons name="arrow-back" size={16} color={C.white} />
          <Text style={styles.notFoundBtnText}>Back to bikes</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeCount = components.filter((c) => c.bikeId === id && c.status === 'active').length;
  const retiredCount = components.filter((c) => c.bikeId === id && c.status === 'retired').length;

  // ── Handlers ────────────────────────────────────────────────────────────────

  /**
   * Run the shared back-date correction against this bike. We pass the
   * full `bikes` array down so attribution matches the migration
   * (gear-tagged rides go to their real owner, no falling-through to
   * defaultActivity on the wrong bike). priorWear is preserved by the
   * caller as its own field, so it isn't part of this call.
   */
  const runBackdateCorrection = async (installDate: number) => {
    if (!userId) return { ok: false as const };
    return correctBackdatedInstall({
      userId,
      bike,
      allBikes: bikes,
      stravaTokens,
      installDate,
    });
  };

  const doAddComponent = async (data: {
    name: string;
    category: ComponentCategory;
    brand: string;
    installDate: number;
    installDistance: number;
    priorWear?: number;
    maxLifespan: number;
    attentionFrequency?: number;
    notes: string;
    isElectric: boolean;
    lastCharged?: number;
    chargeIntervalDays?: number;
    lubeType?: ChainLubeType;
    lastLubedAt?: number;
    lubeIntervalKm?: number;
    weight?: number;
  }) => {
    if (!userId) return;
    // When installDate is back-dated, derive the install anchor from
    // the full activity history so "km on this bike since install"
    // matches reality. Falls back to the modal's value when Strava
    // can't be queried. priorWear is forwarded separately, untouched.
    const correction = await runBackdateCorrection(data.installDate);
    const correctedInstallDistance = correction.ok
      ? correction.installDistance
      : data.installDistance;
    if (correction.ok && bike) {
      await applyBikeTotalSnapshot({
        userId,
        bike,
        newTotalKm: correction.bikeTotalDistance,
        updateBikeLocal,
      });
    }
    const newComp = await addComponent(userId, {
      bikeId: id,
      name: data.name,
      category: data.category,
      brand: data.brand || undefined,
      installDate: data.installDate,
      installDistance: correctedInstallDistance,
      // priorWear is independent of installDistance — forward the
      // user's input untouched. The back-date snapshot only adjusts
      // the install anchor (when the bike's odometer was at that
      // date), not the part's pre-BikeVault history.
      priorWear: data.priorWear,
      maxLifespan: data.maxLifespan,
      attentionFrequency: data.attentionFrequency,
      status: 'active',
      notes: data.notes || undefined,
      isElectric: data.isElectric,
      lastCharged: data.lastCharged,
      chargeIntervalDays: data.chargeIntervalDays,
      lubeType: data.lubeType,
      lastLubedAt: data.lastLubedAt,
      lubeIntervalKm: data.lubeIntervalKm,
      // Anchor the re-lube odometer to today's bike distance so we
      // correctly measure km-since-lube going forward.
      lubeDistanceAtLastLube:
        data.lubeType && bike ? bike.totalDistance : undefined,
      weight: data.weight,
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
    installDate: number;
    installDistance: number;
    priorWear?: number;
    maxLifespan: number;
    attentionFrequency?: number;
    notes: string;
    isElectric: boolean;
    lastCharged?: number;
    chargeIntervalDays?: number;
    lubeType?: ChainLubeType;
    lastLubedAt?: number;
    lubeIntervalKm?: number;
    weight?: number;
  }) => {
    if (!userId) return;

    // Check for an existing active component of the same category on this bike
    const existing = components.find(
      (c) => c.bikeId === id && c.status === 'active' && c.category === data.category
    );

    if (existing) {
      const typeLabel = COMPONENT_TYPES[data.category]?.label ?? data.category;
      const choice = await dialog.choose<'stock' | 'retire'>({
        title: typeLabel + ' already installed',
        message: `"${existing.name}" is currently on this bike. What should happen to it?`,
        options: [
          { label: 'Cancel', value: 'stock', cancel: true },
          { label: 'Move to Stock', value: 'stock' },
          { label: 'Retire It', value: 'retire', tone: 'destructive' },
        ],
      });
      if (choice === null) return;
      if (choice === 'stock') {
        await moveToStock(userId, existing.id);
        updateComponentLocal(existing.id, { bikeId: null, status: 'in-stock', updatedAt: Date.now() });
      } else {
        await retireComponent(userId, existing.id);
        updateComponentLocal(existing.id, { status: 'retired', updatedAt: Date.now() });
      }
      await doAddComponent(data);
      return;
    }

    await doAddComponent(data);
  };

  const handleEditSave = async (
    componentId: string,
    updates: Partial<Omit<BikeComponent, 'id' | 'createdAt'>>
  ) => {
    if (!userId) return;
    // Same back-date correction as the add path: when the user moves
    // installDate into the past, the modal's `installDistance =
    // bikeKm - prior` doesn't account for rides that fall inside the
    // back-date window. Applies only when the edit kept the part on
    // the current bike (we don't try to correct cross-bike moves —
    // installOnBike handles those explicitly with a manual distance).
    let nextUpdates = updates;
    const stayingOnThisBike =
      updates.installDistance !== undefined &&
      updates.installDate !== undefined &&
      (updates.bikeId === undefined || updates.bikeId === id);
    if (stayingOnThisBike) {
      const correction = await runBackdateCorrection(updates.installDate!);
      if (correction.ok && bike) {
        await applyBikeTotalSnapshot({
          userId,
          bike,
          newTotalKm: correction.bikeTotalDistance,
          updateBikeLocal,
        });
        if (correction.installDistance !== updates.installDistance) {
          nextUpdates = { ...updates, installDistance: correction.installDistance };
        }
      }
    }
    await updateComponent(userId, componentId, nextUpdates);
    updateComponentLocal(componentId, { ...nextUpdates, updatedAt: Date.now() });
    if (nextUpdates.category) Analytics.editComponent(nextUpdates.category);
    const editedComp = components.find((c) => c.id === componentId);
    logComponentEvent(userId, {
      componentId,
      bikeId: nextUpdates.bikeId ?? editedComp?.bikeId ?? id,
      action: 'component_edited',
      selfLabel: 'Edited',
      bikeLabel: `Edited “${nextUpdates.name ?? editedComp?.name ?? 'component'}”`,
    });
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

  const handleDeleteBike = async () => {
    const ok = await dialog.confirm({
      title: 'Delete Bike',
      message: 'Delete "' + bike.name + '" and all its components? This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok || !userId) return;
    try {
      await deleteBike(userId, id);
    } catch (e) {
      // Surface the error but still clear local state — otherwise the
      // user is stuck on a phantom bike card they can't remove.
      const msg = e instanceof Error ? e.message : 'Delete failed';
      dialog.alert({
        title: 'Delete failed',
        message: 'Could not delete from the server: ' + msg,
        tone: 'destructive',
      });
    }
    removeBikeLocal(id);
    Analytics.deleteBike();
    router.back();
  };

  const handleSaveBike = async (data: {
    name: string;
    brand: string;
    type: BikeType;
    brakeSystem: BrakeSystem;
    color: string;
    defaultActivity: StravaActivityType;
    weight: number | null;
    weightMode: BikeWeightMode;
  }) => {
    if (!userId) return;
    // EditBikeModal sends `weight: null` to clear an existing value
    // (Firestore accepts null) and a positive number to set one.
    // `updateBike` strips undefined keys, so we have to forward null
    // explicitly when the user wants the field removed.
    const writeData: Record<string, unknown> = {
      name: data.name,
      brand: data.brand,
      type: data.type,
      brakeSystem: data.brakeSystem,
      color: data.color,
      defaultActivity: data.defaultActivity,
      weightMode: data.weightMode,
    };
    if (data.weight !== null) writeData.weight = data.weight;
    else writeData.weight = null;

    await updateBike(userId, id, writeData);
    updateBikeLocal(id, {
      name: data.name,
      brand: data.brand,
      type: data.type,
      brakeSystem: data.brakeSystem,
      color: data.color,
      defaultActivity: data.defaultActivity,
      // Local store mirrors Firestore: `null` => undefined so reads
      // through `bike.weight` return `undefined` for cleared bikes.
      weight: data.weight ?? undefined,
      weightMode: data.weightMode,
      updatedAt: Date.now(),
    });
    Analytics.editBike();
    logBikeActivity(userId, id, 'bike_edited', 'Details edited');
  };

  const handleAddRide = async () => {
    const km = Number(rideKm.replace(/[,\s]/g, ''));
    if (!km || !userId) return;
    setAddingRide(true);
    try {
      const newDist = bike.totalDistance + km;
      await updateBike(userId, id, { totalDistance: newDist });
      updateBikeLocal(id, { totalDistance: newDist, updatedAt: Date.now() });
      logBikeActivity(userId, id, 'ride_added', `Ride added +${Math.round(km)} km`);
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

  /** Pull-to-refresh — same behaviour as the Bikes and Garage tabs:
   *  trigger a Strava sync when connected, otherwise just flash the
   *  spinner so the gesture feels acknowledged. Sync errors are
   *  surfaced via the Settings tab's sync button, not here. */
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (stravaTokens) {
        await syncStrava();
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch {
      /* swallow — surfaced from Settings */
    } finally {
      setRefreshing(false);
    }
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

      <RefreshableScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={C.accent}
      >
        {/* Back button */}
        <TouchableOpacity
          style={[styles.backBtn, { paddingTop: topInset }]}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
        >
          <Ionicons name="arrow-back" size={18} color={C.accent} />
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
                  <Ionicons name="pencil-outline" size={16} color={C.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeleteBike} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={C.danger} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatValue}>
                  {formatNumber(bike.totalDistance)}
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
                <Ionicons name="add-circle-outline" size={22} color={C.accent} />
                <Text style={styles.heroStatLabel}>add ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Weight card — only renders when there's something to show.
            In Manual / Mixed: bike.weight (the user's number).
            In Sum: live total of installed components with weight set.
            Mixed also lists the components total alongside as a sanity
            check — the difference is the un-tracked frame + hardware. */}
        {(() => {
          const eff = effectiveBikeWeight(bike, components);
          const mode: BikeWeightMode = bike.weightMode ?? 'manual';
          const partsSum = sumComponentWeights(bike.id, components);
          if (eff === null && partsSum === 0) return null;
          return (
            <View style={styles.weightCard}>
              <View style={styles.weightIconWrap}>
                <Ionicons name="scale-outline" size={20} color={C.accent} />
              </View>
              <View style={styles.weightBody}>
                <Text style={styles.weightHeader}>Weight</Text>
                <View style={styles.weightRow}>
                  <Text style={styles.weightValue}>
                    {eff !== null ? formatWeight(eff) : '—'}
                  </Text>
                  <Text style={styles.weightModeLabel}>
                    {mode === 'sum'
                      ? 'sum of parts'
                      : mode === 'mixed'
                      ? 'mixed'
                      : 'manual'}
                  </Text>
                </View>
                {mode === 'mixed' && partsSum > 0 && (
                  <Text style={styles.weightHint}>
                    Parts total: {formatWeight(partsSum)}
                    {eff !== null
                      ? ' · diff: ' + formatWeight(Math.abs(eff - partsSum))
                      : ''}
                  </Text>
                )}
                {mode === 'sum' && partsSum === 0 && (
                  <Text style={styles.weightHint}>
                    No installed components have a weight yet.
                  </Text>
                )}
              </View>
            </View>
          );
        })()}

        {/* Indoor setup info card */}
        {isIndoorBike(bike.type) && (
          <View style={styles.indoorCard}>
            <View style={styles.indoorIconWrap}>
              <Ionicons
                name={
                  bike.type === 'trainer-direct-drive'
                    ? 'barbell-outline'
                    : 'sync-circle-outline'
                }
                size={20}
                color={C.accent}
              />
            </View>
            <View style={styles.indoorBody}>
              <Text style={styles.indoorTitle}>
                {bike.type === 'trainer-direct-drive'
                  ? 'Direct-Drive Trainer'
                  : 'Roller Trainers'}
              </Text>
              <Text style={styles.indoorText}>
                {bike.type === 'trainer-direct-drive'
                  ? 'Track wear on the chain, cassette, chainring and pulleys — that\'s what your trainer actually grinds through. Rear-wheel, tyre and brake components are hidden because the rear wheel is off the bike.'
                  : 'Everything wears like outdoors, but the rear tyre wears significantly faster against the drums. When you add it, set a shorter lifespan (roughly half of what you\'d use outdoors).'}
              </Text>
            </View>
          </View>
        )}

        {/* Irrelevant component warning: any tracked parts that don't apply
            to this indoor setup (e.g. a front tyre left over from a bike
            that was converted to trainer use). */}
        {(() => {
          const hidden = hiddenComponentCategoriesForBike(bike.type);
          if (hidden.length === 0) return null;
          const stray = bikeComponents.filter(
            (c) => c.status === 'active' && hidden.includes(c.category)
          );
          if (stray.length === 0) return null;
          return (
            <View style={styles.strayCard}>
              <Ionicons name="warning-outline" size={18} color={C.warning} />
              <Text style={styles.strayText}>
                {stray.length} active part
                {stray.length === 1 ? '' : 's'} don't apply to this setup —
                move them to stock or retire them.
              </Text>
            </View>
          );
        })()}

        {/* Last rides from Strava */}
        {bike.stravaId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last Rides</Text>
            {loadingRides ? (
              <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />
            ) : activities.length === 0 ? (
              <Text style={styles.noRides}>No recent Strava rides found for this bike.</Text>
            ) : (
              <View style={styles.rideList}>
                {activities.map((act) => (
                  <View key={act.id} style={styles.rideRow}>
                    <View style={styles.rideIcon}>
                      <Ionicons name="bicycle-outline" size={16} color={C.accent} />
                    </View>
                    <View style={styles.rideInfo}>
                      <Text style={styles.rideName} numberOfLines={1}>
                        {act.name}
                      </Text>
                      <Text style={styles.rideMeta}>
                        {formatNumber(act.distance / 1000)} km
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
            <TouchableOpacity
              onPress={() => {
                if (!canAddComponent(components.length, isSubscribed)) {
                  dialog.alert({
                    title: 'Free plan limit reached',
                    message: `The free plan is capped at ${FREE_COMPONENT_LIMIT} components total. Subscribe from Settings to add more.`,
                    tone: 'warning',
                  });
                  return;
                }
                setShowAdd(true);
              }}
              style={styles.addBtn}
            >
              <Ionicons name="add" size={18} color={C.accent} />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.componentList}>
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
        </View>

        {/* Latest actions — this bike's history plus its components' events */}
        <View style={{ marginTop: 24 }}>
          <ActivityLog entries={actionLog} />
        </View>
      </RefreshableScrollView>

      <AppTabBar active="bikes" />

      {/* Add Component modal */}
      <AddComponentModal
        visible={showAdd}
        bikeDistance={bike.totalDistance}
        brakeSystem={bike.brakeSystem}
        bikeType={bike.type}
        onClose={() => setShowAdd(false)}
        onAdd={handleAddComponent}
      />

      {/* Edit Bike modal */}
      <EditBikeModal
        visible={showEditBike}
        bike={bike}
        // Activities owned by OTHER bikes — picker disables them so the
        // user can't break the unique-defaultActivity invariant the
        // sync attribution relies on. We exclude `bike.id` so the
        // current bike's own activity stays selectable.
        takenActivities={
          new Set(
            bikes
              .filter((b) => b.id !== bike.id)
              .map((b) => b.defaultActivity ?? defaultActivityForBikeType(b.type))
          )
        }
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
        onDelete={handleDeleteComponent}
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
              <Ionicons name="calendar-outline" size={16} color={C.textSecondary} />
              <TextInput
                style={[styles.rideInput, { flex: 1 }]}
                placeholder="Date — e.g. 15 Apr 2026"
                placeholderTextColor={C.textTertiary}
                value={rideDate}
                onChangeText={setRideDate}
              />
            </View>

            {/* Name */}
            <View style={styles.rideFieldRow}>
              <Ionicons name="text-outline" size={16} color={C.textSecondary} />
              <TextInput
                style={[styles.rideInput, { flex: 1 }]}
                placeholder="Ride name (optional)"
                placeholderTextColor={C.textTertiary}
                value={rideName}
                onChangeText={setRideName}
              />
            </View>

            {/* Distance */}
            <View style={styles.rideFieldRow}>
              <Ionicons name="speedometer-outline" size={16} color={C.textSecondary} />
              <TextInput
                style={[styles.rideInput, { flex: 1 }]}
                placeholder="Distance in km *"
                placeholderTextColor={C.textTertiary}
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
                <Text style={{ color: C.textSecondary, fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rideModalSave, !rideKm && styles.rideModalSaveDisabled]}
                onPress={handleAddRide}
                disabled={!rideKm || addingRide}
              >
                {addingRide ? (
                  <ActivityIndicator color={C.white} />
                ) : (
                  <Text style={{ color: C.white, fontWeight: '700', fontSize: 15 }}>
                    {rideKm ? 'Add ' + formatNumber(Number(rideKm.replace(/[,\s]/g, ''))) + ' km' : 'Add Ride'}
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

const makeStyles = (C: ColorPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
    padding: 24,
  },
  notFoundText: { color: C.textSecondary, fontSize: 16 },
  notFoundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 18,
  },
  notFoundBtnText: { fontSize: 15, fontWeight: '700', color: C.white },
  content: { paddingBottom: 40 },

  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backText: { fontSize: 15, color: C.accent, fontWeight: '500' },

  hero: {
    flexDirection: 'row',
    margin: 20,
    marginTop: 4,
    backgroundColor: C.card,
    borderRadius: 20,
    overflow: 'hidden',
  },
  colorBar: { width: 5 },
  heroBody: { flex: 1, padding: 18, gap: 14 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bikeName: { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  bikeMeta: { fontSize: 13, color: C.textSecondary, marginTop: 3 },
  bikeDate: { fontSize: 12, color: C.textTertiary, marginTop: 2 },
  heroBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.dangerDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStats: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, alignItems: 'center', gap: 3 },
  heroStatValue: { fontSize: 18, fontWeight: '700', color: C.text },
  heroStatLabel: { fontSize: 11, color: C.textSecondary },
  heroStatDivider: { width: 1, height: 32, backgroundColor: C.border },

  indoorCard: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.accentDim,
  },
  indoorIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentDim,
  },
  indoorBody: { flex: 1, gap: 4 },
  indoorTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  indoorText: { fontSize: 13, color: C.textSecondary, lineHeight: 19 },
  weightCard: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.card,
  },
  weightIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentDim,
  },
  weightBody: { flex: 1, gap: 4 },
  weightHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    letterSpacing: 1,
  },
  weightRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  weightValue: { fontSize: 20, fontWeight: '700', color: C.text },
  weightModeLabel: { fontSize: 12, color: C.textTertiary, fontWeight: '500' },
  weightHint: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  strayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.dangerDim,
  },
  strayText: { flex: 1, fontSize: 13, color: C.warning, lineHeight: 18 },

  section: { paddingHorizontal: 20, marginBottom: 20 },
  componentList: { paddingHorizontal: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 12 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  retiredToggle: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: C.surface,
  },
  retiredToggleText: { fontSize: 12, color: C.textSecondary, fontWeight: '500' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: C.accentDim,
  },
  addBtnText: { fontSize: 14, fontWeight: '600', color: C.accent },

  noRides: { fontSize: 13, color: C.textSecondary },
  rideList: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  rideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rideIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideInfo: { flex: 1 },
  rideName: { fontSize: 14, fontWeight: '500', color: C.text },
  rideMeta: { fontSize: 12, color: C.textSecondary, marginTop: 2 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  rideModal: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    gap: 12,
  },
  rideModalTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  rideFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  rideInput: {
    paddingVertical: 12,
    fontSize: 15,
    color: C.text,
  },
  rideModalActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  rideModalCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: C.surface,
  },
  rideModalSave: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: C.accent,
  },
  rideModalSaveDisabled: { opacity: 0.4 },
});
