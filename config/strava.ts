export const STRAVA_CONFIG = {
  clientId: process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? '',
  clientSecret: process.env.EXPO_PUBLIC_STRAVA_CLIENT_SECRET ?? '',
  authEndpoint: 'https://www.strava.com/oauth/authorize',
  tokenEndpoint: 'https://www.strava.com/oauth/token',
  apiBase: 'https://www.strava.com/api/v3',
  // profile:read_all is required so GET /athlete returns the detailed
  // representation (including the `bikes` array). Without it, the API
  // returns a summary athlete and we can't sync gear distances.
  scopes: ['activity:read_all', 'profile:read_all'],
};
