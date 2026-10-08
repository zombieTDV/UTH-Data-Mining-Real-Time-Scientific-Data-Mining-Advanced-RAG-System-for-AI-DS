import type { FC } from 'react';
import { InteractiveWorkflowCanvas } from '../components/schematic';
import { MetricsBento } from '../components/common';
import { StorageInspector } from '../components/schematic';
import { useLakehouseStreamStore } from '../store';
import { useTranslation } from '../hooks';
import type { AppTab, AppTheme, PipelineStatus, SchematicViewMode } from '../types';

export interface SchematicScreenProps {
  viewMode: SchematicViewMode;
  onViewModeChange: (mode: SchematicViewMode) => void;
  theme: AppTheme;
  pipelineStatus: PipelineStatus;
  onNavigateTab: (tab: AppTab) => void;
  onTriggerPipeline: () => void;
}

export const SchematicScreen: FC<SchematicScreenProps> = ({
  viewMode,
  onViewModeChange,
  theme,
  pipelineStatus,
  onNavigateTab,
  onTriggerPipeline,
}) => {
  const { language } = useTranslation();
  const { storageUsedGb } = useLakehouseStreamStore();

  const renderSwitcher = () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'var(--bg-surface-elevated, #162035)',
        padding: '3px',
        borderRadius: '9px',
        border: '1px solid var(--border-highlight, rgba(255, 255, 255, 0.25))',
        gap: '4px',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
      }}
    >
      {/* FLOW CANVAS Button */}
      <button
        type="button"
        onClick={() => onViewModeChange('canvas')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          borderRadius: '6px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 800,
          letterSpacing: '0.3px',
          backgroundColor: viewMode === 'canvas' ? 'var(--bg-surface, #0e1422)' : 'transparent',
          color: viewMode === 'canvas' ? 'var(--accent-silver, #38bdf8)' : 'var(--text-muted, #94a3b8)',
          border: viewMode === 'canvas' ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid transparent',
          cursor: 'pointer',
          boxShadow: viewMode === 'canvas' ? '0 2px 8px rgba(56, 189, 248, 0.25)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M10 6.5h4" />
          <path d="M6.5 10v4" />
          <path d="M17.5 10v4" />
        </svg>
        <span>{language === 'vi' ? 'SƠ ĐỒ LUỒNG' : 'FLOW CANVAS'}</span>
        {viewMode === 'canvas' && (
          <span
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 6px #10b981',
              display: 'inline-block',
            }}
          />
        )}
      </button>

      {/* BENTO & STORAGE INSPECTOR Button */}
      <button
        type="button"
        onClick={() => onViewModeChange('storage')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          borderRadius: '6px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 800,
          letterSpacing: '0.3px',
          backgroundColor: viewMode === 'storage' ? 'var(--bg-surface, #0e1422)' : 'transparent',
          color: viewMode === 'storage' ? 'var(--accent-gold, #fbbf24)' : 'var(--text-muted, #94a3b8)',
          border: viewMode === 'storage' ? '1px solid rgba(251, 191, 36, 0.6)' : '1px solid transparent',
          cursor: 'pointer',
          boxShadow: viewMode === 'storage' ? '0 2px 8px rgba(251, 191, 36, 0.25)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
        <span>{language === 'vi' ? 'BENTO & GIÁM SÁT LƯU TRỮ' : 'BENTO & STORAGE INSPECTOR'}</span>
        <span
          style={{
            fontSize: '9px',
            padding: '1px 5px',
            borderRadius: '4px',
            backgroundColor: viewMode === 'storage' ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255, 255, 255, 0.08)',
            color: viewMode === 'storage' ? '#fbbf24' : 'var(--text-muted)',
            fontWeight: 700,
          }}
        >
          {storageUsedGb.toFixed(2)} GB
        </span>
      </button>
    </div>
  );

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Top Schematic Mode Control Bar (Anchored, 100% Fixed Position, Zero Jumping, Zero Wrapping) */}
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
        {/* Left Side: Title & Badges */}
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
              {viewMode === 'canvas'
                ? (language === 'vi' ? 'SƠ ĐỒ LUỒNG PIPELINE LAKEHOUSE' : 'LAKEHOUSE WORKFLOW PIPELINE CANVAS')
                : (language === 'vi' ? 'LĂNG KÍNH LƯU TRỮ ĐA TẦNG LAKEHOUSE' : 'LAKEHOUSE MULTI-TIER STORAGE LENS')}
            </span>

            {/* Micro Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span
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
                }}
              >
                {language === 'vi' ? 'ZERO EGRESS R2' : 'ZERO EGRESS R2'}
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
                {language === 'vi' ? 'ĐỒNG BỘ THỜI GIAN THỰC' : 'REAL-TIME SYNCED'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Segmented Mode Switcher (Always at the exact same position, never wraps) */}
        <div style={{ flexShrink: 0 }}>
          {renderSwitcher()}
        </div>
      </div>

      {/* Main Viewport Content */}
      {viewMode === 'canvas' ? (
        <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <InteractiveWorkflowCanvas
            onNavigateTab={onNavigateTab}
            isPipelineRunning={pipelineStatus === 'RUNNING'}
            onTriggerPipeline={onTriggerPipeline}
            theme={theme}
            language={language}
          />
        </div>
      ) : (
        <div style={{ flex: 1, width: '100%', overflowY: 'auto', padding: '16px 24px 32px' }}>
          <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <MetricsBento />
            <StorageInspector />
          </div>
        </div>
      )}
    </div>
  );
};
