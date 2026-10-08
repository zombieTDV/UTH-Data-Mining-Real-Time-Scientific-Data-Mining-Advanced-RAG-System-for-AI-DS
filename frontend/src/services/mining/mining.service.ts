import { API_CONFIG } from '../../config';
import type {
  HealthResponse,
  StorageStatsResponse,
  TriggerPipelineResponse,
  DuckDbQueryResult,
  LakehouseSearchResult,
} from '../../types';

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.health}`);
  if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
  return res.json();
}

export async function fetchStorageStats(): Promise<StorageStatsResponse> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.storageStats}`);
  if (!res.ok) throw new Error(`Failed to load Storage stats: ${res.statusText}`);
  return res.json();
}

export async function triggerMiningPipeline(): Promise<TriggerPipelineResponse> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.triggerPipeline}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to trigger pipeline: ${res.statusText}`);
  return res.json();
}

export async function executeDuckDbQuery(sql: string): Promise<DuckDbQueryResult> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.storageQuery}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) throw new Error(`DuckDB query failed: ${res.statusText}`);
  return res.json();
}

export async function searchLakehouse(
  query: string,
  top_k: number = 5,
  category?: string,
): Promise<LakehouseSearchResult> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.search}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k, category, mode: 'fts' }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  return res.json();
}

export async function syncR2Storage(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_CONFIG.baseUrl}/api/storage/sync-r2`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`R2 sync failed: ${res.statusText}`);
  return res.json();
}

export async function resetStorageSession(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_CONFIG.baseUrl}/api/storage/reset-session`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Reset session failed: ${res.statusText}`);
  return res.json();
}

export async function fetchSchedulerStatus(): Promise<any> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.schedulerStatus}`);
  if (!res.ok) throw new Error(`Failed to load scheduler status: ${res.statusText}`);
  return res.json();
}

export async function triggerSchedulerHarvest(source: string, limit?: number, syncR2: boolean = true, force: boolean = true): Promise<any> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.schedulerTrigger}/${encodeURIComponent(source)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, sync_r2: syncR2, force }),
  });
  if (!res.ok) throw new Error(`Failed to trigger harvest for ${source}: ${res.statusText}`);
  return res.json();
}

export async function startSchedulerDaemon(intervalSeconds: number = 30): Promise<any> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.schedulerStart}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interval_seconds: intervalSeconds }),
  });
  if (!res.ok) throw new Error(`Failed to start scheduler daemon: ${res.statusText}`);
  return res.json();
}

export async function stopSchedulerDaemon(cancelRunning: boolean = false): Promise<any> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.schedulerStop}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cancel_running: cancelRunning }),
  });
  if (!res.ok) throw new Error(`Failed to stop scheduler daemon: ${res.statusText}`);
  return res.json();
}

export async function toggleSchedulerSource(source: string, enabled?: boolean): Promise<any> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.schedulerToggle}/${encodeURIComponent(source)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`Failed to toggle scheduler source ${source}: ${res.statusText}`);
  return res.json();
}

export async function cancelSchedulerTask(): Promise<any> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.schedulerCancel}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to cancel active scheduler task: ${res.statusText}`);
  return res.json();
}

