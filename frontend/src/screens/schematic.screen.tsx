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
  return (
    <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
      {/* High-Contrast Segmented View Mode Switcher */}
      <div style={{ position: 'absolute', top: '14px', right: '22px', zIndex: 40 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-surface-elevated, #162035)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid var(--border-highlight, rgba(255, 255, 255, 0.25))',
            gap: '5px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.4), 0 0 16px rgba(56, 189, 248, 0.15)',
          }}
        >
          {/* FLOW CANVAS Button */}
          <button
            type="button"
            onClick={() => onViewModeChange('canvas')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '11.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              letterSpacing: '0.4px',
              backgroundColor: viewMode === 'canvas' ? 'var(--bg-surface, #0e1422)' : 'transparent',
              color: viewMode === 'canvas' ? 'var(--accent-silver, #38bdf8)' : 'var(--text-muted, #94a3b8)',
              border: viewMode === 'canvas' ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid transparent',
              cursor: 'pointer',
              boxShadow: viewMode === 'canvas' ? '0 2px 10px rgba(56, 189, 248, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)' : 'none',
              transition: 'all 0.18s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  boxShadow: '0 0 8px #10b981',
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
              gap: '7px',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '11.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              letterSpacing: '0.4px',
              backgroundColor: viewMode === 'storage' ? 'var(--bg-surface, #0e1422)' : 'transparent',
              color: viewMode === 'storage' ? 'var(--accent-gold, #fbbf24)' : 'var(--text-muted, #94a3b8)',
              border: viewMode === 'storage' ? '1px solid rgba(251, 191, 36, 0.6)' : '1px solid transparent',
              cursor: 'pointer',
              boxShadow: viewMode === 'storage' ? '0 2px 10px rgba(251, 191, 36, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)' : 'none',
              transition: 'all 0.18s ease',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
            <span>{language === 'vi' ? 'BENTO & GIÁM SÁT LƯU TRỮ' : 'BENTO & STORAGE INSPECTOR'}</span>
            <span
              style={{
                fontSize: '9.5px',
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
      </div>

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
            {/* Bento Tab Context Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '12px 18px',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 8px #10b981',
                  }}
                />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {language === 'vi' ? 'LĂNG KÍNH LƯU TRỮ ĐA TẦNG LAKEHOUSE' : 'LAKEHOUSE MULTI-TIER STORAGE LENS'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {language === 'vi'
                      ? 'Kiểm chứng liên tục: Cloudflare R2 S3 Object Lake • Apache Arrow / DuckDB OLAP • LanceDB Vector Store'
                      : 'Continuous Verification: Cloudflare R2 S3 Object Lake • Apache Arrow / DuckDB OLAP • LanceDB Vector Store'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    fontWeight: 700,
                  }}
                >
                  {language === 'vi' ? 'ZERO EGRESS R2 HOẠT ĐỘNG' : 'ZERO EGRESS R2 ACTIVE'}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    color: '#10b981',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontWeight: 700,
                  }}
                >
                  {language === 'vi' ? 'ĐỒNG BỘ THỜI GIAN THỰC' : 'REAL-TIME SYNCED'}
                </span>
              </div>
            </div>

            <MetricsBento />
            <StorageInspector />
          </div>
        </div>
      )}
    </div>
  );
};
