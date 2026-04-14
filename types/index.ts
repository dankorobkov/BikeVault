export type BikeType =
  | 'road'
  | 'mtb'
  | 'gravel'
  | 'cyclocross'
  | 'city'
  | 'ebike'
  | 'other';

export interface Bike {
  id: string;
  name: string;
  brand: string;
  type: BikeType;
  color: string;
  stravaId?: string;
  totalDistance: number; // km
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
}

export type ComponentStatus = 'active' | 'retired';

export type ComponentCategory =
  | 'chain'
  | 'cassette'
  | 'chainring'
  | 'rear_derailleur'
  | 'front_derailleur'
  | 'brake_pads_rim'
  | 'brake_pads_disc'
  | 'tire_front'
  | 'tire_rear'
  | 'brake_cable'
  | 'shift_cable'
  | 'bottom_bracket'
  | 'bar_tape'
  | 'pedals'
  | 'fork'
  | 'handlebar'
  | 'saddle'
  | 'other';

export interface BikeComponent {
  id: string;
  bikeId: string;
  name: string;
  category: ComponentCategory;
  brand?: string;
  installDate: number; // timestamp
  installDistance: number; // bike's total km when this component was installed
  maxLifespan: number; // km
  status: ComponentStatus;
  notes?: string;
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
  expiresAt: number; // unix timestamp
  athleteId: number;
  athleteName: string;
  athleteAvatar: string;
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
