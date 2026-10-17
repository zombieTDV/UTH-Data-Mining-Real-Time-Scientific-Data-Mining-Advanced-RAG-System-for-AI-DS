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
  totalSizeGb?: number;
  ingestionPpm?: number;
  dedupRatePct?: number;
  bucketName?: string;
}

export const PipelineStatusPill: FC<PipelineStatusPillProps> = ({
  pipelineStatus,
  streamActive,
  totalPapers,
  totalFormulas = 2765395,
  totalVectors = 913205,
  streamSpeed = 0,
  sessionIngested = 0,
  totalSizeGb = 8.28,
  ingestionPpm = 32.4,
  dedupRatePct = 14.8,
  bucketName = 'scientific-rag-lakehouse',
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

  const tooltipContent =
    language === 'vi'
      ? `TRUNG TÂM GIÁM SÁT HẠ TẦNG & DỮ LIỆU LAKEHOUSE:
• Cloudflare R2 Bucket: ${bucketName}
• Quy mô lưu trữ Lakehouse: ${totalSizeGb.toFixed(2)} GB (Bronze/Silver/Gold)
• Tốc độ thu nạp (CDC): ${ingestionPpm} PPM | Khử trùng lặp (Dedup): ${dedupRatePct}%
• Toàn văn bài báo đã xác minh: ${totalPapers.toLocaleString()} bài
• Công thức toán học (DuckDB AST): ${totalFormulas.toLocaleString()}
• LanceDB Vector Embeddings (IVF-PQ 768-dim): ${totalVectors.toLocaleString()} vectors
• Trạng thái: ${isRunning ? 'Đang chạy Ingestion/Embedding Pipeline' : streamActive ? `Đang nhận CDC Stream (${streamSpeed} bài/phút)` : 'Lakehouse Sẵn sàng phục vụ RAG & Mining'}`
      : `LAKEHOUSE INFRASTRUCTURE & DATA TELEMETRY CENTER:
• Cloudflare R2 Bucket: ${bucketName}
• Lakehouse Storage Footprint: ${totalSizeGb.toFixed(2)} GB (Bronze/Silver/Gold)
• Ingestion Rate (CDC): ${ingestionPpm} PPM | Deduplication Rate: ${dedupRatePct}%
• Verified Full-Text Papers: ${totalPapers.toLocaleString()} works
• Mathematical Formulas (DuckDB AST): ${totalFormulas.toLocaleString()}
• LanceDB Vector Index (IVF-PQ 768-dim): ${totalVectors.toLocaleString()} embeddings
• Status: ${isRunning ? 'Running Ingestion/Embedding Pipeline' : streamActive ? `Active CDC Stream (${streamSpeed} papers/min)` : 'Lakehouse Operational / Ready for RAG & Mining'}`;

  return (
    <div
      title={tooltipContent}
      className="header-pill-container"
    >
      {/* 1. Live Pipeline Status Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: statusColor,
            boxShadow: statusGlow,
            animation: isRunning || streamActive ? 'stageGlowOrange 1.2s infinite' : 'none',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: '10px',
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

      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-subtle)', flexShrink: 0 }} />

      {/* 2. Core Data Corpus Metric Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px', flexShrink: 0 }}>
        {/* Papers / Works */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            <AnimatedCounter value={totalPapers} />
          </span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {language === 'vi' ? 'bài' : 'works'}
          </span>
          {sessionIngested > 0 && (
            <span
              style={{
                fontSize: '9px',
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

        {/* Math Formulas */}
        <div className="header-pill-formulas" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--border-subtle)', fontSize: '9px', marginRight: '3px' }}>•</span>
          <span style={{ color: '#ea580c', fontWeight: 900, fontSize: '10.5px' }}>∑</span>
          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            <AnimatedCounter
              value={totalFormulas}
              formatter={(v) => `${(v / 1000000).toFixed(2)}M`}
            />
          </span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {language === 'vi' ? 'toán' : 'math'}
          </span>
        </div>

        {/* LanceDB Vectors */}
        <div className="header-pill-vectors" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: 'var(--border-subtle)', fontSize: '9px', marginRight: '3px' }}>•</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            <AnimatedCounter value={totalVectors} />
          </span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            vec
          </span>
        </div>
      </div>
    </div>
  );
};

