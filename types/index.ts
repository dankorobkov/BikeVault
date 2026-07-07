export type BikeType =
  | 'road'
  | 'mtb'
  | 'gravel'
  | 'cyclocross'
  | 'city'
  | 'ebike'
  // ── Indoor setups ─────────────────────────────────────────────────────────
  // Direct-drive trainer: rear wheel is removed, chain engages with the
  // trainer's own cassette. Cassette + chain + pulleys wear; tyres, rear
  // hub, rear rotor don't apply (wheel isn't there).
  | 'trainer-direct-drive'
  // Rollers: bike spins freely on drums, both wheels turn. Everything
  // wears like outdoors — except the rear tyre wears significantly faster
  // because of heat and the hard drum surface.
  | 'rollers'
  | 'other';

/**
 * Whether a bike is an indoor-only setup. Drives UI hints (info card,
 * badge on BikeCard) and component-category filtering.
 */
export function isIndoorBike(type: BikeType): boolean {
  return type === 'trainer-direct-drive' || type === 'rollers';
}

/**
 * Component categories that don't apply to a given bike type.
 * Used by AddComponentModal to hide irrelevant options and by the bike
 * detail screen to flag invalid installs.
 *
 * Direct-drive: the rear wheel is removed, so everything attached to it
 * is irrelevant. The cassette the chain actually engages with lives on
 * the trainer, but we still track it here because users swap BikeVault
 * bikes onto the same trainer (so the cassette "belongs" to the trainer
 * bike entry).
 */
export function hiddenComponentCategoriesForBike(
  type: BikeType
): ComponentCategory[] {
  if (type === 'trainer-direct-drive') {
    return [
      'rear-hub',
      'rear-rim',
      'rear-spokes',
      'rear-tyre',
      'rear-tube',
      'rear-tubeless-sealant',
      'rear-disc-rotor',
      'rear-brake-pads',
      'rear-brake-cable',
      // Front wheel doesn't move either on a direct-drive trainer
      'front-hub',
      'front-rim',
      'front-spokes',
      'front-tyre',
      'front-tube',
      'front-tubeless-sealant',
      'front-disc-rotor',
      'front-brake-pads',
      'front-brake-cable',
    ];
  }
  // Rollers & outdoor bikes: everything is fair game.
  return [];
}

export type BrakeSystem = 'disc-hydraulic' | 'disc-cable' | 'rim';

/**
 * Strava `sport_type` values we surface as selectable defaults.
 *
 * Only cycling-adjacent sport types. Strava has dozens more (Run,
 * Hike, Swim, AlpineSki, Kayaking, etc.) but none of them apply to a
 * bike, so we don't show them.
 *
 * Reference:
 *   https://developers.strava.com/docs/reference/#api-models-SportType
 */
export type StravaActivityType =
  | 'Ride'
  | 'VirtualRide'
  | 'MountainBikeRide'
  | 'GravelRide'
  | 'EBikeRide'
  | 'EMountainBikeRide';

/**
 * Default activity for a bike type. Picked as the best-fitting Strava
 * `sport_type` so if we later auto-categorize Strava activities by
 * bike, the mapping is already in place.
 */
export function defaultActivityForBikeType(type: BikeType): StravaActivityType {
  switch (type) {
    case 'mtb':
      return 'MountainBikeRide';
    case 'gravel':
    case 'cyclocross':
      return 'GravelRide';
    case 'ebike':
      return 'EBikeRide';
    case 'trainer-direct-drive':
    case 'rollers':
      return 'VirtualRide';
    case 'road':
    case 'city':
    case 'other':
    default:
      return 'Ride';
  }
}

