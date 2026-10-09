export type ActionName = 'launch-game' | 'cleanup';

export interface ActionData {
  action: string;
  target: string;
  message: string;
  exit_code: number;
  files_removed?: number;
  path?: string;
}

export interface ActionSuccess {
  ok: true;
  data: ActionData;
}

export interface ActionFailure {
  ok: false;
  code: string;
  message: string;
}

export type ActionResult = ActionSuccess | ActionFailure;

interface ApiSuccessPayload {
  status: 'success';
  data: ActionData;
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

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

/** Token auth opsional dari env frontend; kosong = auth mati (tanpa header tambahan). */
const AUTH_TOKEN = (import.meta.env.VITE_AUTH_TOKEN as string | undefined) ?? '';

/** Header auth untuk fetch — {} (tanpa Authorization) bila token tak diset. */
export function authHeaders(): Record<string, string> {
  return AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};
}

/**
 * Sisipkan token sebagai query `?token=` untuk URL yang tak bisa kirim header
 * (mis. <img src>). URL yang sudah punya query digabung dengan `&`.
 */
export function withToken(url: string): string {
  if (!AUTH_TOKEN) return url;
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(AUTH_TOKEN);
}

const ACTION_ENDPOINT = '/api/actions/launch-game';

const NETWORK_ERROR_MESSAGES: string[] = ['Failed to fetch', 'fetch failed', 'NetworkError'];

function isSuccessPayload(payload: unknown): payload is ApiSuccessPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as { status?: unknown; data?: unknown };
  if (candidate.status !== 'success') return false;
  if (typeof candidate.data !== 'object' || candidate.data === null) return false;
  const data = candidate.data as { exit_code?: unknown };
  return typeof data.exit_code === 'number';
}

function isErrorPayload(payload: unknown): payload is ApiErrorPayload {
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

function toFailureMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : '';
  if (NETWORK_ERROR_MESSAGES.some((entry) => message.includes(entry))) {
    return `Backend tidak terhubung di ${API_BASE_URL}`;
  }
  return message || 'Gagal menghubungi backend aksi';
}

/**
 * Kirim aksi OS ke backend (POST /api/actions/launch-game).
 * Sukses → { ok: true, data } — gagal (HTTP/jaringan/non-JSON) → { ok: false, code, message }.
 */
export async function postAction(action: ActionName, target: string): Promise<ActionResult> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${ACTION_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({ action, target }),
    });
  } catch (reason) {
    return { ok: false, code: 'BACKEND_UNREACHABLE', message: toFailureMessage(reason) };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok && isSuccessPayload(payload)) {
    return { ok: true, data: payload.data };
  }

  if (isErrorPayload(payload)) {
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
    message: `Respons backend tidak sesuai kontrak (HTTP ${response.status})`,
  };
}

/**
 * URL ikon asli aplikasi (GET /api/actions/app-icon?name=<nama app>).
 * 200 image/png bila ikon ada, 404 bila tidak — penanganan error ada di sisi pemanggil.
 */
export function appIconUrl(name: string): string {
  // <img src> tidak bisa menyertakan header → token dikirim via query.
  return withToken(`${API_BASE_URL}/api/actions/app-icon?name=${encodeURIComponent(name)}`);
}

export interface InstalledApp {
  name: string;
  display_name?: string | null;
  bundle_id?: string | null;
  source: string;
}

export interface InstalledAppsData {
  apps: InstalledApp[];
  count: number;
}

export interface AppsSuccess {
  ok: true;
  data: InstalledAppsData;
}

export interface AppsFailure {
  ok: false;
  code: string;
  message: string;
}

export type AppsResult = AppsSuccess | AppsFailure;

interface ApiAppsPayload {
  status: 'success';
  data: {
    apps: unknown[];
    count: number;
  };
}

const APPS_ENDPOINT = '/api/actions/apps';

let appsCache: InstalledAppsData | null = null;

export function getCachedInstalledApps(): InstalledAppsData | null {
  return appsCache;
}

