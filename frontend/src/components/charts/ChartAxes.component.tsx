import type { FC } from 'react';

/**
 * Shared axis titles and legends so every EDA / mining chart states what each axis and mark means.
 * AxisTitle renders inside an <svg>; ChartLegend is plain HTML placed next to the chart.
 */

export interface AxisTitleProps {
  /** 'x' runs along the bottom; 'y' (left) and 'y2' (right) are rotated to read bottom-to-top / top-to-bottom */
  axis: 'x' | 'y' | 'y2';
  x: number;
  y: number;
  text: string;
  color?: string;
  fontSize?: number;
}

export const AxisTitle: FC<AxisTitleProps> = ({ axis, x, y, text, color, fontSize = 11 }) => (
  <text
    x={x}
    y={y}
    textAnchor="middle"
    fontSize={fontSize}
    fontWeight={600}
    fill={color ?? 'var(--text-secondary, #475569)'}
    transform={axis === 'y' ? `rotate(-90 ${x} ${y})` : axis === 'y2' ? `rotate(90 ${x} ${y})` : undefined}
    style={{ pointerEvents: 'none', userSelect: 'none' }}
  >
    {text}
  </text>
);

export type LegendMark = 'bar' | 'line' | 'dashed' | 'dot' | 'ring' | 'area' | 'size';

export interface LegendItem {
  label: string;
  color: string;
  mark?: LegendMark;
}

export interface ChartLegendProps {
  items: LegendItem[];
  /** Optional lead-in such as "Chú thích:" or "Màu = chuyên mục" */
  title?: string;
  /** Free-text footnote shown after the items (e.g. "Mỗi chấm = 1 bài báo") */
  note?: string;
}

const Swatch: FC<{ mark: LegendMark; color: string }> = ({ mark, color }) => {
  switch (mark) {
    case 'line':
      return <span style={{ width: '16px', height: '2px', backgroundColor: color, display: 'inline-block' }} />;
    case 'dashed':
      return <span style={{ width: '16px', height: 0, borderTop: `2px dashed ${color}`, display: 'inline-block' }} />;
    case 'dot':
      return <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />;
    case 'ring':
      return <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: `2px solid ${color}`, display: 'inline-block' }} />;
    case 'area':
      return <span style={{ width: '14px', height: '9px', backgroundColor: color, opacity: 0.25, border: `1px solid ${color}`, display: 'inline-block' }} />;
    case 'size':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: color }} />
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color }} />
        </span>
      );
    default:
      return <span style={{ width: '12px', height: '9px', borderRadius: '2px', backgroundColor: color, display: 'inline-block' }} />;
  }
};

export const ChartLegend: FC<ChartLegendProps> = ({ items, title, note }) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '6px 14px',
      fontSize: '11px',
      color: 'var(--text-secondary, #475569)',
      lineHeight: 1.4,
    }}
  >
    {title && <span style={{ fontWeight: 600, color: 'var(--text-primary, #0f172a)' }}>{title}</span>}
    {items.map((it) => (
      <span key={`${it.label}-${it.color}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <Swatch mark={it.mark ?? 'bar'} color={it.color} />
        {it.label}
      </span>
    ))}
    {note && <span style={{ color: 'var(--text-muted, #64748b)' }}>{note}</span>}
  </div>
);
