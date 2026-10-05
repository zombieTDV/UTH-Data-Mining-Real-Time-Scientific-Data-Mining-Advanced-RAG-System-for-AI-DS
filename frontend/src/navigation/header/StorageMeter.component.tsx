import type { FC } from 'react';

export interface StorageMeterProps {
  storageUsedGb: number;
  storageUsedPct: number;
  totalPapers: number;
}

export const StorageMeter: FC<StorageMeterProps> = ({ storageUsedGb, storageUsedPct, totalPapers }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
      <span style={{ color: 'var(--text-muted)' }}>R2 LAKE:</span>
      <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
        {(storageUsedGb + (totalPapers - 10000) * 0.00056).toFixed(3)} GB
      </span>
      <span
        style={{
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: 'var(--accent-emerald)',
          padding: '1px 6px',
          borderRadius: '4px',
          fontWeight: 700,
          border: '1px solid rgba(16, 185, 129, 0.3)',
        }}
      >
        {Math.min(100, +(storageUsedPct + (totalPapers - 10000) * 0.0056).toFixed(1))}%
      </span>
    </div>
  );
};
