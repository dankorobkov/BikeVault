import type { Bike, BikeComponent } from '../types';

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

export const DEMO_BIKES: Bike[] = [
  {
    id: 'demo-bike-1',
    name: 'Domane SL 6',
    brand: 'Trek',
    type: 'road',
    brakeSystem: 'disc-hydraulic',
    color: '#0A84FF',
    totalDistance: 4280,
    createdAt: NOW - 365 * DAY,
    updatedAt: NOW - 2 * DAY,
  },
  {
    id: 'demo-bike-2',
    name: 'Stumpjumper EVO',
    brand: 'Specialized',
    type: 'mtb',
    brakeSystem: 'disc-hydraulic',
    color: '#30D158',
    totalDistance: 2860,
    createdAt: NOW - 200 * DAY,
    updatedAt: NOW - 5 * DAY,
  },
];

export const DEMO_COMPONENTS: BikeComponent[] = [
  // ── Trek Domane components ──────────────────────────────────────────────────
  {
    id: 'demo-c-1',
    bikeId: 'demo-bike-1',
    name: 'CN-HG901-11',
    category: 'chain',
    brand: 'Shimano',
    installDate: NOW - 120 * DAY,
    installDistance: 1800, // ridden 2480 km → 83% worn (critical)
    maxLifespan: 3000,
    attentionFrequency: 300,
    status: 'active',
    createdAt: NOW - 120 * DAY,
    updatedAt: NOW - 2 * DAY,
  },
  {
    id: 'demo-c-2',
    bikeId: 'demo-bike-1',
    name: '105 R7000 11-34T',
    category: 'cassette',
    brand: 'Shimano',
    installDate: NOW - 365 * DAY,
    installDistance: 0, // ridden 4280 km → 43% worn (good)
    maxLifespan: 10000,
    status: 'active',
    createdAt: NOW - 365 * DAY,
    updatedAt: NOW - 2 * DAY,
  },
  {
    id: 'demo-c-3',
    bikeId: 'demo-bike-1',
    name: 'GP5000 TL 700x32',
    category: 'front-tyre',
    brand: 'Continental',
    installDate: NOW - 180 * DAY,
    installDistance: 900, // ridden 3380 km → 68% worn (warning)
    maxLifespan: 5000,
    status: 'active',
    createdAt: NOW - 180 * DAY,
    updatedAt: NOW - 2 * DAY,
  },
  {
    id: 'demo-c-4',
    bikeId: 'demo-bike-1',
    name: 'GP5000 TL 700x32',
    category: 'rear-tyre',
    brand: 'Continental',
    installDate: NOW - 90 * DAY,
    installDistance: 2600, // ridden 1680 km → 42% worn (good)
    maxLifespan: 4000,
    status: 'active',
    createdAt: NOW - 90 * DAY,
    updatedAt: NOW - 2 * DAY,
  },
  {
    id: 'demo-c-5',
    bikeId: 'demo-bike-1',
    name: 'Tacky Tape',
    category: 'bar-tape',
    brand: 'Lizard Skins',
    installDate: NOW - 30 * DAY,
    installDistance: 4000, // ridden 280 km → 6% worn (good)
    maxLifespan: 5000,
    status: 'active',
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - 2 * DAY,
  },
  {
    id: 'demo-c-6',
    bikeId: 'demo-bike-1',
    name: '105 R7000 Rear Cable',
    category: 'rear-shift-cable',
    brand: 'Shimano',
    installDate: NOW - 365 * DAY,
    installDistance: 0, // ridden 4280 km → 54% worn (good)
    maxLifespan: 8000,
    status: 'active',
    createdAt: NOW - 365 * DAY,
    updatedAt: NOW - 2 * DAY,
  },
  {
    id: 'demo-c-7',
    bikeId: 'demo-bike-1',
    name: 'SM-RT70 160mm',
    category: 'front-disc-rotor',
    brand: 'Shimano',
    installDate: NOW - 365 * DAY,
    installDistance: 0, // ridden 4280 km → 29% worn (good)
    maxLifespan: 15000,
    status: 'active',
    createdAt: NOW - 365 * DAY,
    updatedAt: NOW - 2 * DAY,
  },

  // ── Specialized Stumpjumper components ─────────────────────────────────────
  {
    id: 'demo-c-8',
    bikeId: 'demo-bike-2',
    name: 'HG601 12-speed',
    category: 'chain',
    brand: 'Shimano',
    installDate: NOW - 80 * DAY,
    installDistance: 700, // ridden 2160 km → 86% worn (critical)
    maxLifespan: 2500,
    attentionFrequency: 250,
    status: 'active',
    createdAt: NOW - 80 * DAY,
    updatedAt: NOW - 5 * DAY,
  },
  {
    id: 'demo-c-9',
    bikeId: 'demo-bike-2',
    name: 'Aggressor 29x2.3 EXO+',
    category: 'rear-tyre',
    brand: 'Maxxis',
    installDate: NOW - 200 * DAY,
    installDistance: 0, // ridden 2860 km → 95% worn (overdue!)
    maxLifespan: 3000,
    status: 'active',
    createdAt: NOW - 200 * DAY,
    updatedAt: NOW - 5 * DAY,
  },
  {
    id: 'demo-c-10',
    bikeId: 'demo-bike-2',
    name: 'Minion DHF 29x2.5 3C',
    category: 'front-tyre',
    brand: 'Maxxis',
    installDate: NOW - 200 * DAY,
    installDistance: 0, // ridden 2860 km → 72% worn (warning)
    maxLifespan: 4000,
    status: 'active',
    createdAt: NOW - 200 * DAY,
    updatedAt: NOW - 5 * DAY,
  },
  {
    id: 'demo-c-11',
    bikeId: 'demo-bike-2',
    name: 'XT M8100 180mm',
    category: 'front-disc-rotor',
    brand: 'Shimano',
    installDate: NOW - 200 * DAY,
    installDistance: 0, // ridden 2860 km → 19% worn (good)
    maxLifespan: 15000,
    status: 'active',
    createdAt: NOW - 200 * DAY,
    updatedAt: NOW - 5 * DAY,
  },
  {
    id: 'demo-c-12',
    bikeId: 'demo-bike-2',
    name: 'XT M8100 180mm',
    category: 'rear-disc-rotor',
    brand: 'Shimano',
    installDate: NOW - 200 * DAY,
    installDistance: 0, // ridden 2860 km → 19% worn (good)
    maxLifespan: 15000,
    status: 'active',
    createdAt: NOW - 200 * DAY,
    updatedAt: NOW - 5 * DAY,
  },
  {
    id: 'demo-c-13',
    bikeId: 'demo-bike-2',
    name: 'XT M8100 resin pads',
    category: 'rear-brake-pads',
    brand: 'Shimano',
    installDate: NOW - 100 * DAY,
    installDistance: 1400, // ridden 1460 km → 29% worn (good)
    maxLifespan: 5000,
    status: 'active',
    createdAt: NOW - 100 * DAY,
    updatedAt: NOW - 5 * DAY,
  },
  {
    id: 'demo-c-14',
    bikeId: 'demo-bike-2',
    name: 'SLX M7100 12-46T',
    category: 'cassette',
    brand: 'Shimano',
    installDate: NOW - 200 * DAY,
    installDistance: 0, // ridden 2860 km → 29% worn (good)
    maxLifespan: 10000,
    status: 'active',
    createdAt: NOW - 200 * DAY,
    updatedAt: NOW - 5 * DAY,
  },
];
