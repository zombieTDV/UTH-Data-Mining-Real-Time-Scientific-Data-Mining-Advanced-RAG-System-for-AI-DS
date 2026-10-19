import { useSyncExternalStore } from 'react';
import { API_CONFIG } from '../config';
import { fetchStorageStats, fetchPipelineLogs } from '../services';
import type { StorageStatsResponse } from '../types';

/**
 * Server-authoritative pipeline store.
 *
 * Everything shown on the dashboard comes from the backend monitor over ONE SSE connection:
 *  - SNAPSHOT: Airflow DAG state, RabbitMQ queue, Qdrant vector count, MinIO totals, session counters (every ~3 s)
 *  - LOG: a pipeline log line (ids are the backend's sequence numbers, so lines can never be duplicated or reordered)
 *  - PAPER_INGESTED: one paper that now exists in Bronze + Silver + Gold
 * Nothing is estimated in the browser: no fake increments, no hard-coded fallback numbers.
 */

export interface StreamingLogEntry {
  id: string;
  seq: number;
  time: string;
  level: string;
  tag: string;
  tier?: string | null;
  msg: string;
}

export interface LiveDag {
  key: string;
  dag_id: string;
  name: string;
  frequency: string;
  kind: string;
  present?: boolean; // false when the DAG file is not loaded in Airflow
  paused: boolean;
  running: boolean;
  next_run?: string | null;
  last_run?: { run_id: string; state: string; run_type: string; start?: string | null; end?: string | null } | null;
}

export interface LiveSnapshot {
  status: 'STREAMING' | 'IDLE';
  stage: 'idle' | 'harvest' | 'queued' | 'embedding' | 'gold';
  time: string;
  // ready/unacked/consumers: ingest queue (metadata -> fetch worker); embed_*: Silver records -> embed worker
  queue: { status: string; ready: number; unacked: number; consumers: number; dead: number; embed_ready?: number; embed_unacked?: number; embed_consumers?: number; embed_max?: number };
  airflow: { reachable: boolean; scheduler_healthy: boolean; dags: LiveDag[] };
  corpus: {
    vectors: number;
    papers: number;
    formulas?: number; // sum of total_math_count over Silver
    tier1_rows: number;
    tier2_rows: number;
    tier3_rows: number;
    sources: Record<string, number>;
  };
  storage: { storage_total_bytes?: number; storage_total_gb?: number; storage_used_pct?: number; objects?: number; last_synced?: string };
  session: {
    ingested: number;
    by_tier: Record<string, number>;
    by_origin: Record<string, number>;
    speed_ppm: number;
    last_paper: {
      paper_id?: string; title?: string; category?: string; tier?: string; content_origin?: string;
      total_words?: number; total_sections?: number; vectors_synced?: number; at?: string;
    } | null;
  };
  last_log_id: number;
}

export interface LakehouseStreamState {
  isStreaming: boolean;
  totalCorpus: number;
  totalVectors: number;
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
    tier: string;
    contentOrigin: string;
    totalWords: number;
    vectorsSynced: number;
    latencyMs: number;
  } | null;
  storageStats: StorageStatsResponse | null;
  activePipelineStage: 'idle' | 'harvest' | 'bronze' | 'duckdb' | 'silver' | 'embedding' | 'parallel' | 'gold' | 'r2_sync' | 'completed' | 'queued';
  connectionStatus: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';
  viewMode: 'active' | 'total';
  logs: StreamingLogEntry[];
  isSyncingStorage: boolean;
  lastSyncedStorage: string | null;
  live: LiveSnapshot | null;
}

const MAX_LOGS = 300;

const getStoredViewMode = (): 'active' | 'total' => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('uth_lakehouse_view_mode');
    if (saved === 'active' || saved === 'total') return saved;
  }
  return 'total';
};

