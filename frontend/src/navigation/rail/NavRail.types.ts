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
  { id: 'pillars', label: 'PILLARS', title: '[Alt+1] 4 Mining Pillars (FP-Growth, Clusters, Graph, Outliers)' },
  { id: 'eda', label: 'EDA', title: '[Alt+2] Real-Time Scientific EDA & Paper Explorer' },
  { id: 'rag', label: 'RAG', title: '[Alt+3] Grounded Scientific RAG Chat' },
  { id: 'schematic', label: 'LAKEHOUSE', title: '[Alt+4] Medallion Architecture & Harvester' },
  { id: 'logs', label: 'LOGS', title: '[Alt+5] Live Telemetry & Terminal Logs' },
];
