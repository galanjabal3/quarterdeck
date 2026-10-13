const PLACEHOLDER = '—';

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return PLACEHOLDER;
  return `${value.toFixed(1)}%`;
}

export function formatGb(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return PLACEHOLDER;
  return `${value.toFixed(decimals)} GB`;
}

/**
 * Versi ringkas tanpa satuan: dibulatkan ke 1 desimal dan nol ekor dibuang —
 * 28.57 → "28.6", 6.76 → "6.8", 0 → "0". Dipakai baris scan junk yang menulis
 * angka dan satuan GB secara terpisah (mis. "App logs 0 GB", bukan "0.0 GB").
 */
export function formatGbShort(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return PLACEHOLDER;
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
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
