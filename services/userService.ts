import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  collection,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { deleteUser, type User } from 'firebase/auth';
import { db } from '../config/firebase';
import { clearStravaTokens } from './stravaService';
import { SUBSCRIPTION_DURATION_MS, SUBSCRIPTION_FEATURE_LAUNCH_MS } from '../constants/subscription';

export type SubscriptionStatus = 'free' | 'subscribed';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  signupCode: string;
  createdAt: number;
  // Whether the user has finished (or skipped) the onboarding video.
  // Undefined on legacy profiles created before the field existed;
  // the onboarding gate treats undefined as "not seen yet" and then
  // relies on the signup-time cutoff in the feature flag doc to avoid
  // surfacing the video to pre-existing users.
  hasSeenOnboarding?: boolean;
  // ── Subscription ──────────────────────────────────────────────────────
  // Free tier is capped (see constants/subscription.ts); 'subscribed' has
  // no limits. Profiles written before this feature existed have no
  // `subscriptionStatus` field at all — `getUserProfile` grandfathers
  // those in as permanently subscribed (subscriptionExpiresAt: null)
  // rather than defaulting them to 'free'.
  subscriptionStatus: SubscriptionStatus;
  // When the (mock) subscription was purchased. Undefined for accounts
  // that have never subscribed.
  subscriptionPurchasedAt?: number;
  // ms timestamp the subscription lapses, or `null` for "never expires"
  // (grandfathered legacy accounts). Undefined = never subscribed.
  subscriptionExpiresAt?: number | null;
  // ms timestamp the account first went over the free-tier limits while
  // on the free plan. Drives the 30-day grace period before the
  // trim-selection gate kicks in. `null`/undefined = not currently over
  // limit (or the account is subscribed, where this doesn't apply).
  overLimitSince?: number | null;
}

function userDoc(userId: string) {
  return doc(db, 'users', userId);
}

/** Returns the user's profile doc (or null if the user hasn't signed up yet). */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const snap = await getDoc(userDoc(userId));
  if (!snap.exists()) return null;
  const data = snap.data();
  // A profile is considered "created" once `signupCode` has been written.
  if (!data.signupCode) return null;

  const toMs = (v: unknown): number | undefined => {
    if (v instanceof Timestamp) return v.toMillis();
    if (typeof v === 'number') return v;
    return undefined;
  };

  // `createdAt` is written as `serverTimestamp()`, which reads back as a
  // Firestore `Timestamp` instance — NOT a `number`. Must go through
  // `toMs` (previously this fell through to `Date.now()` on every read,
  // silently making "account age" meaningless everywhere it was used).
  const createdAtMs = toMs(data.createdAt) ?? Date.now();

  // Legacy profiles (written before the subscription feature shipped)
  // have no `subscriptionStatus` field at all. Grandfather those in as
  // permanently subscribed rather than dropping them onto the free tier
  // — per product decision, everyone who was already using the app
  // keeps unlimited bikes/components with no expiry. Gated on BOTH the
  // missing field AND predating the feature's launch cutoff, so a
  // brand-new profile can never be grandfathered even in edge cases the
  // field-presence check alone might miss.
  const hasSubscriptionField = typeof data.subscriptionStatus === 'string';
  const isLegacyAccount = !hasSubscriptionField && createdAtMs < SUBSCRIPTION_FEATURE_LAUNCH_MS;
  const subscriptionStatus: SubscriptionStatus = hasSubscriptionField
    ? (data.subscriptionStatus as SubscriptionStatus)
    : isLegacyAccount
    ? 'subscribed'
    : 'free';

  return {
    uid: userId,
    email: (data.email as string | null) ?? null,
    displayName: (data.displayName as string | null) ?? null,
    photoUrl: (data.photoUrl as string | null) ?? null,
    signupCode: data.signupCode as string,
    createdAt: createdAtMs,
    hasSeenOnboarding:
      typeof data.hasSeenOnboarding === 'boolean'
        ? data.hasSeenOnboarding
        : undefined,
    subscriptionStatus,
    subscriptionPurchasedAt: toMs(data.subscriptionPurchasedAt),
    subscriptionExpiresAt: hasSubscriptionField
      ? data.subscriptionExpiresAt === null
        ? null
        : toMs(data.subscriptionExpiresAt) ?? null
      : null, // grandfathered legacy profile: never expires
    overLimitSince:
      data.overLimitSince === null ? null : toMs(data.overLimitSince) ?? null,
  };
}

