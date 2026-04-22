export const KM_TO_MILES = 0.621371;

/**
 * Format an integer with thousands separators.
 * Forces en-US grouping so every locale shows commas (e.g. 10000 ->
 * "10,000"); relying on the user's default locale makes distances
 * read inconsistently across devices.
 */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function formatDist(km: number, useMetric: boolean): string {
  if (useMetric) return formatNumber(km) + ' km';
  return formatNumber(km * KM_TO_MILES) + ' mi';
}

export function formatDistShort(km: number, useMetric: boolean): string {
  if (useMetric) return formatNumber(km) + ' km';
  return formatNumber(km * KM_TO_MILES) + ' mi';
}

export function unitLabel(useMetric: boolean): string {
  return useMetric ? 'km' : 'mi';
}

export function toDisplayDist(km: number, useMetric: boolean): number {
  return useMetric ? km : Math.round(km * KM_TO_MILES);
}

export function toStorageKm(displayVal: number, useMetric: boolean): number {
  return useMetric ? displayVal : Math.round(displayVal / KM_TO_MILES);
}
