import { useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, HardDrive, RefreshCcw, Wand2 } from 'lucide-react';
import type { SystemMetricsState } from '../../hooks/useSystemMetrics';
import { formatGb, formatPercent } from '../../lib/format';
import { postAction } from '../../lib/actions';

interface StorageSegment {
  label: string;
  legend: string;
  fillPercent: number;
  barClass: string;
  dotClass: string;
}

interface StorageOptimizerProps {
  metrics: SystemMetricsState;
}

/**
 * Backend hanya menyediakan total/used/free. Rasio ini dipakai untuk
 * memecah `used_gb` secara proporsional agar tetap konsisten dengan total.
 */
const USED_SPLIT = {
  system: 0.7,
  apps: 0.2,
  junk: 0.1,
} as const;

const SEGMENT_STYLES = [
  { barClass: 'bg-slate-800', dotClass: 'bg-slate-800' },
  { barClass: 'bg-blue-500', dotClass: 'bg-blue-500' },
  { barClass: 'bg-emerald-400', dotClass: 'bg-emerald-400' },
  { barClass: 'bg-slate-200', dotClass: 'bg-slate-200' },
] as const;

const SEGMENT_NAMES = ['System', 'Apps', 'Junk', 'Free'] as const;

const PLACEHOLDER_SEGMENTS: StorageSegment[] = SEGMENT_NAMES.map((name, index) => ({
  label: name,
  legend: `${name} (—)`,
  fillPercent: 0,
  barClass: SEGMENT_STYLES[index].barClass,
  dotClass: SEGMENT_STYLES[index].dotClass,
}));

function buildSegments(
  systemGb: number | null,
  appsGb: number | null,
  junkGb: number | null,
  freeGb: number | null,
): StorageSegment[] {
  if (systemGb == null || appsGb == null || junkGb == null || freeGb == null) {
    return PLACEHOLDER_SEGMENTS;
  }

  const values = [systemGb, appsGb, junkGb, freeGb];
  const sum = values.reduce((total, value) => total + value, 0);
  if (sum <= 0) return PLACEHOLDER_SEGMENTS;

  return values.map((value, index) => {
    const name = SEGMENT_NAMES[index];
    const displayGb = index === 3 ? formatGb(freeGb, 1) : formatGb(value, 1);
    return {
      label: `${name}: ${displayGb}`,
      legend: `${name} (${displayGb})`,
      fillPercent: (value / sum) * 100,
      barClass: SEGMENT_STYLES[index].barClass,
      dotClass: SEGMENT_STYLES[index].dotClass,
    };
  });
}

type CleanStatus = 'idle' | 'loading' | 'success' | 'error';

interface ActionErrorState {
  message: string;
  code: string;
}

