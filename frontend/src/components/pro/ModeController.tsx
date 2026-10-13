import { Terminal } from 'lucide-react';

// ToggleSwitch sengaja tidak ada di sini — Header adalah satu-satunya lokasi toggle Pro/Casual.
export default function ModeController() {
  return (
    <div className="w-full bg-surface-container-low rounded-xl p-space-md shadow-sm flex flex-col md:flex-row items-center justify-between gap-space-md transition-all duration-300">
      <div className="flex items-center gap-space-md min-w-0">
        <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center transition-all duration-300">
          <Terminal className="w-[22px] h-[22px] text-primary-container" aria-hidden="true" />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-space-xs">
            <span className="font-headline-sm text-headline-sm text-primary font-bold tracking-tight">
              Quarterdeck
            </span>
            <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded bg-surface-container-high text-primary-fixed uppercase tracking-wider">
              [ PRO HUD ]
            </span>
          </div>
          <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
            Local system metrics, app launcher, and whitelisted OS actions
          </span>
        </div>
      </div>
    </div>
  );
}
