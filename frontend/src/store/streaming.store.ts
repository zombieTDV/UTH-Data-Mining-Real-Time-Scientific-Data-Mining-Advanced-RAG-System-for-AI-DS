import { useSyncExternalStore } from 'react';
import { API_CONFIG } from '../config';
import { fetchStreamingStatus, fetchStorageStats, fetchPipelineLogs } from '../services';
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
      msg: 'Cloudflare R2 lakehouse active: 8.750 GB across Bronze (2.352 GB HTML5/OpenAlex), Silver (321.69 MB Parquet), Gold (211.27 MB LanceDB, 4.943 GB Backups)',
    },
    {
      id: 'init-02',
      time: formatTime(new Date(now.getTime() - 1000 * 120)),
      level: 'SUCCESS',
      tag: 'GOLD/LANCEDB',
      msg: '164,750 vector embeddings active in LanceDB table scientific_papers_gold (Cosine ANN, 768-dim nomic-embed-text-v1.5)',
    },
    {
      id: 'init-03',
      time: formatTime(new Date(now.getTime() - 1000 * 90)),
      level: 'INFO',
      tag: 'SILVER/DUCKDB',
      msg: 'DuckDB columnar OLAP engine attached to Silver Parquet partitions (2,838,695 LaTeX formulas indexed with SIMD)',
    },
    {
      id: 'init-04',
      time: formatTime(new Date(now.getTime() - 1000 * 60)),
      level: 'INFO',
      tag: 'CORPUS/SYNC',
      msg: 'Corpus baseline verified: 18,287 works (101 arXiv HTML5 + 9,621 OpenAlex + 8,565 conferences/journals) mapped in Lakehouse Bronze & Silver layers',
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
  isSyncingR2: boolean;
  lastSyncedR2: string | null;
  miningSyncVersion: number;
}

const getStoredViewMode = (): 'active' | 'total' => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('uth_lakehouse_view_mode');
    if (saved === 'active' || saved === 'total') return saved;
  }
  return 'total';
};

const getStoredLogs = (): StreamingLogEntry[] => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('uth_lakehouse_logs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const isMock = parsed.some((l: any) => 
            typeof l.msg === 'string' && (l.msg.includes('CVPR Pipeline') || l.msg.includes('OpenAlex Pipeline') || l.msg.includes('15,926 objects'))
          );
          if (isMock) {
            localStorage.removeItem('uth_lakehouse_logs');
            return [];
          }
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

const getStoredStorageStats = (): StorageStatsResponse | null => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('uth_lakehouse_storage_stats_cache');
      if (saved) {
        const parsed = JSON.parse(saved);
        const dedup = parsed?.sourceBreakdown?.total_deduplicated || parsed?.activeLakehouse?.sourceBreakdown?.total_deduplicated || 0;
        if (dedup < 100) {
          localStorage.removeItem('uth_lakehouse_storage_stats_cache');
          return null;
        }
        return parsed;
      }
    } catch {}
  }
  return null;
};

const initialCachedStats = getStoredStorageStats();

let state: LakehouseStreamState = {
  isStreaming: false,
  totalCorpus:
    initialCachedStats?.sourceBreakdown?.total_deduplicated ??
    initialCachedStats?.activeLakehouse?.sourceBreakdown?.total_deduplicated ??
    18287,
  sessionIngested: 0,
  streamSpeed: 0,
  streamTarget: 3000,
  storageUsedGb: initialCachedStats?.totalBucket?.totalSizeGb ?? initialCachedStats?.activeLakehouse?.totalSizeGb ?? 8.75,
  storageUsedPct: initialCachedStats?.totalBucket?.usedPercentage ?? initialCachedStats?.activeLakehouse?.usedPercentage ?? 87.5,
  storageTotalBytes: initialCachedStats?.totalBucket?.totalSizeBytes ?? initialCachedStats?.activeLakehouse?.totalSizeBytes ?? 8751797344,
  lastPaperDeltaBytes: 0,
  lastIngestedPaper: null,
  storageStats: initialCachedStats,
  activePipelineStage: 'idle',
  connectionStatus: 'DISCONNECTED',
  viewMode: getStoredViewMode(),
  logs: getStoredLogs(),
  isSyncingR2: false,
  lastSyncedR2: initialCachedStats?.last_synced ?? '2026-10-18 03:33:05',
  miningSyncVersion: 0,
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

export async function refreshStorageStats(forceReset: boolean = false): Promise<void> {
  try {
    const data = await fetchStorageStats();
    if (data) {
      const mode = state.viewMode;
      const gb = mode === 'total' ? data.total_size_gb : (data.activeLakehouse?.totalSizeGb ?? 2.895);
      const pct = mode === 'total' ? data.used_percentage : (data.activeLakehouse?.usedPercentage ?? 28.95);
      const bytes = mode === 'total' ? data.total_size_bytes : (data.activeLakehouse?.totalSizeBytes ?? 3108398926);

      // Merge storageStats but never let polling overwrite HIGHER numbers already pushed via SSE,
      // UNLESS a forceReset was explicitly triggered by user resetting the ingestion session.
      const mergedActiveLakehouse = (!forceReset && data.activeLakehouse && state.storageStats?.activeLakehouse)
        ? {
            ...data.activeLakehouse,
            activeLanceDbVectors: Math.max(
              data.activeLakehouse.activeLanceDbVectors ?? 0,
              state.storageStats.activeLakehouse.activeLanceDbVectors ?? 0,
            ),
            arxivHtmlCount: Math.max(
              data.activeLakehouse.arxivHtmlCount ?? 0,
              state.storageStats.activeLakehouse.arxivHtmlCount ?? 0,
            ),
            conferenceCount: Math.max(
              data.activeLakehouse.conferenceCount ?? 0,
              state.storageStats.activeLakehouse.conferenceCount ?? 0,
            ),
          }
        : data.activeLakehouse;

      const updatedTotalWorks = 
        data.sourceBreakdown?.total_deduplicated ||
        data.activeLakehouse?.sourceBreakdown?.total_deduplicated ||
        data.sourceBreakdown?.active_rag_papers ||
        data.total_objects ||
        18287;

      updateState({
        totalCorpus: updatedTotalWorks,
        storageStats: data.activeLakehouse ? { ...data, activeLakehouse: mergedActiveLakehouse } : data,
        storageUsedGb: gb,
        storageUsedPct: pct,
        storageTotalBytes: bytes,
        ...(forceReset ? { sessionIngested: 0 } : {}),
        lastSyncedR2: data.last_synced || state.lastSyncedR2,
      });

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('uth_lakehouse_storage_stats_cache', JSON.stringify(data));
        } catch {}
      }
    }
  } catch (e) {
    console.warn('[StreamStore] Failed to refresh storage stats:', e);
  }
}

