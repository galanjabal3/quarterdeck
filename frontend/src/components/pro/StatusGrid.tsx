import type { SystemMetricsState } from '../../hooks/useSystemMetrics';
import { clampPercent, formatCelsius, formatGhz, formatPercent } from '../../lib/format';

interface StatusCard {
  label: string;
  badge: string;
  badgeClass: string;
  value: string;
  fill: number;
  barClass: string;
  meta?: string;
  perCore?: number[];
}

interface StatusGridProps {
  metrics: SystemMetricsState;
}

const STATIC_CARDS: StatusCard[] = [
  {
    label: 'THREAD POOL',
    badge: '64 / 64',
    badgeClass: 'text-primary-container',
    value: '0.42 ms',
    fill: 84,
    barClass: 'bg-primary-container',
  },
  {
    label: 'REDIS LATENCY',
    badge: 'OPTIMAL',
    badgeClass: 'text-secondary-fixed-dim',
    value: '1.18 ms',
    fill: 24,
    barClass: 'bg-secondary',
  },
  {
    label: 'DOCKER DAEMON',
    badge: '18 PODS',
    badgeClass: 'text-primary-container',
    value: '14.2 GB',
    fill: 62,
    barClass: 'bg-primary-container',
  },
  {
    label: 'INGRESS / EGRESS',
    badge: 'TX/RX',
    badgeClass: 'text-primary-container',
    value: '842 Mb/s',
    fill: 49,
    barClass: 'bg-primary-fixed-dim',
  },
];

export default function StatusGrid({ metrics }: StatusGridProps) {
  const cpu = metrics.data.cpu;
  const ram = metrics.data.ram;

  const cards: StatusCard[] = [
    {
      label: 'CPU LOAD',
      badge: cpu ? `${cpu.core_count} CORE` : '—',
      badgeClass: 'text-primary-container',
      value: formatPercent(cpu?.percent_used ?? null),
      fill: clampPercent(cpu?.percent_used ?? 0),
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
      fill: clampPercent(ram?.percent_used ?? 0),
      barClass: 'bg-secondary',
      meta: ram ? `${ram.used_gb.toFixed(1)} GB of ${ram.total_gb.toFixed(1)} GB in use` : '—',
    },
    ...STATIC_CARDS,
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
          ) : (
            <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
              <div
                className={`h-full ${card.barClass} transition-all duration-300`}
                style={{ width: `${card.fill}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
