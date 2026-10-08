import { useState } from 'react';
import Header from './components/shared/Header';
import CasualDashboard from './components/casual/CasualDashboard';
import ProDashboard from './components/pro/ProDashboard';
import useSystemMetrics from './hooks/useSystemMetrics';

export default function App() {
  const [isProMode, setIsProMode] = useState<boolean>(false);
  const metrics = useSystemMetrics();

  const handleToggle = (): void => {
    setIsProMode((prev) => !prev);
  };

  return (
    <div
      className={`min-h-screen font-body-md transition-colors duration-300 ${
        isProMode ? 'bg-pro-base text-pro-text' : 'bg-casual-canvas text-casual-text'
      }`}
    >
      <Header isProMode={isProMode} onToggle={handleToggle} />
      {isProMode ? (
        <ProDashboard metrics={metrics} onToggle={handleToggle} />
      ) : (
        <CasualDashboard metrics={metrics} />
      )}
    </div>
  );
}
