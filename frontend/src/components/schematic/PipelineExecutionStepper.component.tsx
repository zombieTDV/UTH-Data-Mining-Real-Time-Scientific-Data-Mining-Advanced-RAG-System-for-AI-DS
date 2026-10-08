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
  stepNum: number;
  shortTitleEn: string;
  shortTitleVi: string;
  fullTitleEn: string;
  fullTitleVi: string;
  color: string;
  engine: string;
}

const STAGES: StepDef[] = [
  {
    key: 'harvest',
    nodeId: 'start-flow',
    stepNum: 1,
    shortTitleEn: '1. Ingest',
    shortTitleVi: '1. Thu Thập',
    fullTitleEn: 'Source Ingest (arXiv + OpenAlex)',
    fullTitleVi: 'Thu thập Nguồn (arXiv + OpenAlex)',
    color: '#8b5cf6',
    engine: 'OAI-PMH XML',
  },
  {
    key: 'bronze',
    nodeId: 'bronze-instance',
    stepNum: 2,
    shortTitleEn: '2. Bronze R2',
    shortTitleVi: '2. Hồ Thô R2',
    fullTitleEn: 'Cloudflare R2 Object Storage',
    fullTitleVi: 'Hồ Thô Bất Biến Cloudflare R2',
    color: '#e11d48',
    engine: 'Zero-Egress S3',
  },
  {
    key: 'duckdb',
    nodeId: 'review-duckdb',
    stepNum: 3,
    shortTitleEn: '3. DuckDB',
    shortTitleVi: '3. DuckDB OLAP',
    fullTitleEn: 'DuckDB Vectorized SIMD OLAP',
    fullTitleVi: 'Xử lý Vectorized SIMD DuckDB',
    color: '#f59e0b',
    engine: 'Arrow Memory',
  },
  {
    key: 'parallel',
    nodeId: 'silver-parquet',
    stepNum: 4,
    shortTitleEn: '4. Dual Storage',
    shortTitleVi: '4. Lưu Trữ Kép',
    fullTitleEn: 'Dual Storage (Parquet + LanceDB)',
    fullTitleVi: 'Lưu Trữ Kép (Parquet + LanceDB)',
    color: '#10b981',
    engine: 'Snappy + IVF-PQ',
  },
  {
    key: 'completed',
    nodeId: 'grounded-rag',
    stepNum: 5,
    shortTitleEn: '5. Grounded RAG',
    shortTitleVi: '5. Grounded RAG',
    fullTitleEn: 'Grounded RAG (Qwen 2.5 QA)',
    fullTitleVi: 'Tổng Hợp RAG Qwen 2.5',
    color: '#6366f1',
    engine: 'Verified Citations',
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
        padding: '10px 18px',
        borderRadius: '12px',
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.92)' : '#ffffff',
        border: `1px solid ${
          isPipelineRunning
            ? (isDark ? 'rgba(99, 102, 241, 0.5)' : '#818cf8')
            : isDark
            ? 'rgba(255, 255, 255, 0.12)'
            : '#e2e8f0'
        }`,
        boxShadow: isPipelineRunning
          ? (isDark ? '0 0 24px rgba(99, 102, 241, 0.3)' : '0 4px 20px rgba(99, 102, 241, 0.15)')
          : isDark
          ? '0 4px 20px rgba(0, 0, 0, 0.35)'
          : '0 2px 12px rgba(0, 0, 0, 0.05)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        zIndex: 25,
        transition: 'all 0.25s ease',
        userSelect: 'none',
      }}
    >
      {/* Left: Execution Controls & Live Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {/* Trigger Button */}
        <button
          type="button"
          onClick={onTriggerPipeline}
          disabled={isPipelineRunning || isStreaming}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            cursor: isPipelineRunning || isStreaming ? 'not-allowed' : 'pointer',
            backgroundColor: isPipelineRunning
              ? (isDark ? 'rgba(99, 102, 241, 0.25)' : '#e0e7ff')
              : isDark
              ? '#2563eb'
              : '#1d4ed8',
            color: isPipelineRunning && !isDark ? '#4338ca' : '#ffffff',
            border: isPipelineRunning
              ? '1px solid rgba(99, 102, 241, 0.6)'
              : '1px solid transparent',
            boxShadow: isPipelineRunning
              ? '0 0 12px rgba(99, 102, 241, 0.4)'
              : '0 2px 6px rgba(37, 99, 235, 0.25)',
            opacity: isStreaming ? 0.65 : 1,
            transition: 'all 0.2s ease',
          }}
        >
          {isPipelineRunning ? (
            <span
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                border: isDark ? '2px solid rgba(255, 255, 255, 0.3)' : '2px solid rgba(67, 56, 202, 0.3)',
                borderTopColor: isDark ? '#ffffff' : '#4338ca',
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
              ? (language === 'vi' ? 'ĐANG CHẠY...' : 'RUNNING...')
              : currentStage === 'completed'
              ? (language === 'vi' ? 'CHẠY LẠI' : 'RE-RUN')
              : (language === 'vi' ? 'CHẠY PIPELINE' : 'RUN PIPELINE')}
          </span>
        </button>

        {/* Live Timer Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '7px',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            fontWeight: 700,
            color: isPipelineRunning ? '#38bdf8' : isDark ? '#cbd5e1' : '#334155',
          }}
          title={language === 'vi' ? 'Thời gian thực thi pipeline' : 'Pipeline execution time'}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{elapsedFormatted}s</span>
        </div>

        {/* CDC Streaming Live Indicator */}
        {isStreaming && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '7px',
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
              border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.35)' : '#a7f3d0'}`,
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 700,
              color: isDark ? '#34d399' : '#059669',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px #10b981',
              }}
            />
            <span>{language === 'vi' ? 'CDC BẬT' : 'CDC ON'}</span>
          </div>
        )}
      </div>

      {/* Subtle Vertical Divider */}
      <div
        style={{
          width: '1px',
          height: '26px',
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0',
          flexShrink: 0,
        }}
      />

      {/* Center: Connected Pipeline Timeline Track */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
          minWidth: 0,
        }}
      >
        {STAGES.map((step, idx) => {
          const isCurrent = currentStage === step.key;
          const isPassed = currentIdx > idx || currentStage === 'completed';
          const isSelected = selectedNodeId === step.nodeId;

          // Connector line styling after this stage (except the last one)
          const isLast = idx === STAGES.length - 1;
          const railPassed = currentIdx > idx || currentStage === 'completed';
          const railActive = isCurrent && isPipelineRunning;

          return (
            <div
              key={step.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                flex: isLast ? '0 0 auto' : '1 1 0',
                minWidth: 0,
              }}
            >
              {/* Interactive Stage Pill Node */}
              <button
                type="button"
                onClick={() => onSelectStageNode?.(step.nodeId)}
                title={
                  language === 'vi'
                    ? `${step.fullTitleVi} (${step.engine})`
                    : `${step.fullTitleEn} (${step.engine})`
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  backgroundColor: isCurrent && isPipelineRunning
                    ? (isDark ? `${step.color}22` : `${step.color}15`)
                    : isSelected
                    ? (isDark ? 'rgba(56, 189, 248, 0.15)' : '#f0f9ff')
                    : isPassed
                    ? (isDark ? 'rgba(16, 185, 129, 0.12)' : '#f0fdf4')
                    : (isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc'),
                  border: isCurrent && isPipelineRunning
                    ? `1.5px solid ${step.color}`
                    : isSelected
                    ? '1.5px solid #38bdf8'
                    : isPassed
                    ? `1px solid ${isDark ? 'rgba(16, 185, 129, 0.35)' : '#bbf7d0'}`
                    : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                }}
              >
                {/* Step Circle Indicator */}
                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: isPassed
                      ? '#10b981'
                      : isCurrent && isPipelineRunning
                      ? step.color
                      : isDark
                      ? 'rgba(255, 255, 255, 0.12)'
                      : '#cbd5e1',
                    color: isPassed || (isCurrent && isPipelineRunning) ? '#ffffff' : (isDark ? '#94a3b8' : '#475569'),
                    boxShadow: isCurrent && isPipelineRunning
                      ? `0 0 10px ${step.color}`
                      : isPassed
                      ? '0 0 6px rgba(16, 185, 129, 0.4)'
                      : 'none',
                    flexShrink: 0,
                  }}
                >
                  {isPassed ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    step.stepNum
                  )}
                </div>

                {/* Stage Label Text */}
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: isCurrent || isPassed ? 700 : 600,
                    fontFamily: 'var(--font-sans, system-ui)',
                    color: isCurrent && isPipelineRunning
                      ? step.color
                      : isPassed
                      ? (isDark ? '#e2e8f0' : '#0f172a')
                      : (isDark ? '#94a3b8' : '#64748b'),
                    whiteSpace: 'nowrap',
                  }}
                >
                  {language === 'vi' ? step.shortTitleVi : step.shortTitleEn}
                </span>
              </button>

              {/* Connecting Rail Line between Stage Nodes */}
              {!isLast && (
                <div
                  style={{
                    flex: 1,
                    height: '3px',
                    margin: '0 6px',
                    minWidth: '16px',
                    backgroundColor: railPassed
                      ? '#10b981'
                      : railActive
                      ? step.color
                      : isDark
                      ? 'rgba(255, 255, 255, 0.12)'
                      : '#e2e8f0',
                    borderRadius: '2px',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: railPassed
                      ? '0 0 4px rgba(16, 185, 129, 0.4)'
                      : railActive
                      ? `0 0 6px ${step.color}`
                      : 'none',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {railActive && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        width: '40%',
                        backgroundColor: '#ffffff',
                        boxShadow: `0 0 8px #ffffff`,
                        animation: 'conduitParticleStream 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Subtle Vertical Divider */}
      <div
        style={{
          width: '1px',
          height: '26px',
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0',
          flexShrink: 0,
        }}
      />

      {/* Right: Progress Metric Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '56px',
            height: '6px',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
            borderRadius: '9999px',
            overflow: 'hidden',
          }}
          title={language === 'vi' ? `Tiến độ hoàn tất: ${progressPct}%` : `Progress: ${progressPct}%`}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              background:
                progressPct === 100
                  ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                  : 'linear-gradient(90deg, #8b5cf6 0%, #38bdf8 100%)',
              boxShadow: progressPct === 100 ? '0 0 6px #10b981' : 'none',
              transition: 'width 0.35s ease',
            }}
          />
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            fontWeight: 800,
            color: progressPct === 100 ? '#10b981' : isDark ? '#e2e8f0' : '#1e293b',
            minWidth: '36px',
            textAlign: 'right',
          }}
        >
          {progressPct}%
        </span>
      </div>
    </div>
  );
};
