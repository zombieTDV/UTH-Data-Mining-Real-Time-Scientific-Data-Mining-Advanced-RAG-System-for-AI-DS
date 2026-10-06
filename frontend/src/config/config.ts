export const APP_CONFIG = {
  name: 'UTH Scientific Lakehouse',
  shortName: 'UTH-DM',
  version: '0.1.0',
  university: 'Ho Chi Minh City University of Transport (UTH)',
  defaultTab: 'schematic' as const,
  defaultTheme: 'light' as const,
  defaultTargetPapers: 10000,
  defaultGoldLimit: 500,
  defaultRagTopK: 5,
  defaultEnrichHtmlLimit: 100,
  keyboardShortcuts: {
    tab1: { key: '1', alt: true, action: 'schematic' },
    tab2: { key: '2', alt: true, action: 'eda' },
    tab3: { key: '3', alt: true, action: 'pillars' },
    tab4: { key: '4', alt: true, action: 'rag' },
    tab5: { key: '5', alt: true, action: 'logs' },
    theme: { key: 'T', shift: true, action: 'toggleTheme' },
  },
} as const;

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_CONFIG = {
  baseUrl: (import.meta.env.VITE_API_URL as string) || (isLocalhost ? 'http://127.0.0.1:8000' : ''),
  endpoints: {
    health: '/health',
    eda: '/api/mining/eda',
    associationRules: '/api/mining/pillars/association-rules',
    clusters: '/api/mining/pillars/clusters',
    graph: '/api/mining/pillars/graph',
    trends: '/api/mining/pillars/trends',
    storageStats: '/api/storage/stats',
    chat: '/api/chat',
    chatStream: '/api/chat/stream',
    triggerPipeline: '/api/mining/trigger',
    telemetryStream: '/api/mining/telemetry/stream',
    ingestionStatus: '/api/ingestion/status',
    ingestionStart: '/api/ingestion/start',
    ingestionStop: '/api/ingestion/stop',
    ingestionStream: '/api/ingestion/stream',
    paperById: '/api/papers',
    storageQuery: '/api/storage/query',
    search: '/api/search',
  },
  devProxy: {
    target: 'http://127.0.0.1:8000',
  },
} as const;

export const DEV_CONFIG = {
  vitePort: 5173,
  proxyPaths: ['/api', '/health'],
} as const;

export type AppConfig = typeof APP_CONFIG;
export type ApiConfig = typeof API_CONFIG;
export type DevConfig = typeof DEV_CONFIG;
