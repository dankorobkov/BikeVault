import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useTopInset } from '../../hooks/useTopInset';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../store/useAppStore';
import { addBike } from '../../services/bikesService';
import { fetchAthlete, getValidToken } from '../../services/stravaService';
import { useSync } from '../../hooks/useSync';
import { Analytics } from '../../services/analytics';
import { useThemeColors } from '../../theme/ThemeProvider';
import type { ColorPalette } from '../../constants/colors';
import BikeCard from '../../components/BikeCard';
import AddBikeModal from '../../components/AddBikeModal';
import EmptyState from '../../components/EmptyState';
import SuccessBanner from '../../components/SuccessBanner';
import BikeIcon from '../../components/BikeIcon';
import { defaultActivityForBikeType } from '../../types';
import type { BikeType, BikeWeightMode, BrakeSystem, StravaActivityType } from '../../types';

export default function BikesScreen() {
  const topInset = useTopInset();
  const router = useRouter();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { userId, bikes, components, isDataLoading, stravaTokens, addBikeLocal } = useAppStore();
  const { syncStrava } = useSync();

  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stravaBikes, setStravaBikes] = useState<
    { id: string; name: string; distanceKm: number }[]
  >([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successBikeName, setSuccessBikeName] = useState('');

  // Activities already owned by existing bikes. The picker in
  // AddBikeModal disables these so activity-based Strava attribution
  // stays unambiguous. Bikes missing an explicit `defaultActivity`
  // fall back to the type-derived default.
  const takenActivities = React.useMemo(() => {
    const s = new Set<StravaActivityType>();
    for (const b of bikes) {
      s.add(b.defaultActivity ?? defaultActivityForBikeType(b.type));
    }
    return s;
  }, [bikes]);

  const openAddModal = async () => {
    if (stravaTokens && userId) {
      try {
        const tokens = await getValidToken(userId, stravaTokens);
        const athlete = await fetchAthlete(tokens.accessToken);
        setStravaBikes(
          athlete.bikes.map((b) => ({
            id: b.id,
            name: b.name,
            distanceKm: Math.round(b.distance / 1000),
          }))
        );
      } catch {
        setStravaBikes([]);
      }
    }
    setShowAdd(true);
  };

  const handleAdd = async (data: {
    name: string;
    brand: string;
    type: BikeType;
    brakeSystem: BrakeSystem;
    color: string;
    stravaId?: string;
    totalDistance: number;
    defaultActivity: StravaActivityType;
    weight?: number;
    weightMode: BikeWeightMode;
  }) => {
    if (!userId) return;
    const newBike = await addBike(userId, data);
    addBikeLocal(newBike);
    Analytics.addBike(data.type);
    setSuccessBikeName(newBike.name);
    setShowSuccess(true);
  };

  /**
   * Pull-to-refresh handler. Triggers a Strava sync when connected so
   * the bikes' totalDistance + components' wear redraw with any rides
   * recorded since the last sync. When Strava isn't connected we just
   * flash the spinner — there's no remote source to pull from, but
   * suppressing the spinner entirely would feel like the gesture was
   * ignored.
   *
   * Errors from `syncStrava` are swallowed here: the Settings screen
   * surfaces them via the dialog when the user taps Sync there. We
   * don't want a network blip during an idle pull to spawn an alert.
   */
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (stravaTokens) {
        await syncStrava();
      } else {
        // Idle pull with no Strava — keep the spinner up briefly so the
        // gesture feels acknowledged instead of snapping back instantly.
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch {
      /* surfaced via Settings; pull-to-refresh stays quiet */
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.root}>
      <SuccessBanner
        visible={showSuccess}
        title={successBikeName + ' added!'}
        subtitle="Start adding components to track wear."
        onHide={() => setShowSuccess(false)}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset }]}>
        <Text style={styles.title}>My Bikes</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addBtn}>
          <BikeIcon name="add" variant="line" size={22} color={C.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.accent}
          />
        }
      >
        {bikes.length === 0 ? (
          isDataLoading ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator size="large" color={C.accent} />
            </View>
          ) : (
          <EmptyState
            icon="bicycle-outline"
            title="No bikes yet"
            subtitle="Add your first bike to start tracking component wear."
            actionLabel="Add your first bike"
            onAction={openAddModal}
          />
          )
        ) : (
          bikes.map((bike) => (
            <BikeCard
              key={bike.id}
              bike={bike}
              components={components}
              onPress={() => router.push(('/bike/' + bike.id) as never)}
            />
          ))
        )}
      </ScrollView>

      <AddBikeModal
        visible={showAdd}
        stravaBikes={stravaBikes}
        takenActivities={takenActivities}
        onClose={() => setShowAdd(false)}
        onAdd={handleAdd}
      />
    </View>
  );
}

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
    },
    title: {
      fontSize: 34,
      fontWeight: '700',
      color: C.text,
      letterSpacing: -0.5,
    },
    addBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: C.accentDim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 24,
      flexGrow: 1,
    },
    loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  });
