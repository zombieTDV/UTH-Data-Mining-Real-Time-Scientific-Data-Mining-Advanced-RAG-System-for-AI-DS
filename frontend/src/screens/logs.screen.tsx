import type { FC } from 'react';
import { ToolLogos } from '../components/logs';
import { LiveTelemetryFeed } from '../components/logs';

export const LogsScreen: FC = () => {
  return (
    <div style={{ maxWidth: '1440px', width: '100%', height: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', padding: '10px 0 40px' }}>
      <ToolLogos />
      <LiveTelemetryFeed />
    </div>
  );
};
