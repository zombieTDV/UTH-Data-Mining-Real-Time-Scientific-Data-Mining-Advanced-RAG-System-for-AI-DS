import type { FC } from 'react';
import type { BackendStatus } from '../../types';

export interface StatusPillProps {
  backendStatus: BackendStatus;
  lastTelemetryTick: string;
}

export const StatusPill: FC<StatusPillProps> = ({ backendStatus, lastTelemetryTick }) => {
  return (
    <span
      style={{
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        color: backendStatus === 'ONLINE' ? 'var(--accent-emerald)' : '#ef4444',
        backgroundColor: backendStatus === 'ONLINE' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
        padding: '2px 7px',
        borderRadius: '5px',
        fontWeight: 800,
      }}
    >
      ● FASTAPI {backendStatus} {lastTelemetryTick ? `[${lastTelemetryTick}]` : ''}
    </span>
  );
};
