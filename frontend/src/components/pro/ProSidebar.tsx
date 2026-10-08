import type { LucideIcon } from 'lucide-react';
import { Activity, LayoutGrid, Network, ReceiptText, Settings, SquareTerminal } from 'lucide-react';
import type { SystemMetricsState } from '../../hooks/useSystemMetrics';
import { clampPercent, formatPercent } from '../../lib/format';

interface NavItem {
  label: string;
  icon: LucideIcon;
}

interface ProSidebarProps {
  metrics: SystemMetricsState;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', icon: LayoutGrid },
  { label: 'Live Telemetry', icon: Activity },
  { label: 'Task Orchestration', icon: SquareTerminal },
  { label: 'Node Clusters', icon: Network },
  { label: 'Audit Logs', icon: ReceiptText },
  { label: 'System Settings', icon: Settings },
];

export default function ProSidebar({ metrics }: ProSidebarProps) {
  const ramPercent = metrics.data.ram?.percent_used ?? null;

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-lowest z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col">
        <div className="h-16 px-space-md flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-space-sm">
            <span className="w-2.5 h-2.5 bg-primary-container" aria-hidden="true" />
            <span className="font-headline-sm text-headline-sm tracking-tight text-primary font-bold">
              SYS.CORE
            </span>
          </div>
          <span className="font-label-sm text-label-sm px-space-xs py-0.5 bg-surface-container-high text-primary-fixed">
            v2.4
          </span>
        </div>

        <div className="px-space-md py-space-sm">
          <span className="font-label-sm text-label-sm tracking-wider text-outline uppercase">
            Navigation
          </span>
        </div>

        <nav className="flex flex-col px-space-sm gap-space-xs" aria-label="Pro sidebar navigation">
          {NAV_ITEMS.map((item, index) => {
            const Icon = item.icon;
            const isActive = index === 0;
            return (
              <button
                key={item.label}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-pro transition-colors ${
                  isActive
                    ? 'bg-surface-container text-primary-container font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                <span className="font-body-md text-body-md text-left">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-space-md bg-surface-container-low flex flex-col gap-space-sm">
        <div className="flex items-center justify-between text-on-surface-variant">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            Hub Link
          </span>
          {metrics.error ? (
            <span
              className="flex items-center gap-1.5 font-label-sm text-label-sm text-error"
              title={metrics.error}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-error" />
              API OFFLINE
            </span>
          ) : (
            <span className="flex items-center gap-1.5 font-label-sm text-label-sm text-primary-fixed-dim">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse" />
              SECURE
            </span>
          )}
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded flex flex-col gap-space-xs">
          <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
            <span>CPU MEM</span>
            <span className="text-on-surface font-code-md text-code-md">
              {formatPercent(ramPercent)}
            </span>
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
            <div
              className="bg-primary-container h-full transition-all duration-300"
              style={{ width: `${clampPercent(ramPercent ?? 0)}%` }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
