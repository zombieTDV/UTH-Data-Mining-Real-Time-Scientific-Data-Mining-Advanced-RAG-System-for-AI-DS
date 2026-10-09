import type { FC } from 'react';
import { AnimatedCounter } from '../../components/common';
import { useLakehouseStreamStore } from '../../store';

export interface StorageMeterProps {
  storageUsedGb: number;
  storageUsedPct: number;
  totalPapers?: number;
}

export const StorageMeter: FC<StorageMeterProps> = ({
  storageUsedGb,
  storageUsedPct,
}) => {
  const { isSyncingR2, lastSyncedR2, triggerR2ManualSync } = useLakehouseStreamStore();
  const quotaGb = 10.0;
  const pct = Math.min(100, Math.max(0, storageUsedPct));

  // Visual state styling based on capacity tier
  const isHigh = pct >= 90;
  const isMed = pct >= 80;

  const barGradient = isHigh
    ? 'linear-gradient(90deg, #f43f5e, #dc2626)'
    : isMed
    ? 'linear-gradient(90deg, #f59e0b, #ea580c)'
    : 'linear-gradient(90deg, #10b981, #06b6d4)';

  const accentColor = isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#34d399';

  return (
    <div
      onClick={() => !isSyncingR2 && triggerR2ManualSync()}
      title={`Cloudflare R2 Storage Bucket (Bấm để Fetch R2 live)\n• Đã dùng: ${storageUsedGb.toFixed(2)} GB (${pct.toFixed(1)}%)\n• Hạn mức Free Tier: ${quotaGb.toFixed(2)} GB\n• Đồng bộ lần cuối: ${lastSyncedR2 || 'Mới đây'}\n• Zero Egress Fees`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '9px',
        padding: '0 12px',
        height: '32px',
        borderRadius: '8px',
        backgroundColor: 'var(--badge-bg)',
        border: '1px solid var(--badge-border)',
        fontFamily: 'var(--font-mono)',
        cursor: isSyncingR2 ? 'wait' : 'pointer',
        boxSizing: 'border-box',
        transition: 'all 0.15s ease',
        userSelect: 'none',
      }}
    >
      {/* Cloudflare R2 Identity Icon & Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: isSyncingR2 ? '#eab308' : accentColor,
            flexShrink: 0,
            animation: isSyncingR2 ? 'spin 1s linear infinite' : 'none',
          }}
        >
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </svg>
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
          {isSyncingR2 ? '...' : 'R2'}
        </span>
      </div>

      {/* Sleek Mini Capacity Gauge */}
      <div
        style={{
          width: '52px',
          height: '5px',
          backgroundColor: 'var(--bg-elevated)',
          borderRadius: '9999px',
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barGradient,
            borderRadius: '9999px',
            transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </div>

      {/* Storage Volume: Only GB Ratio (No redundant % badge) */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', fontSize: '11px', fontWeight: 800 }}>
        <span style={{ color: 'var(--text-primary)' }}>
          <AnimatedCounter value={storageUsedGb} decimals={2} />
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '9.5px', fontWeight: 600 }}>
          / 10 GB
        </span>
      </div>
    </div>
  );
};
