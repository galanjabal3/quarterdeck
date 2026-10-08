import { useCallback, useEffect, useRef, useState } from 'react';
import { Server } from 'lucide-react';
import { fetchSystemProcesses, type ProcessesData, type SystemProcess } from '../../lib/actions';
import { formatPercent } from '../../lib/format';

const POLL_INTERVAL_MS = 2500;
const MAX_ROWS = 10;

function roleChipClass(role: string): string {
  if (role === 'backend') return 'text-primary-fixed';
  if (role === 'frontend') return 'text-secondary-fixed-dim';
  return 'text-on-surface-variant';
}

function roleDotClass(role: string): string {
  if (role === 'backend') return 'bg-primary-container';
  if (role === 'frontend') return 'bg-secondary';
  return 'bg-outline';
}

function formatMb(value: number | null): string {
  return value == null || Number.isNaN(value) ? '—' : `${value.toFixed(1)} MB`;
}

export default function ServerManager() {
  const [data, setData] = useState<ProcessesData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback((): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    return fetchSystemProcesses(signal).then((result) => {
      if (signal.aborted) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.message);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    void load();

    const intervalId = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      controllerRef.current?.abort();
    };
  }, [load]);

  // Paling boros di atas; cpu_percent bisa null (dorong ke bawah).
  const processes: SystemProcess[] = [...(data?.processes ?? [])].sort(
    (a, b) => (b.cpu_percent ?? -1) - (a.cpu_percent ?? -1),
  );
  const visible = processes.slice(0, MAX_ROWS);
  const hiddenCount = processes.length - visible.length;

  return (
    <div className="bg-surface-container-low p-space-md rounded-md flex flex-col gap-space-md shadow-sm">
      <div className="flex items-center justify-between pb-space-xs bg-surface-container-low">
        <div className="flex items-center gap-space-xs">
          <Server className="w-[18px] h-[18px] text-primary-container" aria-hidden="true" />
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight uppercase">
            ENV // Process Manager
          </span>
        </div>
        <span className="font-label-sm text-label-sm text-outline">
          [ {processes.length} ACTIVE ]
        </span>
      </div>

      <div className="flex flex-col gap-space-sm">
        {error && (
          <div className="p-space-sm rounded bg-surface-container-lowest text-error font-code-md text-code-md break-words">
            [ ERROR ] {error}
          </div>
        )}

        {loading && !data && !error && (
          <div className="p-space-sm rounded bg-surface-container-lowest font-label-sm text-label-sm text-outline uppercase">
            Loading process table…
          </div>
        )}

        {data && visible.length === 0 && !error && (
          <div className="p-space-sm rounded bg-surface-container-lowest font-label-sm text-label-sm text-outline uppercase">
            No processes detected.
          </div>
        )}

        {visible.map((proc) => (
          <div
            key={proc.pid}
            className="p-space-sm rounded bg-surface-container-lowest flex flex-col gap-space-xs"
          >
            <div className="flex items-center justify-between gap-space-sm">
              <div className="flex items-center gap-space-sm min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${roleDotClass(proc.role)}`}
                />
                <span className="font-code-md text-code-md font-bold text-primary truncate">
                  {proc.name}
                </span>
                <span
                  className={`font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container-high shrink-0 ${roleChipClass(proc.role)}`}
                >
                  PID {proc.pid}
                </span>
              </div>
              <span
                className="px-space-sm py-0.5 rounded font-label-sm text-label-sm bg-surface-container-high text-on-surface-variant uppercase shrink-0"
                title="Uptime proses sejak start"
              >
                {proc.uptime ? `UP ${proc.uptime}` : 'UP —'}
              </span>
            </div>
            <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant pt-1 gap-space-sm">
              <span className="truncate">ROLE: {proc.role || '—'}</span>
              <span className="font-code-md text-code-md text-outline shrink-0">
                CPU {formatPercent(proc.cpu_percent)} // MEM {formatMb(proc.memory_mb)}
              </span>
            </div>
          </div>
        ))}

        {hiddenCount > 0 && (
          <span className="font-label-sm text-label-sm text-outline">
            … +{hiddenCount} more (top {MAX_ROWS} by CPU)
          </span>
        )}
      </div>
    </div>
  );
}
