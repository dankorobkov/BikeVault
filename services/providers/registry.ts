import { STRAVA_CONFIG } from '../../config/strava';
import { WAHOO_CONFIG } from '../../config/wahoo';
import type { ProviderId } from '../../types';

/**
 * Static, display-oriented descriptor for each linkable data source.
 *
 * This is the single place the UI loops over to render the "Data
 * Sources" section, so adding a third provider later is mostly: add a
 * service (mirroring wahooService), add an entry here, and wire its
 * OAuth hook in Settings. Token/refresh/fetch logic stays in each
 * provider's own service — this registry is intentionally free of
 * network code so it's safe to import anywhere (including pure UI).
 */
export interface ProviderDescriptor {
  id: ProviderId;
  displayName: string;
  /** Brand accent used for the provider's icon chip. */
  brandColor: string;
  /** Ionicons glyph name. */
  icon: string;
  /** expo-router route that receives the OAuth redirect (web flow). */
  callbackPath: string;
  authEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  /** True once real credentials are present in the build's env. */
  isConfigured: boolean;
  /**
   * Scopes exactly as expo-auth-session should send them.
   *   - Strava: one element pre-joined with commas (Strava rejects the
   *     OAuth-standard space-separated list).
   *   - Wahoo: standard array, joined with spaces by the library.
   */
  scopeParam: string[];
  /** Short line shown under the provider name when not connected. */
  tagline: string;
}

const STRAVA_PLACEHOLDER = 'your_strava_client_id';
const WAHOO_PLACEHOLDER = 'your_wahoo_client_id';

export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  strava: {
    id: 'strava',
    displayName: 'Strava',
    brandColor: '#FC4C02',
    icon: 'fitness-outline',
    callbackPath: 'strava-callback',
    authEndpoint: STRAVA_CONFIG.authEndpoint,
    tokenEndpoint: STRAVA_CONFIG.tokenEndpoint,
    clientId: STRAVA_CONFIG.clientId,
    isConfigured: !!STRAVA_CONFIG.clientId && STRAVA_CONFIG.clientId !== STRAVA_PLACEHOLDER,
    scopeParam: [STRAVA_CONFIG.scopes.join(',')],
    tagline: 'Rides, gear tags & full history',
  },
  wahoo: {
    id: 'wahoo',
    displayName: 'Wahoo',
    brandColor: '#2C6BED',
    icon: 'speedometer-outline',
    callbackPath: 'wahoo-callback',
    authEndpoint: WAHOO_CONFIG.authEndpoint,
    tokenEndpoint: WAHOO_CONFIG.tokenEndpoint,
    clientId: WAHOO_CONFIG.clientId,
    isConfigured: !!WAHOO_CONFIG.clientId && WAHOO_CONFIG.clientId !== WAHOO_PLACEHOLDER,
    scopeParam: WAHOO_CONFIG.scopes,
    tagline: 'ELEMNT & KICKR workouts',
  },
};

/** Render order for the Data Sources list. */
export const PROVIDER_ORDER: ProviderId[] = ['strava', 'wahoo'];

export function getProviderDescriptor(id: ProviderId): ProviderDescriptor {
  return PROVIDERS[id];
}
