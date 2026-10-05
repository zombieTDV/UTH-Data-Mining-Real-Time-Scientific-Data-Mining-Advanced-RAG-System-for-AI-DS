/**
 * API Client for interacting with the FastAPI Lakehouse Backend.
 */

import type {
  EdaResponse,
  AssociationRulesResponse,
  ClustersResponse,
  GraphResponse,
  TrendsResponse,
  StorageStatsResponse,
  ChatResponse,
} from './types';

const BASE_URL =
  (import.meta.env.VITE_API_URL as string) ||
  (typeof window !== 'undefined' && window.location.port === '5173' ? 'http://localhost:8000' : '');

export async function fetchHealth(): Promise<{ status: string; lancedb_ready: boolean; parquet_ready: boolean }> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
  return res.json();
}

export async function fetchEdaSummary(): Promise<EdaResponse> {
  const res = await fetch(`${BASE_URL}/api/mining/eda`);
  if (!res.ok) throw new Error(`Failed to load EDA: ${res.statusText}`);
  return res.json();
}

export async function fetchAssociationRules(): Promise<AssociationRulesResponse> {
  const res = await fetch(`${BASE_URL}/api/mining/pillars/association-rules`);
  if (!res.ok) throw new Error(`Failed to load Association Rules: ${res.statusText}`);
  return res.json();
}

export async function fetchClusters(): Promise<ClustersResponse> {
  const res = await fetch(`${BASE_URL}/api/mining/pillars/clusters`);
  if (!res.ok) throw new Error(`Failed to load Clusters: ${res.statusText}`);
  return res.json();
}

export async function fetchGraph(): Promise<GraphResponse> {
  const res = await fetch(`${BASE_URL}/api/mining/pillars/graph`);
  if (!res.ok) throw new Error(`Failed to load Graph: ${res.statusText}`);
  return res.json();
}

export async function fetchTrends(): Promise<TrendsResponse> {
  const res = await fetch(`${BASE_URL}/api/mining/pillars/trends`);
  if (!res.ok) throw new Error(`Failed to load Trends: ${res.statusText}`);
  return res.json();
}

export async function fetchStorageStats(): Promise<StorageStatsResponse> {
  const res = await fetch(`${BASE_URL}/api/storage/stats`);
  if (!res.ok) throw new Error(`Failed to load Storage stats: ${res.statusText}`);
  return res.json();
}

export async function executeDuckDbQuery(sql: string): Promise<{
  columns: string[];
  rows: Record<string, any>[];
  row_count: number;
  execution_time_ms: number;
}> {
  const res = await fetch(`${BASE_URL}/api/storage/query`, {
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
  category?: string
): Promise<{
  query: string;
  mode: string;
  total_results: number;
  results: Array<{
    chunk_id: string;
    paper_id: string;
    title: string;
    text: string;
    primary_category?: string;
    score?: number;
  }>;
}> {
  const res = await fetch(`${BASE_URL}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k, category, mode: 'fts' }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
  return res.json();
}

export async function sendChatQuery(query: string, category?: string): Promise<ChatResponse> {

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, category, top_k: 5 }),
  });
  if (!res.ok) throw new Error(`Chat query failed: ${res.statusText}`);
  return res.json();
}

export async function triggerMiningPipeline(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/api/mining/trigger`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to trigger pipeline: ${res.statusText}`);
  return res.json();
}

export function subscribeTelemetry(
  onData: (data: any) => void,
  onError?: (err: any) => void,
): () => void {
  const eventSource = new EventSource(`${BASE_URL}/api/mining/telemetry/stream`);

  eventSource.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      onData(parsed);
    } catch {
      onData(event.data);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    eventSource.close();
  };
}

export async function fetchStreamingStatus(): Promise<{
  status: string;
  target_papers: number;
  session_ingested: number;
  total_corpus: number;
  speed_ppm: number;
  elapsed_seconds: number;
}> {
  const res = await fetch(`${BASE_URL}/api/ingestion/status`);
  if (!res.ok) throw new Error(`Failed to load streaming status: ${res.statusText}`);
  return res.json();
}

export async function startStreamingIngestion(
  target: number = 3000,
  delay: number = 2.0
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/api/ingestion/start?target=${target}&delay=${delay}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to start streaming: ${res.statusText}`);
  return res.json();
}

export async function stopStreamingIngestion(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/api/ingestion/stop`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to stop streaming: ${res.statusText}`);
  return res.json();
}

export function subscribeIngestionStream(
  onEvent: (event: any) => void,
  onError?: (err: any) => void
): () => void {
  const eventSource = new EventSource(`${BASE_URL}/api/ingestion/stream`);

  eventSource.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      onEvent(parsed);
    } catch {
      onEvent(event.data);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    eventSource.close();
  };
}

export async function fetchPaper(paperId: string): Promise<any[]> {
  const res = await fetch(`${BASE_URL}/api/papers/${encodeURIComponent(paperId)}`);
  if (!res.ok) throw new Error(`Paper fetch failed: ${res.statusText}`);
  return res.json();
}

export function streamChatQuery(
  query: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError?: (err: any) => void,
  category?: string
): () => void {
  const controller = new AbortController();
  fetch(`${BASE_URL}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, category, top_k: 5 }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Streaming failed: ${response.statusText}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream available');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6).trim();
            if (dataStr === '[DONE]') {
              onDone();
              return;
            }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.token) {
                onToken(parsed.token);
              }
            } catch {
              onToken(dataStr);
            }
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== 'AbortError' && onError) {
        onError(err);
      }
    });

  return () => controller.abort();
}

