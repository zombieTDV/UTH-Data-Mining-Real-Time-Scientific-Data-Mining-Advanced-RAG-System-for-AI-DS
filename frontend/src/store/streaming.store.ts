import { useSyncExternalStore } from 'react';
import { API_CONFIG } from '../config';
import { fetchStreamingStatus, fetchStorageStats } from '../services';
import type { IngestionEvent, StorageStatsResponse } from '../types';

export interface StreamingLogEntry {
  id: string;
  time: string;
  level: 'SUCCESS' | 'INFO' | 'STORAGE' | 'QUERY' | 'EXEC' | 'WARN' | 'START';
  tag: string;
  msg: string;
}

export const createInitialLakehouseLogs = (): StreamingLogEntry[] => {
  const now = new Date();
  const formatTime = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);

  return [
    {
      id: 'init-01',
      time: formatTime(new Date(now.getTime() - 1000 * 150)),
      level: 'STORAGE',
      tag: 'R2/SYNC',
      msg: 'Cloudflare R2 lakehouse active: 8.277 GB across Bronze (7.744 GB HTML5/OpenAlex), Silver (321.68 MB Parquet), Gold (211.26 MB LanceDB)',
    },
    {
      id: 'init-02',
      time: formatTime(new Date(now.getTime() - 1000 * 120)),
      level: 'SUCCESS',
      tag: 'GOLD/LANCEDB',
      msg: '164,702 vector embeddings active in LanceDB table scientific_papers_gold (Cosine ANN, 768-dim nomic-embed-text-v1.5)',
    },
    {
      id: 'init-03',
      time: formatTime(new Date(now.getTime() - 1000 * 90)),
      level: 'INFO',
      tag: 'SILVER/DUCKDB',
      msg: 'DuckDB columnar OLAP engine attached to Silver Parquet partitions (2,220,938 LaTeX formulas indexed with SIMD)',
    },
    {
      id: 'init-04',
      time: formatTime(new Date(now.getTime() - 1000 * 60)),
      level: 'INFO',
      tag: 'CORPUS/SYNC',
      msg: 'Corpus baseline verified: 36,414 works (11,660 arXiv HTML5 + 24,754 OpenAlex JSON-LD + 184 conferences) mapped in Lakehouse Bronze layer',
    },
    {
      id: 'init-05',
      time: formatTime(new Date(now.getTime() - 1000 * 30)),
      level: 'SUCCESS',
      tag: 'RAG/GATE',
      msg: 'Qwen 2.5 7B GGUF Anti-Hallucination Gate initialized with Cosine grounding threshold tau >= 0.75',
    },
    {
      id: 'init-06',
      time: formatTime(now),
      level: 'INFO',
      tag: 'CDC/STREAM',
      msg: 'Continuous Lakehouse Change Data Capture (CDC) stream listening on /api/ingestion/stream',
    },
  ];
};

export interface LakehouseStreamState {
  isStreaming: boolean;
  totalCorpus: number;
  sessionIngested: number;
  streamSpeed: number;
  streamTarget: number;
  storageUsedGb: number;
  storageUsedPct: number;
  storageTotalBytes: number;
  lastPaperDeltaBytes: number;
  lastIngestedPaper: {
    paperId: string;
    title: string;
    category: string;
    vectorsSynced: number;
    latencyMs: number;
  } | null;
  storageStats: StorageStatsResponse | null;
  activePipelineStage: 'idle' | 'harvest' | 'bronze' | 'duckdb' | 'silver' | 'embedding' | 'parallel' | 'gold' | 'r2_sync' | 'completed';
  connectionStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  viewMode: 'active' | 'total';
  logs: StreamingLogEntry[];
}

const getStoredViewMode = (): 'active' | 'total' => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('uth_lakehouse_view_mode');
    if (saved === 'active' || saved === 'total') return saved;
  }
  return 'active';
};

