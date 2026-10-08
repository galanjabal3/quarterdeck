import { useEffect, useState } from 'react';
import type { SystemMetricsState } from '../../hooks/useSystemMetrics';
import {
  fetchFastOps,
  fetchInstalledApps,
  fetchSystemProcesses,
  type FastOpsData,
  type InstalledAppsData,
  type ProcessesData,
} from '../../lib/actions';
import { clampPercent, formatCelsius, formatGhz, formatPercent } from '../../lib/format';

interface StatusCard {
  label: string;
  badge: string;
  badgeClass: string;
  value: string;
  /** Hanya diisi bila angkanya benar-benar rasio/persentase dari data. */
  fill?: number;
  barClass: string;
  meta?: string;
  perCore?: number[];
}

interface StatusGridProps {
  metrics: SystemMetricsState;
}

interface RemoteData<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

type RemoteResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const INITIAL_REMOTE: { loading: boolean; error: string | null; data: null } = {
  loading: true,
  error: null,
  data: null,
};

function toRemote<T>(result: RemoteResult<T>): RemoteData<T> {
  if (result.ok) return { loading: false, error: null, data: result.data };
  return { loading: false, error: result.message, data: null };
}

function stateText<T>(remote: RemoteData<T>, ready: (data: T) => string): string {
  if (remote.loading) return 'Memuat…';
  if (remote.error) return remote.error;
  if (remote.data) return ready(remote.data);
  return '—';
}

/** Angka/badge tidak pernah diisi saat loading atau error — selalu '—'. */
function valueText<T>(remote: RemoteData<T>, ready: (data: T) => string): string {
  if (remote.data && !remote.loading && !remote.error) return ready(remote.data);
  return '—';
}

function summarizeRoles(processes: ProcessesData): string | null {
  const counts = new Map<string, number>();
  for (const process of processes.processes) {
    const role = process.role.trim();
    if (!role) continue;
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].map(([role, count]) => `${role} ${count}`).join(' // ');
}

function topProcessNames(processes: ProcessesData): string | null {
  if (processes.processes.length === 0) return null;
  return [...processes.processes]
    .sort((a, b) => (b.cpu_percent ?? -1) - (a.cpu_percent ?? -1))
    .slice(0, 3)
    .map((process) => process.name)
    .join(' · ');
}

function uniqueSourceCount(apps: InstalledAppsData): number {
  return new Set(apps.apps.map((app) => app.source)).size;
}

