import { Bell, Cloud, Gauge, Gamepad2, LayoutGrid, Network, Search, Terminal } from 'lucide-react';
import ToggleSwitch from './ToggleSwitch';

export interface HeaderProps {
  isProMode: boolean;
  onToggle: () => void;
}

const PRO_NAV = ['Console', 'Telemetry Stream', 'Topology'];

export default function Header({ isProMode, onToggle }: HeaderProps) {
  if (isProMode) {
    return (
      <header className="fixed top-0 left-64 right-0 h-16 z-40 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] px-space-lg flex items-center justify-between">
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-space-sm">
            <LayoutGrid className="w-5 h-5 text-primary-container" aria-hidden="true" />
            <span className="font-headline-sm text-headline-sm font-bold text-on-surface tracking-tight">
              Command Hub
            </span>
          </div>
          <div className="h-4 w-[1px] bg-surface-container-highest" aria-hidden="true" />
          <nav className="hidden xl:flex items-center gap-space-md" aria-label="Pro navigation">
            {PRO_NAV.map((item, index) => (
              <button
                key={item}
                type="button"
                className={
                  index === 0
                    ? 'transition-colors text-primary font-semibold font-body-sm text-body-sm'
                    : 'font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors'
                }
              >
                {item}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-space-md">
          <ToggleSwitch isProMode={isProMode} onToggle={onToggle} />
          <div className="h-4 w-[1px] bg-surface-container-highest" aria-hidden="true" />
          <div className="flex items-center gap-space-sm">
            <button
              type="button"
              title="Global Search"
              aria-label="Global search"
              className="w-9 h-9 flex items-center justify-center rounded bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
            >
              <Search className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Alert Feeds"
              aria-label="Alert feeds"
              className="w-9 h-9 flex items-center justify-center rounded bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface relative transition-colors"
            >
              <Bell className="w-[18px] h-[18px]" aria-hidden="true" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-secondary-container" />
            </button>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Terminal className="w-[18px] h-[18px] text-on-primary" aria-hidden="true" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 right-0 h-16 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 flex items-center justify-between shadow-xs">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-sm">
            <Network className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-headline-sm text-[17px] font-bold text-slate-900 tracking-tight">
                Command Hub
              </span>
              <span className="px-1.5 py-[2px] rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                CASUAL
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Workspace Optimizer</span>
          </div>
        </div>
        <div className="h-5 w-[1px] bg-slate-200" aria-hidden="true" />
        <nav
          className="hidden md:flex items-center gap-5 text-[13px] font-medium"
          aria-label="Casual navigation"
        >
          <button
            type="button"
            className="text-emerald-600 font-semibold flex items-center gap-1.5"
          >
            <Gauge className="w-4 h-4" aria-hidden="true" />
            Dashboard
          </button>
          <button
            type="button"
            className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5"
          >
            <Gamepad2 className="w-4 h-4" aria-hidden="true" />
            Games
          </button>
          <button
            type="button"
            className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5"
          >
            <Cloud className="w-4 h-4" aria-hidden="true" />
            AirDrop
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <ToggleSwitch isProMode={isProMode} onToggle={onToggle} />
        <div className="h-4 w-[1px] bg-slate-200" aria-hidden="true" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Search"
            aria-label="Search"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <Search className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Notifications"
            aria-label="Notifications"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 relative transition-colors"
          >
            <Bell className="w-[18px] h-[18px]" aria-hidden="true" />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
          </button>
        </div>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-sm ring-2 ring-slate-100">
          JD
        </div>
      </div>
    </header>
  );
}
