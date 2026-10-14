/**
 * Sumber tunggal konstanta base URL, guard envelope JSON API, fetcher junk
 * scan, dan eksekutor clean. Dipakai lib/actions.ts, hooks/useSystemMetrics.ts,
 * serta kartu storage (Casual) dan DISK/terminal (Pro) — jangan definisikan
 * ulang di file lain.
 */

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

/** Pola pesan jaringan dari fetch/browser yang perlu dipetakan ke pesan ramah. */
export const NETWORK_ERROR_MESSAGES: string[] = ['Failed to fetch', 'fetch failed', 'NetworkError'];

export interface ApiSuccessPayload<T> {
  status: 'success';
  data: T;
}

interface ApiErrorPayload {
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

// ---------------------------------------------------------------------------
// Junk scan — GET /api/metrics/junk (tanpa auth, cache TTL 60 detik)
// ---------------------------------------------------------------------------

/** Satu zona lokasi junk yang berhasil dipindai; zona yang tak ada di disk tidak muncul. */
export interface JunkLocation {
  id: string;
  label: string;
  path: string;
  size_gb: number;
  file_count: number;
  /** Symlink/tanpa-izin yang dilewati scanner. */
  skipped: number;
}

export interface JunkScanData {
  reclaimable_gb: number;
  file_count: number;
  skipped: number;
  locations: JunkLocation[];
  /** Unix timestamp detik (desimal) kapan scan terakhir selesai. */
  scanned_at: number;
  /** true bila diambil dari cache TTL backend (scan ulang dalam 60 detik instan). */
  cached: boolean;
  /** Durasi scan di sisi server — scan cold bisa >20 detik (walk ratusan ribu file). */
  duration_s: number;
}

export type JunkScanResult =
  { ok: true; data: JunkScanData } | { ok: false; code: string; message: string };

const JUNK_ENDPOINT = '/api/metrics/junk';

/**
 * Ambil hasil scan junk terbaru (GET /api/metrics/junk).
 * Sukses → { ok: true, data } — gagal (jaringan/HTTP/non-JSON) → { ok: false, code, message }.
 */
export async function fetchJunkScan(signal?: AbortSignal): Promise<JunkScanResult> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${JUNK_ENDPOINT}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '';
    if (NETWORK_ERROR_MESSAGES.some((entry) => message.includes(entry))) {
      return {
        ok: false,
        code: 'BACKEND_UNREACHABLE',
        message: `Backend tidak terhubung di ${API_BASE_URL}`,
      };
    }
    return {
      ok: false,
      code: 'BACKEND_UNREACHABLE',
      message: message || 'Gagal menghubungi scanner junk',
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (
    response.ok &&
    isSuccessPayload<JunkScanData>(payload) &&
    Array.isArray(payload.data.locations)
  ) {
    // Angka garang (NaN/Infinity/bukan-number) lolos `Array.isArray` dan merusak
    // reduce/format di UI — tolak di kontrak sebelum sampai ke komponen.
    const reclaimable = payload.data.reclaimable_gb;
    if (typeof reclaimable === 'number' && Number.isFinite(reclaimable)) {
      return { ok: true, data: payload.data };
    }
    return {
      ok: false,
      code: 'INVALID_RESPONSE',
      message: `Hasil scan junk tidak sesuai kontrak (HTTP ${response.status})`,
    };
  }

  if (payload !== null && isErrorPayload(payload)) {
    return { ok: false, code: payload.error.code, message: payload.error.message };
  }

  if (payload === null) {
    return {
      ok: false,
      code: 'INVALID_RESPONSE',
      message: `Backend mengirim respons non-JSON (HTTP ${response.status})`,
    };
  }

  return {
    ok: false,
    code: `HTTP_${response.status}`,
    message: `Hasil scan junk tidak sesuai kontrak (HTTP ${response.status})`,
  };
}

// ---------------------------------------------------------------------------
// Clean — POST /api/actions/clean (pindahkan zona ke Trash, undo-able)
// ---------------------------------------------------------------------------

/** Rincian satu zona dalam hasil eksekusi; `note` muncul bila zona dilewati backend. */
export interface CleanZoneResult {
  id: string;
  label?: string;
  entries_moved?: number;
  errors?: number;
  skipped?: number;
  size_moved_gb?: number;
  /** Catatan backend, mis. "zone tidak ada di disk" atau "ditolak guard (di luar root)". */
  note?: string;
}

/**
 * Data sukses POST /api/actions/clean. Semua field bertanda aman (optional)
 * supaya UI tetap valid bila backend menambah/mengurangi field — jangan asumsikan
 * angka ada sebelum memeriksanya.
 */
export interface CleanResult {
  action?: string;
  zone_ids?: string[];
  zones?: CleanZoneResult[];
  entries_moved?: number;
  errors?: number;
  /** Folder tujuan di Trash (mis. `~/.Trash/qd-clean-20261013-140821`) untuk undo. */
  trash_path?: string;
  message?: string;
  exit_code?: number;
}

export type ExecuteCleanResult =
  { ok: true; data: CleanResult } | { ok: false; code: string; message: string };

const CLEAN_ENDPOINT = '/api/actions/clean';

/** Guard kontrak clean: envelope sukses + field inti `action` dan `zones` sesuai kontrak. */
function isCleanSuccessPayload(payload: unknown): payload is ApiSuccessPayload<CleanResult> {
  if (!isSuccessPayload<CleanResult>(payload)) return false;
  return payload.data.action === 'clean' && Array.isArray(payload.data.zones);
}

/**
 * Eksekusi pembersihan zona (POST /api/actions/clean) dengan `confirm: true`
 * sehingga isi zona dipindahkan ke `~/.Trash/qd-clean-<ts>/<zone_id>/` — tanpa
 * penghapusan permanen (undo lewat Finder → Trash).
 *
 * Eksekusi bisa lambat (~20–30 detik untuk ratusan ribu file).
 * Sukses → { ok: true, data } — gagal (jaringan/HTTP/envelope error) → { ok: false, code, message }.
 */
export async function executeClean(
  zoneIds: string[],
  signal?: AbortSignal,
): Promise<ExecuteCleanResult> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${CLEAN_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ zone_ids: zoneIds, confirm: true }),
      signal,
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '';
    if (NETWORK_ERROR_MESSAGES.some((entry) => message.includes(entry))) {
      return {
        ok: false,
        code: 'BACKEND_UNREACHABLE',
        message: `Backend tidak terhubung di ${API_BASE_URL}`,
      };
    }
    return {
      ok: false,
      code: 'BACKEND_UNREACHABLE',
      message: message || 'Gagal menghubungi executor clean',
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok && isCleanSuccessPayload(payload)) {
    return { ok: true, data: payload.data };
  }

  if (payload !== null && isErrorPayload(payload)) {
    // Termasuk CLEAN_CONFIRM_REQUIRED & ACTION_NOT_ALLOWED (mis. zone `trash`).
    return { ok: false, code: payload.error.code, message: payload.error.message };
  }

  if (payload === null) {
    return {
      ok: false,
      code: 'INVALID_RESPONSE',
      message: `Backend mengirim respons non-JSON (HTTP ${response.status})`,
    };
  }

  return {
    ok: false,
    code: `HTTP_${response.status}`,
    message: `Hasil clean tidak sesuai kontrak (HTTP ${response.status})`,
  };
}
