import type { FC } from 'react';
import { StatusPill } from './StatusPill.component';
import { PipelineStatusPill } from './PipelineStatusPill.component';
import { StorageMeter } from './StorageMeter.component';
import { RunPipelineButton } from './RunPipelineButton.component';
import { ThemeToggle } from './ThemeToggle.component';
import { LanguageToggle } from './LanguageToggle.component';
import type { BackendStatus, PipelineStatus } from '../../types';

export interface HeaderBarProps {
  backendStatus: BackendStatus;
  lastTelemetryTick: string;
  pipelineStatus: PipelineStatus;
  streamActive: boolean;
  totalPapers: number;
  streamSpeed: number;
  storageUsedGb: number;
  storageUsedPct: number;
  onTriggerPipeline: () => void;
}

export const HeaderBar: FC<HeaderBarProps> = ({
  backendStatus,
  lastTelemetryTick,
  pipelineStatus,
  streamActive,
  totalPapers,
  streamSpeed,
  storageUsedGb,
  storageUsedPct,
  onTriggerPipeline,
}) => {
  return (
    <header
      style={{
        height: '52px',
        flexShrink: 0,
        backgroundColor: 'var(--header-bg)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--header-border)',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 40,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-primary)' }}>
          UTH SCIENTIFIC LAKEHOUSE &amp; MINING PIPELINE
        </span>
        <StatusPill backendStatus={backendStatus} lastTelemetryTick={lastTelemetryTick} />
      </div>

      <PipelineStatusPill
        pipelineStatus={pipelineStatus}
        streamActive={streamActive}
        totalPapers={totalPapers}
        streamSpeed={streamSpeed}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <ThemeToggle />
        <LanguageToggle />
        <StorageMeter
          storageUsedGb={storageUsedGb}
          storageUsedPct={storageUsedPct}
          totalPapers={totalPapers}
        />
        <RunPipelineButton pipelineStatus={pipelineStatus} onClick={onTriggerPipeline} />
      </div>
    </header>
  );
};
