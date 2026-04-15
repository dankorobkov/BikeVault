export const KM_TO_MILES = 0.621371;

export function formatDist(km: number, useMetric: boolean): string {
  if (useMetric) return km.toLocaleString() + ' km';
  return Math.round(km * KM_TO_MILES).toLocaleString() + ' mi';
}

export function formatDistShort(km: number, useMetric: boolean): string {
  if (useMetric) return km.toLocaleString() + ' km';
  return Math.round(km * KM_TO_MILES).toLocaleString() + ' mi';
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
