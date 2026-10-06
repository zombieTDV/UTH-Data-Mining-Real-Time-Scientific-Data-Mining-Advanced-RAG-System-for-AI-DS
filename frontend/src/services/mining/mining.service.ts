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
