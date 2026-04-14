import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '../store/useAppStore';
import {
  fetchAthlete,
  getValidToken,
  buildBikeDistanceMap,
} from '../services/stravaService';
import { updateBikeDistance } from '../services/bikesService';

const LAST_SYNC_KEY = 'bikevault_last_sync';

export function useSync() {
  const {
    userId,
    stravaTokens,
    bikes,
    setIsSyncing,
    setLastSyncAt,
    updateBikeLocal,
  } = useAppStore();

  const syncStrava = useCallback(async () => {
    if (!userId || !stravaTokens) return;
    setIsSyncing(true);
    try {
      const validTokens = await getValidToken(userId, stravaTokens);
      const athlete = await fetchAthlete(validTokens.accessToken);
      const distanceMap = buildBikeDistanceMap(athlete.bikes);

      // Update bike distances for bikes linked to Strava
      for (const bike of bikes) {
        if (bike.stravaId && distanceMap[bike.stravaId] !== undefined) {
          const newDistance = distanceMap[bike.stravaId];
          if (newDistance !== bike.totalDistance) {
            await updateBikeDistance(userId, bike.id, newDistance);
            updateBikeLocal(bike.id, { totalDistance: newDistance, updatedAt: Date.now() });
          }
        }
      }

      const now = Date.now();
      setLastSyncAt(now);
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(now));
    } finally {
      setIsSyncing(false);
    }
  }, [userId, stravaTokens, bikes, setIsSyncing, setLastSyncAt, updateBikeLocal]);

  const loadLastSync = useCallback(async () => {
    const stored = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (stored) setLastSyncAt(Number(stored));
  }, [setLastSyncAt]);

  return { syncStrava, loadLastSync };
}
