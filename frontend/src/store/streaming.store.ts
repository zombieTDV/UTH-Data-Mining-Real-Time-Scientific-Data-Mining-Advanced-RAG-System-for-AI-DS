import { useSyncExternalStore } from 'react';
import { API_CONFIG } from '../config';
import { fetchStreamingStatus, fetchStorageStats } from '../services';
import type { IngestionEvent, StorageStatsResponse } from '../types';

export interface StreamingLogEntry {
  id: string;
  time: string;
  level: 'SUCCESS' | 'INFO' | 'STORAGE' | 'QUERY';
  tag: string;
  msg: string;
}

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
      if (saved) return JSON.parse(saved);
    } catch {}
  }
  return [];
};

let state: LakehouseStreamState = {
  isStreaming: false,
  totalCorpus: 36414,
  sessionIngested: 0,
  streamSpeed: 0,
  streamTarget: 3000,
  storageUsedGb: 8.184,
  storageUsedPct: 81.84,
  storageTotalBytes: 8787548614,
  lastPaperDeltaBytes: 0,
  lastIngestedPaper: null,
  storageStats: null,
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
      const gb = mode === 'total' ? data.total_size_gb : (data.activeLakehouse?.totalSizeGb ?? 8.073);
      const pct = mode === 'total' ? data.used_percentage : (data.activeLakehouse?.usedPercentage ?? 80.73);
      const bytes = mode === 'total' ? data.total_size_bytes : (data.activeLakehouse?.totalSizeBytes ?? 8668472480);
      updateState({
        storageStats: data,
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
        gb = data.activeLakehouse?.totalSizeGb ?? 8.073;
        pct = data.activeLakehouse?.usedPercentage ?? 80.73;
        bytes = data.activeLakehouse?.totalSizeBytes ?? 8668472480;
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

          const isGold = event.stage === 'GOLD' || (typeof event.vectors_synced === 'number' && event.vectors_synced > 0 && (event.bronze_bytes_delta === 0 || !event.bronze_bytes_delta));
          appendStreamLog({
            time: event.timestamp || new Date().toLocaleTimeString('en-US', { hour12: false }),
            level: 'SUCCESS',
            tag: isGold ? 'GOLD-VECTOR' : 'STREAM-CDC',
            msg: isGold
              ? `[GOLD ZONE] Upserted ${(event.vectors_synced || 0).toLocaleString()} vectors to LanceDB Lakehouse ('scientific_papers_gold')`
              : `[BRONZE HARVEST] ${event.paper_id} (${event.category}) -> "${(event.title || '').slice(0, 48)}..." -> (+${Math.round(paperDelta / 1024)} KB raw payload)`,
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
            updateState({ isStreaming: false });
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