function isInstalledApp(value: unknown): value is InstalledApp {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { name?: unknown; source?: unknown };
  return typeof candidate.name === 'string' && typeof candidate.source === 'string';
}

function isAppsPayload(payload: unknown): payload is ApiAppsPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as { status?: unknown; data?: { apps?: unknown; count?: unknown } };
  if (candidate.status !== 'success') return false;
  if (typeof candidate.data !== 'object' || candidate.data === null) return false;
  return Array.isArray(candidate.data.apps) && typeof candidate.data.count === 'number';
}

/**
 * Ambil daftar aplikasi terpasang (GET /api/actions/apps).
 * Hasil sukses di-cache di level module — pass { refresh: true } untuk scan ulang.
 */
export async function fetchInstalledApps(options?: { refresh?: boolean }): Promise<AppsResult> {
  if (appsCache && options?.refresh !== true) {
    return { ok: true, data: appsCache };
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${APPS_ENDPOINT}`, {
      headers: { Accept: 'application/json', ...authHeaders() },
    });
  } catch (reason) {
    return { ok: false, code: 'BACKEND_UNREACHABLE', message: toFailureMessage(reason) };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok && isAppsPayload(payload)) {
    const data: InstalledAppsData = {
      apps: payload.data.apps.filter(isInstalledApp),
      count: payload.data.count,
    };
    appsCache = data;
    return { ok: true, data };
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
    message: `Daftar aplikasi tidak sesuai kontrak (HTTP ${response.status})`,
  };
}

// ---------------------------------------------------------------------------
// Fast Ops + System Processes
// ---------------------------------------------------------------------------

interface Envelope {
  response: Response;
  payload: unknown;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

interface ContractFailure {
  ok: false;
  code: string;
  message: string;
}

const FAST_OPS_ENDPOINT = '/api/actions/fast-ops';
const FAST_OP_ENDPOINT = '/api/actions/fast-op';
const PROCESSES_ENDPOINT = '/api/system/processes';

/**
 * Fetch JSON sekali ke backend dan kembalikan { response, payload }.
 * Kegagalan jaringan/abort dilempar sebagai pengecualian — pemanggil
 * mengubahnya jadi pesan ramah lewat toFailureMessage().
 */
async function requestEnvelope(path: string, options?: RequestOptions): Promise<Envelope> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options?.signal,
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
}

/** Petakan respons yang tidak lolos guard kontrak jadi kegagalan seragam. */
function contractFailure(response: Response, payload: unknown, label: string): ContractFailure {
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
    message: `${label} tidak sesuai kontrak (HTTP ${response.status})`,
  };
}

function toStderr(payload: { stderr?: unknown }): string {
  return typeof payload.stderr === 'string' ? payload.stderr : '';
}

// --- GET /api/actions/fast-ops -------------------------------------------

export interface FastOpMeta {
  id: string;
  title: string;
  command_display: string;
}

export interface FastOpsData {
  platform: string;
  platform_name: string;
  /** Objek yang di-key oleh action id (bukan array). */
  actions: Record<string, FastOpMeta>;
}

export interface FastOpsSuccess {
  ok: true;
  data: FastOpsData;
}

export type FastOpsResult = FastOpsSuccess | ContractFailure;

interface FastOpsPayload {
  status: 'success';
  data: {
    platform: string;
    platform_name: string;
    actions: Record<string, unknown>;
  };
}

function toFastOpMeta(value: unknown): FastOpMeta | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { id?: unknown; title?: unknown; command_display?: unknown };
  if (typeof candidate.id !== 'string') return null;
  if (typeof candidate.title !== 'string') return null;
  if (typeof candidate.command_display !== 'string') return null;
  return {
    id: candidate.id,
    title: candidate.title,
    command_display: candidate.command_display,
  };
}

function isFastOpsPayload(payload: unknown): payload is FastOpsPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as { status?: unknown; data?: unknown };
  if (candidate.status !== 'success') return false;
  if (typeof candidate.data !== 'object' || candidate.data === null) return false;
  const data = candidate.data as { platform?: unknown; platform_name?: unknown; actions?: unknown };
  if (typeof data.platform !== 'string') return false;
  if (typeof data.platform_name !== 'string') return false;
  if (typeof data.actions !== 'object' || data.actions === null) return false;
  return true;
}

/**
 * Ambil daftar aksi Fast Ops untuk OS yang sedang berjalan
 * (GET /api/actions/fast-ops → { platform, platform_name, actions }).
 */
export async function fetchFastOps(signal?: AbortSignal): Promise<FastOpsResult> {
  let envelope: Envelope;

  try {
    envelope = await requestEnvelope(FAST_OPS_ENDPOINT, { signal });
  } catch (reason) {
    return { ok: false, code: 'BACKEND_UNREACHABLE', message: toFailureMessage(reason) };
  }

  const { response, payload } = envelope;

  if (response.ok && isFastOpsPayload(payload)) {
    const actions: Record<string, FastOpMeta> = {};
    for (const value of Object.values(payload.data.actions)) {
      const meta = toFastOpMeta(value);
      if (meta) actions[meta.id] = meta;
    }
    return {
      ok: true,
      data: {
        platform: payload.data.platform,
        platform_name: payload.data.platform_name,
        actions,
      },
    };
  }

  return contractFailure(response, payload, 'Daftar fast ops');
}

// --- POST /api/actions/fast-op -------------------------------------------

export interface FastOpData {
  action: string;
  exit_code: number;
  message: string;
}

export interface FastOpSuccess {
  ok: true;
  data: FastOpData;
  stderr: string;
}

export interface FastOpFailure extends ContractFailure {
  stderr: string;
}

export type FastOpResult = FastOpSuccess | FastOpFailure;

interface FastOpSuccessPayload {
  status: 'success';
  data: FastOpData;
  stderr?: unknown;
}

function isFastOpSuccessPayload(payload: unknown): payload is FastOpSuccessPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as { status?: unknown; data?: unknown };
  if (candidate.status !== 'success') return false;
  if (typeof candidate.data !== 'object' || candidate.data === null) return false;
  const data = candidate.data as { action?: unknown; exit_code?: unknown; message?: unknown };
  if (typeof data.action !== 'string') return false;
  if (typeof data.exit_code !== 'number') return false;
  if (typeof data.message !== 'string') return false;
  return true;
}

/**
 * Eksekusi satu aksi Fast Ops (POST /api/actions/fast-op, body { action }).
 * Sukses → exit_code 0 di dalam data; exit != 0 maupun aksi tak dikenal
 * dikirim backend sebagai envelope error (HTTP 400) → { ok: false, code, message }.
 */
export async function postFastOp(action: string, signal?: AbortSignal): Promise<FastOpResult> {
  let envelope: Envelope;

  try {
    envelope = await requestEnvelope(FAST_OP_ENDPOINT, {
      method: 'POST',
      body: { action },
      signal,
    });
  } catch (reason) {
    return {
      ok: false,
      code: 'BACKEND_UNREACHABLE',
      message: toFailureMessage(reason),
      stderr: '',
    };
  }

  const { response, payload } = envelope;

  if (response.ok && isFastOpSuccessPayload(payload)) {
    return {
      ok: true,
      data: {
        action: payload.data.action,
        exit_code: payload.data.exit_code,
        message: payload.data.message,
      },
      stderr: toStderr(payload),
    };
  }

  if (payload !== null && isErrorPayload(payload)) {
    return {
      ok: false,
      code: payload.error.code,
      message: payload.error.message,
      stderr: toStderr(payload),
    };
  }

  return { ...contractFailure(response, payload, 'Hasil fast op'), stderr: '' };
}

// --- GET /api/system/processes -------------------------------------------

export interface SystemProcess {
  pid: number;
  name: string;
  cpu_percent: number | null;
  memory_mb: number | null;
  uptime: string | null;
  role: string;
}

export interface ProcessesData {
  processes: SystemProcess[];
  count: number;
}

export interface ProcessesSuccess {
  ok: true;
  data: ProcessesData;
}

export type ProcessesResult = ProcessesSuccess | ContractFailure;

interface ProcessesPayload {
  status: 'success';
  data: {
    processes: unknown[];
    count: number;
  };
}

function toSystemProcess(value: unknown): SystemProcess | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as {
    pid?: unknown;
    name?: unknown;
    cpu_percent?: unknown;
    memory_mb?: unknown;
    uptime?: unknown;
    role?: unknown;
  };
  if (typeof candidate.pid !== 'number' || typeof candidate.name !== 'string') return null;
  return {
    pid: candidate.pid,
    name: candidate.name,
    cpu_percent: typeof candidate.cpu_percent === 'number' ? candidate.cpu_percent : null,
    memory_mb: typeof candidate.memory_mb === 'number' ? candidate.memory_mb : null,
    uptime: typeof candidate.uptime === 'string' ? candidate.uptime : null,
    role: typeof candidate.role === 'string' ? candidate.role : '',
  };
}

function isProcessesPayload(payload: unknown): payload is ProcessesPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as { status?: unknown; data?: unknown };
  if (candidate.status !== 'success') return false;
  if (typeof candidate.data !== 'object' || candidate.data === null) return false;
  const data = candidate.data as { processes?: unknown; count?: unknown };
  return Array.isArray(data.processes) && typeof data.count === 'number';
}

/**
 * Ambil daftar proses nyata milik proyek (GET /api/system/processes).
 * Field cpu_percent/memory_mb/uptime bisa null — jangan asumsikan angka.
 */
export async function fetchSystemProcesses(signal?: AbortSignal): Promise<ProcessesResult> {
  let envelope: Envelope;

  try {
    envelope = await requestEnvelope(PROCESSES_ENDPOINT, { signal });
  } catch (reason) {
    return { ok: false, code: 'BACKEND_UNREACHABLE', message: toFailureMessage(reason) };
  }

  const { response, payload } = envelope;

  if (response.ok && isProcessesPayload(payload)) {
    const processes = payload.data.processes
      .map(toSystemProcess)
      .filter((process): process is SystemProcess => process !== null);
    return { ok: true, data: { processes, count: payload.data.count } };
  }

  return contractFailure(response, payload, 'Daftar proses');
}

// --- Probe kesehatan (GET ringan + latensi terukur) ------------------------

/** Endpoint ringan dipakai sebagai health check (latensi rendah). */
export const HEALTH_ENDPOINT = '/api/metrics/cpu';

export interface ProbeResult {
  ok: boolean;
  /** Status HTTP asli; null bila permintaan tidak sampai ke server. */
  httpStatus: number | null;
  /** Latensi terukur dengan performance.now() di sekitar request. */
  latencyMs: number;
  /** Pesan kegagalan dari envelope; string kosong bila sukses. */
  message: string;
}

function isSuccessEnvelope(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  return (payload as { status?: unknown }).status === 'success';
}

/**
 * Ukur latensi nyata ke `path` (default: health endpoint) dan kembalikan
 * hasil probe apa adanya — tidak pernah mengarang status atau angka.
 */
export async function probeEndpoint(
  path: string = HEALTH_ENDPOINT,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const startedAt = performance.now();

  let envelope: Envelope;

  try {
    envelope = await requestEnvelope(path, { signal });
  } catch (reason) {
    if (signal?.aborted) {
      return { ok: false, httpStatus: null, latencyMs: 0, message: 'Permintaan dibatalkan' };
    }
    return {
      ok: false,
      httpStatus: null,
      latencyMs: performance.now() - startedAt,
      message: toFailureMessage(reason),
    };
  }

  const latencyMs = performance.now() - startedAt;
  const { response, payload } = envelope;

  if (response.ok && isSuccessEnvelope(payload)) {
    return { ok: true, httpStatus: response.status, latencyMs, message: '' };
  }

  return {
    ok: false,
    httpStatus: response.status,
    latencyMs,
    message: contractFailure(response, payload, 'Probe backend').message,
  };
}