/**
 * How the bike's displayed weight is computed.
 *
 *   'manual' — show `bike.weight` as the source of truth and ignore
 *              components. Use when the user just wants to record a
 *              weighed-on-a-scale number and doesn't track per-part
 *              weights.
 *   'sum'    — display weight = sum of installed components' `weight`.
 *              Useful when the user has weighed every part and wants
 *              the bike total to update automatically as parts change.
 *              `bike.weight` is ignored / unused in this mode.
 *   'mixed'  — display weight = `bike.weight`, but the UI also surfaces
 *              the components-sum next to it as a sanity check. Lets
 *              the user reconcile "what the bike actually weighed on
 *              the scale" against "what the parts add up to" — the
 *              delta is the un-tracked stuff (frame, hardware, water
 *              bottle cage, etc.).
 *
 * Older bikes created before this field existed don't have a value.
 * The `effectiveBikeWeight` helper treats missing as 'manual'.
 */
export type BikeWeightMode = 'manual' | 'sum' | 'mixed';

export interface Bike {
  id: string;
  name: string;
  brand: string;
  type: BikeType;
  brakeSystem: BrakeSystem;
  color: string;
  stravaId?: string;
  totalDistance: number; // km
  /**
   * Default Strava activity for rides on this bike. Auto-derived from
   * `type` when the bike is created, but user-overridable from Add/Edit
   * Bike and from Settings. Used as the canonical label for the bike's
   * rides and will drive future auto-categorisation of untagged Strava
   * activities.
   */
  defaultActivity?: StravaActivityType;
  /**
   * User-entered bike weight in kilograms. Decimals allowed (e.g.
   * 8.25). Used directly when `weightMode` is 'manual' or 'mixed';
   * ignored when 'sum'. Optional — bikes created before this field
   * existed have no value and the UI shows a "Set weight" prompt.
   */
  weight?: number;
  /** See `BikeWeightMode`. Defaults to 'manual' when missing. */
  weightMode?: BikeWeightMode;
  createdAt: number;
  updatedAt: number;
}

export type ComponentStatus = 'active' | 'in-stock' | 'retired';

// ── Drivetrain ────────────────────────────────────────────────────────────────
export type DrivetrainCategory =
  | 'chain'
  | 'cassette'
  | 'chainring'
  | 'pulley-wheel'
  | 'left-shifter'
  | 'right-shifter'
  | 'front-derailleur'
  | 'rear-derailleur'
  | 'bottom-bracket'
  | 'crankset'
  | 'di2-battery'
  | 'front-shift-cable'
  | 'rear-shift-cable';

// ── Brakes ────────────────────────────────────────────────────────────────────
export type BrakeCategory =
  | 'front-disc-rotor'
  | 'front-brake-pads'
  | 'rear-disc-rotor'
  | 'rear-brake-pads'
  | 'front-brake-cable'
  | 'rear-brake-cable';

// ── Wheels ────────────────────────────────────────────────────────────────────
export type WheelCategory =
  | 'front-hub'
  | 'front-rim'
  | 'front-spokes'
  | 'front-tyre'
  | 'front-tube'
  | 'front-tubeless-sealant'
  | 'rear-hub'
  | 'rear-rim'
  | 'rear-spokes'
  | 'rear-tyre'
  | 'rear-tube'
  | 'rear-tubeless-sealant';

// ── Frame & Cockpit ───────────────────────────────────────────────────────────
export type FrameCategory =
  | 'fork'
  | 'frame'
  | 'saddle'
  | 'saddle-post'
  | 'stem'
  | 'headset-bearings'
  | 'handlebar'
  | 'pedals'
  | 'bar-tape';

// ── Sensors ───────────────────────────────────────────────────────────────────
export type SensorCategory = 'speed-sensor' | 'cadence-sensor' | 'power-meter';

export type ComponentCategory =
  | DrivetrainCategory
  | BrakeCategory
  | WheelCategory
  | FrameCategory
  | SensorCategory
  | 'other';

export type ComponentGroup =
  | 'drivetrain'
  | 'brakes'
  | 'front-wheel'
  | 'rear-wheel'
  | 'frame'
  | 'sensors'
  | 'other';

// Electric-capable categories
export const ELECTRIC_CATEGORIES: ComponentCategory[] = [
  'left-shifter',
  'right-shifter',
  'front-derailleur',
  'rear-derailleur',
  'di2-battery',
];

