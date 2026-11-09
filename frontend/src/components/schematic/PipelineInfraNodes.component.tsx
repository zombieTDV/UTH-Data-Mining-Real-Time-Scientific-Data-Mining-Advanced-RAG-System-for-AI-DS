import type { FC, ReactNode } from 'react';
import type { LiveDag, LiveSnapshot } from '../../store/streaming.store';
import { useTranslation } from '../../hooks';

/**
 * Orchestration + messaging nodes of the workflow canvas: Apache Airflow (schedules the harvest DAGs) and
 * RabbitMQ (ingest queue -> fetch worker -> embed queue -> embed worker). Every figure is read from the backend
 * monitor snapshot; nothing here is simulated.
 */

export interface NodeTheme {
  isDark: boolean;
  cardBg: string;
  cardBorder: string;
  cardDivider: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  wire: string;
  btnInspectBg: string;
  btnInspectBorder: string;
  btnInspectText: string;
  drawerSectionBg: string;
  drawerSectionBorder: string;
}

interface Palette {
  solid: string; // icon tile, selected border
  bright: string; // active border, text on dark
  deep: string; // text on light
  activeBgDark: string;
  activeBgLight: string;
  glow: string; // rgba used for shadows / wire
  animation: string;
}

export const AIRFLOW_PALETTE: Palette = {
  solid: '#0891b2',
  bright: '#22d3ee',
  deep: '#0e7490',
  activeBgDark: 'rgba(14, 116, 144, 0.32)',
  activeBgLight: '#ecfeff',
  glow: '8, 145, 178',
  animation: 'stageGlowCyan',
};

export const RABBIT_PALETTE: Palette = {
  solid: '#ea580c',
  bright: '#fb923c',
  deep: '#c2410c',
  activeBgDark: 'rgba(154, 52, 18, 0.34)',
  activeBgLight: '#fff7ed',
  glow: '234, 88, 12',
  animation: 'stageGlowTangerine',
};

const mono = 'var(--font-mono)';

// ------------------------------------------------------------------ shared pieces

