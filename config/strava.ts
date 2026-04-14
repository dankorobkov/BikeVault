export const STRAVA_CONFIG = {
  clientId: process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? '',
  clientSecret: process.env.EXPO_PUBLIC_STRAVA_CLIENT_SECRET ?? '',
  authEndpoint: 'https://www.strava.com/oauth/authorize',
  tokenEndpoint: 'https://www.strava.com/oauth/token',
  apiBase: 'https://www.strava.com/api/v3',
  scopes: ['activity:read_all'],
};
