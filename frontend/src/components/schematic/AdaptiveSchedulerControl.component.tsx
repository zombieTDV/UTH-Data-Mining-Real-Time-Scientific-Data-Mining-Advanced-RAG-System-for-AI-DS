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

const SOURCE_META: Record<string, { label: string; sublabel: string; color: string; badge: string }> = {
  arxiv: {
    label: 'arXiv Preprints',
    sublabel: 'OAI-PMH XML • cs.AI, cs.LG, cs.CV',
    color: '#8b5cf6',
    badge: 'PREPRINT',
  },
  openreview: {
    label: 'OpenReview Reviews',
    sublabel: 'Peer Reviews & Rebuttals • ICLR, NeurIPS',
    color: '#2563eb',
    badge: 'PEER-REVIEW',
  },
  openalex: {
    label: 'OpenAlex Graph',
    sublabel: 'Global Citation Graph & Inverted Abstracts',
    color: '#0284c7',
    badge: 'CITATION-GRAPH',
  },
  cvf: {
    label: 'CVF Open Access',
    sublabel: 'Proceedings Full-Text • CVPR, ICCV',
    color: '#059669',
    badge: 'CONFERENCE',
  },
};

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
    const timer = setInterval(loadStatus, 8000);
    return () => clearInterval(timer);
  }, []);

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 4500);
  };

  const handleToggleDaemon = async () => {
    setLoading(true);
    try {
      if (daemonRunning) {
        const res = await stopSchedulerDaemon(false);
        showFeedback(res.message || (language === 'vi' ? 'Đã tắt hệ thống cào tự động nền' : 'Scheduler daemon stopped'));
      } else {
        const res = await startSchedulerDaemon(30);
        showFeedback(res.message || (language === 'vi' ? 'Đã bật hệ thống cào tự động nền (00:10 VN)' : 'Scheduler daemon active (Daily 00:10 VN)'));
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
      showFeedback(res.message || (language === 'vi' ? `Đã cập nhật trạng thái nguồn ${key.toUpperCase()}` : `Updated status for ${key.toUpperCase()}`));
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
      showFeedback(res.message || (language === 'vi' ? 'Đã hủy khẩn cấp tiến trình cào đang thực thi' : 'Aborted active crawler subprocess'));
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
      showFeedback(res.message || (language === 'vi' ? `Đã kích hoạt cào dữ liệu cho nguồn ${key.toUpperCase()}` : `Triggered harvest for ${key.toUpperCase()}`));
      await loadStatus();
    } catch (e: any) {
      showFeedback(`Lỗi: ${e.message}`);
    } finally {
      setTriggeringSource(null);
    }
  };

  const handleTriggerAll = async () => {
    setTriggeringSource('all');
    try {
      const res = await triggerSchedulerHarvest('all', undefined, true, true);
      showFeedback(res.message || (language === 'vi' ? 'Đã kích hoạt thu thập toàn bộ 4 nguồn học thuật' : 'Dispatched harvest for all 4 sources'));
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
        background: 'var(--bg-surface-elevated, #162035)',
        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
        borderRadius: '12px',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Top Header Row: Mission Title & Global Daemon Controller */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: daemonRunning ? '#10b981' : '#94a3b8',
                boxShadow: daemonRunning ? '0 0 10px #10b981' : 'none',
              }}
            />
            <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '0.02em' }}>
              {language === 'vi' ? 'Bộ Điều Khiển Thu Thập Đa Nguồn Thích Ứng (4 Nguồn)' : 'Adaptive Multi-Source Ingestion Mission Control'}
            </h4>
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontWeight: 700,
              }}
            >
              Cache-First R2 Guard
            </span>
          </div>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted, #94a3b8)', margin: '4px 0 0 0', fontFamily: 'var(--font-mono)' }}>
            {language === 'vi'
              ? 'Lịch tự động hàng ngày: 00:10 VN. Nén batch Parquet trước khi nạp R2, bảo toàn hạn mức Free Tier.'
              : 'Automated Daily at 00:10 VN. Batch compaction into Parquet before R2 push, preserving Free Tier quota.'}
          </p>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {activeSource && (
            <button
              type="button"
              onClick={handleCancelTask}
              disabled={loading}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 10px rgba(239, 68, 68, 0.4)',
                animation: 'pulse 1.5s infinite',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
              {language === 'vi'
                ? `DỪNG KHẨN CẤP (${activeSource.toUpperCase()}${activePid ? ` #${activePid}` : ''})`
                : `ABORT (${activeSource.toUpperCase()}${activePid ? ` #${activePid}` : ''})`}
            </button>
          )}

          <button
            type="button"
            onClick={handleTriggerAll}
            disabled={loading || triggeringSource === 'all' || !!activeSource}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(59, 130, 246, 0.18)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: loading || !!activeSource ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{triggeringSource === 'all' ? '...' : '▶'}</span>
            <span>{language === 'vi' ? 'CÀO TẤT CẢ (4 NGUỒN)' : 'HARVEST ALL (4 SOURCES)'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleDaemon}
            disabled={loading}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: daemonRunning ? 'rgba(239, 68, 68, 0.15)' : '#10b981',
              color: daemonRunning ? '#f87171' : '#ffffff',
              border: daemonRunning ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid #059669',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: daemonRunning ? 'none' : '0 2px 8px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.15s ease',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: daemonRunning ? '#f87171' : '#ffffff',
              }}
            />
            {daemonRunning
              ? (language === 'vi' ? 'TẮT TỰ ĐỘNG (DAEMON)' : 'STOP DAEMON')
              : (language === 'vi' ? 'BẬT TỰ ĐỘNG (DAEMON)' : 'START DAEMON')}
          </button>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(37, 99, 235, 0.15)',
            color: '#93c5fd',
            border: '1px solid rgba(37, 99, 235, 0.3)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ color: '#60a5fa' }}>●</span>
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* 4 Academic Sources Matrix Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '8px',
        }}
      >
        {sourceKeys.map((key) => {
          const meta = SOURCE_META[key] || {
            label: key.toUpperCase(),
            sublabel: 'Academic Source',
            color: '#6366f1',
            badge: 'SOURCE',
          };

          const item = sources[key] || {
            key,
            name: meta.label,
            frequency: 'Daily at 00:10 VN',
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
                background: 'var(--bg-surface, #0f172a)',
                border: isRunning
                  ? `2px solid ${meta.color}`
                  : isEnabled
                  ? '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))'
                  : '1px dashed rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '10px 12px',
                opacity: isEnabled ? 1 : 0.6,
                boxShadow: isRunning ? `0 0 16px ${meta.color}44` : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Card Header: Source Name + Category Tag + ON/OFF Switch */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: meta.color,
                      boxShadow: `0 0 6px ${meta.color}`,
                    }}
                  />
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {meta.label}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleSource(key, isEnabled)}
                  disabled={loading}
                  title={isEnabled ? 'Click to disable' : 'Click to enable'}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: isEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: isEnabled ? '#34d399' : '#f87171',
                    letterSpacing: '0.04em',
                  }}
                >
                  {isEnabled ? (language === 'vi' ? 'BẬT' : 'ON') : (language === 'vi' ? 'TẮT' : 'OFF')}
                </button>
              </div>

              {/* Sublabel & Category details */}
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #94a3b8)', fontFamily: 'var(--font-mono)' }}>
                {meta.sublabel}
              </div>

              {/* Metrics block */}
              <div
                style={{
                  fontSize: '10.5px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary, #cbd5e1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  paddingTop: '6px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Lần cào cuối:</span>
                  <span style={{ fontWeight: 600 }}>{item.last_run ? item.last_run.split(' ')[1] : 'Chưa'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Lần tới:</span>
                  <span style={{ color: '#60a5fa', fontWeight: 700 }}>{item.next_run ? item.next_run.split(' ')[1] : '00:10:00'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Đã thu thập:</span>
                  <span style={{ color: '#34d399', fontWeight: 800 }}>{(item.total_papers_harvested || 0).toLocaleString()} bài</span>
                </div>
              </div>

              {/* Manual Trigger Button */}
              <button
                type="button"
                onClick={() => handleManualTrigger(key)}
                disabled={isRunning || isTriggering || !isEnabled || !!activeSource}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  background: isRunning ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                  color: isRunning ? '#fbbf24' : 'var(--text-primary)',
                  border: isRunning ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  cursor: isRunning || isTriggering || !isEnabled || !!activeSource ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                {isRunning
                  ? (language === 'vi' ? 'Đang cào...' : 'Harvesting...')
                  : isTriggering
                  ? (language === 'vi' ? 'Đang gửi...' : 'Dispatched...')
                  : (language === 'vi' ? '▶ Cào Ngay' : '▶ Harvest Now')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