export const FlowConnector: FC<{ active: boolean; theme: NodeTheme; rgb: string; head: string }> = ({ active, theme, rgb, head }) => (
  <div
    style={{
      width: '42px',
      height: '2px',
      backgroundColor: active ? `rgba(${rgb}, 0.4)` : theme.wire,
      position: 'relative',
      flexShrink: 0,
      overflow: 'hidden',
      boxShadow: active ? `0 0 10px rgba(${rgb}, 0.6)` : 'none',
      transition: 'all 0.3s ease',
    }}
  >
    {active && (
      <div
        style={{
          position: 'absolute',
          top: 0,
          height: '100%',
          width: '32px',
          background: `linear-gradient(90deg, transparent 0%, rgba(${rgb}, 0.4) 30%, ${head} 80%, #ffffff 100%)`,
          boxShadow: `0 0 10px ${head}, 0 0 4px #ffffff`,
          animation: 'laserDataStream 1.0s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        }}
      />
    )}
  </div>
);

const NodeShell: FC<{
  theme: NodeTheme;
  palette: Palette;
  active: boolean;
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge: { label: string; tone: 'ok' | 'warn' | 'down' | 'idle' };
  children: ReactNode;
}> = ({ theme, palette, active, selected, onClick, icon, title, subtitle, badge, children }) => {
  const { isDark } = theme;
  const tones = {
    ok: { fg: isDark ? '#34d399' : '#059669', bg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#ecfdf5', bd: 'rgba(16, 185, 129, 0.3)' },
    warn: { fg: isDark ? '#fbbf24' : '#b45309', bg: isDark ? 'rgba(245, 158, 11, 0.16)' : '#fffbeb', bd: 'rgba(245, 158, 11, 0.3)' },
    down: { fg: '#ef4444', bg: isDark ? 'rgba(239, 68, 68, 0.16)' : '#fef2f2', bd: 'rgba(239, 68, 68, 0.3)' },
    idle: { fg: isDark ? palette.bright : palette.deep, bg: `rgba(${palette.glow}, ${isDark ? 0.18 : 0.08})`, bd: `rgba(${palette.glow}, 0.3)` },
  }[badge.tone];
  return (
    <div
      onClick={onClick}
      style={{
        width: '240px',
        backgroundColor: active ? (isDark ? palette.activeBgDark : palette.activeBgLight) : theme.cardBg,
        borderRadius: '14px',
        padding: '14px 16px',
        border: active ? `2px solid ${palette.bright}` : selected ? `2px solid ${palette.solid}` : `1px solid ${theme.cardBorder}`,
        boxShadow: active
          ? `0 0 ${isDark ? 32 : 24}px rgba(${palette.glow}, ${isDark ? 0.7 : 0.4})`
          : isDark
          ? '0 4px 16px rgba(0, 0, 0, 0.45)'
          : '0 4px 16px rgba(0, 0, 0, 0.05)',
        animation: active ? `${palette.animation} 2.2s infinite ease-in-out` : 'none',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '9px',
              backgroundColor: palette.solid,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: `0 2px 6px rgba(${palette.glow}, 0.3)`,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? palette.bright : palette.deep }}>{title}</div>
            <div style={{ fontSize: '10px', color: theme.textMuted, fontFamily: mono }}>{subtitle}</div>
          </div>
        </div>
        <span
          style={{
            fontSize: '10px',
            fontFamily: mono,
            fontWeight: 700,
            color: tones.fg,
            backgroundColor: tones.bg,
            border: `1px solid ${tones.bd}`,
            padding: '1px 5px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
          }}
        >
          {badge.label}
        </span>
      </div>

      <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${theme.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {children}
      </div>
    </div>
  );
};

const StatusDot: FC<{ color: string; pulse?: boolean }> = ({ color, pulse }) => (
  <span
    style={{
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      backgroundColor: color,
      flexShrink: 0,
      boxShadow: pulse ? `0 0 0 3px ${color}33` : 'none',
      animation: pulse ? 'ragBeaconGlow 1.6s ease-in-out infinite' : 'none',
    }}
  />
);

// ------------------------------------------------------------------ Airflow

const HARVEST_ROWS: { key: string; label: string }[] = [
  { key: 'tier1', label: 'Tier 1 · RSS' },
  { key: 'tier2', label: 'Tier 2 · CVF + arXiv' },
  { key: 'tier3', label: 'Tier 3 · Landmarks' },
];

/** "19:00" today, "T2 19:10" another day (ICT, the browser's locale clock). */
export function formatNextRun(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hm = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay = d.toDateString() === new Date().toDateString();
  const dm = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return sameDay ? hm : `${dm} ${hm}`;
}

type DagState = { label: string; color: string; pulse: boolean };

export function dagState(dag: LiveDag | undefined, isDark: boolean): DagState {
  if (!dag || dag.present === false) return { label: 'MISSING', color: '#ef4444', pulse: false };
  if (dag.running) return { label: 'RUNNING', color: '#10b981', pulse: true };
  if (dag.paused) return { label: 'PAUSED', color: isDark ? '#64748b' : '#94a3b8', pulse: false };
  if (dag.last_run?.state === 'failed') return { label: formatNextRun(dag.next_run), color: '#f59e0b', pulse: false };
  return { label: formatNextRun(dag.next_run), color: '#0891b2', pulse: false };
}

const AirflowGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {/* pinwheel: four blades around the scheduler hub */}
    <path d="M12 12 C12 7 14 4 17 4 C17 8 15 11 12 12 Z" />
    <path d="M12 12 C17 12 20 14 20 17 C16 17 13 15 12 12 Z" />
    <path d="M12 12 C12 17 10 20 7 20 C7 16 9 13 12 12 Z" />
    <path d="M12 12 C7 12 4 10 4 7 C8 7 11 9 12 12 Z" />
  </svg>
);

export const AirflowNode: FC<{
  live: LiveSnapshot | null;
  theme: NodeTheme;
  selected: boolean;
  onClick: () => void;
}> = ({ live, theme, selected, onClick }) => {
  const { language } = useTranslation();
  const af = live?.airflow;
  const dags = af?.dags ?? [];
  const running = dags.filter((d) => d.running);
  const active = running.some((d) => d.kind === 'harvest');
  const badge = !af?.reachable
    ? { label: 'OFFLINE', tone: 'down' as const }
    : af.scheduler_healthy
    ? { label: '● LIVE', tone: 'ok' as const }
    : { label: 'SCHEDULER DOWN', tone: 'down' as const };

  return (
    <NodeShell
      theme={theme}
      palette={AIRFLOW_PALETTE}
      active={active}
      selected={selected}
      onClick={onClick}
      icon={<AirflowGlyph />}
      title="Airflow"
      subtitle="Apache · Orchestrator"
      badge={badge}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: 900, color: active ? '#10b981' : theme.textPrimary, fontFamily: mono }}>
          {running.length > 0
            ? (language === 'vi' ? `${running.length} đang chạy` : `${running.length} running`)
            : (language === 'vi' ? 'Nghỉ' : 'Idle')}
        </span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>{dags.length} DAGs</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {HARVEST_ROWS.map(({ key, label }) => {
          const s = dagState(dags.find((d) => d.key === key), theme.isDark);
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '10.5px', fontFamily: mono }}>
              <StatusDot color={s.color} pulse={s.pulse} />
              <span style={{ color: theme.textSecondary, fontWeight: 600, flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
              <span style={{ color: s.label === 'RUNNING' ? '#10b981' : theme.textMuted, fontWeight: 700 }}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </NodeShell>
  );
};

// ------------------------------------------------------------------ RabbitMQ

const RabbitGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    {/* two stacked message lanes feeding a consumer */}
    <rect x="3" y="5" width="13" height="5" rx="1.5" />
    <rect x="3" y="14" width="13" height="5" rx="1.5" />
    <path d="M19 7.5h2M19 16.5h2" />
    <path d="M6.5 5v5M9.5 5v5M6.5 14v5M9.5 14v5" />
  </svg>
);

function queueNumbers(live: LiveSnapshot | null) {
  const q = live?.queue;
  return {
    status: q?.status ?? 'OFFLINE',
    ingestReady: q?.ready ?? 0,
    ingestBusy: q?.unacked ?? 0,
    fetchWorkers: q?.consumers ?? 0,
    embedKnown: q?.embed_ready !== undefined, // older backends do not report the second stage
    embedReady: q?.embed_ready ?? 0,
    embedBusy: q?.embed_unacked ?? 0,
    embedWorkers: q?.embed_consumers ?? 0,
    embedMax: q?.embed_max ?? 500,
    dead: q?.dead ?? 0,
  };
}

const QueueLane: FC<{
  theme: NodeTheme;
  name: string;
  worker: string;
  ready: number;
  busy: number;
  workers: number;
  cap?: number;
  unknown?: boolean;
}> = ({ theme, name, worker, ready, busy, workers, cap, unknown }) => {
  if (unknown) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: '10px' }} title="Backend chưa báo số liệu queue này (cần restart backend)">
        <span style={{ fontWeight: 700, color: theme.textSecondary }}>{name}</span>
        <span style={{ color: theme.textMuted, fontWeight: 700 }}>—</span>
      </div>
    );
  }
  const fill = cap ? Math.min(100, (ready / cap) * 100) : 0;
  const full = cap ? ready >= cap : false;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontFamily: mono }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: theme.textSecondary }}>{name}</span>
        <span style={{ fontSize: '12px', fontWeight: 900, color: theme.textPrimary }}>
          {ready.toLocaleString()}
          {cap ? <span style={{ fontSize: '9.5px', fontWeight: 700, color: theme.textMuted }}> / {cap}</span> : null}
        </span>
      </div>
      {cap ? (
        <div style={{ height: '4px', borderRadius: '9999px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${fill}%`,
              height: '100%',
              borderRadius: '9999px',
              background: full ? 'linear-gradient(90deg, #f59e0b, #ea580c)' : 'linear-gradient(90deg, #fb923c, #ea580c)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9.5px', fontFamily: mono, color: theme.textMuted }}>
        <StatusDot color={workers > 0 ? '#10b981' : '#ef4444'} pulse={workers > 0 && busy > 0} />
        <span>
          {worker} ×{workers} · {busy} in flight
        </span>
      </div>
    </div>
  );
};

