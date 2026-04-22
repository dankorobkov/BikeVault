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
    bikeId: (data.bikeId as string | null) ?? null,
    name: data.name as string,
    category: data.category as ComponentCategory,
    brand: (data.brand as string) ?? undefined,
    installDate:
      data.installDate instanceof Timestamp
        ? data.installDate.toMillis()
        : (data.installDate as number) ?? Date.now(),
    installDistance: (data.installDistance as number) ?? 0,
    maxLifespan: (data.maxLifespan as number) ?? 5000,
    attentionFrequency: (data.attentionFrequency as number) ?? undefined,
    status: (data.status as ComponentStatus) ?? 'active',
    notes: (data.notes as string) ?? undefined,
    isElectric: (data.isElectric as boolean) ?? false,
    lastCharged:
      data.lastCharged instanceof Timestamp
        ? data.lastCharged.toMillis()
        : (data.lastCharged as number) ?? undefined,
    chargeIntervalDays: (data.chargeIntervalDays as number) ?? undefined,
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
  const data: Record<string, unknown> = {
    bikeId: component.bikeId ?? null,
    name: component.name,
    category: component.category,
    installDate: component.installDate,
    installDistance: component.installDistance,
    maxLifespan: component.maxLifespan,
    status: component.status,
    isElectric: component.isElectric ?? false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (component.brand) data.brand = component.brand;
  if (component.notes) data.notes = component.notes;
  if (component.attentionFrequency) data.attentionFrequency = component.attentionFrequency;
  if (component.lastCharged) data.lastCharged = component.lastCharged;
  if (component.chargeIntervalDays) data.chargeIntervalDays = component.chargeIntervalDays;

  const ref = await addDoc(componentsRef(userId), data);
  const now = Date.now();
  return { id: ref.id, ...component, createdAt: now, updatedAt: now };
}

export async function updateComponent(
  userId: string,
  componentId: string,
  updates: Partial<Omit<BikeComponent, 'id' | 'createdAt'>>
): Promise<void> {
  // Firestore rejects `undefined` values ("Unsupported field value:
  // undefined"), but the Edit modal happily sends `notes: undefined`
  // when a user clears a text field (since `trim() || undefined` was
  // used to avoid writing empty strings). Strip those before the call.
  // This keeps cleared-but-previously-set fields at their old value
  // rather than removing them, which is fine for the current UX — the
  // optional fields are all free-form text / metadata.
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) clean[k] = v;
  }
  await updateDoc(componentDoc(userId, componentId), clean);
}

export async function retireComponent(userId: string, componentId: string): Promise<void> {
  await updateDoc(componentDoc(userId, componentId), {
    status: 'retired',
    updatedAt: serverTimestamp(),
  });
}

export async function moveToStock(userId: string, componentId: string): Promise<void> {
  await updateDoc(componentDoc(userId, componentId), {
    bikeId: null,
    status: 'in-stock',
    updatedAt: serverTimestamp(),
  });
}

export async function installOnBike(
  userId: string,
  componentId: string,
  bikeId: string,
  installDistance: number
): Promise<void> {
  await updateDoc(componentDoc(userId, componentId), {
    bikeId,
    status: 'active',
    installDistance,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteComponent(userId: string, componentId: string): Promise<void> {
  await deleteDoc(componentDoc(userId, componentId));
}
