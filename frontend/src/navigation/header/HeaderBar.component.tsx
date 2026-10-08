import type { FC } from 'react';
import { StatusPill } from './StatusPill.component';
import { PipelineStatusPill } from './PipelineStatusPill.component';
import { StorageMeter } from './StorageMeter.component';
import { RunPipelineButton } from './RunPipelineButton.component';
import { LanguageToggle } from './LanguageToggle.component';
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
  storageUsedGb: number;
  storageUsedPct: number;
  onTriggerPipeline: () => void;
  onOpenStorageLens?: () => void;
}

export const HeaderBar: FC<HeaderBarProps> = ({
  backendStatus,
  lastTelemetryTick,
  pipelineStatus,
  streamActive,
  totalPapers,
  totalFormulas = 2220938,
  totalVectors = 164702,
  sessionIngested = 0,
  streamSpeed,
  storageUsedGb,
  storageUsedPct,
  onTriggerPipeline,
  onOpenStorageLens,
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
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
            flexShrink: 0,
          }}
          title={language === 'vi' ? 'Trường Đại học Giao thông Vận tải TP.HCM (UTH)' : 'Ho Chi Minh City University of Transport (UTH)'}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
        </div>

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

      {/* Right Controls: Visual Storage Meter + Segmented Language Switch + Pipeline Action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <StorageMeter
          storageUsedGb={storageUsedGb}
          storageUsedPct={storageUsedPct}
          totalPapers={totalPapers}
          onClick={onOpenStorageLens}
        />
        <LanguageToggle />
        <RunPipelineButton pipelineStatus={pipelineStatus} onClick={onTriggerPipeline} />
      </div>
    </header>
  );
};
