import type { ComponentCategory, ComponentGroup, BrakeSystem, BikeType } from '../types';

export interface ComponentTypeInfo {
  label: string;
  icon: string; // Ionicons name
  defaultLifespan: number; // km
  group: ComponentGroup;
  isElectricCapable?: boolean;
  defaultAttentionFrequency?: number; // km — suggested maintenance interval
  // Which brake systems this component belongs to (undefined = any)
  brakeSystemFilter?: BrakeSystem[];
}

export const COMPONENT_TYPES: Record<ComponentCategory, ComponentTypeInfo> = {
  // ── Drivetrain ──────────────────────────────────────────────────────────────
  chain: {
    label: 'Chain',
    icon: 'link-outline',
    defaultLifespan: 3000,
    group: 'drivetrain',
  },
  cassette: {
    label: 'Cassette',
    icon: 'settings-outline',
    defaultLifespan: 10000,
    group: 'drivetrain',
  },
  chainring: {
    label: 'Chainring',
    icon: 'radio-button-on-outline',
    defaultLifespan: 15000,
    group: 'drivetrain',
  },
  'pulley-wheel': {
    label: 'Pulley Wheels',
    icon: 'ellipse-outline',
    defaultLifespan: 15000,
    group: 'drivetrain',
  },
  'left-shifter': {
    label: 'Left Shifter',
    icon: 'hand-left-outline',
    defaultLifespan: 30000,
    group: 'drivetrain',
    isElectricCapable: true,
  },
  'right-shifter': {
    label: 'Right Shifter',
    icon: 'hand-right-outline',
    defaultLifespan: 30000,
    group: 'drivetrain',
    isElectricCapable: true,
  },
  'front-derailleur': {
    label: 'Front Derailleur',
    icon: 'git-branch-outline',
    defaultLifespan: 30000,
    group: 'drivetrain',
    isElectricCapable: true,
  },
  'rear-derailleur': {
    label: 'Rear Derailleur',
    icon: 'git-branch-outline',
    defaultLifespan: 30000,
    group: 'drivetrain',
    isElectricCapable: true,
  },
  'bottom-bracket': {
    label: 'Bottom Bracket',
    icon: 'reload-outline',
    defaultLifespan: 15000,
    group: 'drivetrain',
  },
  crankset: {
    label: 'Crankset',
    icon: 'sync-outline',
    defaultLifespan: 30000,
    group: 'drivetrain',
  },
  'di2-battery': {
    label: 'Di2 / eTap Battery',
    icon: 'battery-charging-outline',
    defaultLifespan: 50000,
    group: 'drivetrain',
    isElectricCapable: true,
  },
  'front-shift-cable': {
    label: 'Front Shift Cable',
    icon: 'remove-outline',
    defaultLifespan: 8000,
    group: 'drivetrain',
  },
  'rear-shift-cable': {
    label: 'Rear Shift Cable',
    icon: 'remove-outline',
    defaultLifespan: 8000,
    group: 'drivetrain',
  },

  // ── Brakes ──────────────────────────────────────────────────────────────────
  'front-disc-rotor': {
    label: 'Front Disc Rotor',
    icon: 'disc-outline',
    defaultLifespan: 15000,
    group: 'brakes',
    brakeSystemFilter: ['disc-hydraulic', 'disc-cable'],
  },
  'front-brake-pads': {
    label: 'Front Brake Pads',
    icon: 'stop-circle-outline',
    defaultLifespan: 5000,
    group: 'brakes',
  },
  'rear-disc-rotor': {
    label: 'Rear Disc Rotor',
    icon: 'disc-outline',
    defaultLifespan: 15000,
    group: 'brakes',
    brakeSystemFilter: ['disc-hydraulic', 'disc-cable'],
  },
  'rear-brake-pads': {
    label: 'Rear Brake Pads',
    icon: 'stop-circle-outline',
    defaultLifespan: 5000,
    group: 'brakes',
  },
  'front-brake-cable': {
    label: 'Front Brake Cable',
    icon: 'remove-outline',
    defaultLifespan: 5000,
    group: 'brakes',
    brakeSystemFilter: ['disc-cable', 'rim'],
  },
  'rear-brake-cable': {
    label: 'Rear Brake Cable',
    icon: 'remove-outline',
    defaultLifespan: 5000,
    group: 'brakes',
    brakeSystemFilter: ['disc-cable', 'rim'],
  },

  // ── Front Wheel ─────────────────────────────────────────────────────────────
  'front-hub': {
    label: 'Front Hub',
    icon: 'radio-button-off-outline',
    defaultLifespan: 50000,
    group: 'front-wheel',
  },
  'front-rim': {
    label: 'Front Rim',
    icon: 'ellipse-outline',
    defaultLifespan: 30000,
    group: 'front-wheel',
  },
  'front-spokes': {
    label: 'Front Spokes',
    icon: 'star-outline',
    defaultLifespan: 30000,
    group: 'front-wheel',
  },
  'front-tyre': {
    label: 'Front Tyre',
    icon: 'ellipse-outline',
    defaultLifespan: 5000,
    group: 'front-wheel',
  },
  'front-tube': {
    label: 'Front Tube',
    icon: 'ellipse-outline',
    defaultLifespan: 3000,
    group: 'front-wheel',
  },
  'front-tubeless-sealant': {
    label: 'Front Tubeless Sealant',
    icon: 'water-outline',
    defaultLifespan: 2000,
    group: 'front-wheel',
    defaultAttentionFrequency: 2000, // top up every season / ~2000km
  },

  // ── Rear Wheel ──────────────────────────────────────────────────────────────
  'rear-hub': {
    label: 'Rear Hub',
    icon: 'radio-button-off-outline',
    defaultLifespan: 50000,
    group: 'rear-wheel',
  },
  'rear-rim': {
    label: 'Rear Rim',
    icon: 'ellipse-outline',
    defaultLifespan: 25000,
    group: 'rear-wheel',
  },
  'rear-spokes': {
    label: 'Rear Spokes',
    icon: 'star-outline',
    defaultLifespan: 25000,
    group: 'rear-wheel',
  },
  'rear-tyre': {
    label: 'Rear Tyre',
    icon: 'ellipse-outline',
    defaultLifespan: 4000,
    group: 'rear-wheel',
  },
  'rear-tube': {
    label: 'Rear Tube',
    icon: 'ellipse-outline',
    defaultLifespan: 3000,
    group: 'rear-wheel',
  },
  'rear-tubeless-sealant': {
    label: 'Rear Tubeless Sealant',
    icon: 'water-outline',
    defaultLifespan: 2000,
    group: 'rear-wheel',
    defaultAttentionFrequency: 2000,
  },

  // ── Frame & Cockpit ─────────────────────────────────────────────────────────
  fork: {
    label: 'Fork',
    icon: 'git-network-outline',
    defaultLifespan: 50000,
    group: 'frame',
  },
  frame: {
    label: 'Frame',
    icon: 'bicycle-outline',
    defaultLifespan: 80000,
    group: 'frame',
  },
  saddle: {
    label: 'Saddle',
    icon: 'triangle-outline',
    defaultLifespan: 20000,
    group: 'frame',
  },
  'saddle-post': {
    label: 'Saddle Post',
    icon: 'arrow-up-outline',
    defaultLifespan: 30000,
    group: 'frame',
  },
  stem: {
    label: 'Stem',
    icon: 'swap-horizontal-outline',
    defaultLifespan: 40000,
    group: 'frame',
  },
  'headset-bearings': {
    label: 'Headset Bearings',
    icon: 'reload-outline',
    defaultLifespan: 20000,
    group: 'frame',
  },
  handlebar: {
    label: 'Handlebar',
    icon: 'swap-horizontal-outline',
    defaultLifespan: 25000,
    group: 'frame',
  },
  pedals: {
    label: 'Pedals',
    icon: 'grid-outline',
    defaultLifespan: 25000,
    group: 'frame',
  },
  'bar-tape': {
    label: 'Bar Tape',
    icon: 'bandage-outline',
    defaultLifespan: 5000,
    group: 'frame',
  },

  // ── Sensors ─────────────────────────────────────────────────────────────────
  'speed-sensor': {
    label: 'Speed Sensor',
    icon: 'speedometer-outline',
    defaultLifespan: 30000,
    group: 'sensors',
    isElectricCapable: true,
  },
  'cadence-sensor': {
    label: 'Cadence Sensor',
    icon: 'sync-circle-outline',
    defaultLifespan: 30000,
    group: 'sensors',
    isElectricCapable: true,
  },
  'power-meter': {
    label: 'Power Meter',
    icon: 'flash-outline',
    defaultLifespan: 50000,
    group: 'sensors',
    isElectricCapable: true,
  },

  other: {
    label: 'Other',
    icon: 'construct-outline',
    defaultLifespan: 10000,
    group: 'other',
  },
};

