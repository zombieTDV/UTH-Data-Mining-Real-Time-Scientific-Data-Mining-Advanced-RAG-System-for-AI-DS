import { useState, useEffect } from 'react';
import type { FC } from 'react';
import {
  fetchSchedulerStatus,
  startSchedulerDaemon,
  stopSchedulerDaemon,
  toggleSchedulerSource,
  cancelSchedulerTask,
  triggerSchedulerHarvest,
} from '../../services';
import { useTranslation } from '../../hooks';

interface SourceItem {
  key: string;
  name: string;
  frequency: string;
  enabled: boolean;
  status: string;
  last_run: string | null;
  next_run: string | null;
  last_duration_s: number;
  total_papers_harvested: number;
  last_error: string | null;
}

export const AdaptiveSchedulerControl: FC = () => {
  const { language } = useTranslation();
  const [daemonRunning, setDaemonRunning] = useState(false);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [activePid, setActivePid] = useState<number | null>(null);
  const [sources, setSources] = useState<Record<string, SourceItem>>({});
  const [loading, setLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [triggeringSource, setTriggeringSource] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const res = await fetchSchedulerStatus();
      if (res) {
        setDaemonRunning(!!res.daemon_running);
        setActiveSource(res.active_source || null);
        setActivePid(res.active_pid || null);
        if (res.sources) {
          setSources(res.sources);
        }
      }
    } catch (e: any) {
      console.warn('[SchedulerControl] Failed to load scheduler status:', e);
    }
  };

  useEffect(() => {
    loadStatus();
    // Low-frequency polling (every 10s) to keep next_run / status updated with negligible network footprint
    const timer = setInterval(loadStatus, 10000);
    return () => clearInterval(timer);
  }, []);

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleToggleDaemon = async () => {
    setLoading(true);
    try {
      if (daemonRunning) {
        const res = await stopSchedulerDaemon(false);
        showFeedback(res.message || 'Đã tắt hệ thống cào tự động (Daemon Stopped)');
      } else {
        const res = await startSchedulerDaemon(30);
        showFeedback(res.message || 'Đã bật hệ thống cào tự động (Daemon Started)');
      }
      await loadStatus();
    } catch (e: any) {
      showFeedback(`Lỗi: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSource = async (key: string, currentEnabled: boolean) => {
    setLoading(true);
    try {
      const res = await toggleSchedulerSource(key, !currentEnabled);
      showFeedback(res.message || `Đã chuyển đổi trạng thái nguồn ${key.toUpperCase()}`);
      await loadStatus();
    } catch (e: any) {
      showFeedback(`Lỗi: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTask = async () => {
    setLoading(true);
    try {
      const res = await cancelSchedulerTask();
      showFeedback(res.message || 'Đã dừng khẩn cấp tác vụ đang cào.');
      await loadStatus();
    } catch (e: any) {
      showFeedback(`Lỗi: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleManualTrigger = async (key: string) => {
    setTriggeringSource(key);
    try {
      const res = await triggerSchedulerHarvest(key, undefined, true, true);
      showFeedback(res.message || `Đã kích hoạt cào cho ${key.toUpperCase()}`);
      await loadStatus();
    } catch (e: any) {
      showFeedback(`Lỗi: ${e.message}`);
    } finally {
      setTriggeringSource(null);
    }
  };

  const sourceKeys = ['arxiv', 'openreview', 'openalex', 'cvf'];

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        marginTop: '20px',
      }}
    >
      {/* Header & Cost-Guard Pill */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {language === 'vi' ? 'Bộ Điều Khiển Cào Thông Minh & Tiết Kiệm R2' : 'Adaptive Harvester & R2 Cost Guard'}
            </h4>
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--accent-emerald)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontWeight: 600,
              }}
            >
              🛡️ Cache-First Zero-R2 Bill Guard
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            {language === 'vi'
              ? 'Tự động cào 4 nguồn theo lịch, nén Parquet gộp batch trước khi đồng bộ R2. Frontend cập nhật realtime 100% qua SSE Cache.'
              : 'Orchestrates 4 academic sources on schedule with Parquet compaction. Zero direct R2 queries from Frontend.'}
          </p>
        </div>

        {/* Global Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeSource && (
            <button
              type="button"
              onClick={handleCancelTask}
              disabled={loading}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
              }}
            >
              <span>⏹</span> Dừng Khẩn Cấp ({activeSource.toUpperCase()}{activePid ? ` #${activePid}` : ''})
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleDaemon}
            disabled={loading}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              background: daemonRunning ? 'rgba(239, 68, 68, 0.12)' : 'var(--accent-emerald)',
              color: daemonRunning ? '#ef4444' : '#ffffff',
              border: daemonRunning ? '1px solid rgba(239, 68, 68, 0.3)' : 'none',
              fontSize: '11.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: daemonRunning ? 'var(--accent-emerald)' : '#94a3b8',
                display: 'inline-block',
                boxShadow: daemonRunning ? '0 0 8px #10b981' : 'none',
              }}
            />
            {daemonRunning
              ? language === 'vi' ? 'TẮT CÀO TỰ ĐỘNG' : 'STOP AUTO-DAEMON'
              : language === 'vi' ? 'BẬT CÀO TỰ ĐỘNG' : 'START AUTO-DAEMON'}
          </button>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: '12px',
            borderRadius: '6px',
            background: 'rgba(37, 99, 235, 0.12)',
            color: 'var(--accent-blue)',
            border: '1px solid rgba(37, 99, 235, 0.25)',
            fontSize: '11.5px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          ℹ️ {actionFeedback}
        </div>
      )}

      {/* 4 Academic Sources Matrix */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '12px',
        }}
      >
        {sourceKeys.map((key) => {
          const item = sources[key] || {
            key,
            name: key.toUpperCase(),
            frequency: 'Scheduled',
            enabled: true,
            status: 'IDLE',
            last_run: null,
            next_run: null,
            total_papers_harvested: 0,
          };

          const isEnabled = item.enabled !== false;
          const isRunning = item.status === 'RUNNING' || activeSource === key;
          const isTriggering = triggeringSource === key;

          return (
            <div
              key={key}
              style={{
                background: 'var(--bg-surface)',
                border: isRunning
                  ? '1px solid var(--accent-bronze)'
                  : isEnabled
                  ? '1px solid var(--border-subtle)'
                  : '1px dashed var(--border-muted)',
                borderRadius: 'var(--radius-md)',
                padding: '14px',
                opacity: isEnabled ? 1 : 0.65,
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                  {key.toUpperCase()}
                </span>

                {/* Source Switch (ON / OFF) */}
                <button
                  type="button"
                  onClick={() => handleToggleSource(key, isEnabled)}
                  disabled={loading}
                  title={isEnabled ? 'Bấm để Tắt nguồn này' : 'Bấm để Bật nguồn này'}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '10px',
                    border: 'none',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: isEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: isEnabled ? 'var(--accent-emerald)' : '#ef4444',
                  }}
                >
                  {isEnabled ? '🟢 BẬT' : '🔴 TẮT'}
                </button>
              </div>

              <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.4' }}>
                {item.frequency}
              </div>

              <div
                style={{
                  fontSize: '10.5px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  marginBottom: '10px',
                }}
              >
                <div>Lần cào cuối: <span style={{ color: 'var(--text-primary)' }}>{item.last_run ? item.last_run.split(' ')[1] : 'Chưa'}</span></div>
                <div>Lần tới: <span style={{ color: 'var(--accent-blue)' }}>{item.next_run ? item.next_run.split(' ')[1] : 'N/A'}</span></div>
                <div>Đã thu thập: <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>{item.total_papers_harvested.toLocaleString()} bài</span></div>
              </div>

              {/* Action: Trigger Now */}
              <button
                type="button"
                onClick={() => handleManualTrigger(key)}
                disabled={isRunning || isTriggering || !isEnabled}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: isRunning ? 'var(--accent-gold)' : 'var(--bg-elevated)',
                  color: isRunning ? '#000000' : 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '10.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  cursor: isRunning || isTriggering || !isEnabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  transition: 'background 0.15s ease',
                }}
              >
                {isRunning ? '🔵 Đang cào...' : isTriggering ? '⏳ Đang khởi động...' : '▶ Cào Ngay'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
