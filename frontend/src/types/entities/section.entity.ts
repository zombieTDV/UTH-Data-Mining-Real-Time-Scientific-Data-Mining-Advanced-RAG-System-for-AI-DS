export type AppTab = 'schematic' | 'eda' | 'pillars' | 'rag' | 'logs';

export type AppTheme = 'dark' | 'light';

export type PipelineStatus = 'IDLE' | 'RUNNING' | 'COMPLETED';

export type BackendStatus = 'ONLINE' | 'OFFLINE';

export type SchematicViewMode = 'pipeline' | 'canvas' | 'storage';

export type PipelineStageKey =
  | 'idle'
  | 'harvest'
  | 'bronze'
  | 'duckdb'
  | 'parallel'
  | 'completed';

export interface NavItem {
  id: AppTab;
  label: string;
  shortcut: string;
  icon: string;
}
