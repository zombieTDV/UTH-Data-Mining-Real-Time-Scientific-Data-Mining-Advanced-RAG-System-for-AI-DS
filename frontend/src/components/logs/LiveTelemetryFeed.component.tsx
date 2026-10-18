import { useState, useEffect, useRef } from 'react';
import { useLakehouseStreamStore } from '../../store';

export interface LogLine {
  id: string;
  time: string;
  level: string;
  tag: string;
  tier?: string | null;
  message: string;
}

const LEVEL_FILTERS = ['ALL', 'SUCCESS', 'INFO', 'WARN', 'ERROR'];

/**
 * Pipeline log view. Every line comes from the backend's single log buffer (Airflow runs, harvest DAGs, the queue consumer,
 * RabbitMQ/Qdrant monitor), delivered over the same SSE connection that carries the counters, so what is written here is
 * exactly what the numbers on the dashboard did.
 */
export function LiveTelemetryFeed() {
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { logs: storeLogs, connectionStatus, live } = useLakehouseStreamStore();

  const allLogs: LogLine[] = storeLogs.map((sl) => ({
    id: sl.id,
    time: sl.time,
    level: sl.level,
    tag: sl.tag,
    tier: sl.tier,
    message: sl.msg,
  }));

  const filteredLogs = allLogs.filter((l) => {
    if (filterLevel !== 'ALL' && l.level !== filterLevel) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return l.message.toLowerCase().includes(q) || l.tag.toLowerCase().includes(q) || l.time.includes(q) || (l.tier || '').includes(q);
    }
    return true;
  });

  // newest line first at the top; keep the view pinned there while "follow" is on
  useEffect(() => {
    if (follow && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [filteredLogs.length, follow]);

  const getTagColor = (level: LogLine['level']) => {
    switch (level) {
      case 'SUCCESS': return 'var(--accent-emerald)';
      case 'WARN': return 'var(--accent-gold)';
      case 'ERROR': return '#ef4444';
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
            {connectionStatus === 'CONNECTED' ? 'LIVE' : connectionStatus} · Airflow {live?.airflow.reachable ? 'online' : 'offline'} · queue {live ? live.queue.ready + live.queue.unacked : 0} → embed {live ? (live.queue.embed_ready ?? 0) + (live.queue.embed_unacked ?? 0) : 0}
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
            {LEVEL_FILTERS.map(lvl => (
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
        ref={scrollRef}
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
                {log.tier ? <span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>({log.tier})</span> : null}
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
        <span>SHOWING {filteredLogs.length} OF {allLogs.length} PIPELINE EVENTS (AIRFLOW · RABBITMQ · WORKER · QDRANT)</span>
        <span>
          <label style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} style={{ marginRight: 6 }} />
            FOLLOW LATEST
          </label>
          {' · '}CLICK A LINE TO COPY
        </span>
      </div>
    </div>
  );
}
