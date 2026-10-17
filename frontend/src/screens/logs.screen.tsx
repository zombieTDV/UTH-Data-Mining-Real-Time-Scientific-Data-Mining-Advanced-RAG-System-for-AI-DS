import type { FC } from 'react';
import { LiveTelemetryFeed } from '../components/logs';

export const LogsScreen: FC = () => {
  return (
    <div
      style={{
        maxWidth: '1440px',
        width: '100%',
        height: '100%',
        flex: 1,
        minHeight: 0,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <LiveTelemetryFeed />
    </div>
  );
};
