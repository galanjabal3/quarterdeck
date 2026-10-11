/**
 * Sumber tunggal konstanta base URL dan guard envelope JSON API.
 * Dipakai lib/actions.ts dan hooks/useSystemMetrics.ts — jangan definisikan ulang di file lain.
 */

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

/** Pola pesan jaringan dari fetch/browser yang perlu dipetakan ke pesan ramah. */
export const NETWORK_ERROR_MESSAGES: string[] = ['Failed to fetch', 'fetch failed', 'NetworkError'];

export interface ApiSuccessPayload<T> {
  status: 'success';
  data: T;
}

export interface ApiErrorPayload {
  status: 'error';
  error: {
    code: string;
    message: string;
  };
  /** Fast-op menyertakan stderr (bersih/truncate) di level envelope, bukan di dalam `error`. */
  stderr?: unknown;
}

/** Envelope sukses generik: `status: 'success'` dengan objek `data` apa pun. */
export function isSuccessPayload<T>(payload: unknown): payload is ApiSuccessPayload<T> {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as { status?: unknown; data?: unknown };
  return (
    candidate.status === 'success' && typeof candidate.data === 'object' && candidate.data !== null
  );
}

/** Envelope error: `status: 'error'` dengan objek `error` berisi code/message string. */
export function isErrorPayload(payload: unknown): payload is ApiErrorPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as { status?: unknown; error?: { code?: unknown; message?: unknown } };
  return (
    candidate.status === 'error' &&
    typeof candidate.error === 'object' &&
    candidate.error !== null &&
    typeof candidate.error.code === 'string' &&
    typeof candidate.error.message === 'string'
  );
}
