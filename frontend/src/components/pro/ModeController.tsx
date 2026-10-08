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
            High-throughput dev telemetry, process daemons, and live stream monitors
          </span>
        </div>
      </div>

      <div className="flex items-center gap-space-md flex-shrink-0">
        <div className="hidden lg:flex items-center gap-space-md px-space-md py-1.5 rounded-lg bg-surface-container-lowest">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Telemetry
            </span>
            <span className="font-code-md text-code-md text-primary-fixed-dim">
              99.98% OPS // 12ms
            </span>
          </div>
          <div className="w-[1px] h-6 bg-surface-container-highest" aria-hidden="true" />
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Cluster State
            </span>
            <span className="font-code-md text-code-md text-primary-container flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-container animate-pulse" />
              ACTIVE
            </span>
          </div>
        </div>

        <ToggleSwitch isProMode={isProMode} onToggle={onToggle} />

        <div className="hidden sm:flex items-center text-outline font-label-sm text-label-sm tracking-wider">
          <kbd className="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface font-code-md text-code-md">
            P
          </kbd>
          <span className="ml-1 opacity-70">toggle</span>
        </div>
      </div>
    </div>
  );
}