/**
 * Chain lubrication strategies we support. Each entry drives a
 * recommended re-lube interval and the UI icon/label in
 * `constants/chainLube.ts`.
 *
 * Picked as the mainstream options cyclists talk about:
 *   - 'hot-wax'   — immersive paraffin/wax-bath treatment (e.g. Silca
 *                   Secret Chain Blend, Molten Speed Wax). Longest
 *                   interval, cleanest drivetrain, most effort per
 *                   application.
 *   - 'drip-wax'  — emulsion drip wax (Silca Super Secret, Squirt, SILCA
 *                   Synergetic's wax variants). Medium interval, easy
 *                   to apply without removing the chain.
 *   - 'wet-lube'  — oil-based wet lube (Finish Line Wet, Rock'n'Roll
 *                   Absolute Dry). Best for rain/winter, attracts grit.
 *   - 'dry-lube'  — thin oil lube (Finish Line Dry, White Lightning
 *                   Clean Ride). For dry conditions, short interval.
 *   - 'ceramic'   — ceramic/polymer lubes (Muc-Off Ludicrous AF, CeramicSpeed
 *                   UFO). Premium, fairly long interval.
 */
export type ChainLubeType =
  | 'hot-wax'
  | 'drip-wax'
  | 'wet-lube'
  | 'dry-lube'
  | 'ceramic';

export interface BikeComponent {
  id: string;
  bikeId: string | null; // null = in stock, not installed on a bike
  name: string;
  category: ComponentCategory;
  brand?: string;
  installDate: number; // timestamp ms
  installDistance: number; // bike's total km when installed (0 if in stock)
  /**
   * Kilometres this component had already been ridden BEFORE it was
   * tracked in BikeVault — e.g. a used cassette bought with 3 000 km
   * on it, or a part migrated over from another bike. Stored as its
   * own column (rather than implicit in `installDistance =
   * bike.totalDistance − prior`) so migrations that rebase
   * `installDistance` from the activity timeline can't silently
   * destroy it. Optional — missing means 0.
   *
   * Displayed wear math:
   *   ridden = max(0, bike.totalDistance − installDistance) + priorWear
   */
  priorWear?: number;
  maxLifespan: number; // km
  attentionFrequency?: number; // km between maintenance events (e.g. chain lube)
  status: ComponentStatus; // 'active' | 'in-stock' | 'retired'
  notes?: string;
  // Electric fields (only when isElectric = true)
  isElectric?: boolean;
  lastCharged?: number; // timestamp ms
  chargeIntervalDays?: number; // typical days between charges
  // Chain-lube fields (only when category === 'chain' and user picked one)
  lubeType?: ChainLubeType;
  /** Timestamp of the most recent re-lube. */
  lastLubedAt?: number;
  /** User override for re-lube interval in km. Defaults to the value in
   *  `CHAIN_LUBE_TYPES[lubeType].defaultIntervalKm`. */
  lubeIntervalKm?: number;
  /** Bike's total distance at the most recent re-lube. Used together with
   *  the current bike distance to compute km-since-lube without needing
   *  a ride log. */
  lubeDistanceAtLastLube?: number;
  /**
   * Component weight in kilograms. Decimals allowed (e.g. 0.25 for a
   * chain). Optional — most riders don't weigh every part. When set,
   * contributes to the parent bike's `weightMode='sum'` computation
   * and is shown on the component card. Stored in kg so the math
   * against `bike.weight` (also kg) is unit-clean.
   */
  weight?: number;
  createdAt: number;
  updatedAt: number;
}

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile: string;
  bikes: StravaBike[];
}

export interface StravaBike {
  id: string;
  name: string;
  distance: number; // meters
}

export interface StravaActivity {
  id: number;
  name: string;
  distance: number; // meters
  moving_time: number; // seconds
  start_date: string;
  gear_id: string | null;
  type: string;
}

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athleteId: number;
  athleteName: string;
  athleteAvatar: string;
}

// ── Multi-provider activity sources ────────────────────────────────────────────

/**
 * Every fitness data source BikeVault can link. The user may link more
 * than one, but exactly one is the *primary* source — the only provider
 * whose activities advance bike odometers. The rest stay linked so the
 * user can switch primary later without re-authorizing.
 */