/** One RabbitMQ stage on the data path: Q1 sits before MinIO (fetch worker), Q2 between Silver and Qdrant (embed worker). */
export const RabbitQueueNode: FC<{
  stage: 'ingest' | 'embed';
  live: LiveSnapshot | null;
  theme: NodeTheme;
  selected: boolean;
  onClick: () => void;
}> = ({ stage, live, theme, selected, onClick }) => {
  const { language } = useTranslation();
  const n = queueNumbers(live);
  const ingest = stage === 'ingest';
  const ready = ingest ? n.ingestReady : n.embedReady;
  const busy = ingest ? n.ingestBusy : n.embedBusy;
  const workers = ingest ? n.fetchWorkers : n.embedWorkers;
  const unknown = !ingest && !n.embedKnown;
  const active = !unknown && ready + busy > 0 && workers > 0;
  const badge =
    n.status !== 'HEALTHY'
      ? { label: n.status, tone: 'down' as const }
      : unknown
      ? { label: 'N/A', tone: 'idle' as const }
      : workers === 0
      ? { label: language === 'vi' ? 'THIẾU WORKER' : 'NO WORKER', tone: ready > 0 ? ('down' as const) : ('idle' as const) }
      : { label: active ? (language === 'vi' ? '● ĐANG CHẢY' : '● FLOWING') : (language === 'vi' ? 'CHỜ' : 'IDLE'), tone: active ? ('ok' as const) : ('idle' as const) };

  return (
    <NodeShell
      theme={theme}
      palette={RABBIT_PALETTE}
      active={active}
      selected={selected}
      onClick={onClick}
      icon={<RabbitGlyph />}
      title={ingest ? 'RabbitMQ · Q1' : 'RabbitMQ · Q2'}
      subtitle={ingest ? 'paper_ingest' : 'chunk_embed'}
      badge={badge}
    >
      <QueueLane
        theme={theme}
        name={
          ingest
            ? (language === 'vi' ? 'metadata chờ tải' : 'metadata queued')
            : (language === 'vi' ? 'bản ghi chờ embed' : 'records queued')
        }
        worker={ingest ? 'fetch worker' : 'embed worker'}
        ready={ready}
        busy={busy}
        workers={workers}
        cap={ingest ? undefined : n.embedMax}
        unknown={unknown}
      />
      <div style={{ fontSize: '9.5px', fontFamily: mono, color: theme.textMuted, lineHeight: 1.5 }}>
        {ingest
          ? (language === 'vi' ? 'HTML5 → ar5iv → abstract, ghi Bronze + Silver' : 'HTML5 → ar5iv → abstract, write Bronze + Silver')
          : (language === 'vi' ? 'chunk → Nomic 768-D (1 lần gọi / lô) → Qdrant' : 'chunk → Nomic 768-D (1 batch call) → Qdrant')}
      </div>
    </NodeShell>
  );
};

