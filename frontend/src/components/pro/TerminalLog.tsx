import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Filter } from 'lucide-react';

type Tone = 'sys' | 'http' | 'orm' | 'warn' | 'cmd' | 'resp' | 'note';

interface LogLine {
  id: number;
  tone: Tone;
  text: string;
  suffix?: string;
}

const INITIAL_LINES: LogLine[] = [
  {
    id: 1,
    tone: 'sys',
    text: '[SYS] Kernel rendezvous initialized. Listening on unix:///run/sys.sock',
  },
  {
    id: 2,
    tone: 'http',
    text: '2025-05-18T10:14:02.102Z - GET /v1/cluster/health 200 OK (0.84ms)',
  },
  {
    id: 3,
    tone: 'orm',
    text: 'SELECT "p".id, "p".name, "p".status FROM "Process" "p" WHERE "p".is_active = 1',
    suffix: '[0.42ms - 4 rows]',
  },
  {
    id: 4,
    tone: 'http',
    text: '2025-05-18T10:14:03.220Z - POST /v1/telemetry/ingest 202 Accepted (1.10ms)',
  },
  {
    id: 5,
    tone: 'warn',
    text: 'Memory pressure throttler threshold: L1 cache pruned (freed 42MB)',
  },
  {
    id: 6,
    tone: 'orm',
    text: 'UPDATE "ClusterNode" SET "last_heartbeat" = NOW() WHERE "id" = \'node-west-04\'',
    suffix: '[1.12ms]',
  },
  {
    id: 7,
    tone: 'http',
    text: '2025-05-18T10:14:04.590Z - GET /v1/auth/verify_token 200 OK (0.39ms)',
  },
  {
    id: 8,
    tone: 'orm',
    text: 'SELECT "m".metric_key, AVG("m".val) FROM "Telemetry" "m" GROUP BY "m".metric_key',
    suffix: '[2.18ms]',
  },
];

const FILTERS = ['ALL', 'ORM', 'HTTP', 'WARN'];

function renderLine(line: LogLine): ReactNode {
  switch (line.tone) {
    case 'sys':
      return <span className="text-outline text-label-sm font-label-sm">{line.text}</span>;
    case 'http':
      return (
        <span className="text-on-surface-variant">
          <span className="text-primary-container font-bold">[HTTP]</span> {line.text}
        </span>
      );
    case 'orm':
      return (
        <span className="text-on-surface">
          <span className="text-secondary-fixed-dim font-bold">[ORM]</span> {line.text}{' '}
          <span className="text-primary-container">{line.suffix}</span>
        </span>
      );
    case 'warn':
      return (
        <span className="text-error font-medium">
          <span className="bg-error text-on-error px-1 py-[2px] rounded text-label-sm font-label-sm mr-1">
            WARN
          </span>
          {line.text}
        </span>
      );
    case 'cmd':
      return <span className="text-primary font-bold">{line.text}</span>;
    case 'resp':
      return <span className="text-primary-container">{line.text}</span>;
    case 'note':
      return <span className="text-secondary-fixed py-1 block">{line.text}</span>;
  }
}

export default function TerminalLog() {
  const [lines, setLines] = useState<LogLine[]>(INITIAL_LINES);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [isLive, setIsLive] = useState<boolean>(true);
  const [command, setCommand] = useState<string>('');

  const nextId = (): number =>
    lines.length > 0 ? Math.max(...lines.map((line) => line.id)) + 1 : 1;

  const appendLine = (tone: Tone, text: string, suffix?: string): void => {
    setLines((prev) => [...prev, { id: nextId(), tone, text, suffix }]);
  };

  const handleClear = (): void => {
    setLines([{ id: 1, tone: 'sys', text: '[SYSTEM LOGS CLEARED BY USER]' }]);
  };

  const handleFilter = (filter: string): void => {
    setActiveFilter(filter);
    appendLine('note', `>> Filter rule activated: [${filter}]`);
  };

  const handleCommand = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return;
    const value = command.trim();
    if (!value) return;

    let response = `sys.core: command '${value}' queued for background dispatch`;
    if (value.toLowerCase() === 'help') {
      response = 'AVAILABLE COMMANDS: ping, status, clear, orm, exit';
    } else if (value.toLowerCase() === 'ping') {
      response = 'PONG 127.0.0.1: time=0.18ms';
    } else if (value.toLowerCase() === 'status') {
      response = 'SYSTEM STATUS: 4 daemons alive, 0 failed, 12ms avg latency.';
    }

    setLines((prev) => [
      ...prev,
      { id: nextId(), tone: 'cmd', text: `$ ${value}` },
      { id: nextId() + 1, tone: 'resp', text: response },
    ]);
    setCommand('');
  };

  return (
    <div className="bg-surface-container-lowest rounded-md p-space-md shadow-md flex flex-col h-full gap-space-sm">
      <div className="flex items-center justify-between pb-space-xs bg-surface-container-lowest">
        <div className="flex items-center gap-space-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-error inline-block" />
            <span className="w-3 h-3 rounded-full bg-secondary inline-block" />
            <span className="w-3 h-3 rounded-full bg-primary-container inline-block" />
          </div>
          <span className="font-code-md text-code-md text-on-surface font-semibold ml-2">
            sys.core://pty/stream/stdout
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
          <button
            type="button"
            onClick={() => setIsLive((prev) => !prev)}
            className={`px-2 py-0.5 rounded font-label-sm text-label-sm uppercase transition-all ${
              isLive
                ? 'bg-surface-container-high text-primary-container'
                : 'bg-surface-container text-outline'
            }`}
          >
            Live Tail
          </button>
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
        <div className="ml-auto font-label-sm text-label-sm text-outline pr-1">BUFF: 120/5000</div>
      </div>

      <div className="flex-1 bg-surface-container-lowest p-space-sm rounded font-code-md text-code-md overflow-y-auto max-h-[460px] min-h-[380px] flex flex-col gap-1 select-text">
        {lines.map((line) => (
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
          placeholder="Type prompt command (e.g. 'status', 'ping', 'inspect')"
        />
        <span
          className="inline-block w-2 h-4 bg-primary-container animate-pulse"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
