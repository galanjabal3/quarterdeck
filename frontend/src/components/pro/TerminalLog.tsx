import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Filter } from 'lucide-react';
import type { SystemMetricsState } from '../../hooks/useSystemMetrics';
import {
  API_BASE_URL,
  HEALTH_ENDPOINT,
  fetchInstalledApps,
  fetchSystemProcesses,
  probeEndpoint,
} from '../../lib/actions';
import { formatPercent } from '../../lib/format';

type Tone = 'sys' | 'http' | 'cmd' | 'resp' | 'err';

interface LogLine {
  id: number;
  timestamp: number;
  tone: Tone;
  text: string;
}

interface TerminalLogProps {
  metrics: SystemMetricsState;
}

type ConnectionState = 'checking' | 'live' | 'offline';

const FILTERS = ['ALL', 'SYS', 'HTTP', 'CMD', 'ERR'] as const;

const HELP_TEXT = 'perintah tersedia: help, ping, status, ps, apps, clear';

function matchesFilter(line: LogLine, filter: string): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'CMD') return line.tone === 'cmd' || line.tone === 'resp';
  return line.tone === filter.toLowerCase();
}

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function renderLine(line: LogLine): ReactNode {
  const clock = (
    <span className="text-outline select-none mr-2">{formatClock(line.timestamp)}</span>
  );

  switch (line.tone) {
    case 'sys':
      return (
        <span className="text-outline text-label-sm font-label-sm">
          {clock}
          {line.text}
        </span>
      );
    case 'http':
      return (
        <span className="text-on-surface-variant">
          {clock}
          <span className="text-primary-container font-bold">[HTTP]</span> {line.text}
        </span>
      );
    case 'cmd':
      return (
        <span className="text-primary font-bold">
          {clock}
          {line.text}
        </span>
      );
    case 'resp':
      return (
        <span className="text-primary-container">
          {clock}
          {line.text}
        </span>
      );
    case 'err':
      return (
        <span className="text-error font-medium">
          {clock}
          <span className="bg-error text-on-error px-1 py-[2px] rounded text-label-sm font-label-sm mr-1">
            ERR
          </span>
          {line.text}
        </span>
      );
  }
}

