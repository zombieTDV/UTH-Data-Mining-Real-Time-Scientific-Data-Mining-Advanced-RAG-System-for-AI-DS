import { useState, useEffect } from 'react';
import { subscribeTelemetry, subscribeIngestionStream } from '../../services';

export interface LogLine {
  id: string;
  time: string;
  level: 'SUCCESS' | 'INFO' | 'QUERY' | 'STORAGE' | 'START';
  tag: string;
  message: string;
}

export const PIPELINE_LOGS: LogLine[] = [
  {
    id: 'l-01',
    time: '2026-10-03 13:41:55',
    level: 'SUCCESS',
    tag: 'RAG/ANSWER',
    message: 'Grounded synthesis completed in 18.51s (5.9 words/s) citing [Paper: 2310.01407, Section: 5 Experiments]'
  },
  {
    id: 'l-02',
    time: '2026-10-03 13:41:37',
    level: 'QUERY',
    tag: 'RAG/RETRIEVE',
    message: 'LanceDB Cosine ANN returned 3 chunks (Top Sim: 0.8510) for query: "sampling z_t in CoDi"'
  },
  {
    id: 'l-03',
    time: '2026-10-03 13:41:35',
    level: 'INFO',
    tag: 'RAG/QUERY',
    message: 'Received scientific query: "How is z_t sampled in CoDi during generation?"'
  },
  {
    id: 'l-04',
    time: '2026-10-03 13:30:12',
    level: 'SUCCESS',
    tag: 'STORAGE/GOLD',
    message: 'LanceDB Gold multi-modal index built: 143,523 text embeddings (384-dim, cosine metric)'
  },
  {
    id: 'l-05',
    time: '2026-10-03 13:28:44',
    level: 'STORAGE',
    tag: 'STORAGE/SILVER',
    message: 'Parquet silver tables written to s3://arxiv-lakehouse/silver/ (10,000 papers, Snappy)'
  },
  {
    id: 'l-06',
    time: '2026-10-03 13:25:01',
    level: 'INFO',
    tag: 'MINING/PILLARS',
    message: 'FP-Growth computed 48 frequent itemsets (min_sup=0.05), 32 rules (min_conf=0.60)'
  },
  {
    id: 'l-07',
    time: '2026-10-03 13:22:18',
    level: 'INFO',
    tag: 'MINING/PILLARS',
    message: 'K-Means clustering converged at k=8 (Silhouette: 0.6184, Davies-Bouldin: 0.7412)'
  },
  {
    id: 'l-08',
    time: '2026-10-03 13:19:55',
    level: 'INFO',
    tag: 'MINING/PILLARS',
    message: 'PageRank computed across 2,410 co-authorship nodes. Top: Yoshua Bengio (0.0142)'
  },
  {
    id: 'l-09',
    time: '2026-10-03 13:15:30',
    level: 'STORAGE',
    tag: 'STORAGE/BRONZE',
    message: 'Bronze JSON corpus: 10,000 papers synced from R2 bucket arxiv-lakehouse-bronze'
  },
  {
    id: 'l-10',
    time: '2026-10-03 13:10:00',
    level: 'START',
    tag: 'PIPELINE/INIT',
    message: 'Pipeline initialized. Hardware: Apple M3 Max (Metal/MPS enabled). DuckDB v1.1.3'
  },
];

