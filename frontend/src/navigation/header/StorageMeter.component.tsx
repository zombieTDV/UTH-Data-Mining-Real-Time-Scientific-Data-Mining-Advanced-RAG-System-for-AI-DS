import type { FC } from 'react';

export interface StorageMeterProps {
  storageUsedGb: number;
  storageUsedPct: number;
  totalPapers?: number;
}

export const StorageMeter: FC<StorageMeterProps> = ({
  storageUsedGb,
  storageUsedPct,
}) => {
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

  const accentColor = isHigh ? '#ef4444' : isMed ? '#f59e0b' : 'var(--accent-emerald)';
  const badgeBg = isHigh
    ? 'rgba(239, 68, 68, 0.14)'
    : isMed
    ? 'rgba(245, 158, 11, 0.14)'
    : 'rgba(16, 185, 129, 0.14)';

  return (
    <div
      title={`Cloudflare R2 Storage Lens (Hạn mức Free Tier: 10.00 GB)\n• Đã dùng: ${storageUsedGb.toFixed(3)} GB (${pct.toFixed(2)}%)\n• Còn trống: ${(quotaGb - storageUsedGb).toFixed(3)} GB\n• Active Lakehouse: arXiv HTML5 + OpenAlex + Parquet + LanceDB\n• Không tốn phí Egress (Zero Egress Fees)`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '8px',
        backgroundColor: 'var(--badge-bg)',
        border: '1px solid var(--badge-border)',
        fontFamily: 'var(--font-mono)',
        minWidth: '170px',
        cursor: 'default',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: accentColor }}>
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
          </svg>
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
            R2 LAKE
          </span>
        </div>

        <span
          style={{
            fontSize: '9.5px',
            fontWeight: 800,
            color: accentColor,
            backgroundColor: badgeBg,
            padding: '1px 5px',
            borderRadius: '4px',
          }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Thanh tiến trình trực quan (Visual progress bar) */}
        <div
          style={{
            flex: 1,
            height: '6px',
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: '9999px',
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: barGradient,
              borderRadius: '9999px',
              transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>

        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          {storageUsedGb.toFixed(2)} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>/ 10 GB</span>
        </span>
      </div>
    </div>
  );
};
