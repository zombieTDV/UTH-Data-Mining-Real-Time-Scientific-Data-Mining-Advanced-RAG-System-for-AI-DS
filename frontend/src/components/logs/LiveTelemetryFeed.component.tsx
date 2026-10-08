import { useState, useEffect, useRef, useMemo, type FC } from 'react';
import { subscribeTelemetry } from '../../services';
import { useLakehouseStreamStore, appendStreamLog, clearStreamLogs, type StreamingLogEntry } from '../../store';
import { useTranslation } from '../../hooks';

export interface LogLine {
  id: string;
  time: string;
  level: 'SUCCESS' | 'INFO' | 'QUERY' | 'STORAGE' | 'START' | 'EXEC' | 'WARN';
  tag: string;
  message: string;
}

export const LiveTelemetryFeed: FC = () => {
  const { language } = useTranslation();
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [selectedLog, setSelectedLog] = useState<LogLine | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  const { logs: storeLogs, isStreaming, streamSpeed, connectionStatus, storageUsedGb } = useLakehouseStreamStore();

  // Listen to telemetry SSE events safely (skip 3s repeating heartbeat dumps)
  useEffect(() => {
    const unsub = subscribeTelemetry((data: any) => {
      if (!data) return;

      const isHeartbeatPulse = data.timestamp && (data.modules || data.total_execution_seconds !== undefined);
      if (isHeartbeatPulse) {
        return;
      }

      if (data.event || data.message) {
        appendStreamLog({
          time: new Date().toISOString().replace('T', ' ').slice(0, 19),
          level: (data.level || 'INFO') as any,
          tag: data.tag || 'TELEMETRY',
          msg: data.message || `System event: ${JSON.stringify(data)}`,
        });
      }
    });

    return () => {
      unsub();
    };
  }, []);

  const allLogs: LogLine[] = useMemo(() => {
    return storeLogs.map((sl: StreamingLogEntry) => ({
      id: sl.id,
      time: sl.time,
      level: sl.level as LogLine['level'],
      tag: sl.tag,
      message: sl.msg,
    }));
  }, [storeLogs]);

  // Telemetry counts by level
  const countsByLevel = useMemo(() => {
    const counts = { ALL: allLogs.length, SUCCESS: 0, STORAGE: 0, INFO: 0, QUERY: 0, WARN: 0 };
    for (const l of allLogs) {
      if (l.level === 'SUCCESS') counts.SUCCESS++;
      else if (l.level === 'STORAGE') counts.STORAGE++;
      else if (l.level === 'INFO') counts.INFO++;
      else if (l.level === 'QUERY') counts.QUERY++;
      else if (l.level === 'WARN') counts.WARN++;
    }
    return counts;
  }, [allLogs]);

  const filteredLogs = useMemo(() => {
    return allLogs.filter((l) => {
      if (filterLevel !== 'ALL' && l.level !== filterLevel) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return l.message.toLowerCase().includes(q) || l.tag.toLowerCase().includes(q) || l.time.includes(q);
      }
      return true;
    });
  }, [allLogs, filterLevel, search]);

  // Auto-scroll to top or bottom as new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [storeLogs, autoScroll]);

  const getTagTheme = (level: LogLine['level']) => {
    switch (level) {
      case 'SUCCESS':
        return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' };
      case 'STORAGE':
        return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' };
      case 'QUERY':
        return { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' };
      case 'WARN':
        return { color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.3)' };
      case 'START':
        return { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.3)' };
      case 'EXEC':
        return { color: '#818cf8', bg: 'rgba(129, 140, 248, 0.12)', border: 'rgba(129, 140, 248, 0.3)' };
      case 'INFO':
      default:
        return { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.25)' };
    }
  };

  const handleCopyLine = (text: string, id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleExportLogs = () => {
    const content = allLogs.map((l) => `[${l.time}] [${l.level}] [${l.tag}] ${l.message}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `uth-lakehouse-telemetry-${new Date().toISOString().slice(0, 10)}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        width: '100%',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.2)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 1. Terminal Window Header Bar (Mac/Unix Style Window Controls) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 18px',
          backgroundColor: 'var(--bg-surface-elevated, #162035)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Terminal Dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 800,
                letterSpacing: '0.04em',
                color: 'var(--text-primary)',
              }}
            >
              {language === 'vi' ? 'BẢNG ĐIỀU KHIỂN TELEMETRY LAKEHOUSE' : 'LAKEHOUSE TELEMETRY STREAM CONSOLE'}
            </span>

            {/* Connection Status Pill */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '10.5px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: connectionStatus === 'CONNECTED' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: connectionStatus === 'CONNECTED' ? '#10b981' : '#ef4444',
                border: `1px solid ${connectionStatus === 'CONNECTED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: connectionStatus === 'CONNECTED' ? '#10b981' : '#ef4444',
                  boxShadow: connectionStatus === 'CONNECTED' ? '0 0 8px #10b981' : 'none',
                }}
              />
              {connectionStatus === 'CONNECTED' ? 'LIVE SSE' : connectionStatus}
            </span>

            {isStreaming && (
              <span
                style={{
                  fontSize: '10.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(6, 182, 212, 0.14)',
                  color: '#06b6d4',
                  border: '1px solid rgba(6, 182, 212, 0.35)',
                }}
              >
                {streamSpeed} {language === 'vi' ? 'bài/phút' : 'ppm'}
              </span>
            )}
          </div>
        </div>

        {/* Global Action Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Storage Snapshot Pill */}
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-canvas)',
              color: 'var(--accent-gold, #fbbf24)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            R2: {storageUsedGb.toFixed(2)} GB
          </span>

          {/* Auto-scroll toggle */}
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: autoScroll ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-canvas)',
              color: autoScroll ? '#38bdf8' : 'var(--text-muted)',
              border: `1px solid ${autoScroll ? 'rgba(56, 189, 248, 0.4)' : 'var(--border-subtle)'}`,
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={language === 'vi' ? 'Tự động cuộn đến log mới nhất' : 'Auto scroll to newest log'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="7 13 12 18 17 13" />
              <polyline points="7 6 12 11 17 6" />
            </svg>
            {language === 'vi' ? 'TỰ CUỘN' : 'AUTO SCROLL'}
          </button>

          {/* Export Log Button */}
          <button
            type="button"
            onClick={handleExportLogs}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: 'var(--bg-canvas)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={language === 'vi' ? 'Xuất toàn bộ log ra file text (.log)' : 'Download all recorded logs as .log'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {language === 'vi' ? 'XUẤT LOG' : 'EXPORT'}
          </button>

          {/* Reset Logs Button */}
          <button
            type="button"
            onClick={clearStreamLogs}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={language === 'vi' ? 'Đặt lại toàn bộ nhật ký về trạng thái ban đầu của Lakehouse' : 'Reset telemetry logs back to baseline'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            {language === 'vi' ? 'ĐẶT LẠI' : 'RESET'}
          </button>
        </div>
      </div>

      {/* 2. Interactive Search & Level Category Filter Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '10px 18px',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* Category Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {(['ALL', 'SUCCESS', 'STORAGE', 'INFO', 'QUERY', 'WARN'] as const).map((lvl) => {
            const isSelected = filterLevel === lvl;
            const count = countsByLevel[lvl as keyof typeof countsByLevel] ?? 0;
            return (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  backgroundColor: isSelected ? 'var(--bg-surface-elevated, #1e293b)' : 'var(--bg-canvas)',
                  border: isSelected ? '1px solid var(--accent-silver, #38bdf8)' : '1px solid var(--border-subtle)',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{language === 'vi' && lvl === 'ALL' ? 'TẤT CẢ' : lvl}</span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 5px',
                    borderRadius: '999px',
                    backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                    color: isSelected ? '#38bdf8' : 'var(--text-muted)',
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Real-time Search Input with Clear Button */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: 'absolute', left: '10px', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder={language === 'vi' ? 'Tìm bài báo, công thức, mã lỗi...' : 'Filter papers, tags, payloads...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '6px 28px 6px 30px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              outline: 'none',
              width: '260px',
              transition: 'border-color 0.15s ease',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '2px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 3. Main Console Terminal Feed */}
      <div
        ref={logContainerRef}
        className="log-scrollbar"
        style={{
          backgroundColor: 'var(--bg-canvas, #090d16)',
          height: '560px',
          overflowY: 'auto',
          padding: '8px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          lineHeight: '1.7',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {filteredLogs.length === 0 ? (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>{language === 'vi' ? 'Không tìm thấy dòng nhật ký nào phù hợp với bộ lọc.' : 'No telemetry events match current filter criteria.'}</span>
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            const theme = getTagTheme(log.level);
            const isSelected = selectedLog?.id === log.id;
            return (
              <div
                key={log.id}
                onClick={() => setSelectedLog(isSelected ? null : log)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '12px',
                  padding: '5px 8px',
                  borderRadius: '5px',
                  backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                  border: isSelected ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'background-color 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={language === 'vi' ? 'Bấm để xem chi tiết hoặc sao chép' : 'Click to inspect or copy details'}
              >
                {/* Index / Line number */}
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    width: '36px',
                    textAlign: 'right',
                    userSelect: 'none',
                    flexShrink: 0,
                  }}
                >
                  {(index + 1).toString().padStart(3, '0')}
                </span>

                {/* Timestamp */}
                <span
                  style={{
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '11.5px',
                    flexShrink: 0,
                    userSelect: 'none',
                  }}
                >
                  {log.time}
                </span>

                {/* Level / Tag Badge */}
                <span
                  style={{
                    color: theme.color,
                    backgroundColor: theme.bg,
                    border: `1px solid ${theme.border}`,
                    fontSize: '10.5px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    flexShrink: 0,
                    minWidth: '110px',
                    textAlign: 'center',
                    userSelect: 'none',
                  }}
                >
                  {log.tag}
                </span>

                {/* Message Body */}
                <span
                  style={{
                    color: 'var(--text-primary)',
                    wordBreak: 'break-word',
                    flex: 1,
                  }}
                >
                  {log.message}
                </span>

                {/* Quick Copy Button */}
                <button
                  type="button"
                  onClick={(e) => handleCopyLine(`[${log.time}] [${log.tag}] ${log.message}`, log.id, e)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: copiedId === log.id ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    flexShrink: 0,
                    opacity: 0.8,
                    transition: 'all 0.15s ease',
                  }}
                  title={language === 'vi' ? 'Sao chép dòng này' : 'Copy this line'}
                >
                  {copiedId === log.id ? (
                    <span style={{ color: '#10b981', fontWeight: 800 }}>✓ COPIED</span>
                  ) : (
                    <span>COPY</span>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Selected Log Detail Drawer (Deep Inspection) */}
      {selectedLog && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface-elevated, #162035)',
            borderTop: '1px solid var(--border-subtle)',
            padding: '12px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--accent-silver, #38bdf8)' }}>
              {language === 'vi' ? 'CHI TIẾT SỰ KIỆN ĐÃ CHỌN' : 'SELECTED EVENT PAYLOAD INSPECTION'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleCopyLine(JSON.stringify(selectedLog, null, 2), selectedLog.id)}
                style={{
                  background: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                {copiedId === selectedLog.id ? '✓ COPIED JSON' : 'COPY JSON'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '0 4px',
                }}
              >
                ✕
              </button>
            </div>
          </div>
          <pre
            style={{
              margin: 0,
              fontSize: '11.5px',
              backgroundColor: 'var(--bg-canvas)',
              padding: '8px 12px',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              overflowX: 'auto',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {JSON.stringify(selectedLog, null, 2)}
          </pre>
        </div>
      )}

      {/* 5. Terminal Status Footer Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '8px 18px',
          backgroundColor: 'var(--bg-surface-elevated, #162035)',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>
            {language === 'vi'
              ? `HIỂN THỊ ${filteredLogs.length} TRÊN ${allLogs.length} DÒNG SỰ KIỆN`
              : `SHOWING ${filteredLogs.length} OF ${allLogs.length} RECORDED LAKEHOUSE EVENTS`}
          </span>
          <span style={{ color: 'var(--border-subtle)' }}>•</span>
          <span style={{ color: 'var(--text-muted)' }}>
            BUFFER: 200 {language === 'vi' ? 'sự kiện gần nhất' : 'max event history'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>{language === 'vi' ? 'BẤM DÒNG ĐỂ XEM CHI TIẾT' : 'CLICK ROW TO INSPECT PAYLOAD'}</span>
          <span style={{ color: 'var(--border-subtle)' }}>•</span>
          <span style={{ color: '#10b981', fontWeight: 700 }}>REAL-TIME LAKEHOUSE CDC PULSE ACTIVE</span>
        </div>
      </div>
    </div>
  );
};
