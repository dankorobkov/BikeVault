export const WAHOO_CONFIG = {
  clientId: process.env.EXPO_PUBLIC_WAHOO_CLIENT_ID ?? '',
  clientSecret: process.env.EXPO_PUBLIC_WAHOO_CLIENT_SECRET ?? '',
  authEndpoint: 'https://api.wahooligan.com/oauth/authorize',
  tokenEndpoint: 'https://api.wahooligan.com/oauth/token',
  apiBase: 'https://api.wahooligan.com/v1',
  // - user_read      → GET /v1/user (athlete name shown after linking)
  // - workouts_read  → GET /v1/workouts (the ride history we sync from)
  // - offline_data   → REQUIRED for a refresh_token; without it the access
  //                    token dies after ~2h and can't be renewed, so sync
  //                    would silently stop until the user re-links.
  // Unlike Strava (comma-separated), Wahoo takes a standard
  // space-separated scope list in the authorize URL.
  scopes: ['user_read', 'workouts_read', 'offline_data'],
};
