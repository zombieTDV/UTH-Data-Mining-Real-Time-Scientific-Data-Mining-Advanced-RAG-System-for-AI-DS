import type { FC } from 'react';
import { StatusPill } from './StatusPill.component';
import { PipelineStatusPill } from './PipelineStatusPill.component';
import { SyncR2Button } from './SyncR2Button.component';
import { RunPipelineButton } from './RunPipelineButton.component';
import { useTranslation } from '../../hooks';
import type { BackendStatus, PipelineStatus } from '../../types';

export interface HeaderBarProps {
  backendStatus: BackendStatus;
  lastTelemetryTick: string;
  pipelineStatus: PipelineStatus;
  streamActive: boolean;
  totalPapers: number;
  totalFormulas?: number;
  totalVectors?: number;
  sessionIngested?: number;
  streamSpeed: number;
  onTriggerPipeline: () => void;
}

export const HeaderBar: FC<HeaderBarProps> = ({
  backendStatus,
  lastTelemetryTick,
  pipelineStatus,
  streamActive,
  totalPapers,
  totalFormulas = 2765395,
  totalVectors = 913205,
  sessionIngested = 0,
  streamSpeed,
  onTriggerPipeline,
}) => {
  const { language } = useTranslation();

  return (
    <header
      style={{
        height: '56px',
        flexShrink: 0,
        backgroundColor: 'var(--header-bg)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--header-border)',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 40,
        gap: '16px',
      }}
    >
      {/* Brand & University Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '0.04em', color: 'var(--text-primary)' }}>
              {language === 'vi' ? 'LAKEHOUSE DỮ LIỆU KHOA HỌC UTH' : 'UTH SCIENTIFIC LAKEHOUSE & MINING'}
            </span>
            <StatusPill backendStatus={backendStatus} lastTelemetryTick={lastTelemetryTick} />
          </div>
          <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.02em' }}>
            {language === 'vi'
              ? 'TRƯỜNG ĐẠI HỌC GIAO THÔNG VẬN TẢI TP.HCM (UTH)'
              : 'HO CHI MINH CITY UNIVERSITY OF TRANSPORT (UTH)'}
          </span>
        </div>
      </div>

      {/* Real-time Synchronized Status Center ("Cục này") */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minWidth: 0 }}>
        <PipelineStatusPill
          pipelineStatus={pipelineStatus}
          streamActive={streamActive}
          totalPapers={totalPapers}
          totalFormulas={totalFormulas}
          totalVectors={totalVectors}
          streamSpeed={streamSpeed}
          sessionIngested={sessionIngested}
        />
      </div>

      {/* Right Controls: Sync Live R2 Button + Pipeline Action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <SyncR2Button />
        <RunPipelineButton pipelineStatus={pipelineStatus} onClick={onTriggerPipeline} />
      </div>
    </header>
  );
};
