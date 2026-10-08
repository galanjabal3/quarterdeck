import { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import {
  fetchFastOps,
  postFastOp,
  type FastOpMeta,
  type FastOpResult,
  type FastOpsData,
} from '../../lib/actions';

type RunState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'success'; exitCode: number; message: string; stderr: string }
  | { phase: 'failed'; exitCode: number | null; code: string; message: string; stderr: string };

/** Aksi yang mengubah keadaan GUI/OS (killall/restart/…) perlu konfirmasi dulu. */
const IMPACT_PATTERN = /kill|restart|reboot|shutdown|halt/i;

function needsConfirmation(meta: FastOpMeta): boolean {
  return IMPACT_PATTERN.test(meta.id) || IMPACT_PATTERN.test(meta.command_display);
}

function toRunState(result: FastOpResult): RunState {
  if (result.ok) {
    if (result.data.exit_code === 0) {
      return {
        phase: 'success',
        exitCode: 0,
        message: result.data.message,
        stderr: result.stderr,
      };
    }
    return {
      phase: 'failed',
      exitCode: result.data.exit_code,
      code: `EXIT_${result.data.exit_code}`,
      message: result.data.message,
      stderr: result.stderr,
    };
  }

  return {
    phase: 'failed',
    exitCode: null,
    code: result.code,
    message: result.message,
    stderr: result.stderr,
  };
}

function StatusLine({ state }: { state: RunState }) {
  switch (state.phase) {
    case 'idle':
      return <span className="font-label-sm text-label-sm text-outline uppercase">[ READY ]</span>;
    case 'running':
      return (
        <span className="font-label-sm text-label-sm text-secondary uppercase animate-pulse">
          Running…
        </span>
      );
    case 'success':
      return (
        <span className="font-label-sm text-label-sm text-primary-fixed uppercase flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed shrink-0" aria-hidden="true" />
          EXIT {state.exitCode} // {state.message}
        </span>
      );
    case 'failed':
      return (
        <span className="font-label-sm text-label-sm text-error uppercase flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" aria-hidden="true" />[ FAIL
            ] {state.code}
            {state.exitCode !== null ? ` // EXIT ${state.exitCode}` : ''}
          </span>
          <span className="normal-case font-code-md text-error break-words">{state.message}</span>
          {state.stderr && (
            <span className="normal-case font-code-md text-outline break-words">
              stderr: {state.stderr}
            </span>
          )}
        </span>
      );
  }
}

export default function FastOps() {
  const [ops, setOps] = useState<FastOpsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, RunState>>({});

  const mountedRef = useRef<boolean>(true);
  const runControllersRef = useRef<Set<AbortController>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    const runControllers = runControllersRef.current;

    void fetchFastOps(controller.signal).then((result) => {
      if (!mountedRef.current || controller.signal.aborted) return;
      if (result.ok) {
        setOps(result.data);
        setError(null);
      } else {
        setError(result.message);
      }
      setLoading(false);
    });

    return () => {
      mountedRef.current = false;
      controller.abort();
      for (const runController of runControllers) runController.abort();
      runControllers.clear();
    };
  }, []);

  const handleRun = (meta: FastOpMeta): void => {
    if (runs[meta.id]?.phase === 'running') return;

    if (needsConfirmation(meta)) {
      const confirmed = window.confirm(
        `Jalankan aksi "${meta.title}"?\n\nPerintah: ${meta.command_display}\n\nAksi ini berdampak nyata ke sistem — jendela/aplikasi terkait bisa berkedip sejenak.`,
      );
      if (!confirmed) return;
    }

    setRuns((prev) => ({ ...prev, [meta.id]: { phase: 'running' } }));

    const controller = new AbortController();
    runControllersRef.current.add(controller);

    void postFastOp(meta.id, controller.signal).then((result) => {
      runControllersRef.current.delete(controller);
      if (!mountedRef.current || controller.signal.aborted) return;
      setRuns((prev) => ({ ...prev, [meta.id]: toRunState(result) }));
    });
  };

  const actionList: FastOpMeta[] = ops ? Object.values(ops.actions) : [];

  return (
    <div className="bg-surface-container-low p-space-md rounded-md flex flex-col gap-space-md shadow-sm">
      <div className="flex items-center justify-between pb-space-xs bg-surface-container-low">
        <div className="flex items-center gap-space-xs min-w-0">
          <Zap className="w-[18px] h-[18px] text-secondary shrink-0" aria-hidden="true" />
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight uppercase truncate">
            Fast Ops // {ops?.platform_name ?? '…'}
          </span>
        </div>
        <span className="font-label-sm text-label-sm text-outline shrink-0">
          {loading && !ops
            ? '[ LOADING ]'
            : error && !ops
              ? '[ UNAVAILABLE ]'
              : `[ ${actionList.length} ACTIONS ]`}
        </span>
      </div>

      {error && (
        <div className="p-space-sm rounded bg-surface-container-lowest text-error font-code-md text-code-md break-words">
          [ ERROR ] {error}
        </div>
      )}

      {loading && !ops && !error && (
        <div className="p-space-sm rounded bg-surface-container-lowest font-label-sm text-label-sm text-outline uppercase">
          Loading fast ops…
        </div>
      )}

      {ops && actionList.length === 0 && !error && (
        <div className="p-space-sm rounded bg-surface-container-lowest font-label-sm text-label-sm text-outline uppercase">
          No actions registered for {ops.platform_name}.
        </div>
      )}

      {actionList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-xs font-label-sm text-label-sm">
          {actionList.map((meta) => {
            const state = runs[meta.id] ?? { phase: 'idle' };
            const isRunning = state.phase === 'running';

            return (
              <button
                key={meta.id}
                type="button"
                disabled={isRunning}
                onClick={() => handleRun(meta)}
                aria-label={`Jalankan aksi ${meta.title}`}
                aria-busy={isRunning}
                title={
                  isRunning
                    ? 'Aksi sedang dijalankan…'
                    : `POST /api/actions/fast-op → {"action":"${meta.id}"}`
                }
                className={`p-space-sm rounded bg-surface-container-lowest text-left flex flex-col gap-0.5 transition-all ${
                  isRunning
                    ? 'opacity-60 cursor-wait'
                    : 'hover:bg-surface-container-high cursor-pointer'
                }`}
              >
                <span className="font-code-md text-code-md font-semibold text-primary">
                  {meta.title}
                </span>
                <span className="text-outline break-words">{meta.command_display}</span>
                <span className="mt-0.5">
                  <StatusLine state={state} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