export default function StatusGrid({ metrics }: StatusGridProps) {
  const [apps, setApps] = useState<RemoteData<InstalledAppsData>>(INITIAL_REMOTE);
  const [processes, setProcesses] = useState<RemoteData<ProcessesData>>(INITIAL_REMOTE);
  const [fastOps, setFastOps] = useState<RemoteData<FastOpsData>>(INITIAL_REMOTE);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void fetchInstalledApps().then((result) => {
      if (cancelled) return;
      setApps(toRemote(result));
    });
    void fetchSystemProcesses(controller.signal).then((result) => {
      if (cancelled) return;
      setProcesses(toRemote(result));
    });
    void fetchFastOps(controller.signal).then((result) => {
      if (cancelled) return;
      setFastOps(toRemote(result));
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const storage = metrics.data.storage;
  const cpu = metrics.data.cpu;
  const ram = metrics.data.ram;

  const cards: StatusCard[] = [
    {
      label: 'CPU LOAD',
      badge: cpu ? `${cpu.core_count} CORE` : '—',
      badgeClass: 'text-primary-container',
      value: formatPercent(cpu?.percent_used ?? null),
      fill: cpu ? clampPercent(cpu.percent_used) : undefined,
      barClass: 'bg-primary-container',
      meta: cpu
        ? `TEMP ${formatCelsius(cpu.temperature_c)} // FREQ ${formatGhz(cpu.frequency_ghz)}`
        : '—',
      perCore: cpu?.per_core,
    },
    {
      label: 'MEMORY',
      badge: ram ? `${ram.used_gb.toFixed(1)} / ${ram.total_gb.toFixed(1)} GB` : '—',
      badgeClass: 'text-secondary-fixed-dim',
      value: formatPercent(ram?.percent_used ?? null),
      fill: ram ? clampPercent(ram.percent_used) : undefined,
      barClass: 'bg-secondary',
      meta: ram ? `${ram.used_gb.toFixed(1)} GB of ${ram.total_gb.toFixed(1)} GB in use` : '—',
    },
    {
      label: 'DISK',
      badge: storage ? `${storage.used_gb.toFixed(1)} / ${storage.total_gb.toFixed(1)} GB` : '—',
      badgeClass: 'text-primary-fixed-dim',
      value: formatPercent(storage?.percent_used ?? null),
      fill: storage ? clampPercent(storage.percent_used) : undefined,
      barClass: 'bg-primary-fixed-dim',
      meta: storage
        ? `${storage.free_gb.toFixed(1)} GB free of ${storage.total_gb.toFixed(1)} GB`
        : '—',
    },
    {
      label: 'APP INVENTORY',
      badge: valueText(apps, (data) => `${uniqueSourceCount(data)} SOURCES`),
      badgeClass: 'text-secondary-fixed-dim',
      value: valueText(apps, (data) => String(data.count)),
      barClass: 'bg-secondary',
      meta: stateText(apps, () => 'INSTALLED'),
    },
    {
      label: 'ACTIVE PROCESSES',
      badge: valueText(processes, (data) => {
        const top = [...data.processes].sort(
          (a, b) => (b.cpu_percent ?? -1) - (a.cpu_percent ?? -1),
        )[0];
        return top?.uptime ? `UP ${top.uptime}` : '—';
      }),
      badgeClass: 'text-primary-container',
      value: valueText(processes, (data) => String(data.count)),
      barClass: 'bg-primary-container',
      meta: stateText(processes, (data) => summarizeRoles(data) ?? topProcessNames(data) ?? '—'),
    },
    {
      label: 'FAST OPS',
      badge: valueText(fastOps, (data) => data.platform),
      badgeClass: 'text-primary-fixed-dim',
      value: valueText(fastOps, (data) => String(Object.keys(data.actions).length)),
      barClass: 'bg-primary-fixed-dim',
      meta: stateText(fastOps, (data) => data.platform_name),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-md">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-surface-container-low p-space-md rounded-md flex flex-col justify-between shadow-sm"
        >
          <div className="flex items-center justify-between text-outline">
            <span className="font-label-sm text-label-sm uppercase tracking-wider">
              {card.label}
            </span>
            <span className={`font-code-md text-code-md ${card.badgeClass}`}>{card.badge}</span>
          </div>
          <div className="my-space-sm">
            <span className="font-headline-md text-headline-md text-primary font-bold tracking-tight">
              {card.value}
            </span>
            {card.meta && (
              <span className="font-label-sm text-label-sm text-outline block mt-0.5 truncate">
                {card.meta}
              </span>
            )}
          </div>
          {card.perCore && card.perCore.length > 0 ? (
            <div className="w-full h-1 rounded-full overflow-hidden flex gap-[2px]">
              {card.perCore.map((corePercent, index) => (
                <div
                  key={`core-${index}`}
                  className="flex-1 h-full bg-surface-container-highest rounded-full overflow-hidden"
                >
                  <div
                    className={`h-full ${card.barClass}`}
                    style={{ width: `${clampPercent(corePercent)}%` }}
                  />
                </div>
              ))}
            </div>
          ) : card.fill !== undefined ? (
            <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
              <div
                className={`h-full ${card.barClass} transition-all duration-300`}
                style={{ width: `${card.fill}%` }}
              />
            </div>
          ) : (
            <div className="w-full h-1" aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  );
}