export type ProviderId = 'strava' | 'wahoo';

/**
 * OAuth tokens + athlete summary for a Wahoo connection. Mirrors
 * `StravaTokens` so the two can be handled symmetrically in the store
 * and provider layer. `expiresAt` is unix seconds (Wahoo access tokens
 * live ~2h; `offline_data` scope is what grants the refresh token).
 *
 * Wahoo's user object has no avatar/profile-photo field, so
 * `athleteAvatar` is always '' for Wahoo — the UI falls back to a
 * provider glyph.
 */
export interface WahooTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  athleteId: number;
  athleteName: string;
  athleteAvatar: string;
}

/**
 * A single Wahoo workout as returned by `GET /v1/workouts`. Only the
 * fields BikeVault needs are typed. `workout_summary` is null for
 * planned/uncompleted workouts (no ride happened, so no distance);
 * `distance_accum` is metres, serialized as a string.
 */
export interface WahooWorkout {
  id: number;
  starts: string; // ISO 8601
  minutes: number;
  workout_type_id: number;
  workout_summary?: {
    distance_accum?: string | null;
  } | null;
}

/**
 * Wahoo `workout_type_id` values in the BIKING family — i.e. the ones
 * that put distance on a bicycle. Every other workout type (running,
 * swimming, gym, …) is ignored during sync, exactly like Strava's
 * non-cycling sport types.
 *
 * Reference: Wahoo Cloud API "Workout Types" table.
 *   0  BIKING            11 BIKING_CYCLECROSS   12 BIKING_INDOOR
 *   13 BIKING_MOUNTAIN   14 BIKING_RECUMBENT    15 BIKING_ROAD
 *   16 BIKING_TRACK      17 BIKING_MOTOCYCLING  49 INDOOR_CYCLING_CLASS
 *   61 BIKING_INDOOR_TRAINER   64 EBIKING
 *   68 BIKING_INDOOR_VIRTUAL   70 HANDCYCLING
 */
export const WAHOO_CYCLING_WORKOUT_TYPE_IDS: ReadonlySet<number> = new Set([
  0, 11, 12, 13, 14, 15, 16, 17, 49, 61, 64, 68, 70,
]);

export function isWahooCyclingWorkout(w: WahooWorkout): boolean {
  return WAHOO_CYCLING_WORKOUT_TYPE_IDS.has(w.workout_type_id);
}

/**
 * Map a Wahoo cycling `workout_type_id` onto BikeVault's canonical bike
 * activity type (the same enum used for `bike.defaultActivity`), so a
 * Wahoo workout can be attributed by the existing activity-type rule.
 *
 * Wahoo carries no per-bike/gear tag (unlike Strava's `gear_id`), so
 * activity type is the ONLY attribution signal Wahoo can offer — a
 * limitation surfaced to the user in Settings.
 *
 * Returns `null` for non-cycling workout types.
 */
export function wahooWorkoutTypeToActivityType(
  workoutTypeId: number
): StravaActivityType | null {
  switch (workoutTypeId) {
    case 13: // BIKING_MOUNTAIN
      return 'MountainBikeRide';
    case 11: // BIKING_CYCLECROSS (gravel/cx bucket, matches bike-type default)
      return 'GravelRide';
    case 64: // EBIKING
      return 'EBikeRide';
    case 12: // BIKING_INDOOR
    case 49: // INDOOR_CYCLING_CLASS
    case 61: // BIKING_INDOOR_TRAINER
    case 68: // BIKING_INDOOR_VIRTUAL
      return 'VirtualRide';
    case 0: // BIKING
    case 14: // BIKING_RECUMBENT
    case 15: // BIKING_ROAD
    case 16: // BIKING_TRACK
    case 17: // BIKING_MOTOCYCLING
    case 70: // HANDCYCLING
      return 'Ride';
    default:
      return null;
  }
}

