import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { LayoutGrid, Server, SquareTerminal, Zap } from 'lucide-react';
import type { SystemMetricsState } from '../../hooks/useSystemMetrics';
import { API_BASE_URL } from '../../lib/actions';
import { clampPercent, formatPercent } from '../../lib/format';

interface NavItem {
  /** id section di ProDashboard — dipakai untuk anchor scroll. */
  id: string;
  label: string;
  icon: LucideIcon;
}

interface ProSidebarProps {
  metrics: SystemMetricsState;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'process-manager', label: 'Process Manager', icon: Server },
  { id: 'fast-ops', label: 'Fast Ops', icon: Zap },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
];

export default function ProSidebar({ metrics }: ProSidebarProps) {
  const [activeId, setActiveId] = useState<string>('overview');
  const ramPercent = metrics.data.ram?.percent_used ?? null;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const id = visible[0]?.target.id;
        if (id) setActiveId(id);
      },
      { rootMargin: '-72px 0px -50% 0px', threshold: [0, 0.2, 0.5, 1] },
    );

    for (const item of NAV_ITEMS) {
      const target = document.getElementById(item.id);
      if (target) observer.observe(target);
    }

    return () => observer.disconnect();
  }, []);

  const handleNavigate = (id: string): void => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-lowest z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col">
        <div className="h-16 px-space-md flex items-center bg-surface-container-low">
          <div className="flex items-center gap-space-sm">
            <span className="w-2.5 h-2.5 bg-primary-container" aria-hidden="true" />
            <span className="font-headline-sm text-headline-sm tracking-tight text-primary font-bold">
              SYS.CORE
            </span>
          </div>
        </div>

        <div className="px-space-md py-space-sm">
          <span className="font-label-sm text-label-sm tracking-wider text-outline uppercase">
            Navigation
          </span>
        </div>

        <nav className="flex flex-col px-space-sm gap-space-xs" aria-label="Pro sidebar navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeId === item.id;
            return (
              <button
                key={item.label}
                type="button"
                aria-current={isActive ? 'true' : undefined}
                onClick={() => handleNavigate(item.id)}
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
            Backend API
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
            <span
              className="flex items-center gap-1.5 font-label-sm text-label-sm text-primary-fixed-dim"
              title={`Metrics di-poll tiap 3 dtk dari ${API_BASE_URL}`}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse" />
              API ONLINE
            </span>
          )}
        </div>
        <div className="bg-surface-container-lowest p-space-sm rounded flex flex-col gap-space-xs">
          <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
            <span>RAM</span>
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
