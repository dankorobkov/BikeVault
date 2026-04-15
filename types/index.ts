export type BikeType =
  | 'road'
  | 'mtb'
  | 'gravel'
  | 'cyclocross'
  | 'city'
  | 'ebike'
  | 'other';

export type BrakeSystem = 'disc-hydraulic' | 'disc-cable' | 'rim';

export interface Bike {
  id: string;
  name: string;
  brand: string;
  type: BikeType;
  brakeSystem: BrakeSystem;
  color: string;
  stravaId?: string;
  totalDistance: number; // km
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

export interface BikeComponent {
  id: string;
  bikeId: string | null; // null = in stock, not installed on a bike
  name: string;
  category: ComponentCategory;
  brand?: string;
  installDate: number; // timestamp ms
  installDistance: number; // bike's total km when installed (0 if in stock)
  maxLifespan: number; // km
  attentionFrequency?: number; // km between maintenance events (e.g. chain lube)
  status: ComponentStatus; // 'active' | 'in-stock' | 'retired'
  notes?: string;
  // Electric fields (only when isElectric = true)
  isElectric?: boolean;
  lastCharged?: number; // timestamp ms
  chargeIntervalDays?: number; // typical days between charges
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

export function calcWearPercent(
  bikeDistance: number,
  installDistance: number,
  maxLifespan: number
): number {
  const ridden = Math.max(0, bikeDistance - installDistance);
  return Math.min(Math.round((ridden / maxLifespan) * 100), 120);
}

export function calcRemainingKm(
  bikeDistance: number,
  installDistance: number,
  maxLifespan: number
): number {
  const ridden = Math.max(0, bikeDistance - installDistance);
  return Math.max(0, maxLifespan - ridden);
}
