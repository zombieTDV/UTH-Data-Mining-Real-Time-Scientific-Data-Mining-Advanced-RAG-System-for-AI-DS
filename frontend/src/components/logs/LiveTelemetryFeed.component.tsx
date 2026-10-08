import { useState, useEffect } from 'react';
import { subscribeTelemetry } from '../../services';
import { useLakehouseStreamStore, appendStreamLog, clearStreamLogs, type StreamingLogEntry } from '../../store';

export interface LogLine {
  id: string;
  time: string;
  level: 'SUCCESS' | 'INFO' | 'QUERY' | 'STORAGE' | 'START' | 'EXEC' | 'WARN';
  tag: string;
  message: string;
}

export function LiveTelemetryFeed() {
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { logs: storeLogs } = useLakehouseStreamStore();

  useEffect(() => {
    const unsub = subscribeTelemetry((data: any) => {
      if (data && (data.event || data.message || data.status)) {
        appendStreamLog({
          time: new Date().toISOString().replace('T', ' ').slice(0, 19),
          level: (data.level || (data.status === 'ONLINE' ? 'SUCCESS' : 'INFO')) as any,
          tag: data.tag || 'TELEMETRY/SSE',
          msg: data.message || `System event: ${JSON.stringify(data)}`,
        });
      }
    });

    return () => {
      unsub();
    };
  }, []);

  const allLogs: LogLine[] = storeLogs.map((sl: StreamingLogEntry) => ({
    id: sl.id,
    time: sl.time,
    level: sl.level as LogLine['level'],
    tag: sl.tag,
    message: sl.msg,
  }));

  const filteredLogs = allLogs.filter((l) => {
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
      case 'EXEC': return 'var(--accent-silver)';
      case 'WARN': return 'var(--accent-bronze)';
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
            LAKEHOUSE REAL-TIME TELEMETRY FEED
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
            logs/lakehouse_stream_live.log
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

          <button
            type="button"
            onClick={clearStreamLogs}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 700,
              transition: 'all 0.15s ease',
            }}
            title="Reset telemetry log stream back to Lakehouse seed state"
          >
            RESET LOGS
          </button>
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
                minWidth: '125px'
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
        <span>SHOWING {filteredLogs.length} OF {allLogs.length} RECORDED LAKEHOUSE EVENTS</span>
        <span>CLICK ANY LINE TO COPY TO CLIPBOARD &bull; REAL-TIME SSE LOGGING STREAM ACTIVE</span>
      </div>
    </div>
  );
}
