import type { FC } from 'react';
import type { PipelineStatus } from '../../types';

export interface PipelineStatusPillProps {
  pipelineStatus: PipelineStatus;
  streamActive: boolean;
  totalPapers: number;
  streamSpeed: number;
}

export const PipelineStatusPill: FC<PipelineStatusPillProps> = ({
  pipelineStatus,
  streamActive,
  totalPapers,
  streamSpeed,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        backgroundColor: 'var(--badge-bg)',
        padding: '6px 16px',
        borderRadius: '9999px',
        border: '1px solid var(--badge-border)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: pipelineStatus === 'RUNNING' ? 'var(--accent-bronze)' : 'var(--accent-emerald)',
          boxShadow: pipelineStatus === 'RUNNING' ? '0 0 8px var(--accent-bronze)' : '0 0 8px var(--accent-emerald)',
          animation: pipelineStatus === 'RUNNING' || streamActive ? 'stageGlowOrange 1.2s infinite' : 'none',
        }}
      />
      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
        {pipelineStatus === 'RUNNING'
          ? 'Pipeline Active: Harvesting arXiv batches, DuckDB Parquet & LanceDB Gold indexing...'
          : streamActive
          ? `Real-Time CDC Stream Active: ${totalPapers.toLocaleString()} papers synced (+${Math.max(0, totalPapers - 13000)} new) · ${streamSpeed} papers/min`
          : `Lakehouse Standby: ${totalPapers.toLocaleString()} papers, 2,220,938 formulas, 143,523 LanceDB vectors synced.`}
      </span>
    </div>
  );
};