export const COMPONENT_GROUP_LABELS: Record<ComponentGroup | 'other', string> = {
  drivetrain: 'Drivetrain',
  brakes: 'Brakes',
  'front-wheel': 'Front Wheel',
  'rear-wheel': 'Rear Wheel',
  frame: 'Frame & Cockpit',
  sensors: 'Sensors',
  other: 'Other',
};

// Returns component categories filtered for a given brake system
export function getComponentsForBike(brakeSystem?: BrakeSystem): ComponentCategory[] {
  return (Object.keys(COMPONENT_TYPES) as ComponentCategory[]).filter((key) => {
    const info = COMPONENT_TYPES[key];
    if (!info.brakeSystemFilter) return true;
    if (!brakeSystem) return true;
    return info.brakeSystemFilter.includes(brakeSystem);
  });
}

// Returns components grouped, filtered for a bike's brake system
export function getGroupedComponents(brakeSystem?: BrakeSystem) {
  const keys = getComponentsForBike(brakeSystem);
  const groups: Partial<Record<ComponentGroup | 'other', ComponentCategory[]>> = {};
  keys.forEach((key) => {
    const g = COMPONENT_TYPES[key].group as ComponentGroup | 'other';
    if (!groups[g]) groups[g] = [];
    groups[g]!.push(key);
  });
  return groups;
}

