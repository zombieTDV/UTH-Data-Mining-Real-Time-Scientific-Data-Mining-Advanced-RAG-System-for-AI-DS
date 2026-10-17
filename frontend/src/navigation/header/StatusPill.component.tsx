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

  const tooltipText = isOnline
    ? (language === 'vi'
        ? `FastAPI Backend đang trực tuyến (Nhịp phản hồi: ${lastTelemetryTick || 'vừa xong'})`
        : `FastAPI Backend Online (Heartbeat: ${lastTelemetryTick || 'now'})`)
    : (language === 'vi'
        ? 'Mất kết nối với FastAPI Backend'
        : 'FastAPI Backend Offline');

  return (
    <div
      title={tooltipText}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '2px 8px',
        height: '22px',
        boxSizing: 'border-box',
        borderRadius: '6px',
        fontSize: '9.5px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 800,
        backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.10)' : 'rgba(239, 68, 68, 0.10)',
        color: isOnline ? '#059669' : '#dc2626',
        border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'all 0.2s ease',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: isOnline ? '#10b981' : '#ef4444',
          animation: isOnline ? 'stageGlowEmerald 2s infinite' : 'none',
          flexShrink: 0,
        }}
      />
      <span>
        {isOnline
          ? (lastTelemetryTick ? `FASTAPI: ${lastTelemetryTick}` : 'FASTAPI LIVE')
          : (language === 'vi' ? 'FASTAPI MẤT KẾT NỐI' : 'FASTAPI OFFLINE')}
      </span>
    </div>
  );
};
