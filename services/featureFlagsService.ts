import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Server-controlled feature flags. Read once at app boot (after auth
 * resolves) and cached in the Zustand store. Toggle these from the
 * Firebase console without shipping a build.
 *
 * Document path: `config/featureFlags`
 *
 * Security rules should allow anyone signed in to *read* this doc and
 * restrict writes to admins. Example:
 *
 *   match /config/{flag} {
 *     allow read:  if request.auth != null;
 *     allow write: if false;  // admin-only via console / server SDK
 *   }
 */
export interface FeatureFlags {
  // Master switch for the new-user onboarding sequence. The HTML
  // itself is bundled with the app (see constants/onboardingHtml.ts),
  // so this flag only controls whether to *surface* it — flip false
  // to kill-switch without shipping.
  onboardingVideoEnabled: boolean;
  // Only users whose Firebase Auth `creationTime` is at or after this
  // timestamp are eligible. Lets you roll out the onboarding without
  // surfacing it to your existing test users. Stored as a Firestore
  // Timestamp; converted to ms here.
  onboardingMinSignupTimeMs: number;
}

const DEFAULT_FLAGS: FeatureFlags = {
  onboardingVideoEnabled: false,
  // Sentinel far in the future — until the flag doc exists, treat no
  // user as eligible so the onboarding can never accidentally surface.
  onboardingMinSignupTimeMs: Number.POSITIVE_INFINITY,
};

/**
 * Reads `config/featureFlags` once. Returns sensible defaults if the
 * doc is missing or any field is malformed, so a misconfigured Firestore
 * can never crash the app boot path or surface the video in error.
 */
export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  try {
    const snap = await getDoc(doc(db, 'config', 'featureFlags'));
    if (!snap.exists()) return DEFAULT_FLAGS;
    const data = snap.data();

    const enabled =
      typeof data.onboardingVideoEnabled === 'boolean'
        ? data.onboardingVideoEnabled
        : DEFAULT_FLAGS.onboardingVideoEnabled;

    let minMs = DEFAULT_FLAGS.onboardingMinSignupTimeMs;
    const raw = data.onboardingMinSignupTime;
    if (raw instanceof Timestamp) {
      minMs = raw.toMillis();
    } else if (typeof raw === 'number') {
      minMs = raw;
    } else if (typeof raw === 'string') {
      const parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) minMs = parsed;
    }

    return {
      onboardingVideoEnabled: enabled,
      onboardingMinSignupTimeMs: minMs,
    };
  } catch (e) {
    console.warn('fetchFeatureFlags failed, using defaults:', e);
    return DEFAULT_FLAGS;
  }
}