// ── Notification prefs ────────────────────────────────────────────────────────
export interface NotificationPrefs {
  enabled: boolean;
  chainLube: boolean; // warn when < 100km to attention
  componentWear: boolean; // warn when < 100km remaining lifespan
  batteryLow: boolean; // warn when estimated < 20% charge
}

export type WearLevel = 'good' | 'warning' | 'critical' | 'overdue';

export function getWearLevel(percent: number): WearLevel {
  if (percent >= 100) return 'overdue';
  if (percent >= 80) return 'critical';
  if (percent >= 60) return 'warning';
  return 'good';
}

/**
 * How many km this component has been ridden in total. Combines wear
 * accrued on the current bike since install with any `priorWear` carried
 * forward from before BikeVault tracked the part.
 *
 * Why the `max(0, ...)` floor on the bike-side term: `installDistance`
 * can legitimately exceed `bike.totalDistance` for in-stock parts (no
 * install yet) or moments right after a bike-total recompute. Without
 * the floor, those cases would subtract a negative back into the
 * formula. We want them to read as "0 km on this bike", not "negative
 * km offsetting priorWear".
 */
export function calcRiddenKm(
  bikeDistance: number,
  installDistance: number,
  priorWear: number = 0
): number {
  return Math.max(0, bikeDistance - installDistance) + Math.max(0, priorWear);
}

export function calcWearPercent(
  bikeDistance: number,
  installDistance: number,
  maxLifespan: number,
  priorWear: number = 0
): number {
  const ridden = calcRiddenKm(bikeDistance, installDistance, priorWear);
  return Math.min(Math.round((ridden / maxLifespan) * 100), 120);
}

export function calcRemainingKm(
  bikeDistance: number,
  installDistance: number,
  maxLifespan: number,
  priorWear: number = 0
): number {
  const ridden = calcRiddenKm(bikeDistance, installDistance, priorWear);
  return Math.max(0, maxLifespan - ridden);
}

/**
 * Sum the `weight` (kg) of every active component installed on this
 * bike. Skips components without a recorded weight rather than treating
 * them as 0 — that way the sum honestly represents "weight of the parts
 * I've actually weighed", and the difference vs a scale-measured bike
 * weight is the unweighed remainder. Retired and in-stock components
 * are excluded — they're not on the bike.
 *
 * Floating-point sums of decimals (0.25 + 0.31 + …) drift, but only at
 * the 1e-15 level. We round to 3 decimals on the way out so the UI
 * doesn't ever surface "0.55999999999998 kg".
 */
export function sumComponentWeights(
  bikeId: string,
  components: BikeComponent[]
): number {
  let total = 0;
  for (const c of components) {
    if (c.bikeId !== bikeId) continue;
    if (c.status !== 'active') continue;
    if (typeof c.weight === 'number') total += c.weight;
  }
  return Math.round(total * 1000) / 1000;
}

/**
 * What the bike's "weight" cell should display, given the chosen mode.
 * Returns `null` when there's nothing meaningful to show — e.g. no
 * manual weight set and no weighed components — so the UI can fall
 * back to a "Set weight" prompt instead of rendering 0.
 */
export function effectiveBikeWeight(
  bike: Bike,
  components: BikeComponent[]
): number | null {
  const mode: BikeWeightMode = bike.weightMode ?? 'manual';
  if (mode === 'sum') {
    const sum = sumComponentWeights(bike.id, components);
    return sum > 0 ? sum : null;
  }
  // manual / mixed — bike.weight is the source of truth.
  return typeof bike.weight === 'number' && bike.weight > 0 ? bike.weight : null;
}

/**
 * Format a weight in kilograms as a human string. Always kg, up to two
 * decimals, with trailing zeros stripped so 0.5 kg doesn't read as
 * "0.50 kg" but 0.25 still reads as "0.25 kg".
 */
export function formatWeight(kg: number): string {
  // toFixed(2) gives "0.50" or "8.25". Strip a trailing zero after the
  // dot ("0.50" → "0.5"), and strip a dangling dot if the whole thing
  // rounds to a whole number ("8.00" → "8").
  const str = kg.toFixed(2).replace(/\.?0+$/, '');
  return str + ' kg';
}
