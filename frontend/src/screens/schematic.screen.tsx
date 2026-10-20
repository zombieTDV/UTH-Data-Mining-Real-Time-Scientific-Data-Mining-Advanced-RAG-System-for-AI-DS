import type { FC } from 'react';
import { InteractiveWorkflowCanvas } from '../components/schematic';
import { MetricsBento } from '../components/common';
import { StorageInspector } from '../components/schematic';
import { useLakehouseStreamStore } from '../store';
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
  const { isSyncingStorage, lastSyncedStorage, triggerStorageSync } = useLakehouseStreamStore();

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
      <div style={{ position: 'absolute', top: '14px', right: '20px', zIndex: 30, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          onClick={() => triggerStorageSync()}
          disabled={isSyncingStorage}
          title={lastSyncedStorage ? `Scan the live MinIO bucket (Last synced: ${lastSyncedStorage})` : 'Scan the live MinIO bucket'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: '8px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            backgroundColor: 'var(--badge-bg)',
            color: isSyncingStorage ? '#eab308' : 'var(--text-primary)',
            border: '1px solid var(--badge-border)',
            cursor: isSyncingStorage ? 'not-allowed' : 'pointer',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            transition: 'all 0.2s ease',
          }}
        >
          <span style={{ display: 'inline-block', animation: isSyncingStorage ? 'spin 1s linear infinite' : 'none' }}>
            🔄
          </span>
          <span>{isSyncingStorage ? 'SCANNING MINIO...' : 'SCAN MINIO LIVE'}</span>
          {lastSyncedStorage && !isSyncingStorage && (
            <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 500 }}>
              ({lastSyncedStorage.includes(' ') ? lastSyncedStorage.split(' ')[1] : lastSyncedStorage})
            </span>
          )}
        </button>

        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--badge-bg)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid var(--badge-border)',
            gap: '4px',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          }}
        >
          <button
            type="button"
            onClick={() => onViewModeChange('canvas')}
            style={{
              padding: '3px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              backgroundColor: viewMode === 'canvas' ? 'var(--bg-surface)' : 'transparent',
              color: viewMode === 'canvas' ? 'var(--accent-silver)' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: viewMode === 'canvas' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
            }}
          >
            FLOW CANVAS
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('storage')}
            style={{
              padding: '3px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              backgroundColor: viewMode === 'storage' ? 'var(--bg-surface)' : 'transparent',
              color: viewMode === 'storage' ? 'var(--accent-silver)' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: viewMode === 'storage' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
            }}
          >
            BENTO &amp; STORAGE INSPECTOR
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
          />
        </div>
      ) : (
        <div style={{ flex: 1, width: '100%', overflowY: 'auto', padding: '54px 20px 30px' }}>
          <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <MetricsBento />
            <StorageInspector />
          </div>
        </div>
      )}
    </div>
  );
};
