import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Braces,
  Calculator,
  Code,
  Compass,
  Container,
  Gamepad2,
  Globe,
  LayoutGrid,
  Loader2,
  MessageCircle,
  Music,
  RefreshCw,
  Rocket,
  Search,
  SearchX,
  Send,
} from 'lucide-react';
import {
  appIconUrl,
  fetchInstalledApps,
  postAction,
  type ActionResult,
  type InstalledApp,
} from '../../lib/actions';

const PAGE_SIZE = 12;

const GRADIENTS: string[] = [
  'from-sky-500 via-blue-500 to-indigo-600',
  'from-amber-500 via-orange-500 to-red-500',
  'from-emerald-500 via-green-600 to-teal-700',
  'from-blue-600 via-sky-600 to-cyan-600',
  'from-violet-600 via-purple-600 to-indigo-700',
  'from-rose-500 via-pink-500 to-fuchsia-600',
];

const ICON_RULES: { icon: LucideIcon; pattern: RegExp }[] = [
  { icon: Globe, pattern: /chrome|safari|firefox|edge|browser|brave|opera/i },
  { icon: Code, pattern: /code|studio|editor|idea|cursor|sublime|terminal|xcode|node|python/i },
  { icon: Music, pattern: /music|spotify|itunes|audio|sound|podcast|vlc|player/i },
  { icon: MessageCircle, pattern: /whatsapp|telegram|slack|discord|message|chat|mail|signal/i },
  { icon: Send, pattern: /mail|outlook|thunderbird|airmail/i },
  { icon: Container, pattern: /docker|container|orbstack|podman|kubernetes/i },
  { icon: Braces, pattern: /insomnia|postman|api|request/i },
  { icon: Compass, pattern: /map|compass|location|navi|finder/i },
  { icon: Calculator, pattern: /calc|utilit|activity|monitor|system/i },
  { icon: Gamepad2, pattern: /game|steam|epic|xbox|play/i },
];

function iconFor(appName: string): LucideIcon {
  const rule = ICON_RULES.find((entry) => entry.pattern.test(appName));
  return rule ? rule.icon : LayoutGrid;
}

function hashName(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 1024;
  }
  return hash;
}

function gradientFor(appName: string): string {
  return GRADIENTS[hashName(appName) % GRADIENTS.length];
}

function shortSource(source: string): string {
  const parts = source.split('/').filter(Boolean);
  return parts.length > 0 ? (parts[parts.length - 1] as string) : source;
}

function sourceLabel(source: string): string {
  return source.startsWith('/System') ? 'System' : 'Installed';
}

type LaunchStatus = 'idle' | 'loading' | 'success' | 'error';

interface LaunchState {
  status: LaunchStatus;
  message: string;
  code: string;
}

const IDLE_STATE: LaunchState = { status: 'idle', message: '', code: '' };