let state: LakehouseStreamState = {
  isStreaming: false,
  totalCorpus: 0,
  totalVectors: 0,
  sessionIngested: 0,
  streamSpeed: 0,
  streamTarget: 0,
  storageUsedGb: 0,
  storageUsedPct: 0,
  storageTotalBytes: 0,
  lastPaperDeltaBytes: 0,
  lastIngestedPaper: null,
  storageStats: null,
  activePipelineStage: 'idle',
  connectionStatus: 'DISCONNECTED',
  viewMode: getStoredViewMode(),
  logs: [],
  isSyncingStorage: false,
  lastSyncedStorage: null,
  live: null,
};

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function updateState(partial: Partial<LakehouseStreamState> | ((prev: LakehouseStreamState) => Partial<LakehouseStreamState>)) {
  const next = typeof partial === 'function' ? partial(state) : partial;
  state = { ...state, ...next };
  emitChange();
}

let eventSourceInstance: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let statsTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
let initialized = false;
let lastStatsKey = '';

// ---------------------------------------------------------------- logs
interface ServerLog { id: number; time: string; level: string; tag: string; tier?: string | null; msg: string }

function toEntry(l: ServerLog): StreamingLogEntry {
  return { id: `srv-${l.id}`, seq: l.id, time: l.time, level: l.level, tag: l.tag, tier: l.tier ?? null, msg: l.msg };
}

/** Merge server log lines by sequence number: newest first, no duplicates, stable under reconnects. */
function mergeLogs(prev: StreamingLogEntry[], incoming: StreamingLogEntry[]): StreamingLogEntry[] {
  const bySeq = new Map<number, StreamingLogEntry>();
  for (const l of prev) bySeq.set(l.seq, l);
  for (const l of incoming) bySeq.set(l.seq, l);
  return [...bySeq.values()].sort((a, b) => b.seq - a.seq).slice(0, MAX_LOGS);
}

export function appendStreamLog(log: Omit<StreamingLogEntry, 'id' | 'seq'>): void {
  // Local, client-only notes (e.g. "sync requested") get negative sequence numbers so they never collide with server ids.
  updateState((prev) => {
    const seq = -Date.now();
    return { logs: mergeLogs(prev.logs, [{ ...log, id: `cli-${-seq}`, seq }]) };
  });
}

export async function refreshPipelineLogs(): Promise<void> {
  try {
    const rows = await fetchPipelineLogs(MAX_LOGS);
    if (rows && rows.length > 0) {
      updateState((prev) => ({ logs: mergeLogs(prev.logs, (rows as unknown as ServerLog[]).map(toEntry)) }));
    }
  } catch {
    /* backend not reachable yet: the SSE stream will fill the buffer once it is */
  }
}

// ---------------------------------------------------------------- snapshot -> state
function applySnapshot(s: LiveSnapshot) {
  updateState((prev) => {
    const lp = s.session.last_paper;
    const storageBytes = s.storage.storage_total_bytes ?? prev.storageTotalBytes;
    const patchedStats: StorageStatsResponse | null = prev.storageStats?.activeLakehouse
      ? {
          ...prev.storageStats,
          activeLakehouse: { ...prev.storageStats.activeLakehouse, activeVectors: s.corpus.vectors || prev.storageStats.activeLakehouse.activeVectors },
        }
      : prev.storageStats;
    return {
      live: s,
      isStreaming: s.status === 'STREAMING',
      activePipelineStage: s.stage,
      totalCorpus: s.corpus.papers ?? prev.totalCorpus,
      totalVectors: s.corpus.vectors,
      sessionIngested: s.session.ingested,
      streamSpeed: s.session.speed_ppm,
      storageUsedGb: prev.viewMode === 'total' ? (s.storage.storage_total_gb ?? prev.storageUsedGb) : prev.storageUsedGb,
      storageUsedPct: prev.viewMode === 'total' ? (s.storage.storage_used_pct ?? prev.storageUsedPct) : prev.storageUsedPct,
      storageTotalBytes: prev.viewMode === 'total' ? storageBytes : prev.storageTotalBytes,
      lastSyncedStorage: s.storage.last_synced ?? prev.lastSyncedStorage,
      storageStats: patchedStats,
      lastIngestedPaper: lp
        ? {
            paperId: lp.paper_id || '',
            title: lp.title || '',
            category: lp.category || '',
            tier: lp.tier || '',
            contentOrigin: lp.content_origin || '',
            totalWords: lp.total_words || 0,
            vectorsSynced: lp.vectors_synced || 0,
            latencyMs: 0,
          }
        : prev.lastIngestedPaper,
    };
  });

  // The detailed storage breakdown (zones, per-source counts) is a heavier REST call: refresh it when the lake changed.
  const key = `${s.corpus.vectors}|${s.storage.storage_total_bytes}|${s.corpus.papers}|${s.corpus.tier2_rows}|${s.corpus.tier1_rows}`;
  if (key !== lastStatsKey) {
    lastStatsKey = key;
    if (statsTimer) clearTimeout(statsTimer);
    statsTimer = setTimeout(() => { void refreshStorageStats(); }, 1500);
  }
}