export default function TerminalLog({ metrics }: TerminalLogProps) {
  const [lines, setLines] = useState<LogLine[]>(() => [
    {
      id: 1,
      timestamp: Date.now(),
      tone: 'sys',
      text: `terminal siap — target backend ${API_BASE_URL}`,
    },
  ]);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [command, setCommand] = useState<string>('');

  const nextIdRef = useRef<number>(2);
  const bootstrappedRef = useRef<boolean>(false);

  const appendLine = useCallback((tone: Tone, text: string): void => {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setLines((prev) => [...prev, { id, timestamp: Date.now(), tone, text }]);
  }, []);

  // Probe pertama sekaligus baris log awal + mulai polling indikator koneksi.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const probe = (): void => {
      void probeEndpoint(HEALTH_ENDPOINT, controller.signal).then((result) => {
        if (cancelled) return;
        setConnection(result.ok ? 'live' : 'offline');
        if (bootstrappedRef.current) return;
        bootstrappedRef.current = true;
        if (result.ok) {
          appendLine(
            'http',
            `GET ${HEALTH_ENDPOINT} ${result.httpStatus} OK (${result.latencyMs.toFixed(1)}ms)`,
          );
        } else {
          appendLine('err', `GET ${HEALTH_ENDPOINT} gagal — ${result.message}`);
        }
      });
    };

    probe();
    const intervalId = window.setInterval(probe, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      controller.abort();
    };
  }, [appendLine]);

  const handleClear = (): void => {
    setLines([]);
  };

  const handleFilter = (filter: string): void => {
    setActiveFilter(filter);
  };

  const runCommand = (value: string): void => {
    appendLine('cmd', `$ ${value}`);

    switch (value.toLowerCase()) {
      case 'clear':
        setLines([]);
        return;
      case 'help':
        appendLine('resp', HELP_TEXT);
        return;
      case 'ping':
        void probeEndpoint(HEALTH_ENDPOINT).then((result) => {
          if (result.ok) {
            appendLine(
              'resp',
              `pong — GET ${HEALTH_ENDPOINT} ${result.httpStatus} OK dalam ${result.latencyMs.toFixed(1)}ms`,
            );
          } else {
            appendLine('err', `ping gagal — ${result.message}`);
          }
        });
        return;
      case 'status': {
        const { cpu, ram, storage } = metrics.data;
        if (!cpu && !ram && !storage) {
          appendLine(
            'err',
            metrics.error ? `metrics tidak tersedia — ${metrics.error}` : 'metrics belum tersedia',
          );
          return;
        }
        appendLine(
          'resp',
          `cpu ${formatPercent(cpu?.percent_used)} // ram ${formatPercent(ram?.percent_used)} // disk ${formatPercent(storage?.percent_used)}`,
        );
        if (metrics.error) appendLine('err', `metrics — ${metrics.error}`);
        return;
      }
      case 'ps':
        void fetchSystemProcesses().then((result) => {
          if (!result.ok) {
            appendLine('err', result.message);
            return;
          }
          const top = [...result.data.processes]
            .sort((a, b) => (b.cpu_percent ?? -1) - (a.cpu_percent ?? -1))
            .slice(0, 3);
          appendLine('resp', `${result.data.count} proses aktif`);
          if (top.length === 0) {
            appendLine('resp', '  (tidak ada proses)');
          }
          for (const process of top) {
            appendLine(
              'resp',
              `  pid ${process.pid}  ${process.name}  cpu ${formatPercent(process.cpu_percent)}`,
            );
          }
        });
        return;
      case 'apps':
        void fetchInstalledApps().then((result) => {
          if (!result.ok) {
            appendLine('err', result.message);
            return;
          }
          const sources = new Set(result.data.apps.map((app) => app.source)).size;
          appendLine('resp', `${result.data.count} aplikasi terinstal dari ${sources} sumber`);
        });
        return;
      default:
        appendLine('err', `perintah tidak dikenal: '${value}' — ketik 'help'`);
    }
  };

  const handleCommand = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return;
    const value = command.trim();
    if (!value) return;
    setCommand('');
    runCommand(value);
  };

  const visibleLines = lines.filter((line) => matchesFilter(line, activeFilter));
  const connectionLabel =
    connection === 'live' ? '● LIVE' : connection === 'offline' ? '○ OFFLINE' : '○ CHECKING';
  const connectionClass =
    connection === 'live'
      ? 'bg-surface-container-high text-primary-container'
      : 'bg-surface-container text-outline';

  return (
    <div className="bg-surface-container-lowest rounded-md p-space-md shadow-md flex flex-col h-full gap-space-sm">
      <div className="flex items-center justify-between pb-space-xs bg-surface-container-lowest">
        <div className="flex items-center gap-space-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-error inline-block" />
            <span className="w-3 h-3 rounded-full bg-secondary inline-block" />
            <span className="w-3 h-3 rounded-full bg-primary-container inline-block" />
          </div>
          <span className="font-code-md text-code-md text-on-surface font-semibold ml-2 truncate">
            terminal // {API_BASE_URL}
          </span>
        </div>
        <div className="flex items-center gap-space-xs">
          <button
            type="button"
            onClick={handleClear}
            className="px-2 py-0.5 rounded bg-surface-container-low hover:bg-surface-container-high text-outline hover:text-on-surface font-label-sm text-label-sm uppercase transition-all"
          >
            Clear
          </button>
          <span
            className={`px-2 py-0.5 rounded font-label-sm text-label-sm uppercase transition-all ${connectionClass}`}
            title={`Polling health check tiap 5 dtk ke ${API_BASE_URL}`}
          >
            {connectionLabel}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-space-xs bg-surface-container-low p-1.5 rounded">
        <Filter className="w-4 h-4 text-outline ml-1" aria-hidden="true" />
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => handleFilter(filter)}
            className={`px-2 py-0.5 rounded font-label-sm text-label-sm transition-all ${
              activeFilter === filter
                ? 'bg-surface-container-high text-primary-fixed'
                : 'text-outline hover:text-on-surface'
            }`}
          >
            {filter}
          </button>
        ))}
        <div className="ml-auto font-label-sm text-label-sm text-outline pr-1">
          LINES: {lines.length}
        </div>
      </div>

      <div className="flex-1 bg-surface-container-lowest p-space-sm rounded font-code-md text-code-md overflow-y-auto max-h-[460px] min-h-[380px] flex flex-col gap-1 select-text">
        {visibleLines.length === 0 && (
          <span className="text-outline text-label-sm font-label-sm">
            (tidak ada baris untuk filter {activeFilter})
          </span>
        )}
        {visibleLines.map((line) => (
          <div key={line.id} className="font-code-md text-code-md">
            {renderLine(line)}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-space-sm bg-surface-container-low px-space-sm py-1.5 rounded">
        <span className="text-primary-container font-code-md text-code-md font-bold">&gt;</span>
        <input
          className="bg-transparent border-none outline-none font-code-md text-code-md text-primary flex-1 placeholder:text-outline"
          id="pro-cmd-input"
          type="text"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={handleCommand}
          placeholder="Ketik 'help' untuk daftar perintah"
        />
        <span
          className="inline-block w-2 h-4 bg-primary-container animate-pulse"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
