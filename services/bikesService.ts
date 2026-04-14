import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Bike, BikeType } from '../types';

function bikesRef(userId: string) {
  return collection(db, 'users', userId, 'bikes');
}

function bikeDoc(userId: string, bikeId: string) {
  return doc(db, 'users', userId, 'bikes', bikeId);
}

export async function fetchBikes(userId: string): Promise<Bike[]> {
  const q = query(bikesRef(userId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name,
      brand: data.brand ?? '',
      type: data.type as BikeType,
      color: data.color ?? '#FF6B35',
      stravaId: data.stravaId ?? undefined,
      totalDistance: data.totalDistance ?? 0,
      createdAt:
        data.createdAt instanceof Timestamp
          ? data.createdAt.toMillis()
          : data.createdAt ?? Date.now(),
      updatedAt:
        data.updatedAt instanceof Timestamp
          ? data.updatedAt.toMillis()
          : data.updatedAt ?? Date.now(),
    } as Bike;
  });
}

export async function addBike(
  userId: string,
  bike: Omit<Bike, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Bike> {
  const ref = await addDoc(bikesRef(userId), {
    ...bike,
    totalDistance: bike.totalDistance ?? 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const now = Date.now();
  return { id: ref.id, ...bike, createdAt: now, updatedAt: now };
}

export async function updateBike(
  userId: string,
  bikeId: string,
  updates: Partial<Omit<Bike, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(bikeDoc(userId, bikeId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteBike(
  userId: string,
  bikeId: string
): Promise<void> {
  await deleteDoc(bikeDoc(userId, bikeId));
}

export async function updateBikeDistance(
  userId: string,
  bikeId: string,
  totalDistance: number
): Promise<void> {
  await updateDoc(bikeDoc(userId, bikeId), {
    totalDistance,
    updatedAt: serverTimestamp(),
  });
}