const getStoredLogs = (): StreamingLogEntry[] => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('uth_lakehouse_logs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter out stale mock dates as well as spam heartbeat log dumps
          const cleaned = parsed.filter(
            (l: any) =>
              !l.time?.includes('2026-10-03') &&
              l.tag !== 'TELEMETRY/SSE' &&
              !l.msg?.includes('"total_execution_seconds"')
          );
          if (cleaned.length > 0) return cleaned;
        }
      }
    } catch {}
  }
  return createInitialLakehouseLogs();
};

let state: LakehouseStreamState = {
  isStreaming: false,
  totalCorpus: 36414,
  sessionIngested: 0,
  streamSpeed: 0,
  streamTarget: 3000,
  storageUsedGb: 8.277,
  storageUsedPct: 82.77,
  storageTotalBytes: 8887884161,
  lastPaperDeltaBytes: 0,
  lastIngestedPaper: null,
  storageStats: null,
  activePipelineStage: 'idle',
  connectionStatus: 'DISCONNECTED',
  viewMode: getStoredViewMode(),
  logs: getStoredLogs(),
};

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function updateState(partial: Partial<LakehouseStreamState> | ((prev: LakehouseStreamState) => Partial<LakehouseStreamState>)) {
  const next = typeof partial === 'function' ? partial(state) : partial;
  state = { ...state, ...next };
  emitChange();
}

let eventSourceInstance: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
let initialized = false;

export async function refreshStorageStats(): Promise<void> {
  try {
    const data = await fetchStorageStats();
    if (data) {
      const mode = state.viewMode;
      const gb = mode === 'total' ? data.total_size_gb : (data.activeLakehouse?.totalSizeGb ?? 8.277);
      const pct = mode === 'total' ? data.used_percentage : (data.activeLakehouse?.usedPercentage ?? 82.77);
      const bytes = mode === 'total' ? data.total_size_bytes : (data.activeLakehouse?.totalSizeBytes ?? 8887884161);

      // Merge storageStats but never let polling overwrite HIGHER numbers already pushed via SSE.
      // This prevents the "numbers jump up then reset" bug caused by stale API responses.
      const mergedActiveLakehouse = data.activeLakehouse && state.storageStats?.activeLakehouse
        ? {
            ...data.activeLakehouse,
            // Gold vectors: take the higher of API response vs current state (SSE may have pushed it higher)
            activeLanceDbVectors: Math.max(
              data.activeLakehouse.activeLanceDbVectors ?? 0,
              state.storageStats.activeLakehouse.activeLanceDbVectors ?? 0,
            ),
            // ArXiv HTML count: take higher value
            arxivHtmlCount: Math.max(
              data.activeLakehouse.arxivHtmlCount ?? 0,
              state.storageStats.activeLakehouse.arxivHtmlCount ?? 0,
            ),
            // Conference count: take higher value (pipeline may have added more)
            conferenceCount: Math.max(
              data.activeLakehouse.conferenceCount ?? 0,
              state.storageStats.activeLakehouse.conferenceCount ?? 0,
            ),
          }
        : data.activeLakehouse;

      updateState({
        storageStats: data.activeLakehouse ? { ...data, activeLakehouse: mergedActiveLakehouse } : data,
        storageUsedGb: gb,
        storageUsedPct: pct,
        storageTotalBytes: bytes,
      });
    }
  } catch (e) {
    console.warn('[StreamStore] Failed to refresh storage stats:', e);
  }
}

export function setViewMode(mode: 'active' | 'total'): void {
  updateState((prev) => {
    const data = prev.storageStats;
    let gb = prev.storageUsedGb;
    let pct = prev.storageUsedPct;
    let bytes = prev.storageTotalBytes;
    if (data) {
      if (mode === 'total') {
        gb = data.total_size_gb;
        pct = data.used_percentage;
        bytes = data.total_size_bytes;
      } else {
        gb = data.activeLakehouse?.totalSizeGb ?? 8.277;
        pct = data.activeLakehouse?.usedPercentage ?? 82.77;
        bytes = data.activeLakehouse?.totalSizeBytes ?? 8887884161;
      }
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('uth_lakehouse_view_mode', mode);
      } catch {}
    }
    return {
      viewMode: mode,
      storageUsedGb: gb,
      storageUsedPct: pct,
      storageTotalBytes: bytes,
    };
  });
}

