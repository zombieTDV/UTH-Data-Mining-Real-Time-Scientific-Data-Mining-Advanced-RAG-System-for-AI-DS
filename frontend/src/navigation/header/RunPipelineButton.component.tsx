import { useState, useEffect, useRef, type FC } from 'react';
import { useTranslation } from '../../hooks';
import type { PipelineStatus } from '../../types';
import {
  fetchSchedulerStatus,
  triggerSchedulerHarvest,
  startSchedulerDaemon,
  stopSchedulerDaemon,
  cancelSchedulerTask,
} from '../../services';
import { appendStreamLog } from '../../store';

export interface RunPipelineButtonProps {
  pipelineStatus: PipelineStatus;
  onClick: () => void;
}

export const RunPipelineButton: FC<RunPipelineButtonProps> = ({ pipelineStatus, onClick }) => {
  const { language } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [daemonActive, setDaemonActive] = useState<boolean>(false);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadStatus = async () => {
    try {
      const res = await fetchSchedulerStatus();
      if (res) {
        setDaemonActive(!!res.daemon_running);
        setActiveSource(res.active_source || null);
      }
    } catch {
      // Ignore background fetch error
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [dropdownOpen]);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleTriggerHarvestAll = async () => {
    setActionLoading(true);
    try {
      appendStreamLog({
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        level: 'EXEC',
        tag: 'SCHEDULER',
        msg: 'User triggered concurrent harvest across all 4 academic sources (arXiv, OpenReview, OpenAlex, CVF)',
      });
      const res = await triggerSchedulerHarvest('all', undefined, true, true);
      showFeedback(res.message || (language === 'vi' ? 'Đã kích hoạt thu thập 4 nguồn thành công' : 'Harvest dispatched for all 4 sources'));
      await loadStatus();
    } catch (e: any) {
      showFeedback(e.message || (language === 'vi' ? 'Lỗi kích hoạt thu thập' : 'Trigger harvest failed'));
    } finally {
      setActionLoading(false);
      setDropdownOpen(false);
    }
  };

  const handleToggleDaemon = async () => {
    setActionLoading(true);
    try {
      if (daemonActive) {
        const res = await stopSchedulerDaemon(false);
        showFeedback(res.message || (language === 'vi' ? 'Đã tắt hệ thống cào tự động nền' : 'Daemon stopped'));
      } else {
        const res = await startSchedulerDaemon(30);
        showFeedback(res.message || (language === 'vi' ? 'Đã bật cào tự động định kỳ (00:10 VN)' : 'Daemon active (00:10 VN)'));
      }
      await loadStatus();
    } catch (e: any) {
      showFeedback(e.message || (language === 'vi' ? 'Lỗi bật/tắt daemon' : 'Daemon toggle failed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelActiveTask = async () => {
    setActionLoading(true);
    try {
      const res = await cancelSchedulerTask();
      showFeedback(res.message || (language === 'vi' ? 'Đã dừng khẩn cấp tiến trình cào' : 'Active harvest task aborted'));
      await loadStatus();
    } catch (e: any) {
      showFeedback(e.message || (language === 'vi' ? 'Lỗi dừng tiến trình' : 'Cancel task failed'));
    } finally {
      setActionLoading(false);
      setDropdownOpen(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Unified Split-Action Button Group */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'stretch',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(255, 87, 34, 0.35)',
          background: pipelineStatus === 'RUNNING'
            ? 'var(--accent-bronze, #d97706)'
            : 'linear-gradient(135deg, #ff5722 0%, #ea580c 100%)',
        }}
      >
        {/* Primary Action Button (Mining Engine) */}
        <button
          type="button"
          onClick={onClick}
          disabled={pipelineStatus === 'RUNNING'}
          style={{
            background: 'none',
            color: '#ffffff',
            border: 'none',
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            cursor: pipelineStatus === 'RUNNING' ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: pipelineStatus === 'RUNNING' ? 0.85 : 1,
            transition: 'opacity 0.15s ease',
          }}
          title={language === 'vi' ? 'Kích hoạt pipeline Khai phá Dữ liệu (4 Trụ Cột + EDA)' : 'Run Data Mining Pipeline (4 Pillars + EDA)'}
        >
          {pipelineStatus === 'RUNNING' ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              <span>{language === 'vi' ? 'ĐANG CHẠY...' : 'RUNNING...'}</span>
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{language === 'vi' ? 'CHẠY PIPELINE' : 'RUN PIPELINE'}</span>
            </>
          )}
        </button>

        {/* Dropdown Toggle Chevron */}
        <button
          type="button"
          onClick={() => setDropdownOpen((prev) => !prev)}
          style={{
            background: 'none',
            border: 'none',
            borderLeft: '1px solid rgba(255, 255, 255, 0.28)',
            color: '#ffffff',
            padding: '6px 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s ease',
          }}
          title={language === 'vi' ? 'Mở menu tùy chọn nâng cao' : 'Open advanced pipeline actions'}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            style={{
              transform: dropdownOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Floating Dropdown Menu */}
      {dropdownOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 100,
            width: '310px',
            backgroundColor: 'rgba(15, 23, 42, 0.96)',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '10px',
            padding: '10px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          {/* Menu Header with Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '8px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>
              {language === 'vi' ? 'ĐIỀU PHỐI TÁC VỤ' : 'PIPELINE DISPATCHER'}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: daemonActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                color: daemonActive ? '#34d399' : '#94a3b8',
                fontWeight: 700,
              }}
            >
              {daemonActive ? (language === 'vi' ? 'DAEMON: BẬT' : 'DAEMON: ON') : (language === 'vi' ? 'DAEMON: TẮT' : 'DAEMON: OFF')}
            </span>
          </div>

          {/* Feedback Message */}
          {feedback && (
            <div
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
              }}
            >
              ℹ {feedback}
            </div>
          )}

          {/* Option 1: Trigger Mining Engine */}
          <button
            type="button"
            onClick={() => {
              setDropdownOpen(false);
              onClick();
            }}
            disabled={pipelineStatus === 'RUNNING'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '7px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#f8fafc',
              cursor: pipelineStatus === 'RUNNING' ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: 'rgba(249, 115, 22, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f97316',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#f8fafc' }}>
                {language === 'vi' ? 'Khai Phá Dữ Liệu (Mining Engine)' : 'Data Mining Engine (4 Pillars)'}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                {language === 'vi' ? 'FP-Growth • K-Means • Graph • Isolation Forest' : 'FP-Growth • K-Means • Graph • Isolation Forest'}
              </div>
            </div>
          </button>

          {/* Option 2: Harvest All 4 Sources */}
          <button
            type="button"
            onClick={handleTriggerHarvestAll}
            disabled={actionLoading || !!activeSource}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '7px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#f8fafc',
              cursor: actionLoading || !!activeSource ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#f8fafc' }}>
                {language === 'vi' ? 'Thu Thập 4 Nguồn (Harvest All)' : 'Harvest All 4 Academic Sources'}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                {language === 'vi' ? 'arXiv • OpenReview • OpenAlex • CVF' : 'arXiv • OpenReview • OpenAlex • CVF'}
              </div>
            </div>
          </button>

          {/* Option 3: Scheduler Daemon Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: '7px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#f8fafc' }}>
                {language === 'vi' ? 'Cào Tự Động Nền (Daily Daemon)' : 'Background Daily Daemon'}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                {language === 'vi' ? 'Lặp định kỳ hàng ngày 00:10 VN' : 'Autonomous daily harvest at 00:10 VN'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleDaemon}
              disabled={actionLoading}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                border: 'none',
                fontSize: '11px',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                backgroundColor: daemonActive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                color: daemonActive ? '#34d399' : '#f87171',
                transition: 'all 0.15s ease',
              }}
            >
              {daemonActive ? (language === 'vi' ? 'BẬT' : 'ON') : (language === 'vi' ? 'TẮT' : 'OFF')}
            </button>
          </div>

          {/* Option 4: Emergency Cancel (Shown when a source is actively harvesting) */}
          {activeSource && (
            <button
              type="button"
              onClick={handleCancelActiveTask}
              disabled={actionLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '7px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#f87171',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                fontWeight: 700,
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
              <span>
                {language === 'vi'
                  ? `Dừng Khẩn Cấp Tác Vụ (${activeSource.toUpperCase()})`
                  : `Emergency Cancel (${activeSource.toUpperCase()})`}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
