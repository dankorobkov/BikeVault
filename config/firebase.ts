import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
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

// Firestore on web needs long polling to work around Safari's Intelligent
// Tracking Prevention, which blocks the default WebChannel transport with
// "Fetch API cannot load ... due to access control checks".
//
// We use `experimentalForceLongPolling: true` rather than
// `experimentalAutoDetectLongPolling` because auto-detect relies on
// observing a failed WebChannel to fall back, and in practice Safari's
// block surfaces as a stalled connection rather than a clean error — the
// auto-detector never fires and the app hangs. Forcing long polling is
// slightly slower on Chrome/Firefox but guaranteed to work everywhere.
//
// On native (iOS/Android) the gRPC transport is used anyway, so we just
// use the default getFirestore. initializeFirestore throws if Firestore
// has already been initialized for this app (e.g. on Expo fast refresh),
// so we fall back to getFirestore in that case.
function createDb() {
  if (Platform.OS !== 'web') return getFirestore(app);
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      localCache: persistentLocalCache(),
    });
  } catch {
    return getFirestore(app);
  }
}

export const db = createDb();

export default app;
