import { useEffect, useRef } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import type { JunkScanData } from '../../lib/api';
import { formatGb, formatGbShort } from '../../lib/format';

interface CleanPreviewModalProps {
  /** Hasil scan terbaru; null saat scan masih berjalan atau belum pernah berhasil. */
  scan: JunkScanData | null;
  /** true sambil memuat pratinjau (scan cold bisa ~20 detik). */
  loading: boolean;
  /** Pesan gagal memuat pratinjau — ditampilkan di dalam modal, bukan ditutup diam-diam. */
  error: string | null;
  /** Id zona yang dicentang (selalu tanpa `trash` — backend menolak zona itu). */
  selectedIds: string[];
  /** true selama POST /api/actions/clean berjalan (bisa ~20–30 detik). */
  running: boolean;
  /** Galat eksekusi dari envelope backend; modal tetap terbuka saat ini terisi. */
  runError: { code: string; message: string } | null;
  onToggleZone: (id: string) => void;
  onExecute: () => void;
  onCancel: () => void;
}

/** Zona yang tidak boleh dikirim ke executor — permanen, di luar skema undo-able. */
const PERMANENT_ZONE_ID = 'trash';
const PERMANENT_NOTE = 'permanent — out of scope';

/**
 * Pratinjau (dry-run) sebelum clean: daftar zona hasil scan dengan checkbox,
 * total terpilih, dan konfirmasi "Move to Trash". Gaya Casual (putih/rounded),
 * perilaku modal mengikuti ConfirmActionModal (Escape + fokus awal ke Cancel).
 */
export default function CleanPreviewModal({
  scan,
  loading,
  error,
  selectedIds,
  running,
  runError,
  onToggleZone,
  onExecute,
  onCancel,
}: CleanPreviewModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Fokus awal ke Cancel agar Enter tidak langsung mengeksekusi.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Escape = batal; diabaikan saat eksekusi berjalan agar proses tidak terputus.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !running) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, running]);

  const locations = scan?.locations ?? [];
  const selectedLocations = locations.filter((location) => selectedIds.includes(location.id));
  const selectedGb = selectedLocations.reduce((total, location) => total + location.size_gb, 0);
  const zoneCount = selectedLocations.length;
  const showList = !loading && locations.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Preview before cleaning"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-casual-card border border-slate-200 shadow-xl p-6 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Preview before cleaning
          </h2>
          <p className="text-xs text-slate-500">Centang zona yang akan dipindahkan ke Trash.</p>
        </div>

        {loading && (
          <p className="text-sm text-slate-500 flex items-center gap-2 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" aria-hidden="true" />
            Menyiapkan pratinjau… (scan dingin bisa ~20 detik)
          </p>
        )}

        {!loading && error && locations.length === 0 && (
          <p
            className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 break-words"
            title={error}
          >
            {error}
          </p>
        )}

        {showList && (
          <ul className="flex flex-col gap-2">
            {locations.map((location) => {
              const isPermanent = location.id === PERMANENT_ZONE_ID;
              const isChecked = selectedIds.includes(location.id);
              return (
                <li key={location.id}>
                  <label
                    htmlFor={`clean-zone-${location.id}`}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                      isPermanent
                        ? 'border-slate-200 bg-slate-50'
                        : 'border-slate-200 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/40'
                    } ${running ? 'opacity-60' : ''}`}
                  >
                    <input
                      id={`clean-zone-${location.id}`}
                      type="checkbox"
                      aria-label={location.label}
                      checked={isChecked}
                      disabled={isPermanent || running}
                      onChange={() => onToggleZone(location.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                    />
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="flex items-baseline justify-between gap-3">
                        <span
                          className={`text-sm font-semibold truncate ${
                            isPermanent ? 'line-through text-slate-400' : 'text-slate-800'
                          }`}
                        >
                          {location.label}
                        </span>
                        <span className="text-sm font-medium tabular-nums text-slate-600 shrink-0">
                          {formatGbShort(location.size_gb)} GB
                        </span>
                      </span>
                      <span className="text-xs text-slate-400 truncate">{location.path}</span>
                      {isPermanent && (
                        <span className="text-[11px] font-medium text-amber-600">
                          {PERMANENT_NOTE}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {showList && (
          <p className="text-sm font-semibold text-slate-700 border-t border-slate-100 pt-3">
            {zoneCount} zone{zoneCount === 1 ? '' : 's'} · {formatGb(selectedGb, 1)} selected
          </p>
        )}

        <p className="text-xs text-slate-500">
          Files move to Finder → Trash — nothing is permanently deleted.
        </p>

        {runError && (
          <p
            className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 break-words"
            title={`${runError.code}: ${runError.message}`}
          >
            {runError.message} <span className="font-bold">[{runError.code}]</span>
          </p>
        )}

        {running && (
          <p className="text-xs font-medium text-emerald-700 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            moving files… (bisa ~20–30 detik)
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={running}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onExecute}
            disabled={running || zoneCount === 0}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Cleaning…</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>Move to Trash</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
