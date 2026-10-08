import { type FC } from 'react';
import { InteractiveWorkflowCanvas } from '../components/schematic';
import { useLakehouseStreamStore } from '../store';
import { useTranslation } from '../hooks';
import type { AppTab, AppTheme, PipelineStatus, SchematicViewMode } from '../types';

export interface SchematicScreenProps {
  viewMode?: SchematicViewMode;
  onViewModeChange?: (mode: SchematicViewMode) => void;
  theme?: AppTheme;
  pipelineStatus?: PipelineStatus;
  onNavigateTab?: (tab: AppTab) => void;
  onTriggerPipeline?: () => void;
  onOpenStorageLens?: () => void;
}

export const SchematicScreen: FC<SchematicScreenProps> = ({
  theme = 'dark',
  pipelineStatus = 'IDLE',
  onNavigateTab,
  onTriggerPipeline,
  onOpenStorageLens,
}) => {
  const { language } = useTranslation();
  const { storageUsedGb, isStreaming } = useLakehouseStreamStore();

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
      {/* Top Schematic Control Bar (Integrated Header with Direct Icon Triggers) */}
      <div
        style={{
          height: '46px',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          zIndex: 30,
          gap: '16px',
        }}
      >
        {/* Left Side: Title & Live Lakehouse Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px #10b981',
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span
              style={{
                fontSize: '12.5px',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
              }}
            >
              {language === 'vi'
                ? 'SƠ ĐỒ LUỒNG PIPELINE LAKEHOUSE (CANVAS FLOW)'
                : 'LAKEHOUSE WORKFLOW PIPELINE CANVAS'}
            </span>

            {/* Micro Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span
                role={onOpenStorageLens ? 'button' : undefined}
                tabIndex={onOpenStorageLens ? 0 : undefined}
                onClick={onOpenStorageLens}
                onKeyDown={(e) => {
                  if (onOpenStorageLens && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onOpenStorageLens();
                  }
                }}
                style={{
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: onOpenStorageLens ? 'pointer' : 'default',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title={language === 'vi' ? 'Xem lăng kính lưu trữ R2 (Phím S)' : 'View R2 Storage Lens (Key S)'}
              >
                <span>R2: {(storageUsedGb || 8.28).toFixed(2)} GB / 10 GB</span>
                {onOpenStorageLens && <span style={{ opacity: 0.7, fontSize: '8.5px' }}>↗</span>}
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                DUCKDB SIMD: ONLINE
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: isStreaming ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                  color: isStreaming ? '#ef4444' : '#10b981',
                  border: isStreaming ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.25)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {isStreaming
                  ? (language === 'vi' ? '● ĐANG CÀO' : '● STREAMING')
                  : (language === 'vi' ? '● ĐỒNG BỘ' : '● SYNCED')}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Quick Jump to RAG and Pipeline Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Quick Jump to RAG */}
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('rag')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={language === 'vi' ? 'Chuyển sang RAG Chat hỏi đáp' : 'Switch to RAG Chat'}
            >
              <span>{language === 'vi' ? '▶ HỎI ĐÁP RAG' : '▶ RAG CHAT'}</span>
            </button>
          )}

          {/* Run Pipeline Button */}
          {onTriggerPipeline && (
            <button
              type="button"
              onClick={onTriggerPipeline}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                backgroundColor: pipelineStatus === 'RUNNING' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                color: pipelineStatus === 'RUNNING' ? '#ef4444' : '#10b981',
                border: pipelineStatus === 'RUNNING' ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(16, 185, 129, 0.4)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{language === 'vi' ? 'CHẠY PIPELINE' : 'RUN PIPELINE'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Viewport: THE INTERACTIVE CANVAS FLOW (Always rendered & running) */}
      <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        <InteractiveWorkflowCanvas
          onNavigateTab={onNavigateTab}
          isPipelineRunning={pipelineStatus === 'RUNNING'}
          onTriggerPipeline={onTriggerPipeline}
          theme={theme}
          language={language}
        />
      </div>
    </div>
  );
};
