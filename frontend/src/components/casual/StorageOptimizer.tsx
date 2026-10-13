import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, HardDrive, RefreshCcw, Wand2 } from 'lucide-react';
import type { SystemMetricsState } from '../../hooks/useSystemMetrics';
import { fetchJunkScan, type JunkScanData } from '../../lib/api';
import { formatGb, formatGbShort, formatPercent } from '../../lib/format';
import { postAction } from '../../lib/actions';
import ApiOfflineBadge from '../shared/ApiOfflineBadge';

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
 * Bar disusun dari dua sumber angka nyata saja: used/free dari metrics.storage
 * dan "Junk" dari scan GET /api/metrics/junk — tidak ada rasio karangan.
 */
const SEGMENT_STYLES = [
  { barClass: 'bg-slate-800', dotClass: 'bg-slate-800' },
  { barClass: 'bg-emerald-400', dotClass: 'bg-emerald-400' },
  { barClass: 'bg-slate-200', dotClass: 'bg-slate-200' },
] as const;

const SEGMENT_NAMES = ['Used', 'Junk', 'Free'] as const;

const PLACEHOLDER_SEGMENTS: StorageSegment[] = SEGMENT_NAMES.map((name, index) => ({
  label: name,
  legend: `${name} (—)`,
  fillPercent: 0,
  barClass: SEGMENT_STYLES[index].barClass,
  dotClass: SEGMENT_STYLES[index].dotClass,
}));

function buildSegments(
  usedNonJunkGb: number | null,
  junkGb: number | null,
  freeGb: number | null,
): StorageSegment[] {
  if (usedNonJunkGb == null || junkGb == null || freeGb == null) {
    return PLACEHOLDER_SEGMENTS;
  }

  const values = [usedNonJunkGb, junkGb, freeGb];
  const sum = values.reduce((total, value) => total + value, 0);
  if (sum <= 0) return PLACEHOLDER_SEGMENTS;

  return values.map((value, index) => {
    const name = SEGMENT_NAMES[index];
    const displayGb = formatGb(value, 1);
    return {
      label: `${name}: ${displayGb}`,
      legend: `${name} (${displayGb})`,
      fillPercent: (value / sum) * 100,
      barClass: SEGMENT_STYLES[index].barClass,
      dotClass: SEGMENT_STYLES[index].dotClass,
    };
  });
}

type ScanStatus = 'scanning' | 'ready' | 'error';

/** Satuan jujur dari hasil scan: <1 GB ditampilkan dalam MB, selain itu 1 desimal. */
function formatReclaimable(reclaimableGb: number): string {
  if (reclaimableGb < 1) return `${Math.round(reclaimableGb * 1024)} MB`;
  return `${formatGbShort(reclaimableGb)} GB`;
}

function cleanableTitle(scan: JunkScanData | null, scanStatus: ScanStatus): string {
  if (scanStatus === 'error') return '— GB Cleanable';
  if (!scan) return '… GB Cleanable';
  return `${formatReclaimable(scan.reclaimable_gb)} Cleanable`;
}

