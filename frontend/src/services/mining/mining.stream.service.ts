import { API_CONFIG } from '../../config';
import type { TelemetryTick, IngestionEvent, IngestionStatus, IngestionControlResponse } from '../../types';
import type { StreamHandlers, UnsubscribeFn } from '../types';

export function subscribeTelemetry(
  onData: (data: TelemetryTick) => void,
  onError?: (err: unknown) => void,
): UnsubscribeFn {
  const eventSource = new EventSource(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.telemetryStream}`);

  eventSource.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      onData(parsed);
    } catch {
      onData(event.data as unknown as TelemetryTick);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    eventSource.close();
  };
}

export async function fetchStreamingStatus(): Promise<IngestionStatus> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.ingestionStatus}`);
  if (!res.ok) throw new Error(`Failed to load streaming status: ${res.statusText}`);
  return res.json();
}

export async function startStreamingIngestion(
  target: number = 3000,
  delay: number = 2.0,
): Promise<IngestionControlResponse> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.ingestionStart}?target=${target}&delay=${delay}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to start streaming: ${res.statusText}`);
  return res.json();
}

export async function stopStreamingIngestion(): Promise<IngestionControlResponse> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.ingestionStop}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to stop streaming: ${res.statusText}`);
  return res.json();
}

export interface PipelineLogItem {
  id: string | number;
  time: string;
  level: string;
  tag: string;
  msg: string;
}

export async function fetchPipelineLogs(
  limit: number = 100,
  source?: string,
): Promise<Array<PipelineLogItem> & { activeFile?: string; availableSources?: string[] }> {
  try {
    const query = source ? `?limit=${limit}&source=${encodeURIComponent(source)}` : `?limit=${limit}`;
    const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.ingestionLogs}${query}`);
    if (!res.ok) {
      const fallback: any = [];
      fallback.activeFile = '';
      fallback.availableSources = [];
      return fallback;
    }
    const data = await res.json();
    const result: any = Array.isArray(data.logs) ? data.logs : [];
    result.activeFile = data.active_file || '';
    result.availableSources = Array.isArray(data.available_sources) ? data.available_sources : [];
    return result;
  } catch {
    const fallback: any = [];
    fallback.activeFile = '';
    fallback.availableSources = [];
    return fallback;
  }
}

export function subscribeIngestionStream(
  onEvent: (event: IngestionEvent) => void,
  onError?: (err: unknown) => void,
): UnsubscribeFn {
  const eventSource = new EventSource(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.ingestionStream}`);

  eventSource.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      onEvent(parsed);
    } catch {
      onEvent(event.data as unknown as IngestionEvent);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    eventSource.close();
  };
}

export type TelemetryStreamHandlers = StreamHandlers<TelemetryTick>;
export type IngestionStreamHandlers = StreamHandlers<IngestionEvent>;
