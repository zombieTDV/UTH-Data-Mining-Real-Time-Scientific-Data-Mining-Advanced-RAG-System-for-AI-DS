import type { FC } from 'react';
import { InteractiveWorkflowCanvas } from '../components/schematic';
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

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
      <InteractiveWorkflowCanvas
        onNavigateTab={onNavigateTab}
        isPipelineRunning={pipelineStatus === 'RUNNING'}
        onTriggerPipeline={onTriggerPipeline}
        theme={theme}
        language={language}
      />
    </div>
  );
};
