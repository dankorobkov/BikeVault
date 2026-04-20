import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store/useAppStore';
import { addBike } from '../../services/bikesService';
import { fetchAthlete, getValidToken } from '../../services/stravaService';
import { Analytics } from '../../services/analytics';
import { Colors } from '../../constants/colors';
import BikeCard from '../../components/BikeCard';
import AddBikeModal from '../../components/AddBikeModal';
import EmptyState from '../../components/EmptyState';
import SuccessBanner from '../../components/SuccessBanner';
import type { BikeType, BrakeSystem } from '../../types';

export default function BikesScreen() {
  const topInset = useTopInset();
  const router = useRouter();
  const { userId, bikes, components, isDataLoading, stravaTokens, addBikeLocal } = useAppStore();

  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stravaBikes, setStravaBikes] = useState<
    { id: string; name: string; distanceKm: number }[]
  >([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successBikeName, setSuccessBikeName] = useState('');

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
  }) => {
    if (!userId) return;
    const newBike = await addBike(userId, data);
    addBikeLocal(newBike);
    Analytics.addBike(data.type);
    setSuccessBikeName(newBike.name);
    setShowSuccess(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
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
          <Ionicons name="add" size={22} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
          />
        }
      >
        {bikes.length === 0 ? (
          isDataLoading ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator size="large" color={Colors.accent} />
            </View>
          ) : (
          <EmptyState
            icon="bicycle-outline"
            title="No bikes yet"
            subtitle="Tap + to add your first bike and start tracking component wear."
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
        onClose={() => setShowAdd(false)}
        onAdd={handleAdd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
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
    color: Colors.text,
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentDim,
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
