import { useState, useEffect, type FC } from 'react';
import type { PipelineStageKey } from './InteractiveWorkflowCanvas.component';

export interface PipelineExecutionStepperProps {
  currentStage: PipelineStageKey;
  isPipelineRunning: boolean;
  onTriggerPipeline?: () => void;
  onSelectStageNode?: (nodeId: string) => void;
  selectedNodeId?: string;
  theme?: 'dark' | 'light';
  language?: 'en' | 'vi';
  isStreaming?: boolean;
}

interface StepDef {
  key: PipelineStageKey;
  nodeId: string;
  titleEn: string;
  titleVi: string;
  subEn: string;
  subVi: string;
  color: string;
  tagEn: string;
  tagVi: string;
}

const STAGES: StepDef[] = [
  {
    key: 'harvest',
    nodeId: 'start-flow',
    titleEn: '1. SOURCE INGEST',
    titleVi: '1. THU THẬP NGUỒN',
    subEn: 'arXiv & OpenAlex',
    subVi: 'arXiv & OpenAlex',
    color: '#8b5cf6',
    tagEn: 'OAI-PMH XML',
    tagVi: 'OAI-PMH XML',
  },
  {
    key: 'bronze',
    nodeId: 'bronze-instance',
    titleEn: '2. CLOUDFLARE R2',
    titleVi: '2. CLOUDFLARE R2',
    subEn: 'Bronze Immutable Lake',
    subVi: 'Hồ thô Bất biến S3',
    color: '#e11d48',
    tagEn: 'Zero-Egress S3',
    tagVi: '0 Phí Egress S3',
  },
  {
    key: 'duckdb',
    nodeId: 'review-duckdb',
    titleEn: '3. DUCKDB SIMD',
    titleVi: '3. DUCKDB SIMD',
    subEn: 'LaTeX & Arrow OLAP',
    subVi: 'LaTeX & OLAP Arrow',
    color: '#f59e0b',
    tagEn: 'Zero-Copy SIMD',
    tagVi: 'Bộ nhớ Zero-Copy',
  },
  {
    key: 'parallel',
    nodeId: 'silver-parquet',
    titleEn: '4. DUAL STORAGE',
    titleVi: '4. LƯU TRỮ KÉP',
    subEn: 'Parquet & LanceDB',
    subVi: 'Parquet & LanceDB',
    color: '#10b981',
    tagEn: 'Silver + Gold',
    tagVi: 'Silver + Gold',
  },
  {
    key: 'completed',
    nodeId: 'grounded-rag',
    titleEn: '5. GROUNDED RAG',
    titleVi: '5. GROUNDED RAG',
    subEn: 'Qwen 2.5 Synthesis',
    subVi: 'Tổng hợp Qwen 2.5',
    color: '#6366f1',
    tagEn: 'Citations Gate',
    tagVi: 'Kiểm duyệt Trích dẫn',
  },
];

