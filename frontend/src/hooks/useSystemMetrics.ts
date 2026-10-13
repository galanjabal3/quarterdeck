import { useCallback, useEffect, useRef, useState } from 'react';

import { API_BASE_URL, NETWORK_ERROR_MESSAGES, isErrorPayload, isSuccessPayload } from '../lib/api';
import { authHeaders } from '../lib/actions';

export interface StorageMetrics {
  total_gb: number;
  used_gb: number;
  free_gb: number;
  percent_used: number;
}

export interface RamMetrics {
  total_gb: number;
  used_gb: number;
  percent_used: number;
}

export interface CpuMetrics {
  percent_used: number;
  core_count: number;
  per_core: number[];
  temperature_c: number | null;
  frequency_ghz: number | null;
}

export interface SystemMetrics {
  storage: StorageMetrics | null;
  ram: RamMetrics | null;
  cpu: CpuMetrics | null;
}

export interface SystemMetricsState {
  data: SystemMetrics;
  loading: boolean;
  error: string | null;
}

const POLL_INTERVAL_MS = 3000;

const EMPTY_METRICS: SystemMetrics = {
  storage: null,
  ram: null,
  cpu: null,
};

async function fetchMetrics<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    signal,
    headers: { Accept: 'application/json', ...authHeaders() },
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok && isSuccessPayload<T>(payload)) {
    return payload.data;
  }

  if (isErrorPayload(payload)) {
    throw new Error(`${payload.error.code}: ${payload.error.message}`);
  }

  throw new Error(`HTTP ${response.status} saat memuat ${path}`);
}

function toErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : 'Gagal memuat metrik sistem';
  if (NETWORK_ERROR_MESSAGES.some((entry) => message.includes(entry))) {
    return `Backend tidak terjangkau di ${API_BASE_URL}`;
  }
  return message;
}

export default function useSystemMetrics(): SystemMetricsState {
  const [data, setData] = useState<SystemMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback((): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    return Promise.allSettled([
      fetchMetrics<StorageMetrics>('/api/metrics/storage', signal),
      fetchMetrics<RamMetrics>('/api/metrics/ram', signal),
      fetchMetrics<CpuMetrics>('/api/metrics/cpu', signal),
    ]).then((results) => {
      if (signal.aborted || !mountedRef.current) return;

      const [storageResult, ramResult, cpuResult] = results;
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );

      setData((prev) => ({
        storage: storageResult.status === 'fulfilled' ? storageResult.value : prev.storage,
        ram: ramResult.status === 'fulfilled' ? ramResult.value : prev.ram,
        cpu: cpuResult.status === 'fulfilled' ? cpuResult.value : prev.cpu,
      }));

      if (failures.length > 0) {
        setError(toErrorMessage(failures[0].reason));
      } else {
        setError(null);
      }

      setLoading(false);
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();

    const intervalId = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      controllerRef.current?.abort();
    };
  }, [load]);

  return { data, loading, error };
}