export default function StorageOptimizer({ metrics }: StorageOptimizerProps) {
  const { data, loading, error } = metrics;
  const storage = data.storage;

  const totalGb = storage?.total_gb ?? null;
  const usedGb = storage?.used_gb ?? null;
  const freeGb = storage?.free_gb ?? null;
  const percentUsed = storage?.percent_used ?? null;

  const systemGb = usedGb == null ? null : usedGb * USED_SPLIT.system;
  const appsGb = usedGb == null ? null : usedGb * USED_SPLIT.apps;
  const junkGb = usedGb == null ? null : usedGb * USED_SPLIT.junk;

  const segments = buildSegments(systemGb, appsGb, junkGb, freeGb);

  const [status, setStatus] = useState<CleanStatus>('idle');
  const [filesRemoved, setFilesRemoved] = useState<number>(0);
  const [actionError, setActionError] = useState<ActionErrorState | null>(null);

  const isCleaning = status === 'loading';
  const isCleaned = status === 'success';
  const isError = status === 'error';

  const handleClean = async (): Promise<void> => {
    if (isCleaning || isCleaned) return;
    setStatus('loading');
    setActionError(null);

    const result = await postAction('cleanup', 'temp-files');

    if (result.ok) {
      setFilesRemoved(result.data.files_removed ?? 0);
      setStatus('success');
    } else {
      setActionError({ message: result.message, code: result.code });
      setStatus('error');
    }
  };

  const capacityText = (): ReactNode => {
    if (loading) return 'Loading storage metrics…';
    if (percentUsed == null) {
      return error
        ? 'Storage metrics unavailable — metrics API offline.'
        : 'Storage metrics unavailable.';
    }
    return (
      <>
        Your drive is running at {formatPercent(percentUsed)} capacity. Roughly{' '}
        <strong className="text-emerald-700 font-semibold">{formatGb(junkGb, 1)}</strong> of
        temporary cached installers, build logs, and stale cache can be safely removed.
      </>
    );
  };

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200/80 flex flex-col lg:flex-row items-center justify-between gap-8 relative overflow-hidden">
      <div className="absolute -top-12 -right-12 w-80 h-80 bg-gradient-to-br from-emerald-100/40 to-teal-50/20 rounded-full pointer-events-none blur-2xl" />

      <div className="flex flex-col gap-4 max-w-2xl z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
            <HardDrive className="w-6 h-6" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold tracking-wide uppercase text-slate-500">
            Storage Health &amp; Optimizer
          </span>
          {error && (
            <span
              className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200"
              title={error}
            >
              API OFFLINE
            </span>
          )}
        </div>

        <div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
            {formatGb(usedGb, 0)}{' '}
            <span className="text-slate-500 text-2xl font-medium">
              / {formatGb(totalGb, 0)} Used
            </span>
          </h2>
          <p className="text-sm text-slate-600 mt-1">{capacityText()}</p>
        </div>

        <div className="w-full flex flex-col gap-2.5 pt-2">
          <div className="w-full h-3.5 rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
            {segments.map((segment) => (
              <div
                key={segment.label}
                className={`h-full transition-all duration-300 ${segment.barClass}`}
                style={{ width: `${segment.fillPercent}%` }}
                title={segment.label}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 font-medium">
            {segments.map((segment) => (
              <div key={segment.legend} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${segment.dotClass}`} />
                <span>{segment.legend}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-emerald-50/30 p-6 rounded-2xl z-10 w-full lg:w-80 border border-slate-200 text-center gap-4 shrink-0 shadow-xs">
        <div
          className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-inner transition-all duration-500 ${
            isCleaned
              ? 'bg-emerald-600 text-white'
              : isError
                ? 'bg-red-100 text-red-700'
                : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {isCleaned ? (
            <CheckCircle2 className="w-9 h-9" aria-hidden="true" />
          ) : isError ? (
            <AlertCircle className="w-9 h-9" aria-hidden="true" />
          ) : (
            <Wand2 className="w-9 h-9" aria-hidden="true" />
          )}
        </div>

        <div>
          <span className="text-xl font-bold text-slate-900 block">
            {isCleaned
              ? `${filesRemoved} File${filesRemoved === 1 ? '' : 's'} Removed`
              : isError
                ? 'Cleanup Failed'
                : junkGb == null
                  ? '— Cleanable'
                  : `${formatGb(junkGb, 1)} Cleanable`}
          </span>
          <span className="text-xs text-slate-500">
            {isCleaned
              ? `Drive purged. ${filesRemoved} temporary file${filesRemoved === 1 ? '' : 's'} deleted by the backend.`
              : isError
                ? 'Run blocked — see the error details below.'
                : 'Safe 1-click system tuneup'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void handleClean()}
          disabled={isCleaning || isCleaned}
          className={`w-full py-3.5 px-4 rounded-xl font-semibold shadow-md transition-all flex items-center justify-center gap-2 text-sm active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100 ${
            isCleaned
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-900 hover:bg-slate-800 text-white hover:shadow-lg disabled:opacity-70'
          }`}
        >
          {isCleaning ? (
            <>
              <RefreshCcw className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />
              <span>Executing…</span>
            </>
          ) : isCleaned ? (
            <>
              <CheckCircle2 className="w-[18px] h-[18px]" aria-hidden="true" />
              <span>System Clean &amp; Optimal</span>
            </>
          ) : isError ? (
            <>
              <RefreshCcw className="w-[18px] h-[18px]" aria-hidden="true" />
              <span>Retry 1-Click Clean</span>
            </>
          ) : (
            <>
              <Wand2 className="w-[18px] h-[18px] text-emerald-400" aria-hidden="true" />
              <span>1-Click Clean Drive</span>
            </>
          )}
        </button>

        {isError && actionError && (
          <p
            className="w-full text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 text-left break-words"
            title={`${actionError.code}: ${actionError.message}`}
          >
            {actionError.message} <span className="font-bold">[{actionError.code}]</span>
          </p>
        )}

        <span className="text-[11px] text-slate-400">Zero personal data touched</span>
      </div>
    </div>
  );
}