export const PipelineExecutionStepper: FC<PipelineExecutionStepperProps> = ({
  currentStage,
  isPipelineRunning,
  onTriggerPipeline,
  onSelectStageNode,
  selectedNodeId,
  theme = 'dark',
  language = 'vi',
  isStreaming = false,
}) => {
  const isDark = theme === 'dark';
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  // Live timer tick during pipeline execution
  useEffect(() => {
    if (!isPipelineRunning) {
      if (currentStage === 'completed') {
        setElapsedMs(6500);
      } else {
        setElapsedMs(0);
      }
      return;
    }

    const start = Date.now();
    setElapsedMs(0);
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 50);

    return () => clearInterval(interval);
  }, [isPipelineRunning, currentStage]);

  // Stage order index: 0 = harvest, 1 = bronze, 2 = duckdb, 3 = parallel, 4 = completed
  const stageOrder: Record<PipelineStageKey, number> = {
    idle: -1,
    harvest: 0,
    bronze: 1,
    duckdb: 2,
    parallel: 3,
    completed: 4,
  };

  const currentIdx = stageOrder[currentStage] ?? -1;

  // Percentage progress
  const getProgressPct = (): number => {
    if (currentStage === 'completed') return 100;
    if (currentStage === 'idle') return 0;
    if (currentStage === 'harvest') return 20;
    if (currentStage === 'bronze') return 40;
    if (currentStage === 'duckdb') return 65;
    if (currentStage === 'parallel') return 88;
    return 0;
  };

  const progressPct = getProgressPct();
  const elapsedFormatted = (Math.min(elapsedMs, 6500) / 1000).toFixed(1);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '8px 14px',
        borderRadius: '12px',
        backgroundColor: isDark ? 'rgba(11, 15, 25, 0.88)' : 'rgba(255, 255, 255, 0.94)',
        border: `1px solid ${
          isPipelineRunning
            ? 'rgba(99, 102, 241, 0.45)'
            : isDark
            ? 'rgba(255, 255, 255, 0.12)'
            : '#e2e8f0'
        }`,
        boxShadow: isPipelineRunning
          ? '0 0 24px rgba(99, 102, 241, 0.25), 0 4px 16px rgba(0, 0, 0, 0.4)'
          : isDark
          ? '0 4px 16px rgba(0, 0, 0, 0.35)'
          : '0 4px 16px rgba(0, 0, 0, 0.06)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 25,
        transition: 'all 0.3s ease',
        userSelect: 'none',
      }}
    >
      {/* Top Row: Controls, Live Timer & Overall Progress Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'nowrap',
        }}
      >
        {/* Left: Execution Status & Trigger Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onTriggerPipeline}
            disabled={isPipelineRunning || isStreaming}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '7px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              letterSpacing: '0.4px',
              cursor: isPipelineRunning || isStreaming ? 'not-allowed' : 'pointer',
              backgroundColor: isPipelineRunning
                ? 'rgba(99, 102, 241, 0.25)'
                : isDark
                ? '#2563eb'
                : '#1d4ed8',
              color: '#ffffff',
              border: isPipelineRunning ? '1px solid rgba(99, 102, 241, 0.6)' : '1px solid transparent',
              boxShadow: isPipelineRunning ? '0 0 12px rgba(99, 102, 241, 0.5)' : '0 2px 6px rgba(37, 99, 235, 0.3)',
              opacity: isStreaming ? 0.6 : 1,
              transition: 'all 0.2s ease',
            }}
          >
            {isPipelineRunning ? (
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTopColor: '#ffffff',
                  animation: 'spin 0.8s linear infinite',
                  display: 'inline-block',
                }}
              />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
            <span>
              {isPipelineRunning
                ? (language === 'vi' ? 'ĐANG CHẠY PIPELINE...' : 'RUNNING PIPELINE...')
                : currentStage === 'completed'
                ? (language === 'vi' ? 'CHẠY LẠI PIPELINE' : 'RE-RUN PIPELINE')
                : (language === 'vi' ? 'CHẠY PIPELINE' : 'RUN PIPELINE')}
            </span>
          </button>

          {/* Timer Chip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 700,
              color: isPipelineRunning ? '#38bdf8' : isDark ? '#94a3b8' : '#475569',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{elapsedFormatted}s</span>
          </div>

          {/* Streaming Indicator if active */}
          {isStreaming && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 800,
                color: '#34d399',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  boxShadow: '0 0 6px #10b981',
                }}
              />
              <span>{language === 'vi' ? 'CDC STREAMING BẬT' : 'CDC STREAMING ON'}</span>
            </div>
          )}
        </div>

        {/* Center/Right: Overall Progress Bar */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px' }}>
          <div
            style={{
              flex: 1,
              height: '6px',
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
              borderRadius: '9999px',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background:
                  progressPct === 100
                    ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                    : 'linear-gradient(90deg, #8b5cf6 0%, #38bdf8 50%, #6366f1 100%)',
                boxShadow:
                  isPipelineRunning
                    ? '0 0 8px rgba(99, 102, 241, 0.8)'
                    : progressPct === 100
                    ? '0 0 8px rgba(16, 185, 129, 0.8)'
                    : 'none',
                transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10.5px',
              fontWeight: 800,
              color: progressPct === 100 ? '#10b981' : isDark ? '#cbd5e1' : '#334155',
              width: '36px',
              textAlign: 'right',
              flexShrink: 0,
            }}
          >
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Bottom Row: 5-Stage Stepper Buttons with Connector Lines */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '8px',
          alignItems: 'stretch',
        }}
      >
        {STAGES.map((step, idx) => {
          const isCurrent = currentStage === step.key;
          const isPassed = currentIdx > idx || currentStage === 'completed';
          const isSelected = selectedNodeId === step.nodeId;

          let badgeBg = isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc';
          let badgeBorder = isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0';
          let textColor = isDark ? '#94a3b8' : '#64748b';
          let titleColor = isDark ? '#f8fafc' : '#0f172a';

          if (isCurrent && isPipelineRunning) {
            badgeBg = isDark ? `${step.color}22` : `${step.color}15`;
            badgeBorder = `${step.color}88`;
            textColor = step.color;
            titleColor = isDark ? '#ffffff' : '#0f172a';
          } else if (isPassed) {
            badgeBg = isDark ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5';
            badgeBorder = isDark ? 'rgba(16, 185, 129, 0.3)' : '#a7f3d0';
            textColor = '#10b981';
          } else if (isSelected) {
            badgeBorder = 'rgba(56, 189, 248, 0.6)';
          }

          return (
            <div
              key={step.key}
              onClick={() => onSelectStageNode?.(step.nodeId)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '6px 8px',
                borderRadius: '8px',
                backgroundColor: badgeBg,
                border: `1px solid ${badgeBorder}`,
                boxShadow: isCurrent && isPipelineRunning ? `0 0 14px ${step.color}44` : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
              title={language === 'vi' ? `Nhấp để xem công cụ ${step.titleVi}` : `Click to inspect ${step.titleEn}`}
            >
              {/* Active Breathing Indicator Strip */}
              {isCurrent && isPipelineRunning && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    backgroundColor: step.color,
                    boxShadow: `0 0 6px ${step.color}`,
                  }}
                />
              )}

              {/* Header inside Step: Step indicator + Tag */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      fontWeight: 900,
                      fontFamily: 'var(--font-mono)',
                      backgroundColor: isPassed
                        ? '#10b981'
                        : isCurrent && isPipelineRunning
                        ? step.color
                        : isDark
                        ? 'rgba(255, 255, 255, 0.12)'
                        : '#cbd5e1',
                      color: '#ffffff',
                      boxShadow: isCurrent && isPipelineRunning ? `0 0 8px ${step.color}` : 'none',
                      flexShrink: 0,
                    }}
                  >
                    {isPassed ? '✔' : idx + 1}
                  </span>

                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                      color: titleColor,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {language === 'vi' ? step.titleVi : step.titleEn}
                  </span>
                </div>

                <span
                  style={{
                    fontSize: '8.5px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    padding: '1px 4px',
                    borderRadius: '4px',
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                    color: textColor,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isCurrent && isPipelineRunning
                    ? (language === 'vi' ? 'ĐANG CHẠY' : 'RUNNING')
                    : isPassed
                    ? (language === 'vi' ? 'HOÀN TẤT' : 'DONE')
                    : (language === 'vi' ? step.tagVi : step.tagEn)}
                </span>
              </div>

              {/* Subtitle */}
              <div
                style={{
                  fontSize: '9.5px',
                  color: isDark ? '#94a3b8' : '#64748b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  paddingLeft: '21px',
                }}
              >
                {language === 'vi' ? step.subVi : step.subEn}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
