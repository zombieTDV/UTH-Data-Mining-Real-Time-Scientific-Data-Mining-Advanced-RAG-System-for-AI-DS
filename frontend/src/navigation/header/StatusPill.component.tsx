import type { FC } from 'react';
import type { BackendStatus } from '../../types';
import { useTranslation } from '../../hooks';

export interface StatusPillProps {
  backendStatus: BackendStatus;
  lastTelemetryTick: string;
}

export const StatusPill: FC<StatusPillProps> = ({ backendStatus, lastTelemetryTick }) => {
  const { language } = useTranslation();
  const isOnline = backendStatus === 'ONLINE';
  const statusText = isOnline
    ? (language === 'vi' ? 'TRỰC TUYẾN' : 'ONLINE')
    : (language === 'vi' ? 'MẤT KẾT NỐI' : 'OFFLINE');

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '9.5px',
        fontFamily: 'var(--font-mono)',
        color: isOnline ? 'var(--accent-emerald)' : '#ef4444',
        backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
        padding: '2px 7px',
        borderRadius: '5px',
        border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
        fontWeight: 800,
      }}
    >
      <span
        style={{
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          backgroundColor: isOnline ? 'var(--accent-emerald)' : '#ef4444',
          boxShadow: isOnline ? '0 0 6px var(--accent-emerald)' : 'none',
        }}
      />
      FASTAPI {statusText} {lastTelemetryTick ? `[${lastTelemetryTick}]` : ''}
    </span>
  );
};