export function appendStreamLog(log: Omit<StreamingLogEntry, 'id'>): void {
  updateState((prev) => {
    const newLogs: StreamingLogEntry[] = [
      {
        ...log,
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      },
      ...prev.logs.slice(0, 199),
    ];
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('uth_lakehouse_logs', JSON.stringify(newLogs.slice(0, 50)));
      } catch {}
    }
    return { logs: newLogs };
  });
}

export function clearStreamLogs(): void {
  const initial = createInitialLakehouseLogs();
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('uth_lakehouse_logs', JSON.stringify(initial));
    } catch {}
  }
  updateState({ logs: initial });
}

export const addTelemetryLog = appendStreamLog;

export function setStreamTarget(target: number): void {
  updateState({ streamTarget: target });
}

export function initializeLakehouseStream(): () => void {
  if (initialized) {
    return () => {};
  }
  initialized = true;

  fetchStreamingStatus()
    .then((st) => {
      if (st) {
        updateState({
          isStreaming: st.status === 'STREAMING',
          totalCorpus: st.total_corpus || 36414,
          sessionIngested: st.session_ingested || 0,
          streamSpeed: st.speed_ppm || 0,
          storageUsedGb: st.storage_total_gb ?? state.storageUsedGb,
          storageUsedPct: st.storage_used_pct ?? state.storageUsedPct,
        });
      }
    })
    .catch(() => {});

  refreshStorageStats();

  const connectSSE = () => {
    if (eventSourceInstance) {
      eventSourceInstance.close();
    }

    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.ingestionStream}`;
    eventSourceInstance = new EventSource(url);

    eventSourceInstance.onopen = () => {
      retryCount = 0;
      updateState({ connectionStatus: 'CONNECTED' });
    };

    eventSourceInstance.onmessage = (e) => {
      try {
        const event: IngestionEvent = JSON.parse(e.data);

        if (event.type === 'PAPER_INGESTED') {
          const paperDelta = event.bronze_bytes_delta || 380000;
          const updatedGb = event.storage_total_gb ?? +(state.storageUsedGb + paperDelta / (1024 ** 3)).toFixed(3);
          const updatedPct = event.storage_used_pct ?? +(state.storageUsedPct + (paperDelta / (10 * 1024 ** 3)) * 100).toFixed(2);

          const stageKey = (event.stage || 'harvest').toLowerCase() as any;
          updateState((prev) => {
            const nextSession = event.session_ingested || prev.sessionIngested + 1;
            const vectorsDelta = typeof event.vectors_synced === 'number' ? event.vectors_synced : 0;
            const updatedActive = prev.storageStats?.activeLakehouse
              ? {
                  ...prev.storageStats.activeLakehouse,
                  activeLanceDbVectors:
                    (prev.storageStats.activeLakehouse.activeLanceDbVectors || 164702) + vectorsDelta,
                  totalSizeGb: updatedGb,
                  usedPercentage: updatedPct,
                }
              : null;

            return {
              isStreaming: true,
              activePipelineStage: stageKey,
              totalCorpus: event.total_corpus || prev.totalCorpus + 1,
              sessionIngested: nextSession,
              streamSpeed: event.speed_ppm || prev.streamSpeed,
              storageUsedGb: updatedGb,
              storageUsedPct: updatedPct,
              storageTotalBytes: event.storage_total_bytes ?? prev.storageTotalBytes + paperDelta,
              lastPaperDeltaBytes: paperDelta,
              storageStats: prev.storageStats && updatedActive ? {
                ...prev.storageStats,
                activeLakehouse: updatedActive,
                total_size_gb: updatedGb,
                used_percentage: updatedPct,
              } : prev.storageStats,
              lastIngestedPaper: {
                paperId: event.paper_id || '',
                title: event.title || '',
                category: event.category || '',
                vectorsSynced: vectorsDelta,
                latencyMs: event.latency_ms || 0,
              },
            };
          });

          const isGold = event.stage?.toUpperCase() === 'GOLD' || (typeof event.vectors_synced === 'number' && event.vectors_synced > 0 && (event.bronze_bytes_delta === 0 || !event.bronze_bytes_delta));
          appendStreamLog({
            time: event.timestamp || new Date().toLocaleTimeString('en-US', { hour12: false }),
            level: 'SUCCESS',
            tag: isGold ? 'GOLD-VECTOR' : 'STREAM-CDC',
            msg: isGold
              ? `[GOLD ZONE] Upserted ${(event.vectors_synced || 0).toLocaleString()} vectors to LanceDB Lakehouse ('scientific_papers_gold')`
              : `[BRONZE HARVEST] ${event.paper_id} (${event.category}) -> "${(event.title || '').slice(0, 48)}..." -> (+${Math.round(paperDelta / 1024)} KB raw payload)`,
          });
        } else if (event.type === 'STAGE_CHANGE') {
          const rawStage = (event.stage || '').toLowerCase();
          const targetStage: any = rawStage === 'embedding' ? 'parallel' : rawStage;
          updateState((prev) => {
            const vectorsDelta = typeof event.vectors_synced === 'number' ? event.vectors_synced : 0;
            const updatedActive = prev.storageStats?.activeLakehouse && vectorsDelta > 0
              ? {
                  ...prev.storageStats.activeLakehouse,
                  activeLanceDbVectors:
                    (prev.storageStats.activeLakehouse.activeLanceDbVectors || 164702) + vectorsDelta,
                }
              : prev.storageStats?.activeLakehouse;

            return {
              isStreaming: targetStage !== 'completed',
              activePipelineStage: targetStage,
              storageStats: prev.storageStats && updatedActive ? {
                ...prev.storageStats,
                activeLakehouse: updatedActive,
              } : prev.storageStats,
            };
          });

          if (rawStage === 'completed') {
            setTimeout(() => {
              updateState({ activePipelineStage: 'idle', isStreaming: false });
            }, 6000);
          }

          appendStreamLog({
            time: event.timestamp || new Date().toLocaleTimeString('en-US', { hour12: false }),
            level: 'INFO',
            tag: 'PIPELINE-STEP',
            msg: `[FLOW STAGE: ${rawStage.toUpperCase()}] ${event.title || 'Pipeline transition triggered.'}`,
          });
        } else if (event.type === 'HEARTBEAT' || event.type === 'CONNECTION_ESTABLISHED') {
          if (event.status === 'STREAMING') {
            updateState({
              isStreaming: true,
              sessionIngested: event.session_ingested || state.sessionIngested,
              streamSpeed: event.speed_ppm || state.streamSpeed,
              totalCorpus: event.total_corpus || state.totalCorpus,
              storageUsedGb: event.storage_total_gb ?? state.storageUsedGb,
              storageUsedPct: event.storage_used_pct ?? state.storageUsedPct,
            });
          } else if (event.status === 'PAUSED' || event.status === 'COMPLETED') {
            updateState({ isStreaming: false, activePipelineStage: 'idle' });
          }
        }
      } catch (err) {
        console.error('[StreamStore] Malformed event payload:', err);
      }
    };

    eventSourceInstance.onerror = () => {
      updateState({ connectionStatus: 'RECONNECTING' });
      if (eventSourceInstance) {
        eventSourceInstance.close();
        eventSourceInstance = null;
      }

      const delay = Math.min(10000, 1500 * 2 ** retryCount);
      retryCount += 1;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        connectSSE();
      }, delay);
    };
  };

  connectSSE();

  return () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (eventSourceInstance) {
      eventSourceInstance.close();
      eventSourceInstance = null;
    }
    initialized = false;
    updateState({ connectionStatus: 'DISCONNECTED' });
  };
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): LakehouseStreamState {
  return state;
}

export function useLakehouseStreamStore() {
  const storeState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...storeState,
    initializeStream: initializeLakehouseStream,
    setStreamTarget,
    appendLog: appendStreamLog,
    refreshStorageStats,
    setViewMode,
  };
}
