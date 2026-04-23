import type React from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { ChainLubeType } from '../types';

/**
 * Metadata for each chain lube strategy: human label, icon, recommended
 * re-lube interval in km, and a one-line description.
 *
 * Intervals are deliberately conservative real-world averages gathered
 * from drivetrain testing sources (Zero Friction Cycling, Silca). The
 * user can override the interval per-component via `lubeIntervalKm`.
 *
 *   hot-wax   400km — immersive paraffin bath; longest between re-dips
 *   drip-wax  200km — drip-on wax emulsion; easy daily/weekly top-ups
 *   wet-lube  250km — oil-based, wet/winter conditions; attracts grit
 *   dry-lube  150km — thin oil; dry conditions, shortest interval
 *   ceramic   200km — ceramic/polymer blends; premium, balanced
 */
export const CHAIN_LUBE_TYPES: Record<
  ChainLubeType,
  {
    label: string;
    shortLabel: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    defaultIntervalKm: number;
    description: string;
  }
> = {
  'hot-wax': {
    label: 'Hot wax (immersion)',
    shortLabel: 'Hot wax',
    icon: 'flame-outline',
    defaultIntervalKm: 400,
    description:
      'Paraffin wax bath. Longest interval and cleanest drivetrain, but requires removing the chain.',
  },
  'drip-wax': {
    label: 'Drip wax',
    shortLabel: 'Drip wax',
    icon: 'water-outline',
    defaultIntervalKm: 200,
    description:
      'Drip-on wax emulsion. Nearly as clean as hot wax, applied without removing the chain.',
  },
  'wet-lube': {
    label: 'Wet lube',
    shortLabel: 'Wet lube',
    icon: 'rainy-outline',
    defaultIntervalKm: 250,
    description:
      'Oil-based lube. Best for rain and winter. Attracts grit — plan to clean the drivetrain more often.',
  },
  'dry-lube': {
    label: 'Dry lube',
    shortLabel: 'Dry lube',
    icon: 'sunny-outline',
    defaultIntervalKm: 150,
    description:
      'Thin oil for dry conditions. Runs cleaner than wet lube but needs re-applying more frequently.',
  },
  ceramic: {
    label: 'Ceramic / polymer',
    shortLabel: 'Ceramic',
    icon: 'diamond-outline',
    defaultIntervalKm: 200,
    description:
      'Premium ceramic or polymer-blend lubes (e.g. Muc-Off Ludicrous AF, CeramicSpeed UFO).',
  },
};

/** Ordered list suitable for picker UI. */
export const CHAIN_LUBE_ORDER: ChainLubeType[] = [
  'hot-wax',
  'drip-wax',
  'wet-lube',
  'dry-lube',
  'ceramic',
];