export default function GameLauncher() {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [count, setCount] = useState<number>(0);
  const [appsLoading, setAppsLoading] = useState<boolean>(true);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [notice, setNotice] = useState<string | null>(null);
  const [launchStates, setLaunchStates] = useState<Record<string, LaunchState>>({});
  const [failedIcons, setFailedIcons] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let active = true;

    const load = async (refresh: boolean): Promise<void> => {
      setAppsLoading(true);
      const result = await fetchInstalledApps({ refresh });
      if (!active) return;
      if (result.ok) {
        setApps(result.data.apps);
        setCount(result.data.count);
        setAppsError(null);
      } else {
        setAppsError(result.message);
      }
      setAppsLoading(false);
    };

    void load(false);

    return () => {
      active = false;
    };
  }, []);

  const filteredApps = useMemo(() => {
    if (!apps) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter((app) => {
      const displayName = typeof app.display_name === 'string' ? app.display_name : '';
      return app.name.toLowerCase().includes(needle) || displayName.toLowerCase().includes(needle);
    });
  }, [apps, query]);

  const visibleApps = filteredApps.slice(0, visibleCount);
  const hiddenCount = filteredApps.length - visibleApps.length;

  const visibleAppsKey = visibleApps.map((app) => app.name).join('\n');
  const [prevAppsKey, setPrevAppsKey] = useState(visibleAppsKey);
  if (prevAppsKey !== visibleAppsKey) {
    setPrevAppsKey(visibleAppsKey);
    setFailedIcons({});
  }

  const handleQueryChange = (value: string): void => {
    setQuery(value);
    setVisibleCount(PAGE_SIZE);
  };

  const handleLoadMore = (): void => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  };

  const handleRefresh = async (): Promise<void> => {
    if (appsLoading) return;
    setAppsLoading(true);
    const result = await fetchInstalledApps({ refresh: true });
    if (result.ok) {
      setApps(result.data.apps);
      setCount(result.data.count);
      setAppsError(null);
      setFailedIcons({});
    } else {
      setAppsError(result.message);
    }
    setAppsLoading(false);
  };

  const handleLaunch = async (app: InstalledApp): Promise<void> => {
    const current = launchStates[app.name] ?? IDLE_STATE;
    if (current.status === 'loading') return;

    setLaunchStates((prev) => ({
      ...prev,
      [app.name]: { status: 'loading', message: '', code: '' },
    }));

    const result: ActionResult = await postAction('launch-game', app.name);

    if (result.ok) {
      const message = `Exit code ${result.data.exit_code}`;
      setLaunchStates((prev) => ({
        ...prev,
        [app.name]: { status: 'success', message, code: '' },
      }));
      setNotice(`${app.name} launched — ${message}.`);
    } else {
      setLaunchStates((prev) => ({
        ...prev,
        [app.name]: { status: 'error', message: result.message, code: result.code },
      }));
    }
  };

  const countLabel = appsLoading
    ? 'Scanning…'
    : appsError
      ? 'Apps Offline'
      : `${count} Apps Installed`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
            <Gamepad2 className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">App Launcher</h3>
              {appsError && !appsLoading && (
                <span
                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200"
                  title={appsError}
                >
                  API OFFLINE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              One-tap launch for every app installed on this machine
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
            {countLabel}
          </span>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={appsLoading}
            aria-label="Refresh app list"
            className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`w-4 h-4 ${appsLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search
          className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Cari aplikasi… (Chrome, Code, Spotify)"
          aria-label="Cari aplikasi terpasang"
          className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
        />
      </div>

      {!appsLoading && !appsError && (
        <p className="text-xs text-slate-500">
          Menampilkan {visibleApps.length} dari {filteredApps.length} aplikasi
          {query.trim() ? ` yang cocok dengan “${query.trim()}”` : ''}.
        </p>
      )}

      {appsLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: PAGE_SIZE }, (_, index) => (
            <div
              key={`skeleton-${index}`}
              className="bg-white rounded-casual-card p-4 border border-slate-200 shadow-sm flex flex-col justify-between gap-4 animate-pulse"
            >
              <div className="flex flex-col gap-3">
                <div className="h-28 w-full rounded-xl bg-slate-100" />
                <div className="flex flex-col gap-2">
                  <div className="h-4 w-2/3 rounded bg-slate-100" />
                  <div className="h-3 w-1/2 rounded bg-slate-100" />
                </div>
                <div className="h-3 w-full rounded bg-slate-100" />
              </div>
              <div className="h-9 w-full rounded-xl bg-slate-100" />
            </div>
          ))}
        </div>
      )}

      {!appsLoading && appsError && (
        <div className="bg-white rounded-casual-card p-6 border border-red-100 shadow-sm flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center">
            <SearchX className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Daftar aplikasi tidak tersedia</p>
            <p className="text-xs text-slate-500 mt-1 break-words">{appsError}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition-all active:scale-95"
          >
            Coba lagi
          </button>
        </div>
      )}

      {!appsLoading && !appsError && apps !== null && filteredApps.length === 0 && (
        <div className="bg-white rounded-casual-card p-6 border border-slate-200 shadow-sm flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center">
            <SearchX className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Tidak ada aplikasi cocok</p>
            <p className="text-xs text-slate-500 mt-1">
              {query.trim()
                ? `Tidak ada hasil untuk “${query.trim()}”. Coba kata kunci lain.`
                : 'Belum ada aplikasi terdeteksi di sistem ini.'}
            </p>
          </div>
        </div>
      )}

      {!appsLoading && !appsError && visibleApps.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {visibleApps.map((app) => {
              const Icon = iconFor(app.name);
              const iconFailed = failedIcons[app.name] === true;
              const state = launchStates[app.name] ?? IDLE_STATE;
              const isLoading = state.status === 'loading';
              const displayName =
                typeof app.display_name === 'string' && app.display_name.trim().length > 0
                  ? app.display_name
                  : '';
              const tagline =
                displayName && displayName !== app.name
                  ? displayName
                  : `Aplikasi di ${shortSource(app.source)}`;
              return (
                <div
                  key={app.name}
                  className="bg-white rounded-casual-card p-4 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4 group"
                >
                  <div className="flex flex-col gap-3">
                    <div
                      className={`h-28 w-full rounded-xl bg-gradient-to-tr ${gradientFor(app.name)} flex items-center justify-center relative overflow-hidden text-white shadow-inner`}
                    >
                      {iconFailed ? (
                        <Icon
                          className="w-11 h-11 group-hover:scale-110 transition-transform drop-shadow"
                          aria-hidden="true"
                        />
                      ) : (
                        <img
                          src={appIconUrl(app.name)}
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          decoding="async"
                          onError={() => setFailedIcons((prev) => ({ ...prev, [app.name]: true }))}
                          className="h-16 w-16 rounded-2xl bg-white/95 object-contain p-1.5 shadow-sm drop-shadow transition-transform group-hover:scale-105"
                        />
                      )}
                      <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-sm text-[10px] font-bold text-cyan-200">
                        {sourceLabel(app.source)}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-slate-900 break-words">{app.name}</h4>
                      <span className="text-xs text-slate-500 break-words">{tagline}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                      <span className="truncate" title={app.source}>
                        {app.source}
                      </span>
                      <span className="shrink-0">launch-game</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void handleLaunch(app)}
                      disabled={isLoading}
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      {isLoading ? (
                        <>
                          <Loader2
                            className="w-4 h-4 animate-spin text-emerald-400"
                            aria-hidden="true"
                          />
                          <span>Executing…</span>
                        </>
                      ) : (
                        <>
                          <Rocket className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                          <span>Launch</span>
                        </>
                      )}
                    </button>
                    {state.status === 'success' && (
                      <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1.5 text-center">
                        {state.message}
                      </p>
                    )}
                    {state.status === 'error' && (
                      <p
                        className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 text-center break-words"
                        title={`${state.code}: ${state.message}`}
                      >
                        {state.message} <span className="font-bold">[{state.code}]</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={handleLoadMore}
              className="self-center py-2.5 px-5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold text-xs transition-all shadow-sm active:scale-95"
            >
              Muat lagi ({hiddenCount} tersisa)
            </button>
          )}
        </>
      )}

      {notice && (
        <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}
    </div>
  );
}
