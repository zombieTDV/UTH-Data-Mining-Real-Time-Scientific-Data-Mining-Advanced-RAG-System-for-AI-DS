import type { FC } from 'react';

export interface TimelinePoint {
  period: string;
  value: number;
}

export interface TimelineChartProps {
  points: TimelinePoint[];
  maxValue?: number;
  barColor?: string;
  height?: number;
}

export const TimelineChart: FC<TimelineChartProps> = ({
  points,
  maxValue,
  barColor = '#60a5fa',
  height = 120,
}) => {
  const max = maxValue ?? Math.max(...points.map((p) => p.value), 1);
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: '4px',
      height: `${height}px`,
      background: 'var(--bg-canvas)',
      padding: '12px',
      borderRadius: '6px',
      border: '1px solid var(--border-subtle)'
    }}>
      {points.map((point, idx) => (
        <div
          key={`${point.period}-${idx}`}
          style={{
            flex: 1,
            height: `${(point.value / max) * 100}%`,
            background: barColor,
            borderRadius: '2px 2px 0 0',
            minHeight: '2px'
          }}
          title={`${point.period}: ${point.value}`}
        />
      ))}
    </div>
  );
};
