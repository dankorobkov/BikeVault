# BikeVault 🚴

Track bike component wear automatically using your Strava activity data.

## Features

- **Bikes** — Add and manage multiple bikes, link each to Strava for automatic distance sync
- **Components** — Track any component (chain, cassette, tires, brake pads, cables, etc.) with wear % calculated from distance ridden
- **Garage** — See all components across all bikes filtered by wear status
- **Strava Integration** — OAuth connection syncs bike distances automatically

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in your credentials (already populated if you received this repo configured).

```bash
cp .env.example .env
```

### 3. Firebase setup

Enable the following in your Firebase Console:
- **Authentication** → Anonymous (enable it)
- **Firestore Database** → Create in production mode

Deploy security rules:
```bash
npm install -g firebase-tools
firebase login
firebase use bikevault-627f4
firebase deploy --only firestore:rules,firestore:indexes
```

### 4. Strava API setup

In your [Strava API settings](https://www.strava.com/settings/api), add the following redirect URIs:

- `bikevault://strava-callback` (production)
- For development with Expo Go, also add the URI printed by `AuthSession.makeRedirectUri()` in the console

### 5. Run the app

```bash
npx expo start
```

Scan the QR code with the Expo Go app on iOS/Android.

## Building for production

```bash
npx eas build --platform ios
npx eas build --platform android
```

## Data model

```
Firestore
└── users/{userId}
    ├── bikes/{bikeId}
    │   ├── name, brand, type, color
    │   ├── stravaId         — links to Strava gear
    │   └── totalDistance    — km (synced from Strava)
    ├── components/{componentId}
    │   ├── bikeId, name, category, brand
    │   ├── installDate, installDistance
    │   ├── maxLifespan (km)
    │   └── status (active | retired)
    └── strava/tokens
        ├── accessToken, refreshToken, expiresAt
        └── athleteId, athleteName
```

## Wear calculation

```
wearPercent = (bike.totalDistance - component.installDistance) / component.maxLifespan × 100
```

- 🟢 **Good** — < 60%
- 🟡 **Monitor** — 60–79%
- 🟠 **Replace Soon** — 80–99%
- 🔴 **Overdue** — ≥ 100%

## Tech stack

- [Expo](https://expo.dev) + React Native
- [Expo Router](https://expo.github.io/router) for file-based navigation
- [Firebase](https://firebase.google.com) (Auth + Firestore)
- [Strava API](https://developers.strava.com)
- [Zustand](https://github.com/pmndrs/zustand) for state management