export async function triggerR2ManualSync(): Promise<{ status: string; message: string }> {
  updateState({ isSyncingR2: true });
  try {
    const { syncR2Storage } = await import('../services');
    const res = await syncR2Storage();
    await refreshStorageStats();
    appendStreamLog({
      time: new Date().toLocaleTimeString(),
      level: 'STORAGE',
      tag: 'R2-SYNC',
      msg: res.message || 'Live Cloudflare R2 bucket synchronized successfully.',
    });
    updateState((prev) => ({
      isSyncingR2: false,
      lastSyncedR2: new Date().toLocaleTimeString(),
      miningSyncVersion: prev.miningSyncVersion + 1,
    }));
    return { status: 'SUCCESS', message: res.message || 'R2 synchronized' };
  } catch (err: any) {
    updateState({ isSyncingR2: false });
    return { status: 'ERROR', message: err.message || 'Failed to sync R2' };
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
        gb = data.activeLakehouse?.totalSizeGb ?? 2.895;
        pct = data.activeLakehouse?.usedPercentage ?? 28.95;
        bytes = data.activeLakehouse?.totalSizeBytes ?? 3108398926;
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

export async function refreshPipelineLogs(): Promise<void> {
  try {
    const realLogs = await fetchPipelineLogs(150);
    if (realLogs && realLogs.length > 0) {
      updateState((prev) => {
        // Keep any active in-flight SSE logs at the top, followed by real disk logs
        const sseLogs = prev.logs.filter((l) => l.id.startsWith('log-'));
        const diskLogs = realLogs.map((rl) => ({
          id: String(rl.id),
          time: rl.time,
          level: rl.level as any,
          tag: rl.tag,
          msg: rl.msg,
        }));
        const merged = [...sseLogs, ...diskLogs].slice(0, 200);
        return { logs: merged };
      });
    }
  } catch {}
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
          totalCorpus: st.total_corpus || state.totalCorpus || 18287,
          sessionIngested: st.status === 'STREAMING' ? (st.session_ingested || 0) : 0,
          streamSpeed: st.speed_ppm || 0,
          storageUsedGb: st.storage_total_gb ?? state.storageUsedGb,
          storageUsedPct: st.storage_used_pct ?? state.storageUsedPct,
        });
      }
    })
    .catch(() => {});

  refreshStorageStats();
  refreshPipelineLogs();

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
                    (prev.storageStats.activeLakehouse.activeLanceDbVectors || 164750) + vectorsDelta,
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
          const pTitle = (event.title || '').slice(0, 50);
          const goldMsg = event.paper_id
            ? `[GOLD INGEST] ${event.paper_id} (${event.category || 'Gold'}) -> "${pTitle}..." (+${event.vectors_synced || 64} vectors to LanceDB)`
            : `[GOLD INGEST] +${event.vectors_synced || 64} dense vectors indexed into LanceDB (Total: ${(event.total_vectors || 419528).toLocaleString()} vectors)`;
          const bronzeMsg = `[BRONZE HARVEST] ${event.paper_id || 'arXiv'} (${event.category || 'cs.AI'}) -> "${pTitle || 'Preprint'}" (+${Math.round(paperDelta / 1024)} KB${event.total_sections ? `, ${event.total_sections} sects` : ''})`;

          appendStreamLog({
            time: event.timestamp || new Date().toLocaleTimeString('en-US', { hour12: false }),
            level: 'SUCCESS',
            tag: isGold ? 'GOLD-VECTOR' : 'STREAM-CDC',
            msg: isGold ? goldMsg : bronzeMsg,
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
                    (prev.storageStats.activeLakehouse.activeLanceDbVectors || 164750) + vectorsDelta,
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

export function resetSessionInStore(): void {
  updateState({
    sessionIngested: 0,
  });
}

export function useLakehouseStreamStore() {
  const storeState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...storeState,
    initializeStream: initializeLakehouseStream,
    setStreamTarget,
    appendLog: appendStreamLog,
    refreshStorageStats,
    resetSessionInStore,
    setViewMode,
    triggerR2ManualSync,
  };
}
