import type { SystemMetricsState } from '../../hooks/useSystemMetrics';
import FastOps from './FastOps';
import ModeController from './ModeController';
import ProSidebar from './ProSidebar';
import ServerManager from './ServerManager';
import StatusGrid from './StatusGrid';
import TerminalLog from './TerminalLog';

export interface ProDashboardProps {
  metrics: SystemMetricsState;
  onToggle: () => void;
}

export default function ProDashboard({ metrics, onToggle }: ProDashboardProps) {
  return (
    <>
      <ProSidebar metrics={metrics} />
      <div className="pl-64 flex flex-col min-h-screen">
        <main className="w-full pt-16 bg-surface flex-1">
          <div className="w-full transition-all duration-300 ease-out px-gutter-lg py-space-lg flex flex-col gap-space-lg text-on-surface">
            <ModeController isProMode onToggle={onToggle} />

            <div className="w-full flex flex-col gap-space-lg transition-opacity duration-300">
              <StatusGrid metrics={metrics} />

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg">
                <div className="xl:col-span-5 flex flex-col gap-space-md">
                  <ServerManager />
                  <FastOps />
                </div>
                <div className="xl:col-span-7 flex flex-col">
                  <TerminalLog />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
