const PLACEHOLDER = '—';

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return PLACEHOLDER;
  return `${value.toFixed(1)}%`;
}

export function formatGb(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return PLACEHOLDER;
  return `${value.toFixed(decimals)} GB`;
}

export function formatCelsius(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return PLACEHOLDER;
  return `${Math.round(value)}°C`;
}

export function formatGhz(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return PLACEHOLDER;
  return `${value.toFixed(2)} GHz`;
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
