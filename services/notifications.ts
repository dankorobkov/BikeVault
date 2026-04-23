import { Platform } from 'react-native';
import type { Bike, BikeComponent, NotificationPrefs, ChainLubeType } from '../types';
import { CHAIN_LUBE_TYPES } from '../constants/chainLube';

/**
 * Web push notifications for BikeVault.
 *
 * Strategy
 * --------
 *   - Uses the plain browser Notifications API (`new Notification(...)`).
 *   - Fires while the PWA is open in any tab. No service-worker push /
 *     VAPID / server component — that would require push tokens and an
 *     Anthropic-grade backend we don't have.
 *   - Native builds (iOS/Android) no-op; `Platform.OS === 'web'` gates
 *     every public function. Later we can add `expo-notifications` for
 *     native without changing callers.
 *
 * Dedup
 * -----
 *   Notifications are keyed by a stable string (e.g. `lube:{id}:{iter}`)
 *   and stored in `localStorage` with a timestamp. A notification is
 *   suppressed if the same key fired within `DEDUP_MS`. This prevents
 *   the same warning from firing on every hydrate/refresh.
 *
 * What we scan for
 * ----------------
 *   - Chain lube due             (prefs.chainLube)
 *   - Component critical (≥80%)  (prefs.componentWear)
 *   - Component overdue (≥100%)  (prefs.componentWear)
 *   - Service interval reached   (prefs.componentWear)
 */

const DEDUP_MS = 24 * 60 * 60 * 1000; // 24h
const DEDUP_PREFIX = 'bv_notif_';

type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

function isSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.Notification !== 'undefined'
  );
}

export function getNotificationPermission(): PermissionState {
  if (!isSupported()) return 'unsupported';
  return window.Notification.permission as PermissionState;
}

/**
 * Prompt the user for permission. Safe to call repeatedly — if already
 * granted or denied, returns the current state without re-prompting.
 */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!isSupported()) return 'unsupported';
  if (window.Notification.permission !== 'default') {
    return window.Notification.permission as PermissionState;
  }
  try {
    const result = await window.Notification.requestPermission();
    return result as PermissionState;
  } catch {
    return 'denied';
  }
}

function hasFiredRecently(key: string): boolean {
  try {
    const raw = window.localStorage.getItem(DEDUP_PREFIX + key);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < DEDUP_MS;
  } catch {
    return false;
  }
}

function markFired(key: string): void {
  try {
    window.localStorage.setItem(DEDUP_PREFIX + key, String(Date.now()));
  } catch {
    /* quota / private mode — ignore */
  }
}

function fire(key: string, title: string, body: string): void {
  if (!isSupported()) return;
  if (window.Notification.permission !== 'granted') return;
  if (hasFiredRecently(key)) return;
  try {
    // tag de-duplicates within the native notification center if the
    // same key fires twice in quick succession (e.g. two scans racing).
    new window.Notification(title, { body, tag: key, icon: '/icon.png' });
    markFired(key);
  } catch {
    /* ignore — some browsers block Notification construction from
       non-secure contexts or when the page is hidden. */
  }
}

// ── Scan helpers ─────────────────────────────────────────────────────────────

interface LubeStatus {
  dueIn: number; // km remaining until re-lube; negative = overdue
  intervalIteration: number; // how many full intervals have elapsed since last lube
  intervalKm: number;
}

/**
 * Compute lube status for a chain component. Returns null if the chain
 * has no lube tracking set up.
 */
export function computeLubeStatus(
  component: BikeComponent,
  bike: Bike
): LubeStatus | null {
  if (component.category !== 'chain') return null;
  if (!component.lubeType) return null;
  const intervalKm =
    component.lubeIntervalKm ??
    CHAIN_LUBE_TYPES[component.lubeType].defaultIntervalKm;
  const baseline = component.lubeDistanceAtLastLube ?? component.installDistance;
  const kmSince = Math.max(0, bike.totalDistance - baseline);
  return {
    dueIn: intervalKm - kmSince,
    intervalIteration: Math.floor(kmSince / intervalKm),
    intervalKm,
  };
}

function lubeLabel(lubeType: ChainLubeType): string {
  return CHAIN_LUBE_TYPES[lubeType].shortLabel.toLowerCase();
}

function scanComponentForBike(
  component: BikeComponent,
  bike: Bike,
  prefs: NotificationPrefs
): void {
  if (component.status !== 'active') return;

  // ── Chain lube ─────────────────────────────────────────────────────────
  if (prefs.chainLube && component.category === 'chain' && component.lubeType) {
    const lube = computeLubeStatus(component, bike);
    if (lube && lube.dueIn <= 0) {
      const key = 'lube:' + component.id + ':' + lube.intervalIteration;
      const label = lubeLabel(component.lubeType);
      fire(
        key,
        bike.name + ' — chain lube due',
        "Time to re-apply " + label + " (" + Math.round(-lube.dueIn) + " km over interval)."
      );
    }
  }

  // ── Wear (critical / overdue) ──────────────────────────────────────────
  if (prefs.componentWear) {
    const ridden = Math.max(0, bike.totalDistance - component.installDistance);
    const wearPct = (ridden / component.maxLifespan) * 100;
    if (wearPct >= 100) {
      fire(
        'overdue:' + component.id,
        bike.name + ' — ' + component.name + ' overdue',
        'Past recommended lifespan. Consider replacing soon.'
      );
    } else if (wearPct >= 80) {
      fire(
        'wear80:' + component.id,
        bike.name + ' — ' + component.name + ' nearing end of life',
        Math.round(wearPct) + '% worn. Plan a replacement.'
      );
    }

    // ── Service interval ────────────────────────────────────────────────
    if (component.attentionFrequency && component.attentionFrequency > 0) {
      const intervals = Math.floor(ridden / component.attentionFrequency);
      if (intervals > 0) {
        const key = 'service:' + component.id + ':' + intervals;
        fire(
          key,
          bike.name + ' — ' + component.name + ' service due',
          'Every ' +
            component.attentionFrequency +
            ' km — check, clean, or adjust as needed.'
        );
      }
    }
  }
}

/**
 * Walk through all active components and fire notifications for any
 * thresholds crossed. Safe to call on every app open — dedup keeps
 * things quiet.
 *
 * Returns the number of notifications actually fired (useful for tests).
 */
export function scanAndNotify(
  bikes: Bike[],
  components: BikeComponent[],
  prefs: NotificationPrefs
): number {
  if (!isSupported()) return 0;
  if (!prefs.enabled) return 0;
  if (window.Notification.permission !== 'granted') return 0;

  const bikeById = new Map(bikes.map((b) => [b.id, b]));
  let fired = 0;
  for (const c of components) {
    if (!c.bikeId) continue; // in-stock — no bike to measure against
    const bike = bikeById.get(c.bikeId);
    if (!bike) continue;
    const before = countPendingKeys();
    scanComponentForBike(c, bike, prefs);
    const after = countPendingKeys();
    if (after > before) fired += after - before;
  }
  return fired;
}

function countPendingKeys(): number {
  try {
    let count = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(DEDUP_PREFIX)) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Fire a visible test notification so the user can confirm permission
 * and OS-level delivery are set up.
 */
export function fireTestNotification(): boolean {
  if (!isSupported()) return false;
  if (window.Notification.permission !== 'granted') return false;
  try {
    new window.Notification('BikeVault', {
      body: 'Notifications are set up. We\u2019ll ping you about lubes, wear, and service intervals.',
      tag: 'bv_test',
    });
    return true;
  } catch {
    return false;
  }
}
