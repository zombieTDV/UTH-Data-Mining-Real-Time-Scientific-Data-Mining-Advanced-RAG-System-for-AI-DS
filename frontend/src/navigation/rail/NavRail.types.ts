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
  { id: 'r2', label: 'R2', title: '[Alt+2] Cloudflare R2 Lakehouse Explorer & Viewer' },
  { id: 'eda', label: 'EDA', title: '[Alt+3] Real-Time Scientific EDA & Paper Explorer' },
  { id: 'pillars', label: 'PILLARS', title: '[Alt+4] 4 Mining Pillars (FP-Growth, Clusters, Graph, Outliers)' },
  { id: 'rag', label: 'RAG', title: '[Alt+5] Grounded Scientific RAG Chat' },
  { id: 'logs', label: 'LOGS', title: '[Alt+6] Live Telemetry & Terminal Logs' },
];
