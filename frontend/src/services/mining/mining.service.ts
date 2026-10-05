import { API_CONFIG } from '../../config';
import type {
  HealthResponse,
  StorageStatsResponse,
  TriggerPipelineResponse,
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
