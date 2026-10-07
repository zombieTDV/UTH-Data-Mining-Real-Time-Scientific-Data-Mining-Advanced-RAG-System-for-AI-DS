import type { AppTab, AppTheme } from '../../types/entities/section.entity';

export interface NavRailItem {
  id: AppTab;
  label: string;
  title: string;
}

export interface NavRailProps {
  activeTab: AppTab;
  theme: AppTheme;
  onNavigate: (tab: AppTab) => void;
  onToggleTheme: () => void;
}

export const NAV_RAIL_ITEMS: NavRailItem[] = [
  { id: 'schematic', label: 'FLOW', title: '[Alt+1] Lakehouse Schematic & Storage' },
  { id: 'eda', label: 'EDA', title: '[Alt+2] Real-Time Scientific EDA (DuckDB)' },
  { id: 'pillars', label: 'MODEL', title: '[Alt+3] 4 Mining Pillars' },
  { id: 'rag', label: 'RAG', title: '[Alt+4] Grounded Scientific RAG Chat' },
  { id: 'logs', label: 'LOGS', title: '[Alt+5] Telemetry Logs & Core Engines' },
];
