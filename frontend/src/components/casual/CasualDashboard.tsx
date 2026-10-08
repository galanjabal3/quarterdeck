import type { SystemMetricsState } from '../../hooks/useSystemMetrics';
import CasualTopBar from './CasualTopBar';
import GameLauncher from './GameLauncher';
import StorageOptimizer from './StorageOptimizer';
import UniversalDrop from './UniversalDrop';

export interface CasualDashboardProps {
  metrics: SystemMetricsState;
}

export default function CasualDashboard({ metrics }: CasualDashboardProps) {
  return (
    <div className="w-full flex flex-col min-h-screen bg-casual-canvas">
      <main className="w-full pt-16 bg-casual-canvas flex-1 min-h-[calc(100vh-64px)] pb-12">
        <div className="w-full px-gutter-lg py-space-lg">
          <div className="max-w-7xl mx-auto w-full flex flex-col gap-6">
            <CasualTopBar metrics={metrics} />
            <StorageOptimizer metrics={metrics} />
            <GameLauncher />
            <UniversalDrop />
          </div>
        </div>
      </main>
    </div>
  );
}
