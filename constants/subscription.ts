/**
 * Subscription tiers & free-plan limits.
 *
 * BikeVault has two tiers:
 *   'free'       — capped at FREE_BIKE_LIMIT bikes and FREE_COMPONENT_LIMIT
 *                  components (total across the whole garage, not per bike).
 *   'subscribed' — no limits.
 *
 * There's no payment processor wired up yet, so "subscribing" is a mock
 * action (see `subscribeUser` in services/userService.ts) that just flips
 * the Firestore flag and sets an expiry SUBSCRIPTION_DURATION_DAYS out —
 * good enough to build and test the gating logic now; swap in real billing
 * later without touching any of the limit-checking code below.
 *
 * Existing users (profiles created before this feature shipped) are
 * grandfathered in as permanently subscribed — see the legacy-profile
 * handling in `getUserProfile`.
 */
export const FREE_BIKE_LIMIT = 2;
export const FREE_COMPONENT_LIMIT = 6;

/** Mock subscription length — mirrors an annual plan. */
export const SUBSCRIPTION_DURATION_DAYS = 365;

/**
 * When a subscribed user drops back to free (unsubscribe or expiry) while
 * over the free limits, they keep full access to their existing data for
 * this many days before being forced to choose what to keep.
 */
export const GRACE_PERIOD_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
export const SUBSCRIPTION_DURATION_MS = SUBSCRIPTION_DURATION_DAYS * DAY_MS;
export const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * DAY_MS;

export function canAddBike(currentBikeCount: number, isSubscribed: boolean): boolean {
  return isSubscribed || currentBikeCount < FREE_BIKE_LIMIT;
}

export function canAddComponent(currentComponentCount: number, isSubscribed: boolean): boolean {
  return isSubscribed || currentComponentCount < FREE_COMPONENT_LIMIT;
}

/** True when a free-tier account exceeds either cap (used to start/clear the grace-period clock). */
export function isOverFreeLimits(bikeCount: number, componentCount: number): boolean {
  return bikeCount > FREE_BIKE_LIMIT || componentCount > FREE_COMPONENT_LIMIT;
}

/** Whole days left in the grace period, floored at 0. `overLimitSince` is the ms timestamp the account first went over-limit. */
export function graceDaysRemaining(overLimitSince: number): number {
  const elapsed = Date.now() - overLimitSince;
  const remainingMs = GRACE_PERIOD_MS - elapsed;
  return Math.max(0, Math.ceil(remainingMs / DAY_MS));
}

export function isGracePeriodExpired(overLimitSince: number): boolean {
  return Date.now() - overLimitSince >= GRACE_PERIOD_MS;
}
