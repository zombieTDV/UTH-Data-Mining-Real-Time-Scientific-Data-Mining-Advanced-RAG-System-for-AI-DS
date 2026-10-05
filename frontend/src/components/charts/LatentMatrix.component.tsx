import type { FC } from 'react';

export interface LatentMatrixProps {
  rows?: number;
  cols?: number;
  cellSize?: number;
  gap?: number;
}

export const LatentMatrix: FC<LatentMatrixProps> = ({
  rows = 12,
  cols = 12,
  cellSize = 7,
  gap = 3.5,
}) => {
  const cells = rows * cols;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
      gap: `${gap}px`,
      background: 'var(--bg-canvas)',
      padding: '10px',
      borderRadius: '6px',
      border: '1px solid var(--border-subtle)'
    }}>
      {Array.from({ length: cells }).map((_, idx) => {
        const isLit = (idx * 7 + 13) % 5 === 0;
        const isMedium = (idx * 3 + 7) % 3 === 0;
        return (
          <div
            key={idx}
            style={{
              width: `${cellSize}px`,
              height: `${cellSize}px`,
              borderRadius: '1.5px',
              background: isLit
                ? '#10b981'
                : isMedium
                ? 'rgba(16, 185, 129, 0.45)'
                : 'var(--matrix-dim)',
            }}
          />
        );
      })}
    </div>
  );
};
