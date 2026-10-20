import { useMemo, useState, type FC, type MouseEvent } from 'react';
import type { EdaResponse } from '../../types';
import { AxisTitle, ChartLegend } from '../charts/ChartAxes.component';
import { useTranslation } from '../../hooks';

/**
 * Plain distribution views for the EDA tab:
 *  - a scatter of every sampled paper (words vs. formulas) with no clustering or grouping applied
 *  - a histogram of one chosen variable, using the bins computed by the mining engine (lens2_univariate)
 * Both read only what /api/mining/eda returns.
 */

export interface DistributionViewProps {
  data: EdaResponse;
  theme: 'dark' | 'light';
}

// Shared plot frame (SVG units)
const W = 600;
const H = 340;
const L = 72; // left edge of the plot area
const R = 580; // right edge
const T = 20; // top
const B = 280; // bottom (x axis)
const POINT = '#2563eb';

const fmt = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `${(v / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
};

const Card: FC<{ title: string; subtitle: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, subtitle, children, right }) => (
  <div
    style={{
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '8px',
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      minHeight: 0,
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{subtitle}</div>
      </div>
      {right}
    </div>
    {children}
  </div>
);

const Toggle: FC<{ options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }> = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        onClick={() => onChange(o.id)}
        style={{
          padding: '3px 9px',
          fontSize: '11px',
          borderRadius: '5px',
          cursor: 'pointer',
          border: `1px solid ${value === o.id ? POINT : 'var(--border-subtle)'}`,
          backgroundColor: value === o.id ? 'rgba(37, 99, 235, 0.10)' : 'transparent',
          color: value === o.id ? POINT : 'var(--text-secondary)',
          fontWeight: value === o.id ? 600 : 400,
        }}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// ---------------------------------------------------------------- scatter (no clustering)

const PaperScatter: FC<{ data: EdaResponse }> = ({ data }) => {
  const { language } = useTranslation();
  const isVi = language === 'vi';
  const [scale, setScale] = useState<'log' | 'linear'>('log');
  const [hover, setHover] = useState<{ x: number; y: number; p: NonNullable<EdaResponse['scatter_points']>[number] } | null>(null);
  const points = useMemo(() => (data.scatter_points ?? []).filter((p) => p.words > 0), [data.scatter_points]);

  const frame = useMemo(() => {
    const maxW = Math.max(1, ...points.map((p) => p.words));
    const maxF = Math.max(1, ...points.map((p) => p.formulas));
    if (scale === 'log') {
      // Each axis spans whole decades around the data: from the decade below the smallest value to the one above the
      // largest. log10(1 + v) keeps papers with 0 formulas on the axis.
      const lo = (vals: number[]) => {
        const m = Math.min(...vals);
        return m <= 0 ? 0 : Math.floor(Math.log10(m));
      };
      const xLo = lo(points.map((p) => p.words));
      const yLo = lo(points.map((p) => p.formulas));
      const xHi = Math.ceil(Math.log10(1 + maxW));
      const yHi = Math.ceil(Math.log10(1 + maxF));
      const ticks = (a: number, b: number) => [...(a === 0 ? [0] : []), ...Array.from({ length: b - a + 1 }, (_, i) => 10 ** (a + i))];
      return {
        px: (v: number) => L + ((Math.log10(1 + v) - xLo) / (xHi - xLo || 1)) * (R - L),
        py: (v: number) => B - ((Math.log10(1 + v) - yLo) / (yHi - yLo || 1)) * (B - T),
        xTicks: ticks(xLo, xHi),
        yTicks: ticks(yLo, yHi),
      };
    }
    const lin = (top: number) => [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(r * top));
    return {
      px: (v: number) => L + (v / maxW) * (R - L),
      py: (v: number) => B - (v / maxF) * (B - T),
      xTicks: lin(maxW),
      yTicks: lin(maxF),
    };
  }, [points, scale]);

  return (
    <Card
      title={isVi ? 'Số từ và số công thức của từng bài (chưa phân cụm)' : 'Words vs. Formulas per Paper (Unclustered)'}
      subtitle={
        isVi
          ? `${points.length} bài mẫu từ Silver · mỗi chấm là một bài, không gom nhóm hay tô màu theo cụm`
          : `${points.length} sample works from Silver · each dot represents one paper, without clustering`
      }
      right={
        <Toggle
          options={[
            { id: 'log', label: isVi ? 'Thang log10' : 'Log10 Scale' },
            { id: 'linear', label: isVi ? 'Thang tuyến tính' : 'Linear Scale' },
          ]}
          value={scale}
          onChange={(id) => setScale(id as 'log' | 'linear')}
        />
      }
    >
      <ChartLegend
        items={[{ label: isVi ? 'Một bài báo' : 'Single Paper', color: POINT, mark: 'dot' }]}
        note={isVi ? 'Rê chuột lên chấm để xem tên bài' : 'Hover over a dot to view paper details'}
      />
      <div style={{ position: 'relative', flex: 1, minHeight: '260px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
          {frame.yTicks.map((v) => (
            <g key={`y${v}`}>
              <line x1={L} y1={frame.py(v)} x2={R} y2={frame.py(v)} stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <text x={L - 8} y={frame.py(v) + 3} textAnchor="end" fontSize="10" fill="var(--text-muted)">{fmt(v)}</text>
            </g>
          ))}
          {frame.xTicks.map((v) => (
            <g key={`x${v}`}>
              <line x1={frame.px(v)} y1={T} x2={frame.px(v)} y2={B} stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <text x={frame.px(v)} y={B + 16} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{fmt(v)}</text>
            </g>
          ))}
          <line x1={L} y1={B} x2={R} y2={B} stroke="var(--border-muted)" />
          <line x1={L} y1={T} x2={L} y2={B} stroke="var(--border-muted)" />
          {points.map((p) => (
            <circle
              key={p.id}
              cx={frame.px(p.words)}
              cy={frame.py(p.formulas)}
              r={hover?.p.id === p.id ? 6 : 4}
              fill={POINT}
              fillOpacity={0.55}
              stroke={POINT}
              strokeWidth={1}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                const r = e.currentTarget.getBoundingClientRect();
                setHover({ x: r.left - box.left + r.width / 2, y: r.top - box.top, p });
              }}
              onMouseLeave={() => setHover(null)}
            />
          ))}
          <AxisTitle
            axis="y"
            x={18}
            y={(T + B) / 2}
            text={
              isVi
                ? `Số công thức toán trong bài${scale === 'log' ? ' (log10)' : ''}`
                : `Math formulas in paper${scale === 'log' ? ' (log10)' : ''}`
            }
          />
          <AxisTitle
            axis="x"
            x={(L + R) / 2}
            y={B + 42}
            text={
              isVi
                ? `Số từ của toàn văn${scale === 'log' ? ' (log10)' : ''}`
                : `Full-text word count${scale === 'log' ? ' (log10)' : ''}`
            }
          />
        </svg>
        {hover && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(hover.x + 10, 9999),
              top: Math.max(0, hover.y - 10),
              transform: 'translateY(-100%)',
              maxWidth: '280px',
              padding: '8px 10px',
              borderRadius: '6px',
              backgroundColor: 'var(--tooltip-bg, #ffffff)',
              border: '1px solid var(--tooltip-border, #e2e8f0)',
              color: 'var(--tooltip-text, #0f172a)',
              fontSize: '11.5px',
              pointerEvents: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              zIndex: 5,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>{hover.p.title}</div>
            <div>{isVi ? 'Chuyên mục: ' : 'Category: '}{hover.p.category}</div>
            <div>{isVi ? 'Số từ: ' : 'Words: '}{hover.p.words.toLocaleString()}</div>
            <div>{isVi ? 'Số công thức: ' : 'Formulas: '}{hover.p.formulas.toLocaleString()}</div>
          </div>
        )}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------- histogram

const VariableHistogram: FC<{ data: EdaResponse }> = ({ data }) => {
  const { language } = useTranslation();
  const isVi = language === 'vi';
  const vars = data.diagnostic_3lenses?.lens2_univariate ?? {};
  const keys = Object.keys(vars);
  const [key, setKey] = useState<string>(keys.includes('words') ? 'words' : keys[0] ?? '');
  const v = vars[key];
  const n = data.diagnostic_3lenses?.lens1_topology?.total_papers_evaluated;

  if (!v || !v.histogram_bins?.length) {
    return (
      <Card
        title="Histogram"
        subtitle={isVi ? 'Chưa có dữ liệu phân phối: hãy chạy lại mining' : 'No distribution data: recompute mining engine'}
      >
        <div />
      </Card>
    );
  }

  const bins = v.histogram_bins;
  const minX = bins[0].x0;
  const maxX = bins[bins.length - 1].x1;
  const maxC = Math.max(1, ...bins.map((b) => b.count));
  const yTop = (() => {
    const mag = 10 ** Math.floor(Math.log10(maxC));
    return [1, 2, 5, 10].map((m) => m * mag).find((t) => t >= maxC) ?? maxC;
  })();
  const px = (x: number) => L + ((x - minX) / (maxX - minX || 1)) * (R - L);
  const py = (c: number) => B - (c / yTop) * (B - T);

  return (
    <Card
      title={`Histogram: ${v.label}`}
      subtitle={
        isVi
          ? `${bins.length} khoảng đều nhau${n ? ` trên ${n.toLocaleString()} bài toàn văn` : ''} · lệch ${v.skewness > 0 ? 'phải' : 'trái'} (độ lệch ${v.skewness})`
          : `${bins.length} equal intervals${n ? ` across ${n.toLocaleString()} full-text papers` : ''} · skewed ${v.skewness > 0 ? 'right' : 'left'} (skewness ${v.skewness})`
      }
      right={<Toggle options={keys.map((k) => ({ id: k, label: vars[k].short || k }))} value={key} onChange={setKey} />}
    >
      <ChartLegend
        items={[
          { label: isVi ? 'Số bài trong khoảng' : 'Papers in bin', color: POINT, mark: 'bar' },
          { label: `${isVi ? 'Trung bình' : 'Mean'} = ${fmt(v.mean)} ${v.unit}`, color: '#ea580c', mark: 'dashed' },
          { label: `${isVi ? 'Trung vị' : 'Median'} = ${fmt(v.median)} ${v.unit}`, color: '#10b981', mark: 'dashed' },
        ]}
      />
      <div style={{ position: 'relative', flex: 1, minHeight: '260px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <g key={`y${r}`}>
              <line x1={L} y1={py(r * yTop)} x2={R} y2={py(r * yTop)} stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <text x={L - 8} y={py(r * yTop) + 3} textAnchor="end" fontSize="10" fill="var(--text-muted)">{fmt(Math.round(r * yTop))}</text>
            </g>
          ))}
          {bins.map((b) => (
            <rect
              key={b.x0}
              x={px(b.x0) + 0.5}
              y={py(b.count)}
              width={Math.max(1, px(b.x1) - px(b.x0) - 1)}
              height={B - py(b.count)}
              fill={POINT}
              fillOpacity={0.35}
              stroke={POINT}
              strokeWidth={1}
            >
              <title>{`${fmt(b.x0)} - ${fmt(b.x1)} ${v.unit}: ${b.count} bài`}</title>
            </rect>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <text key={`x${r}`} x={L + r * (R - L)} y={B + 16} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
              {fmt(minX + r * (maxX - minX))}
            </text>
          ))}
          <line x1={L} y1={B} x2={R} y2={B} stroke="var(--border-muted)" />
          <line x1={L} y1={T} x2={L} y2={B} stroke="var(--border-muted)" />
          <line x1={px(v.mean)} y1={T} x2={px(v.mean)} y2={B} stroke="#ea580c" strokeWidth={2} strokeDasharray="5 3" />
          <line x1={px(v.median)} y1={T} x2={px(v.median)} y2={B} stroke="#10b981" strokeWidth={2} strokeDasharray="5 3" />
          <AxisTitle axis="y" x={18} y={(T + B) / 2} text="Số bài báo" />
          <AxisTitle axis="x" x={(L + R) / 2} y={B + 42} text={`${v.label} (${v.unit})`} />
        </svg>
      </div>
    </Card>
  );
};

export const DistributionView: FC<DistributionViewProps> = ({ data }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '12px', flex: 1, minHeight: 0 }}>
    <PaperScatter data={data} />
    <VariableHistogram data={data} />
  </div>
);
