import { useState, useMemo } from 'react';
import type { FC } from 'react';
import {
  fetchSchedulerStatus,
  startSchedulerDaemon,
  stopSchedulerDaemon,
  toggleSchedulerSource,
  cancelSchedulerTask,
  triggerSchedulerHarvest,
} from '../../services';
import { useLakehouseStreamStore } from '../../store/streaming.store';
import { useTranslation } from '../../hooks';

interface SourceItem {
  key: string;
  name: string;
  frequency: string;
  kind: string;
  enabled: boolean;
  status: string;
  last_run: string | null;
  next_run: string | null;
  last_duration_s: number;
  total_papers_harvested: number;
  last_error: string | null;
}

const fmtTime = (iso?: string | null): string => {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/**
 * Airflow orchestration panel. DAG state, queue depth and consumer count are read from the same live SSE snapshot as the
 * rest of the dashboard (refreshed every ~3 s by the backend monitor); the buttons call Airflow through the backend.
 */
export const AdaptiveSchedulerControl: FC = () => {
  const { language } = useTranslation();
  const isVi = language === 'vi';
  const { live } = useLakehouseStreamStore();
  const [loading, setLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [triggeringSource, setTriggeringSource] = useState<string | null>(null);

  const dags = live?.airflow.dags ?? [];
  const queue = live?.queue;
  const sources: Record<string, SourceItem> = useMemo(() => {
    const out: Record<string, SourceItem> = {};
    for (const d of dags) {
      const start = d.last_run?.start ? new Date(d.last_run.start).getTime() : 0;
      const end = d.last_run?.end ? new Date(d.last_run.end).getTime() : 0;
      out[d.key] = {
        key: d.key,
        name: d.name,
        frequency: d.frequency,
        kind: d.kind,
        enabled: !d.paused,
        status: d.running ? 'RUNNING' : (d.last_run?.state || 'never_run').toUpperCase(),
        last_run: d.last_run?.start ?? null,
        next_run: d.next_run ?? null,
        last_duration_s: start && end ? Math.round((end - start) / 1000) : 0,
        total_papers_harvested: live?.session.by_tier?.[d.key] ?? 0,
        last_error: d.last_run?.state === 'failed' ? 'Last Airflow run failed' : null,
      };
    }
    return out;
  }, [dags, live?.session.by_tier]);

  const harvestDags = dags.filter((d) => d.kind === 'harvest');
  const daemonRunning = !!live?.airflow.scheduler_healthy && harvestDags.some((d) => !d.paused);
  const runningDag = dags.find((d) => d.running);
  const activeSource: string | null = runningDag ? runningDag.key : null;
  const activePid: number | null = null;

  const loadStatus = async () => {
    // The SSE snapshot refreshes within ~3 s; this only forces an immediate round trip so errors surface right away.
    try {
      await fetchSchedulerStatus();
    } catch (e: any) {
      console.warn('[SchedulerControl] Failed to load scheduler status:', e);
    }
  };

  const showFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const handleToggleDaemon = async () => {
    setLoading(true);
    try {
      if (daemonRunning) {
        const res = await stopSchedulerDaemon(false);
        showFeedback(res.message || (isVi ? 'Đã tắt hệ thống cào tự động (Daemon Stopped)' : 'Orchestration daemon stopped'));
      } else {
        const res = await startSchedulerDaemon(30);
        showFeedback(res.message || (isVi ? 'Đã bật hệ thống cào tự động (Daemon Started)' : 'Orchestration daemon started'));
      }
      await loadStatus();
    } catch (e: any) {
      showFeedback(`${isVi ? 'Lỗi' : 'Error'}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSource = async (key: string, currentEnabled: boolean) => {
    setLoading(true);
    try {
      const res = await toggleSchedulerSource(key, !currentEnabled);
      showFeedback(res.message || (isVi ? `Đã chuyển đổi trạng thái nguồn ${key.toUpperCase()}` : `Toggled source status for ${key.toUpperCase()}`));
      await loadStatus();
    } catch (e: any) {
      showFeedback(`${isVi ? 'Lỗi' : 'Error'}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTask = async () => {
    setLoading(true);
    try {
      const res = await cancelSchedulerTask();
      showFeedback(res.message || (isVi ? 'Đã dừng khẩn cấp tác vụ đang cào.' : 'Emergency stopped running task.'));
      await loadStatus();
    } catch (e: any) {
      showFeedback(`${isVi ? 'Lỗi' : 'Error'}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleManualTrigger = async (key: string) => {
    setTriggeringSource(key);
    try {
      const res = await triggerSchedulerHarvest(key, undefined, true, true);
      showFeedback(res.message || (isVi ? `Đã kích hoạt cào cho ${key.toUpperCase()}` : `Triggered harvest for ${key.toUpperCase()}`));
      await loadStatus();
    } catch (e: any) {
      showFeedback(`${isVi ? 'Lỗi' : 'Error'}: ${e.message}`);
    } finally {
      setTriggeringSource(null);
    }
  };

  const sourceKeys = Object.keys(sources);

  const getHarvestedCount = (_key: string, reported: number): number => reported;

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
              {language === 'vi' ? 'Bộ Điều Phối Apache Airflow & Hàng Đợi RabbitMQ' : 'Apache Airflow & RabbitMQ Ingestion Orchestrator'}
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
              ⚡ Airflow DAGs + RabbitMQ Async
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            {language === 'vi'
              ? 'Tự động cào Tier 1 (04:50 AM) & Tier 2 (05:00 AM - 10k bài) qua Apache Airflow DAGs. Bắn tasks vào RabbitMQ để Worker bóc tách & nạp Qdrant bất đồng bộ.'
              : 'Orchestrates Tier 1 (04:50 AM) & Tier 2 (05:00 AM - 10k papers) via Apache Airflow DAGs and asynchronous RabbitMQ vector ingestion into Qdrant.'}
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
              <span>⏹</span> {isVi ? 'Dừng Khẩn Cấp' : 'Emergency Stop'} ({activeSource.toUpperCase()}{activePid ? ` #${activePid}` : ''})
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
              ? isVi ? 'TẮT CÀO TỰ ĐỘNG' : 'STOP AUTO-DAEMON'
              : isVi ? 'BẬT CÀO TỰ ĐỘNG' : 'START AUTO-DAEMON'}
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

      {/* RabbitMQ / worker strip: live numbers from the backend monitor */}
      {queue && (
        <div
          style={{
            display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px', padding: '8px 12px',
            borderRadius: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            fontSize: '11.5px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
          }}
        >
          <span>RabbitMQ: <b style={{ color: queue.status === 'HEALTHY' ? 'var(--accent-emerald)' : '#ef4444' }}>{queue.status}</b></span>
          <span title={isVi ? 'Bản tin metadata chờ fetch worker tải toàn văn' : 'Metadata messages awaiting full-text fetch worker'}>
            {isVi ? 'Q1 tải bài:' : 'Q1 Fetch:'} <b style={{ color: 'var(--text-primary)' }}>{queue.ready.toLocaleString()}</b> {isVi ? 'chờ' : 'ready'} · {queue.unacked} {isVi ? 'đang xử lý' : 'unacked'} · worker{' '}
            <b style={{ color: queue.consumers > 0 ? 'var(--accent-emerald)' : '#ef4444' }}>{queue.consumers}</b>
          </span>
          <span title={isVi ? 'Bản ghi Silver chờ embed worker chunk + embed vào Qdrant' : 'Silver records awaiting embed worker to chunk + embed into Qdrant'}>
            {isVi ? 'Q2 embed:' : 'Q2 Embed:'} <b style={{ color: 'var(--text-primary)' }}>{(queue.embed_ready ?? 0).toLocaleString()}</b> {isVi ? 'chờ' : 'ready'} · {queue.embed_unacked ?? 0} {isVi ? 'đang xử lý' : 'unacked'} · worker{' '}
            <b style={{ color: (queue.embed_consumers ?? 0) > 0 ? 'var(--accent-emerald)' : '#ef4444' }}>{queue.embed_consumers ?? 0}</b>
          </span>
          <span>dead-letter <b style={{ color: queue.dead > 0 ? '#ef4444' : 'var(--text-primary)' }}>{queue.dead}</b></span>
          <span>Airflow: <b style={{ color: live?.airflow.reachable ? 'var(--accent-emerald)' : '#ef4444' }}>{live?.airflow.reachable ? (live.airflow.scheduler_healthy ? 'scheduler OK' : 'scheduler DOWN') : 'OFFLINE'}</b></span>
          {((queue.ready + queue.unacked > 0 && queue.consumers === 0) || ((queue.embed_ready ?? 0) > 0 && (queue.embed_consumers ?? 0) === 0)) && (
            <span style={{ color: '#ef4444', fontWeight: 700 }}>
              {isVi ? '⚠ Có tin trong hàng đợi nhưng chưa có worker: hãy chạy ingestion worker.' : '⚠ Messages pending in queue but no active workers: please start ingestion workers.'}
            </span>
          )}
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
                  {item.name}
                </span>

                {/* Source Switch (ON / OFF) */}
                <button
                  type="button"
                  onClick={() => handleToggleSource(key, isEnabled)}
                  disabled={loading}
                  title={isEnabled ? (isVi ? 'Bấm để Tắt nguồn này' : 'Click to disable source') : (isVi ? 'Bấm để Bật nguồn này' : 'Click to enable source')}
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
                  {isEnabled ? (isVi ? '🟢 BẬT' : '🟢 ON') : (isVi ? '🔴 TẮT' : '🔴 OFF')}
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
                <div>{isVi ? 'Lần chạy cuối: ' : 'Last run: '}<span style={{ color: 'var(--text-primary)' }}>{item.last_run ? fmtTime(item.last_run) : (isVi ? 'Chưa' : 'Never')}</span> <span style={{ color: item.status === 'FAILED' ? '#ef4444' : 'var(--accent-emerald)' }}>{item.status}</span></div>
                <div>{isVi ? 'Lần tới: ' : 'Next run: '}<span style={{ color: 'var(--accent-blue)' }}>{fmtTime(item.next_run)}</span></div>
                <div>{isVi ? 'Phiên này: ' : 'This session: '}<span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>{getHarvestedCount(key, item.total_papers_harvested).toLocaleString()} {isVi ? 'bài' : 'papers'}</span></div>
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
                {isRunning ? (isVi ? '🔵 Đang chạy trong Airflow...' : '🔵 Running in Airflow...') : isTriggering ? (isVi ? '⏳ Đang khởi động...' : '⏳ Launching...') : (isVi ? '▶ Cào Ngay' : '▶ Harvest Now')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