/**
 * Marks the onboarding video as seen for this user. Called when the user
 * either watches the video to completion or taps Skip on the first-time
 * presentation. Safe to call more than once.
 *
 * Uses `updateDoc` (not `setDoc`) so this fails loudly if the profile
 * doesn't already exist — which would mean the gate let the modal open
 * before the profile was ready. Better to surface that than to silently
 * create a half-written user doc with only this field on it.
 */
export async function markOnboardingSeen(userId: string): Promise<void> {
  await updateDoc(userDoc(userId), {
    hasSeenOnboarding: true,
    onboardingSeenAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Creates the user profile after a successful invite-code redemption.
 * Safe to call twice (uses `setDoc` with merge).
 */
export async function createUserProfile(
  userId: string,
  profile: {
    email: string | null;
    displayName: string | null;
    photoUrl: string | null;
    signupCode: string;
  }
): Promise<void> {
  await setDoc(
    userDoc(userId),
    {
      email: profile.email ?? null,
      displayName: profile.displayName ?? null,
      photoUrl: profile.photoUrl ?? null,
      signupCode: profile.signupCode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Brand-new profiles start on the free tier — only profiles that
      // predate this field get grandfathered (see `getUserProfile`).
      subscriptionStatus: 'free',
      overLimitSince: null,
    },
    { merge: true }
  );
}

// ─── Subscription ────────────────────────────────────────────────────────────

/**
 * Mock "purchase". No payment processor is wired up yet — this just
 * flips the Firestore flag and sets an expiry SUBSCRIPTION_DURATION_MS
 * out, which is enough to build and test the free/paid gating now. Swap
 * in real billing later without touching any caller of this function.
 */
export async function subscribeUser(userId: string): Promise<void> {
  const now = Date.now();
  await updateDoc(userDoc(userId), {
    subscriptionStatus: 'subscribed',
    subscriptionPurchasedAt: now,
    subscriptionExpiresAt: now + SUBSCRIPTION_DURATION_MS,
    // Subscribing immediately lifts the free-tier caps, so any pending
    // grace period is no longer relevant.
    overLimitSince: null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Cancels immediately (no "stays active until period end" — matches the
 * mock nature of the subscription). `subscriptionExpiresAt` /
 * `subscriptionPurchasedAt` are left in place as history; only the
 * status flips, so Settings can still show "previously subscribed".
 */
export async function unsubscribeUser(userId: string): Promise<void> {
  await updateDoc(userDoc(userId), {
    subscriptionStatus: 'free',
    updatedAt: serverTimestamp(),
  });
}

/** Persists the grace-period start/clear. Pass `null` to clear it. */
export async function setOverLimitSince(userId: string, ts: number | null): Promise<void> {
  await updateDoc(userDoc(userId), {
    overLimitSince: ts,
    updatedAt: serverTimestamp(),
  });
}

/** Pure check — true when a 'subscribed' profile's expiry has passed. */
export function isSubscriptionExpired(profile: UserProfile): boolean {
  return (
    profile.subscriptionStatus === 'subscribed' &&
    typeof profile.subscriptionExpiresAt === 'number' &&
    profile.subscriptionExpiresAt < Date.now()
  );
}

// ─── Account deletion ────────────────────────────────────────────────────────

/**
 * Batch-deletes every document in a subcollection under users/{userId}.
 * Firestore batch limit is 500; we chunk just in case.
 */
async function deleteSubcollection(
  userId: string,
  subcollection: string
): Promise<void> {
  const ref = collection(db, 'users', userId, subcollection);
  const snap = await getDocs(ref);
  if (snap.empty) return;

  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 400)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
}

/**
 * Permanently deletes the user's BikeVault data and the Firebase Auth
 * account. In order:
 *   1. bikes subcollection
 *   2. components subcollection
 *   3. strava/tokens
 *   4. users/{uid} profile doc
 *   5. Firebase Auth user (requires a recent sign-in)
 *
 * Steps 1-4 run inside Firestore; step 5 uses the passed-in auth `User`.
 *
 * Note: the invite code the user redeemed stays consumed — codes are
 * single-use, so the account is gone but the code does not become
 * available again.
 */
export async function deleteUserAccount(
  userId: string,
  authUser: User
): Promise<void> {
  // 1–3: wipe user data
  await deleteSubcollection(userId, 'bikes');
  await deleteSubcollection(userId, 'components');
  try {
    await clearStravaTokens(userId);
  } catch {
    // ignore — token doc might not exist
  }

  // 4: profile doc itself
  try {
    await deleteDoc(userDoc(userId));
  } catch {
    // ignore — may not exist if signup never completed
  }

  // 5: Firebase Auth account — this also signs the user out.
  // May throw `auth/requires-recent-login` if the session is stale; the
  // caller is expected to surface that error to the user so they can
  // sign in again and retry.
  await deleteUser(authUser);
}
