import { useSegments } from 'expo-router';
import { useAppStore } from '../store/useAppStore';
import { auth } from '../config/firebase';

/**
 * Decides whether the first-time onboarding modal should be shown on
 * the current frame. Returns `false` until *every* precondition is
 * satisfied so the modal can only ever surface in the intended slot.
 *
 * Preconditions, top to bottom:
 *  1. Feature flag is loaded AND enabled.
 *  2. The current route is the `(tabs)` group — i.e. the user has just
 *     landed in the app proper. Anywhere else (login, invite-code,
 *     bike detail, strava callback) is suppressed.
 *  3. Signed in, not anonymous, and the Firestore profile has resolved.
 *  4. The Firebase Auth account was created at or after
 *     `onboardingMinSignupTimeMs` — so legacy users that pre-date the
 *     rollout never see it.
 *  5. The profile's `hasSeenOnboarding` flag isn't `true` yet.
 *
 * This is the "first-time" gate. The Settings entry point bypasses it
 * by opening the modal directly with `mode="replay"`.
 */
export function useShouldShowOnboarding(): boolean {
  const segments = useSegments();
  const {
    featureFlags,
    userId,
    isAnonymous,
    hasProfile,
    profileChecked,
    hasSeenOnboarding,
  } = useAppStore();

  // 1. Flag must be loaded and on.
  if (!featureFlags) return false;
  if (!featureFlags.onboardingVideoEnabled) return false;

  // 2. Only fire on first paint inside (tabs).
  if (segments[0] !== '(tabs)') return false;

  // 3. Auth + profile must be ready, and non-anonymous.
  if (!userId || isAnonymous) return false;
  if (!profileChecked || !hasProfile) return false;

  // 4. Signup-time cutoff. `creationTime` is an ISO string in Firebase
  // Auth's user metadata; parse to ms and compare. If the user object
  // isn't available yet (race), bail — better to skip a frame than
  // surface to a legacy user.
  const creationTime = auth.currentUser?.metadata.creationTime;
  if (!creationTime) return false;
  const createdMs = Date.parse(creationTime);
  if (Number.isNaN(createdMs)) return false;
  if (createdMs < featureFlags.onboardingMinSignupTimeMs) return false;

  // 5. Only show if not yet seen. `null` (legacy / unknown) is treated
  // as "not seen" — the cutoff above already prevents legacy users
  // from reaching this branch.
  if (hasSeenOnboarding === true) return false;

  return true;
}
