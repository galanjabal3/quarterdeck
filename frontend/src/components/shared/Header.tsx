import { LayoutGrid, Network } from 'lucide-react';
import ToggleSwitch from './ToggleSwitch';

export interface HeaderProps {
  isProMode: boolean;
  onToggle: () => void;
}

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
        </div>

        <div className="flex items-center gap-space-md">
          <ToggleSwitch isProMode={isProMode} onToggle={onToggle} />
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
      </div>

      <div className="flex items-center gap-4">
        <ToggleSwitch isProMode={isProMode} onToggle={onToggle} />
      </div>
    </header>
  );
}