export const BIKE_TYPE_LABELS: Record<BikeType, string> = {
  road: 'Road',
  mtb: 'Mountain',
  gravel: 'Gravel',
  cyclocross: 'Cyclocross',
  city: 'City / Commuter',
  ebike: 'E-Bike',
  'trainer-direct-drive': 'Direct-Drive Trainer',
  rollers: 'Rollers',
  other: 'Other',
};

/**
 * Ionicons used to visually distinguish bike types in chips, cards, and
 * the add/edit modals. Indoor setups get their own glyphs so they read as
 * clearly different from outdoor bikes at a glance.
 */
export const BIKE_TYPE_ICONS: Record<BikeType, string> = {
  road: 'bicycle-outline',
  mtb: 'bicycle-outline',
  gravel: 'bicycle-outline',
  cyclocross: 'bicycle-outline',
  city: 'bicycle-outline',
  ebike: 'flash-outline',
  'trainer-direct-drive': 'barbell-outline',
  rollers: 'sync-circle-outline',
  other: 'ellipsis-horizontal-outline',
};

export const BRAKE_SYSTEM_LABELS: Record<BrakeSystem, string> = {
  'disc-hydraulic': 'Disc – Hydraulic',
  'disc-cable': 'Disc – Cable',
  rim: 'Rim Brake',
};

export const BIKE_COLORS = [
  '#FF453A',
  '#FF9F0A',
  '#FFD60A',
  '#30D158',
  '#32ADE6',
  '#0A84FF',
  '#BF5AF2',
  '#FF6B35',
  '#FFFFFF',
  '#8E8E93',
];
