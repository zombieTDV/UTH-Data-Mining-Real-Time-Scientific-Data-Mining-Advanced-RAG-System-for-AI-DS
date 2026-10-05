import type { FC } from 'react';
import { InteractiveWorkflowCanvas } from '../components/schematic';
import { MetricsBento } from '../components/common';
import { GeometricTelemetryGauges } from '../components/charts';
import { StorageInspector } from '../components/schematic';
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
  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '8px', gap: '8px' }}>
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--badge-bg)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid var(--badge-border)',
            gap: '4px',
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
        <div style={{ flex: 1, width: '100%', overflowY: 'auto', padding: '10px 0 30px' }}>
          <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <MetricsBento />
            <GeometricTelemetryGauges />
            <StorageInspector />
          </div>
        </div>
      )}
    </div>
  );
};
