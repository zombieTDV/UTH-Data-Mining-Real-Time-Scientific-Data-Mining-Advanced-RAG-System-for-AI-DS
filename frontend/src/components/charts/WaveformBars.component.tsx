import type { FC } from 'react';

export interface WaveformBarsProps {
  values: number[];
  width?: number;
  gap?: number;
  height?: number;
}

export const WaveformBars: FC<WaveformBarsProps> = ({
  values,
  width = 5,
  gap = 4,
  height = 65,
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: `${gap}px`,
      height: `${height}px`,
      background: 'var(--bg-canvas)',
      padding: '8px 12px',
      borderRadius: '6px',
      border: '1px solid var(--border-subtle)'
    }}>
      {values.map((value, idx) => (
        <div
          key={idx}
          style={{
            width: `${width}px`,
            height: `${value}%`,
            background: idx % 2 === 0 ? '#a855f7' : '#c084fc',
            borderRadius: '1.5px',
            opacity: 0.9
          }}
        />
      ))}
    </div>
  );
};
