import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { logBikeActivity } from './activityService';
import { defaultActivityForBikeType } from '../types';
import type {
  Bike,
  BikeType,
  BikeWeightMode,
  BrakeSystem,
  StravaActivityType,
} from '../types';

function bikesRef(userId: string) {
  return collection(db, 'users', userId, 'bikes');
}

function bikeDoc(userId: string, bikeId: string) {
  return doc(db, 'users', userId, 'bikes', bikeId);
}

function fromFirestore(d: { id: string; data: () => Record<string, unknown> }): Bike {
  const data = d.data();
  const type = (data.type as BikeType) ?? 'road';
  return {
    id: d.id,
    name: data.name as string,
    brand: (data.brand as string) ?? '',
    type,
    brakeSystem: (data.brakeSystem as BrakeSystem) ?? 'disc-hydraulic',
    color: (data.color as string) ?? '#FF6B35',
    stravaId: (data.stravaId as string) ?? undefined,
    totalDistance: (data.totalDistance as number) ?? 0,
    // Back-fill defaultActivity for old bike documents so existing
    // data reads as if the feature had always been there.
    defaultActivity:
      (data.defaultActivity as StravaActivityType) ??
      defaultActivityForBikeType(type),
    weight: (data.weight as number) ?? undefined,
    weightMode: (data.weightMode as BikeWeightMode) ?? undefined,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toMillis()
        : (data.createdAt as number) ?? Date.now(),
    updatedAt:
      data.updatedAt instanceof Timestamp
        ? data.updatedAt.toMillis()
        : (data.updatedAt as number) ?? Date.now(),
  };
}

export async function fetchBikes(userId: string): Promise<Bike[]> {
  const q = query(bikesRef(userId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    fromFirestore({ id: d.id, data: () => d.data() as Record<string, unknown> })
  );
}

export async function addBike(
  userId: string,
  bike: Omit<Bike, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Bike> {
  const defaultActivity =
    bike.defaultActivity ?? defaultActivityForBikeType(bike.type);
  const data: Record<string, unknown> = {
    name: bike.name,
    brand: bike.brand ?? '',
    type: bike.type,
    brakeSystem: bike.brakeSystem ?? 'disc-hydraulic',
    color: bike.color ?? '#FF6B35',
    totalDistance: bike.totalDistance ?? 0,
    defaultActivity,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (bike.stravaId) data.stravaId = bike.stravaId;
  if (typeof bike.weight === 'number' && bike.weight > 0) data.weight = bike.weight;
  if (bike.weightMode) data.weightMode = bike.weightMode;

  const ref = await addDoc(bikesRef(userId), data);
  const now = Date.now();
  // Best-effort activity log (never blocks the add).
  void logBikeActivity(userId, ref.id, 'bike_added', 'Bike added');
  return {
    id: ref.id,
    ...bike,
    defaultActivity,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateBike(
  userId: string,
  bikeId: string,
  updates: Partial<Omit<Bike, 'id' | 'createdAt'>>
): Promise<void> {
  // Firestore rejects `undefined`; callers may send cleared-optional
  // fields (e.g. stravaId) as undefined. Strip before writing.
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) clean[k] = v;
  }
  await updateDoc(bikeDoc(userId, bikeId), clean);
}

export async function deleteBike(userId: string, bikeId: string): Promise<void> {
  await deleteDoc(bikeDoc(userId, bikeId));
}
