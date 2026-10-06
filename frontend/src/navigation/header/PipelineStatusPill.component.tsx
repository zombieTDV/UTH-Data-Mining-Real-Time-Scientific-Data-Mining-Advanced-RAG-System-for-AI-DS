import type { FC } from 'react';
import { useTranslation } from '../../hooks';
import type { PipelineStatus } from '../../types';

export interface PipelineStatusPillProps {
  pipelineStatus: PipelineStatus;
  streamActive: boolean;
  totalPapers: number;
  totalFormulas?: number;
  totalVectors?: number;
  streamSpeed?: number;
  sessionIngested?: number;
}

export const PipelineStatusPill: FC<PipelineStatusPillProps> = ({
  pipelineStatus,
  streamActive,
  totalPapers,
  totalFormulas = 2220938,
  totalVectors = 143523,
  streamSpeed = 0,
  sessionIngested = 0,
}) => {
  const { language } = useTranslation();

  const isRunning = pipelineStatus === 'RUNNING';

  // Status state color scheme
  const statusColor = isRunning
    ? 'var(--accent-bronze)'
    : streamActive
    ? 'var(--accent-cyan)'
    : 'var(--accent-emerald)';

  const statusGlow = isRunning
    ? '0 0 10px rgba(245, 158, 11, 0.45)'
    : streamActive
    ? '0 0 10px rgba(6, 182, 212, 0.45)'
    : '0 0 8px rgba(16, 185, 129, 0.35)';

  return (
    <div
      title={
        language === 'vi'
          ? `Đồng bộ Lakehouse Thời gian thực:\n• Tổng bài báo: ${totalPapers.toLocaleString()} (11.6k arXiv + 24.7k OpenAlex)\n• Công thức toán học (DuckDB): ${totalFormulas.toLocaleString()}\n• LanceDB Vector Index: ${totalVectors.toLocaleString()} embeddings\n• Trạng thái: ${isRunning ? 'Đang chạy Ingestion/Embedding' : streamActive ? `Đang nhận CDC Stream (${streamSpeed} bài/phút)` : 'Sẵn sàng phục vụ RAG / Mining'}`
          : `Real-Time Lakehouse Sync:\n• Total Works: ${totalPapers.toLocaleString()} (11.6k arXiv + 24.7k OpenAlex)\n• Math Formulas (DuckDB): ${totalFormulas.toLocaleString()}\n• LanceDB Vector Index: ${totalVectors.toLocaleString()} embeddings\n• Status: ${isRunning ? 'Running Ingestion/Embedding' : streamActive ? `Active CDC Stream (${streamSpeed} papers/min)` : 'Standby / Ready for RAG'}`
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        backgroundColor: 'var(--badge-bg)',
        padding: '5px 14px',
        borderRadius: '9999px',
        border: '1px solid var(--badge-border)',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
        fontFamily: 'var(--font-mono)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Dynamic Status Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: statusColor,
            boxShadow: statusGlow,
            animation: isRunning || streamActive ? 'stageGlowOrange 1.2s infinite' : 'none',
          }}
        />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.04em',
            color: statusColor,
          }}
        >
          {isRunning
            ? (language === 'vi' ? 'ĐANG CHẠY PIPELINE' : 'PIPELINE ACTIVE')
            : streamActive
            ? (language === 'vi' ? `CDC STREAM (${streamSpeed}/phút)` : `CDC STREAM (${streamSpeed}/min)`)
            : (language === 'vi' ? 'LAKEHOUSE SẴN SÀNG' : 'LAKEHOUSE READY')}
        </span>
      </div>

      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-subtle)' }} />

      {/* Real-time Metric Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>📄</span>
          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            {totalPapers.toLocaleString()}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {language === 'vi' ? 'bài' : 'works'}
          </span>
          {sessionIngested > 0 && (
            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 800,
                color: 'var(--accent-cyan)',
                backgroundColor: 'rgba(6, 182, 212, 0.12)',
                padding: '0 4px',
                borderRadius: '4px',
              }}
            >
              +{sessionIngested}
            </span>
          )}
        </div>

        <span style={{ color: 'var(--border-subtle)' }}>•</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>∑</span>
          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            {(totalFormulas / 1000000).toFixed(2)}M
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {language === 'vi' ? 'công thức' : 'math'}
          </span>
        </div>

        <span style={{ color: 'var(--border-subtle)' }}>•</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--text-muted)' }}>⚡</span>
          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            {totalVectors.toLocaleString()}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            vectors
          </span>
        </div>
      </div>
    </div>
  );
};
