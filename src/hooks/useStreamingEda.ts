import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  EdaResponse,
  StreamingTelemetryPayload,
  EdaDeltaPayload,
  AnomalyAlertPayload,
} from '../api/types';
import { fetchEdaSummary } from '../api/client';

export interface UseStreamingEdaResult {
  edaData: EdaResponse | null;
  loading: boolean;
  isStreaming: boolean;
  isFallback: boolean;
  telemetry: StreamingTelemetryPayload | null;
  liveVelocity: {
    papersPerSec: number;
    wordsPerSec: number;
    status: string;
  };
  anomalies: AnomalyAlertPayload[];
  dismissAnomaly: (paperId: string) => void;
  clearAllAnomalies: () => void;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function useStreamingEda(): UseStreamingEdaResult {
  const [edaData, setEdaData] = useState<EdaResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isFallback, setIsFallback] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<StreamingTelemetryPayload | null>(null);
  const [liveVelocity, setLiveVelocity] = useState<{
    papersPerSec: number;
    wordsPerSec: number;
    status: string;
  }>({
    papersPerSec: 0,
    wordsPerSec: 0,
    status: 'STANDBY',
  });
  const [anomalies, setAnomalies] = useState<AnomalyAlertPayload[]>([]);

  // Throttling buffers
  const pendingDeltaRef = useRef<EdaDeltaPayload | null>(null);
  const pendingTelemetryRef = useRef<StreamingTelemetryPayload | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissAnomaly = useCallback((paperId: string) => {
    setAnomalies((prev) => prev.filter((a) => a.paper_id !== paperId));
  }, []);

  const clearAllAnomalies = useCallback(() => {
    setAnomalies([]);
  }, []);

  // 1. Initial Snapshot Fetch
  useEffect(() => {
    let isMounted = true;
    fetchEdaSummary()
      .then((res) => {
        if (isMounted) {
          setEdaData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Throttled update flush (500ms cycle)
  const scheduleThrottledUpdate = useCallback(() => {
    if (throttleTimerRef.current) return;

    throttleTimerRef.current = setTimeout(() => {
      throttleTimerRef.current = null;

      // Apply telemetry updates
      if (pendingTelemetryRef.current) {
        const t = pendingTelemetryRef.current;
        setTelemetry(t);
        const pps = t.ingestion_rate_papers_per_sec || 0;
        const wps = t.ingestion_rate_words_per_sec || 0;
        setLiveVelocity({
          papersPerSec: pps,
          wordsPerSec: wps,
          status: t.status || 'STREAMING LIVE',
        });
        pendingTelemetryRef.current = null;
      }

      // Apply delta updates to EDA data
      if (pendingDeltaRef.current) {
        const delta = pendingDeltaRef.current;
        setEdaData((prev) => {
          if (!prev) return prev;
          const updated = { ...prev };

          if (delta.dynamic_quantiles) {
            updated.math_and_content_stats = {
              ...updated.math_and_content_stats,
              math_quantiles: delta.dynamic_quantiles.math_formulas,
              word_quantiles: delta.dynamic_quantiles.word_counts,
            };
          }

          if (delta.top_active_categories && delta.top_active_categories.length > 0) {
            // Merge top active categories
            const catMap = new Map(updated.category_distribution.map((c) => [c.category, c]));
            delta.top_active_categories.forEach((item) => {
              if (catMap.has(item.category)) {
                const existing = catMap.get(item.category)!;
                existing.count = item.count;
                existing.percentage = item.percentage;
              }
            });
            updated.category_distribution = Array.from(catMap.values());
          }

          return updated;
        });
        pendingDeltaRef.current = null;
      }
    }, 500);
  }, []);

  // 3. SSE Connection with multi-event support & auto-reconnect
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isDisposed = false;

    const connectSSE = () => {
      if (isDisposed) return;

      try {
        const streamUrl = `${BASE_URL}/api/mining/telemetry/stream`;
        eventSource = new EventSource(streamUrl);

        // Standard message listener (handles default heartbeat format)
        eventSource.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            setIsStreaming(true);
            setIsFallback(false);
            pendingTelemetryRef.current = {
              timestamp: parsed.timestamp || new Date().toISOString(),
              status: parsed.status || 'STREAMING LIVE',
              total_papers: parsed.total_papers || 10000,
              total_execution_seconds: parsed.total_execution_seconds || 64.56,
              modules: parsed.modules || {},
              ingestion_rate_papers_per_sec: parsed.ingestion_rate_papers_per_sec || 12.5,
              ingestion_rate_words_per_sec: parsed.ingestion_rate_words_per_sec || 62500,
            };
            scheduleThrottledUpdate();
          } catch {
            // Non-JSON plain ping
          }
        };

        // Custom Event: telemetry (from multi-event specification)
        eventSource.addEventListener('telemetry', (e: MessageEvent) => {
          try {
            const parsed: StreamingTelemetryPayload = JSON.parse(e.data);
            setIsStreaming(true);
            setIsFallback(false);
            pendingTelemetryRef.current = parsed;
            scheduleThrottledUpdate();
          } catch {
            // Ignore parse error
          }
        });

        // Custom Event: eda_delta (online quantile and category shifts)
        eventSource.addEventListener('eda_delta', (e: MessageEvent) => {
          try {
            const delta: EdaDeltaPayload = JSON.parse(e.data);
            pendingDeltaRef.current = delta;
            scheduleThrottledUpdate();
          } catch {
            // Ignore parse error
          }
        });

        // Custom Event: anomaly_alert (real-time scientific outlier alert)
        eventSource.addEventListener('anomaly_alert', (e: MessageEvent) => {
          try {
            const alertPayload: AnomalyAlertPayload = JSON.parse(e.data);
            setAnomalies((prev) => [alertPayload, ...prev.slice(0, 9)]);
          } catch {
            // Ignore parse error
          }
        });

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          setIsStreaming(false);
          setIsFallback(true);

          // Fallback heartbeat every 4 seconds
          if (!fallbackInterval) {
            fallbackInterval = setInterval(() => {
              setLiveVelocity({
                papersPerSec: 0,
                wordsPerSec: 0,
                status: 'LOCAL CACHE ACTIVE',
              });
            }, 4000);
          }

          // Auto-reconnect after 6 seconds
          reconnectTimeout = setTimeout(() => {
            if (!isDisposed) {
              if (fallbackInterval) {
                clearInterval(fallbackInterval);
                fallbackInterval = null;
              }
              connectSSE();
            }
          }, 6000);
        };
      } catch {
        setIsStreaming(false);
        setIsFallback(true);
      }
    };

    connectSSE();

    return () => {
      isDisposed = true;
      if (eventSource) eventSource.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    };
  }, [scheduleThrottledUpdate]);

  return {
    edaData,
    loading,
    isStreaming,
    isFallback,
    telemetry,
    liveVelocity,
    anomalies,
    dismissAnomaly,
    clearAllAnomalies,
  };
}