function scanSubtitle(scan: JunkScanData | null, scanStatus: ScanStatus): string {
  if (scanStatus === 'error') return 'disk scan unavailable — backend offline?';
  if (!scan) return 'Scanning disk… (first scan can take ~20s)';
  return 'Real disk scan · cleanup in simulation mode';
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

  const [scan, setScan] = useState<JunkScanData | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('scanning');

  // Scan nyata sekali saat kartu dimount; backend menyimpan TTL cache 60 detik.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void fetchJunkScan(controller.signal).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setScan(result.data);
        setScanStatus('ready');
      } else {
        setScanStatus('error');
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // Clamp ke used agar irisan bar tetap berada di dalam volume yang sama.
  const junkGb =
    usedGb == null || scanStatus !== 'ready' || scan == null
      ? null
      : Math.min(Math.max(scan.reclaimable_gb, 0), usedGb);
  const usedNonJunkGb = usedGb == null || junkGb == null ? null : usedGb - junkGb;

  const segments = buildSegments(usedNonJunkGb, junkGb, freeGb);

  const [status, setStatus] = useState<CleanStatus>('idle');
  const [filesRemoved, setFilesRemoved] = useState<number | null>(null);
  const [actionError, setActionError] = useState<ActionErrorState | null>(null);

  const isCleaning = status === 'loading';
  const isCleaned = status === 'success';
  const isError = status === 'error';

  const handleClean = async (): Promise<void> => {
    // Boleh dijalankan ulang setelah success/error — hanya diblokir saat masih berjalan.
    if (isCleaning) return;
    setStatus('loading');
    setActionError(null);

    const result = await postAction('cleanup', 'temp-files');

    if (result.ok) {
      // Field opsional: null = backend tidak melaporkan angka → tampilkan "—", bukan 0.
      setFilesRemoved(result.data.files_removed ?? null);
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
    if (scanStatus === 'ready' && scan) {
      return (
        <>
          Your drive is running at {formatPercent(percentUsed)} capacity.{' '}
          <strong className="text-emerald-700 font-semibold">
            {formatReclaimable(scan.reclaimable_gb)}
          </strong>{' '}
          of caches, logs, and trash is reclaimable per the live disk scan.
        </>
      );
    }
    return <>Your drive is running at {formatPercent(percentUsed)} capacity.</>;
  };

  const locationBreakdown =
    scan?.locations
      .map((location) => `${location.label} ${formatGbShort(location.size_gb)} GB`)
      .join(' · ') ?? '';

  return (
    <div className="bg-white rounded-casual-card p-6 md:p-8 shadow-sm border border-slate-200/80 flex flex-col lg:flex-row items-center justify-between gap-8 relative overflow-hidden">
      <div className="absolute -top-12 -right-12 w-80 h-80 bg-gradient-to-br from-emerald-100/40 to-teal-50/20 rounded-full pointer-events-none blur-2xl" />

      <div className="flex flex-col gap-4 max-w-2xl z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
            <HardDrive className="w-6 h-6" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold tracking-wide uppercase text-slate-500">
            Storage Health &amp; Optimizer
          </span>
          <ApiOfflineBadge error={error} className="ml-1" />
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

      <div className="flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-emerald-50/30 p-6 rounded-lg z-10 w-full lg:w-80 border border-slate-200 text-center gap-4 shrink-0 shadow-xs">
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
              ? `${filesRemoved ?? '—'} File${filesRemoved === 1 ? '' : 's'} Removed`
              : isError
                ? 'Cleanup Failed'
                : cleanableTitle(scan, scanStatus)}
          </span>
          <span className="text-xs text-slate-500">
            {isCleaned
              ? `Simulation complete — ${filesRemoved ?? '—'} demo file${
                  filesRemoved === 1 ? '' : 's'
                } processed. No real files were touched.`
              : isError
                ? 'Run blocked — see the error details below.'
                : scanSubtitle(scan, scanStatus)}
          </span>
          {scanStatus === 'ready' && scan && (
            <div className="text-xs text-slate-500 mt-2 flex flex-col gap-0.5">
              {locationBreakdown && <span>{locationBreakdown}</span>}
              <span>{`${scan.file_count.toLocaleString('en-US')} files measured`}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleClean()}
          disabled={isCleaning}
          title={
            isCleaning
              ? 'Sedang membersihkan…'
              : 'Simulation only — real cleanup ships in the next update'
          }
          className={`w-full py-3.5 px-4 rounded-xl font-semibold shadow-md transition-all flex items-center justify-center gap-2 text-sm active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100 ${
            isCleaned
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
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
              <span>Clean Again</span>
            </>
          ) : isError ? (
            <>
              <RefreshCcw className="w-[18px] h-[18px]" aria-hidden="true" />
              <span>Try Again</span>
            </>
          ) : (
            <>
              <Wand2 className="w-[18px] h-[18px] text-emerald-400" aria-hidden="true" />
              <span>Simulate Clean (demo)</span>
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

        <span className="text-[11px] text-slate-500">Zero personal data touched</span>
      </div>
    </div>
  );
}
