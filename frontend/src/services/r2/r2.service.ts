import { API_CONFIG } from '../../config';
import type { R2FileItem } from '../../components/r2/R2FileTree.component';
import type { FilePreviewData } from '../../components/r2/R2FileInspector.component';

export interface R2TreeResponseData {
  bucket_name: string;
  total_objects: number;
  total_size_bytes: number;
  total_size_gb: number;
  free_tier_quota_gb: number;
  used_percentage: number;
  cost_shield_active: boolean;
  last_synced: string;
  zones: Record<string, R2FileItem[]>;
  zone_stats: Record<string, { count: number; size_bytes: number; size_formatted: string }>;
}

export async function fetchR2Tree(): Promise<R2TreeResponseData> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.r2Tree}`);
  if (!res.ok) {
    throw new Error(`Failed to load R2 tree: ${res.statusText}`);
  }
  return res.json();
}

export async function syncR2Bucket(): Promise<R2TreeResponseData> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.r2Sync}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to trigger R2 snapshot: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchFilePreview(key: string): Promise<FilePreviewData> {
  const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.r2Preview}?key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.detail || `Failed to extract preview for ${key} (${res.statusText})`);
  }
  return res.json();
}
