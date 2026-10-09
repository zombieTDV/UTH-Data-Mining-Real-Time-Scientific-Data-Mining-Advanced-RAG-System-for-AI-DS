import { useState, type FC } from 'react';
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
}

export const SchematicScreen: FC<SchematicScreenProps> = ({
  theme = 'dark',
  pipelineStatus = 'IDLE',
  onNavigateTab,
  onTriggerPipeline,
}) => {
  const { language } = useTranslation();
  const { isStreaming } = useLakehouseStreamStore();
  const [inspectNodeTrigger, setInspectNodeTrigger] = useState<string | null>(null);

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
      </div>

      {/* Main Viewport: THE INTERACTIVE CANVAS FLOW (Always rendered & running) */}
      <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        <InteractiveWorkflowCanvas
          onNavigateTab={onNavigateTab}
          isPipelineRunning={pipelineStatus === 'RUNNING'}
          onTriggerPipeline={onTriggerPipeline}
          theme={theme}
          language={language}
          inspectNodeTrigger={inspectNodeTrigger}
          onClearInspectNodeTrigger={() => setInspectNodeTrigger(null)}
        />
      </div>
    </div>
  );
};