// ------------------------------------------------------------------ inspector panels (drawer "control" tab)

const sectionTitle = (theme: NodeTheme, text: string) => (
  <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: mono, color: theme.textSecondary, marginBottom: '8px' }}>{text}</div>
);

export const AirflowPanel: FC<{ live: LiveSnapshot | null; theme: NodeTheme }> = ({ live, theme }) => {
  const { language } = useTranslation();
  const dags = live?.airflow?.dags ?? [];
  const cell = { padding: '7px 10px', borderBottom: `1px solid ${theme.drawerSectionBorder}`, textAlign: 'left' as const };
  return (
    <div>
      {sectionTitle(
        theme,
        language === 'vi'
          ? 'DAG ĐANG ĐƯỢC LẬP LỊCH (LIVE TỪ AIRFLOW REST API)'
          : 'SCHEDULED DAGS (LIVE FROM AIRFLOW REST API)'
      )}
      <div style={{ border: `1px solid ${theme.drawerSectionBorder}`, borderRadius: '8px', overflow: 'hidden', backgroundColor: theme.drawerSectionBg }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: mono, color: theme.textPrimary }}>
          <thead>
            <tr style={{ color: theme.textMuted, fontSize: '10px' }}>
              <th style={cell}>DAG</th>
              <th style={cell}>{language === 'vi' ? 'LỊCH' : 'SCHEDULE'}</th>
              <th style={cell}>{language === 'vi' ? 'TRẠNG THÁI' : 'STATUS'}</th>
              <th style={cell}>{language === 'vi' ? 'LẦN CHẠY GẦN NHẤT' : 'LAST RUN'}</th>
            </tr>
          </thead>
          <tbody>
            {dags.map((d) => {
              const s = dagState(d, theme.isDark);
              const status = d.running ? 'RUNNING' : d.paused ? 'PAUSED' : `next ${s.label}`;
              return (
                <tr key={d.key}>
                  <td style={cell}>
                    <div style={{ fontWeight: 700 }}>{d.name}</div>
                    <div style={{ fontSize: '9.5px', color: theme.textMuted }}>{d.dag_id}</div>
                  </td>
                  <td style={{ ...cell, color: theme.textSecondary }}>{d.frequency}</td>
                  <td style={cell}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: d.running ? '#10b981' : theme.textSecondary }}>
                      <StatusDot color={s.color} pulse={s.pulse} />
                      {status}
                    </span>
                  </td>
                  <td style={{ ...cell, color: d.last_run?.state === 'failed' ? '#f59e0b' : theme.textSecondary }}>
                    {d.last_run ? `${d.last_run.state} · ${formatNextRun(d.last_run.start)}` : '—'}
                  </td>
                </tr>
              );
            })}
            {dags.length === 0 && (
              <tr>
                <td style={{ ...cell, color: theme.textMuted }} colSpan={4}>
                  {language === 'vi' ? 'Airflow chưa phản hồi.' : 'Airflow not responding.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const RabbitPanel: FC<{ live: LiveSnapshot | null; theme: NodeTheme }> = ({ live, theme }) => {
  const { language } = useTranslation();
  const n = queueNumbers(live);
  const stages = [
    {
      q: 'scientific_paper_ingest',
      role: language === 'vi' ? 'Bản tin metadata từ DAG' : 'Metadata messages from DAG',
      worker: language === 'vi' ? 'fetch worker: tải HTML, Bronze, Silver' : 'fetch worker: downloads HTML, Bronze, Silver',
      ready: n.ingestReady,
      busy: n.ingestBusy,
      workers: n.fetchWorkers,
      cap: null as number | null,
    },
    {
      q: 'scientific_chunk_embed',
      role: language === 'vi' ? 'Bản ghi Silver đã có toàn văn' : 'Silver records with full text',
      worker: language === 'vi' ? 'embed worker: chunk, Nomic, Qdrant' : 'embed worker: chunk, Nomic, Qdrant',
      ready: n.embedReady,
      busy: n.embedBusy,
      workers: n.embedWorkers,
      cap: n.embedMax,
    },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px' }}>
      <div>
        {sectionTitle(
          theme,
          language === 'vi'
            ? 'HAI TẦNG HÀNG ĐỢI (LIVE TỪ RABBITMQ MANAGEMENT API)'
            : 'TWO-TIER QUEUES (LIVE FROM RABBITMQ MANAGEMENT API)'
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {stages.map((s) => (
            <div key={s.q} style={{ backgroundColor: theme.drawerSectionBg, border: `1px solid ${theme.drawerSectionBorder}`, borderRadius: '8px', padding: '10px 12px', fontFamily: mono }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: theme.textPrimary }}>{s.q}</span>
                <span style={{ fontSize: '14px', fontWeight: 900, color: theme.textPrimary }}>
                  {s.ready.toLocaleString()}
                  <span style={{ fontSize: '10px', color: theme.textMuted, fontWeight: 700 }}>
                    {s.cap ? (language === 'vi' ? ` / ${s.cap} chờ` : ` / ${s.cap} queued`) : (language === 'vi' ? ' chờ' : ' queued')}
                  </span>
                </span>
              </div>
              <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}>{s.role}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', color: theme.textSecondary, marginTop: '6px' }}>
                <StatusDot color={s.workers > 0 ? '#10b981' : '#ef4444'} pulse={s.workers > 0 && s.busy > 0} />
                {s.worker} · ×{s.workers} · {s.busy} {language === 'vi' ? 'đang xử lý' : 'in flight'}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ backgroundColor: theme.drawerSectionBg, border: `1px solid ${theme.drawerSectionBorder}`, borderRadius: '8px', padding: '12px 14px', fontFamily: mono, fontSize: '10.5px', color: theme.textSecondary, lineHeight: 1.65 }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: theme.textPrimary, marginBottom: '6px' }}>BACKPRESSURE</div>
        <div>{language === 'vi' ? '• Tier 2/3 đẩy lô 1.000 bài, chờ Q1 < 200 mới cào tiếp.' : '• Tier 2/3 pushes 1,000 batches, awaits Q1 < 200 before next.'}</div>
        <div>{language === 'vi' ? `• Fetch worker dừng khi Q2 ≥ ${n.embedMax}: model không bị dồn.` : `• Fetch worker pauses when Q2 ≥ ${n.embedMax}: protects model.`}</div>
        <div>{language === 'vi' ? '• Lỗi được thử lại trong chính queue của nó, quá 3 lần thì vào dead-letter.' : '• Failures retried within queue, dead-lettered after 3 tries.'}</div>
        <div style={{ marginTop: '8px', fontWeight: 700, color: n.dead > 0 ? '#ef4444' : '#10b981' }}>
          dead-letter: {n.dead.toLocaleString()}
        </div>
      </div>
    </div>
  );
};
