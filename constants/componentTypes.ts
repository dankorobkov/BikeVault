import type { ComponentCategory } from '../types';

export interface ComponentTypeInfo {
  label: string;
  icon: string; // Ionicons name
  defaultLifespan: number; // km
  group: 'drivetrain' | 'brakes' | 'wheels' | 'cockpit' | 'other';
}

export const COMPONENT_TYPES: Record<ComponentCategory, ComponentTypeInfo> = {
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
    icon: 'settings-outline',
    defaultLifespan: 15000,
    group: 'drivetrain',
  },
  rear_derailleur: {
    label: 'Rear Derailleur',
    icon: 'git-branch-outline',
    defaultLifespan: 30000,
    group: 'drivetrain',
  },
  front_derailleur: {
    label: 'Front Derailleur',
    icon: 'git-branch-outline',
    defaultLifespan: 30000,
    group: 'drivetrain',
  },
  bottom_bracket: {
    label: 'Bottom Bracket',
    icon: 'radio-button-on-outline',
    defaultLifespan: 15000,
    group: 'drivetrain',
  },
  shift_cable: {
    label: 'Shift Cable',
    icon: 'remove-outline',
    defaultLifespan: 8000,
    group: 'drivetrain',
  },
  brake_pads_rim: {
    label: 'Brake Pads (Rim)',
    icon: 'stop-circle-outline',
    defaultLifespan: 5000,
    group: 'brakes',
  },
  brake_pads_disc: {
    label: 'Brake Pads (Disc)',
    icon: 'stop-circle-outline',
    defaultLifespan: 8000,
    group: 'brakes',
  },
  brake_cable: {
    label: 'Brake Cable',
    icon: 'remove-outline',
    defaultLifespan: 5000,
    group: 'brakes',
  },
  tire_front: {
    label: 'Front Tire',
    icon: 'ellipse-outline',
    defaultLifespan: 5000,
    group: 'wheels',
  },
  tire_rear: {
    label: 'Rear Tire',
    icon: 'ellipse-outline',
    defaultLifespan: 4000,
    group: 'wheels',
  },
  bar_tape: {
    label: 'Bar Tape',
    icon: 'swap-horizontal-outline',
    defaultLifespan: 5000,
    group: 'cockpit',
  },
  handlebar: {
    label: 'Handlebar',
    icon: 'swap-horizontal-outline',
    defaultLifespan: 20000,
    group: 'cockpit',
  },
  saddle: {
    label: 'Saddle',
    icon: 'triangle-outline',
    defaultLifespan: 20000,
    group: 'cockpit',
  },
  pedals: {
    label: 'Pedals',
    icon: 'grid-outline',
    defaultLifespan: 25000,
    group: 'cockpit',
  },
  fork: {
    label: 'Fork',
    icon: 'git-network-outline',
    defaultLifespan: 50000,
    group: 'other',
  },
  other: {
    label: 'Other',
    icon: 'construct-outline',
    defaultLifespan: 10000,
    group: 'other',
  },
};

export const COMPONENT_GROUPS = {
  drivetrain: 'Drivetrain',
  brakes: 'Brakes',
  wheels: 'Wheels & Tires',
  cockpit: 'Cockpit',
  other: 'Other',
};

export const BIKE_TYPE_LABELS: Record<string, string> = {
  road: 'Road',
  mtb: 'Mountain',
  gravel: 'Gravel',
  cyclocross: 'Cyclocross',
  city: 'City / Commuter',
  ebike: 'E-Bike',
  other: 'Other',
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
