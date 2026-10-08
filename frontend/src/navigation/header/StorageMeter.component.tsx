import { useState, type FC } from 'react';
import { AnimatedCounter } from '../../components/common';
import { useTranslation } from '../../hooks';

export interface StorageMeterProps {
  storageUsedGb: number;
  storageUsedPct: number;
  totalPapers?: number;
  onClick?: () => void;
}

export const StorageMeter: FC<StorageMeterProps> = ({
  storageUsedGb,
  storageUsedPct,
  onClick,
}) => {
  const { language } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
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

  const tooltipText = language === 'vi'
    ? `Cloudflare R2 Storage Lens (Hạn mức Free Tier: 10.00 GB)\n• Đã dùng: ${storageUsedGb.toFixed(3)} GB (${pct.toFixed(1)}%)\n• Còn trống: ${(quotaGb - storageUsedGb).toFixed(3)} GB\n• Active Lakehouse: arXiv HTML5 + OpenAlex + Parquet + LanceDB\n• Không tốn phí Egress (Zero Egress Fees)\n• Bấm hoặc nhấn phím S để mở Lăng Kính Lưu Trữ & Bộ Lập Lịch`
    : `Cloudflare R2 Storage Lens (Free Tier Quota: 10.00 GB)\n• Used: ${storageUsedGb.toFixed(3)} GB (${pct.toFixed(1)}%)\n• Available: ${(quotaGb - storageUsedGb).toFixed(3)} GB\n• Active Lakehouse: arXiv HTML5 + OpenAlex + Parquet + LanceDB\n• Zero Egress Fees\n• Click or press S to open Storage Lens & Scheduler`;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={tooltipText}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 10px',
        height: '32px',
        borderRadius: '8px',
        backgroundColor: onClick && isHovered
          ? (isHovered ? 'rgba(245, 158, 11, 0.12)' : 'var(--badge-bg)')
          : 'var(--badge-bg)',
        border: onClick && isHovered
          ? '1px solid rgba(245, 158, 11, 0.6)'
          : '1px solid var(--badge-border)',
        fontFamily: 'var(--font-mono)',
        cursor: onClick ? 'pointer' : 'default',
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
          style={{ color: accentColor, flexShrink: 0 }}
        >
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </svg>
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
          R2
        </span>
      </div>

      {/* Sleek Mini Capacity Gauge */}
      <div
        style={{
          width: '48px',
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

      {/* Storage Volume: Only GB Ratio */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', fontSize: '11px', fontWeight: 800 }}>
        <span style={{ color: 'var(--text-primary)' }}>
          <AnimatedCounter value={storageUsedGb} decimals={2} />
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '9.5px', fontWeight: 600 }}>
          / 10 GB
        </span>
      </div>

      {/* Interactive Lens Badge */}
      {onClick && (
        <span
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            padding: '2px 5px',
            borderRadius: '4px',
            backgroundColor: isHovered ? '#f59e0b' : 'rgba(245, 158, 11, 0.16)',
            color: isHovered ? '#000000' : '#f59e0b',
            border: `1px solid ${isHovered ? '#f59e0b' : 'rgba(245, 158, 11, 0.4)'}`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            letterSpacing: '0.02em',
            transition: 'all 0.15s ease',
          }}
        >
          <span>LENS (S)</span>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </span>
      )}
    </div>
  );
};
