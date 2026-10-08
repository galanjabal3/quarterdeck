import { Terminal } from 'lucide-react';
import ToggleSwitch from '../shared/ToggleSwitch';

interface ModeControllerProps {
  isProMode: boolean;
  onToggle: () => void;
}

export default function ModeController({ isProMode, onToggle }: ModeControllerProps) {
  return (
    <div className="w-full bg-surface-container-low rounded-xl p-space-md shadow-sm flex flex-col md:flex-row items-center justify-between gap-space-md transition-all duration-300">
      <div className="flex items-center gap-space-md min-w-0">
        <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center transition-all duration-300">
          <Terminal className="w-[22px] h-[22px] text-primary-container" aria-hidden="true" />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-space-xs">
            <span className="font-headline-sm text-headline-sm text-primary font-bold tracking-tight">
              Adaptive Command Hub
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

      <div className="flex items-center gap-space-md flex-shrink-0">
        <ToggleSwitch isProMode={isProMode} onToggle={onToggle} />
      </div>
    </div>
  );
}
