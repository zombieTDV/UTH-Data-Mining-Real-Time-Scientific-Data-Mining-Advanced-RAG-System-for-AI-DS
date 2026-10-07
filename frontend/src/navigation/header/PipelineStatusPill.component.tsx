import type { FC } from 'react';
import { useTranslation } from '../../hooks';
import type { PipelineStatus } from '../../types';
import { AnimatedCounter } from '../../components/common';

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
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        backgroundColor: 'var(--badge-bg)',
        padding: '0 12px',
        height: '32px',
        boxSizing: 'border-box',
        borderRadius: '8px',
        border: '1px solid var(--badge-border)',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
        fontFamily: 'var(--font-mono)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Live Status Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: statusColor,
            boxShadow: statusGlow,
            animation: isRunning || streamActive ? 'stageGlowOrange 1.2s infinite' : 'none',
          }}
        />
        <span
          style={{
            fontSize: '10.5px',
            fontWeight: 800,
            letterSpacing: '0.04em',
            color: statusColor,
            whiteSpace: 'nowrap',
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

      {/* Real-time Metric Micro-Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
        {/* 1. Papers / Works */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            <AnimatedCounter value={totalPapers} />
          </span>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
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
              <AnimatedCounter value={sessionIngested} prefix="+" />
            </span>
          )}
        </div>

        <span style={{ color: 'var(--border-subtle)', fontSize: '9px' }}>•</span>

        {/* 2. Math Formulas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: '#f59e0b', fontWeight: 900, fontSize: '11px' }}>∑</span>
          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            <AnimatedCounter
              value={totalFormulas}
              formatter={(v) => `${(v / 1000000).toFixed(2)}M`}
            />
          </span>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
            {language === 'vi' ? 'công thức' : 'math'}
          </span>
        </div>

        <span style={{ color: 'var(--border-subtle)', fontSize: '9px' }}>•</span>

        {/* 3. LanceDB Vectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            <AnimatedCounter value={totalVectors} />
          </span>
          <span style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
            vectors
          </span>
        </div>
      </div>
    </div>
  );
};