export async function refreshStorageStats(): Promise<void> {
  try {
    const data = await fetchStorageStats();
    if (!data) return;
    updateState((prev) => {
      const mode = prev.viewMode;
      return {
        storageStats: data,
        storageUsedGb: mode === 'total' ? data.total_size_gb : (data.activeLakehouse?.totalSizeGb ?? 0),
        storageUsedPct: mode === 'total' ? data.used_percentage : (data.activeLakehouse?.usedPercentage ?? 0),
        storageTotalBytes: mode === 'total' ? data.total_size_bytes : (data.activeLakehouse?.totalSizeBytes ?? 0),
        lastSyncedStorage: data.last_synced || prev.lastSyncedStorage,
      };
    });
  } catch (e) {
    console.warn('[StreamStore] Failed to refresh storage stats:', e);
  }
}

export async function triggerStorageSync(): Promise<{ status: string; message: string }> {
  updateState({ isSyncingStorage: true });
  try {
    const { syncStorage } = await import('../services');
    const res = await syncStorage();
    await refreshStorageStats();
    updateState({ isSyncingStorage: false });
    return { status: 'SUCCESS', message: res.message || 'MinIO synchronized' };
  } catch (err: any) {
    updateState({ isSyncingStorage: false });
    return { status: 'ERROR', message: err.message || 'Failed to sync MinIO' };
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
        gb = data.activeLakehouse?.totalSizeGb ?? 0;
        pct = data.activeLakehouse?.usedPercentage ?? 0;
        bytes = data.activeLakehouse?.totalSizeBytes ?? 0;
      }
    }
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('uth_lakehouse_view_mode', mode); } catch { /* storage unavailable */ }
    }
    return { viewMode: mode, storageUsedGb: gb, storageUsedPct: pct, storageTotalBytes: bytes };
  });
}

export function setStreamTarget(target: number): void {
  updateState({ streamTarget: target });
}

// ---------------------------------------------------------------- SSE
export function initializeLakehouseStream(): () => void {
  if (initialized) return () => {};
  initialized = true;

  void refreshStorageStats();
  void refreshPipelineLogs();

  const connectSSE = () => {
    if (eventSourceInstance) eventSourceInstance.close();
    eventSourceInstance = new EventSource(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.ingestionStream}`);

    eventSourceInstance.onopen = () => {
      retryCount = 0;
      updateState({ connectionStatus: 'CONNECTED' });
      void refreshPipelineLogs(); // fill any gap left while the connection was down
    };

    eventSourceInstance.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        switch (event.type) {
          case 'SNAPSHOT':
          case 'CONNECTION_ESTABLISHED':
            applySnapshot(event as LiveSnapshot);
            break;
          case 'LOG':
            updateState((prev) => ({ logs: mergeLogs(prev.logs, [toEntry(event.log as ServerLog)]) }));
            break;
          case 'PAPER_INGESTED':
            updateState({
              sessionIngested: event.session_ingested ?? state.sessionIngested + 1,
              lastIngestedPaper: {
                paperId: event.paper_id || '',
                title: event.title || '',
                category: event.category || '',
                tier: event.tier || '',
                contentOrigin: event.content_origin || '',
                totalWords: event.total_words || 0,
                vectorsSynced: event.vectors_synced || 0,
                latencyMs: 0,
              },
            });
            break;
          default:
            break;
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
      reconnectTimer = setTimeout(connectSSE, delay);
    };
  };

  connectSSE();

  return () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (statsTimer) clearTimeout(statsTimer);
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
  return () => { listeners.delete(callback); };
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
    triggerStorageSync,
  };
}
