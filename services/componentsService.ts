import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { BikeComponent, ComponentCategory, ComponentStatus } from '../types';

function componentsRef(userId: string) {
  return collection(db, 'users', userId, 'components');
}

function componentDoc(userId: string, componentId: string) {
  return doc(db, 'users', userId, 'components', componentId);
}

function fromFirestore(d: { id: string; data: () => Record<string, unknown> }): BikeComponent {
  const data = d.data();
  return {
    id: d.id,
    bikeId: data.bikeId as string,
    name: data.name as string,
    category: data.category as ComponentCategory,
    brand: (data.brand as string) ?? undefined,
    installDate:
      data.installDate instanceof Timestamp
        ? data.installDate.toMillis()
        : (data.installDate as number) ?? Date.now(),
    installDistance: (data.installDistance as number) ?? 0,
    maxLifespan: (data.maxLifespan as number) ?? 5000,
    status: (data.status as ComponentStatus) ?? 'active',
    notes: (data.notes as string) ?? undefined,
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

export async function fetchAllComponents(userId: string): Promise<BikeComponent[]> {
  const q = query(componentsRef(userId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    fromFirestore({ id: d.id, data: () => d.data() as Record<string, unknown> })
  );
}

export async function fetchComponentsForBike(
  userId: string,
  bikeId: string
): Promise<BikeComponent[]> {
  const q = query(
    componentsRef(userId),
    where('bikeId', '==', bikeId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    fromFirestore({ id: d.id, data: () => d.data() as Record<string, unknown> })
  );
}

export async function addComponent(
  userId: string,
  component: Omit<BikeComponent, 'id' | 'createdAt' | 'updatedAt'>
): Promise<BikeComponent> {
  const ref = await addDoc(componentsRef(userId), {
    ...component,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const now = Date.now();
  return { id: ref.id, ...component, createdAt: now, updatedAt: now };
}

export async function updateComponent(
  userId: string,
  componentId: string,
  updates: Partial<Omit<BikeComponent, 'id' | 'createdAt'>>
): Promise<void> {
  await updateDoc(componentDoc(userId, componentId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function retireComponent(
  userId: string,
  componentId: string
): Promise<void> {
  await updateDoc(componentDoc(userId, componentId), {
    status: 'retired',
    updatedAt: serverTimestamp(),
  });
}

export async function deleteComponent(
  userId: string,
  componentId: string
): Promise<void> {
  await deleteDoc(componentDoc(userId, componentId));
}
