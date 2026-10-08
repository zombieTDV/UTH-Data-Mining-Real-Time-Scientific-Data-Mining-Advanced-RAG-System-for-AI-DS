export type LogLevel = 'SUCCESS' | 'INFO' | 'QUERY' | 'STORAGE' | 'START' | 'WARN' | 'ERROR';

export interface LogLine {
  id: string;
  time: string;
  level: LogLevel;
  tag: string;
  message: string;
}

export interface ToolDetail {
  id: string;
  name: string;
  category: string;
  role: string;
  engineVersion: string;
  badgeColor: string;
  status: 'ONLINE' | 'ACTIVE' | 'SYNCED' | 'STANDBY';
  telemetrySummary: {
    primaryMetric: string;
    secondaryMetric: string;
    latency: string;
    throughput: string;
  };
  features: string[];
  samplePreviewTitle: string;
  sampleCodeOrSchema: string;
}

export interface TelemetryTick {
  timestamp: string;
  source?: string;
  metric?: string;
  value?: number;
  event?: string;
  level?: string;
  status?: string;
  message?: string;
  tag?: string;
  total_execution_seconds?: number;
  total_papers?: number;
  modules?: Record<string, {
    elapsed_seconds?: number;
    file?: string;
    total_papers?: number;
    rules_mined?: number;
    silhouette_score?: number;
    total_nodes?: number;
    total_edges?: number;
    anomalies_detected?: number;
  }>;
}

export interface ToastMessage {
  id: string;
  message: string;
  level: 'success' | 'info' | 'warn' | 'error';
}
