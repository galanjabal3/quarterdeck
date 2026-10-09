import { MemoryStick, Sun } from 'lucide-react';
import type { SystemMetricsState } from '../../hooks/useSystemMetrics';
import { formatPercent } from '../../lib/format';

interface CasualTopBarProps {
  metrics: SystemMetricsState;
}

interface RamStatus {
  text: string;
  className: string;
}

function getRamStatus(percentUsed: number | null): RamStatus {
  if (percentUsed == null) return { text: '', className: '' };
  if (percentUsed >= 85) return { text: '(High)', className: 'text-red-700 font-medium' };
  if (percentUsed >= 60) return { text: '(Moderate)', className: 'text-amber-700 font-medium' };
  return { text: '(Optimal)', className: 'text-emerald-700 font-medium' };
}

export default function CasualTopBar({ metrics }: CasualTopBarProps) {
  const { data, error } = metrics;
  const ramPercent = data.ram?.percent_used ?? null;
  const ramStatus = getRamStatus(ramPercent);

  return (
    <div className="bg-white border border-slate-200/80 rounded-casual-card p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/60">
          <Sun className="w-[22px] h-[22px]" aria-hidden="true" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Casual Workspace</h1>
            {error && (
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200"
                title={error}
              >
                API OFFLINE
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Storage cleanup, live system metrics &amp; a local drop zone
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
          <MemoryStick className="w-[18px] h-[18px] text-emerald-600" aria-hidden="true" />
          <div className="flex flex-col text-left">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">RAM Usage</span>
            <span className="text-xs font-bold text-slate-800">
              {formatPercent(ramPercent)}{' '}
              {ramStatus.text && <span className={ramStatus.className}>{ramStatus.text}</span>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
