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

export const PipelineExecutionStepper: FC<PipelineExecutionStepperProps> = ({
  currentStage,
  isPipelineRunning,
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

  // Stage order and progress calculation
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

  // Dynamic telemetry status badge configuration
  const getStageTelemetry = () => {
    if (currentStage === 'harvest') {
      return {
        badge: language === 'vi' ? '⚡ CHẶNG 1: THU THẬP NGUỒN' : '⚡ STAGE 1: SOURCE INGEST',
        detail: language === 'vi' ? 'arXiv OAI-PMH & OpenAlex REST API' : 'arXiv OAI-PMH & OpenAlex REST',
        color: '#8b5cf6',
      };
    }
    if (currentStage === 'bronze') {
      return {
        badge: language === 'vi' ? '⚡ CHẶNG 2: HỒ THÔ BẤT BIẾN' : '⚡ STAGE 2: BRONZE LAKE',
        detail: language === 'vi' ? 'Cloudflare R2 Object Storage (8.28 GB)' : 'Cloudflare R2 (8.28 GB)',
        color: '#e11d48',
      };
    }
    if (currentStage === 'duckdb') {
      return {
        badge: language === 'vi' ? '⚡ CHẶNG 3: BÓC TÁCH SIMD OLAP' : '⚡ STAGE 3: VECTORIZED SIMD',
        detail: language === 'vi' ? 'DuckDB + 2,220,938 Công Thức Toán LaTeX' : 'DuckDB + 2.22M LaTeX Formulas',
        color: '#f59e0b',
      };
    }
    if (currentStage === 'parallel') {
      return {
        badge: language === 'vi' ? '⚡ CHẶNG 4: LƯU TRỮ SONG SONG' : '⚡ STAGE 4: DUAL STORAGE',
        detail: language === 'vi' ? 'Nhánh Kép: Parquet Cột + LanceDB Vector' : 'Dual: Columnar Parquet + LanceDB Vectors',
        color: '#10b981',
      };
    }
    if (currentStage === 'completed') {
      return {
        badge: language === 'vi' ? '✓ HOÀN TẤT TOÀN BỘ 5/5 CHẶNG' : '✓ ALL 5/5 STAGES PRIMED',
        detail: language === 'vi' ? 'Hội Tụ Tri Thức Sẵn Sàng Grounded RAG' : 'Grounded RAG Primed for Queries',
        color: '#6366f1',
      };
    }
    return {
      badge: language === 'vi' ? '● HỆ THỐNG SẴN SÀNG' : '● SYSTEM READY',
      detail: language === 'vi' ? 'Hồ Dữ Liệu Hoạt Động: 8.28 GB / 10 GB (82.8%)' : 'Active Lakehouse: 8.28 GB / 10 GB (82.8%)',
      color: '#38bdf8',
    };
  };

  const telemetry = getStageTelemetry();

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '5px 16px',
        minHeight: '34px',
        borderRadius: '8px',
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.94)' : '#ffffff',
        border: `1px solid ${
          isPipelineRunning
            ? (isDark ? 'rgba(99, 102, 241, 0.55)' : '#818cf8')
            : isDark
            ? 'rgba(255, 255, 255, 0.12)'
            : '#e2e8f0'
        }`,
        boxShadow: isPipelineRunning
          ? (isDark ? '0 0 20px rgba(99, 102, 241, 0.28)' : '0 4px 18px rgba(99, 102, 241, 0.12)')
          : isDark
          ? '0 4px 16px rgba(0, 0, 0, 0.35)'
          : '0 2px 10px rgba(0, 0, 0, 0.05)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        zIndex: 25,
        transition: 'all 0.25s ease',
        userSelect: 'none',
      }}
    >
      {/* Left: Live Execution Telemetry Timer & CDC */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Live Timer Pill */}
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
            fontSize: '12px',
            fontWeight: 700,
            color: isPipelineRunning ? '#38bdf8' : isDark ? '#cbd5e1' : '#334155',
          }}
          title={language === 'vi' ? 'Thời gian thực thi pipeline' : 'Pipeline execution time'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
              gap: '5px',
              padding: '3px 8px',
              borderRadius: '6px',
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
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px #10b981',
              }}
            />
            <span>{language === 'vi' ? 'CDC BẬT' : 'CDC ON'}</span>
          </div>
        )}
      </div>

      {/* Center: Mission Control Telemetry Stage Badge & Progress Rail */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minWidth: 0,
        }}
      >
        {/* Dynamic Telemetry Status Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '3px 10px',
            borderRadius: '6px',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              color: telemetry.color,
              whiteSpace: 'nowrap',
            }}
          >
            {telemetry.badge}
          </span>
          <span
            style={{
              fontSize: '12px',
              fontFamily: 'var(--font-sans, system-ui)',
              fontWeight: 600,
              color: isDark ? '#94a3b8' : '#64748b',
              whiteSpace: 'nowrap',
            }}
          >
            : {telemetry.detail}
          </span>
        </div>

        {/* Shimmer Continuous Progress Rail */}
        <div
          style={{
            flex: 1,
            height: '6px',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
            borderRadius: '9999px',
            overflow: 'hidden',
            position: 'relative',
          }}
          title={language === 'vi' ? `Tiến độ dòng chảy: ${progressPct}%` : `Pipeline progress: ${progressPct}%`}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              background:
                progressPct === 100
                  ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                  : 'linear-gradient(90deg, #8b5cf6 0%, #e11d48 30%, #f59e0b 60%, #10b981 85%, #6366f1 100%)',
              boxShadow: isPipelineRunning ? '0 0 8px rgba(99, 102, 241, 0.6)' : 'none',
              transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>
      </div>

      {/* Right: Progress Metric Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            fontWeight: 800,
            color: progressPct === 100 ? '#10b981' : isDark ? '#38bdf8' : '#0284c7',
            minWidth: '38px',
            textAlign: 'right',
          }}
        >
          {progressPct}%
        </span>
      </div>
    </div>
  );
};