export function LiveTelemetryFeed() {
  const [logs, setLogs] = useState<LogLine[]>(PIPELINE_LOGS);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeTelemetry((data: any) => {
      if (data && data.stage) {
        const newLog: LogLine = {
          id: `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          time: data.timestamp ? data.timestamp.replace('T', ' ').slice(0, 19) : new Date().toISOString().replace('T', ' ').slice(0, 19),
          level: data.status === 'SUCCESS' ? 'SUCCESS' : data.status === 'ERROR' ? 'STORAGE' : 'INFO',
          tag: `LIVE/${data.stage.toUpperCase()}`,
          message: data.message || `Processed ${data.papers_processed || 0} papers (Latency: ${data.latency_ms || 0}ms)`,
        };
        setLogs((prev) => [newLog, ...prev.slice(0, 99)]);
      }
    });

    const unsubStream = subscribeIngestionStream((event: any) => {
      if (event && event.type) {
        const newLog: LogLine = {
          id: `stream-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          time: new Date().toISOString().replace('T', ' ').slice(0, 19),
          level: event.type === 'PAPER_INGESTED' ? 'SUCCESS' : 'INFO',
          tag: 'INGESTION/CDC',
          message: event.title ? `[${event.paper_id}] ${event.title} (${event.category})` : `CDC Stream: ${event.type}`,
        };
        setLogs((prev) => [newLog, ...prev.slice(0, 99)]);
      }
    });

    return () => {
      unsub();
      unsubStream();
    };
  }, []);

  const filteredLogs = logs.filter((l) => {
    if (filterLevel !== 'ALL' && l.level !== filterLevel) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return l.message.toLowerCase().includes(q) || l.tag.toLowerCase().includes(q) || l.time.includes(q);
    }
    return true;
  });

  const getTagColor = (level: LogLine['level']) => {
    switch (level) {
      case 'SUCCESS': return 'var(--accent-emerald)';
      case 'QUERY': return 'var(--accent-silver)';
      case 'STORAGE': return 'var(--accent-bronze)';
      case 'START': return 'var(--accent-gold)';
      default: return 'var(--text-secondary)';
    }
  };

  const handleCopyLine = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div style={{
      width: '100%',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--card-shadow)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      {/* Top Simple Control Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        paddingBottom: '14px',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--accent-emerald)',
            boxShadow: '0 0 8px rgba(16, 185, 129, 0.7)'
          }} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
            PIPELINE EXECUTION LOG
          </span>
          <span style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-subtle)',
            padding: '2px 8px',
            borderRadius: '3px'
          }}>
            logs/master_pipeline_20261003.log
          </span>
        </div>

        {/* Filter Chips & Search Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            padding: '2px'
          }}>
            {['ALL', 'SUCCESS', 'QUERY', 'STORAGE', 'INFO'].map(lvl => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                style={{
                  background: filterLevel === lvl ? 'var(--bg-surface-elevated)' : 'transparent',
                  border: filterLevel === lvl ? '1px solid var(--border-muted)' : 'none',
                  color: filterLevel === lvl ? 'var(--text-primary)' : 'var(--text-secondary)',
                  padding: '4px 10px',
                  borderRadius: '3px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {lvl}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search log lines..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              outline: 'none',
              width: '180px'
            }}
          />
        </div>
      </div>

      {/* Main Log Window with Dedicated Visible Scrollbar */}
      <div 
        className="log-scrollbar"
        style={{
        background: 'var(--bg-canvas)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '6px',
        padding: '12px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        lineHeight: 1.6,
        height: '620px',
        overflowY: 'scroll',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        {filteredLogs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No log entries found for current filter.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              onClick={() => handleCopyLine(`[${log.time}] [${log.tag}] ${log.message}`, log.id)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '6px 8px',
                borderRadius: '4px',
                background: copiedId === log.id ? 'var(--bg-surface-elevated)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.1s ease',
                borderBottom: '1px solid var(--border-subtle)'
              }}
              title="Click to copy log line"
            >
              {/* Timestamp */}
              <span style={{
                color: 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '12px',
                flexShrink: 0
              }}>
                [{log.time}]
              </span>

              {/* Tag / Category Badge */}
              <span style={{
                color: getTagColor(log.level),
                fontWeight: 700,
                fontSize: '12px',
                flexShrink: 0,
                minWidth: '110px'
              }}>
                [{log.tag}]
              </span>

              {/* Message */}
              <span style={{
                color: 'var(--text-primary)',
                wordBreak: 'break-word',
                flex: 1
              }}>
                {log.message}
              </span>

              {/* Copy Feedback */}
              {copiedId === log.id && (
                <span style={{
                  fontSize: '10px',
                  color: 'var(--accent-emerald)',
                  background: 'rgba(16, 185, 129, 0.15)',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  flexShrink: 0
                }}>
                  COPIED
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer Info */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '11.5px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-secondary)',
        paddingTop: '4px'
      }}>
        <span>SHOWING {filteredLogs.length} OF {PIPELINE_LOGS.length} RECORDED PIPELINE EVENTS</span>
        <span>CLICK ANY LINE TO COPY TO CLIPBOARD · DUAL LOGGING STREAM ACTIVE</span>
      </div>
    </div>
  );
}
