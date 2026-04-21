import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  // Required for Firebase Analytics — get this from Firebase Console →
  // Project Settings → Your apps → Web app → measurementId (format: G-XXXXXXXXXX)
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function createAuth() {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }
  // Native — use AsyncStorage for persistence between app restarts
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getReactNativePersistence } = require('firebase/auth');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  return initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export const auth = createAuth();

// Firestore on web needs long polling + XHR transport to work around
// Safari's Intelligent Tracking Prevention, which blocks the default
// WebChannel / Fetch Streams transport with "Fetch API cannot load ...
// due to access control checks".
//
// `experimentalForceLongPolling: true` switches to long polling.
// `useFetchStreams: false` additionally forces the underlying requests
// over XHR instead of the Fetch Streams API — without this opt-out the
// SDK still hits /Listen/channel via Fetch under ITP rules, which
// Safari blocks as a third-party-cookie violation even though long
// polling over XHR is otherwise fine.
//
// `memoryLocalCache()` avoids the persistent IndexedDB cache. The
// persistent cache opens its own Listen stream to keep itself in sync,
// which Safari ITP also blocks. Since the app only does one-shot reads
// (getDoc/getDocs), the cache gives no real benefit here — memory
// cache is lighter and has no background listener.
//
// On native (iOS/Android) the gRPC transport is used anyway, so we
// just use the default getFirestore. initializeFirestore throws if
// Firestore has already been initialized for this app (e.g. on Expo
// fast refresh), so we fall back to getFirestore in that case.
function createDb() {
  if (Platform.OS !== 'web') return getFirestore(app);
  try {
    // `useFetchStreams` lives on Firestore's internal PrivateSettings,
    // not the public FirestoreSettings surface — it's honoured at
    // runtime but not in the public .d.ts, so we cast through unknown.
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
      localCache: memoryLocalCache(),
    } as unknown as Parameters<typeof initializeFirestore>[1]);
  } catch {
    return getFirestore(app);
  }
}

export const db = createDb();

export default app;
