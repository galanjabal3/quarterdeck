import { Sun, Terminal } from 'lucide-react';

export interface ToggleSwitchProps {
  isProMode: boolean;
  onToggle: () => void;
  className?: string;
}

export default function ToggleSwitch({ isProMode, onToggle, className = '' }: ToggleSwitchProps) {
  const containerClass = isProMode
    ? 'bg-surface-container-low shadow-[0_1px_8px_rgba(0,0,0,0.04)] rounded-full'
    : 'bg-slate-100 border border-slate-200 shadow-inner rounded-pill';

  const thumbClass = isProMode ? 'bg-surface-container-high' : 'bg-white shadow-sm';

  const casualLabelClass = isProMode
    ? 'text-on-surface-variant hover:text-on-surface'
    : 'text-emerald-700 font-semibold';

  const proLabelClass = isProMode
    ? 'text-primary-container font-semibold'
    : 'text-slate-500 hover:text-slate-800 font-medium';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isProMode}
      aria-label={isProMode ? 'Aktifkan Pro HUD mode' : 'Aktifkan Casual mode'}
      title={isProMode ? 'Pro High-Density Terminal Mode' : 'Casual Workspace Mode'}
      onClick={onToggle}
      className={`relative inline-flex items-center p-1 transition-all duration-200 ${containerClass} ${className}`}
    >
      <span className="relative grid grid-cols-2">
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-1/2 rounded-full transition-transform duration-200 ${
            isProMode ? 'translate-x-full' : 'translate-x-0'
          } ${thumbClass}`}
        />
        <span
          className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1 text-xs transition-colors ${casualLabelClass}`}
        >
          <Sun className="w-[15px] h-[15px]" />
          <span className="font-body-sm">Casual</span>
        </span>
        <span
          className={`relative z-10 flex items-center justify-center gap-1.5 px-3 py-1 transition-colors ${proLabelClass}`}
        >
          <Terminal className="w-4 h-4" />
          <span className="font-label-sm text-label-sm uppercase tracking-wider">Pro HUD</span>
        </span>
      </span>
    </button>
  );
}
