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
    ? `Cloudflare R2 Storage (Hạn mức Free Tier: 10.00 GB)\n• Đã dùng: ${storageUsedGb.toFixed(3)} GB (${pct.toFixed(1)}%)\n• Còn trống: ${(quotaGb - storageUsedGb).toFixed(3)} GB\n• Active Lakehouse: arXiv HTML5 + OpenAlex + Parquet + LanceDB\n• Không tốn phí Egress (Zero Egress Fees)\n• Bấm hoặc nhấn phím S để xem chi tiết Storage Lens & Điều phối`
    : `Cloudflare R2 Storage (Free Tier Quota: 10.00 GB)\n• Used: ${storageUsedGb.toFixed(3)} GB (${pct.toFixed(1)}%)\n• Available: ${(quotaGb - storageUsedGb).toFixed(3)} GB\n• Active Lakehouse: arXiv HTML5 + OpenAlex + Parquet + LanceDB\n• Zero Egress Fees\n• Click or press S to view Storage Lens & Scheduler`;

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
        gap: '7px',
        padding: '0 10px',
        height: '32px',
        borderRadius: '8px',
        backgroundColor: onClick && isHovered
          ? 'var(--bg-surface-hover, rgba(255, 255, 255, 0.08))'
          : 'var(--badge-bg)',
        border: onClick && isHovered
          ? '1px solid var(--border-muted, rgba(255, 255, 255, 0.22))'
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
          width: '46px',
          height: '4px',
          backgroundColor: 'var(--track-bg, rgba(255, 255, 255, 0.12))',
          borderRadius: '9999px',
          overflow: 'hidden',
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

      {/* Storage Volume: GB Ratio */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px', fontSize: '11px', fontWeight: 700 }}>
        <span style={{ color: 'var(--text-primary)' }}>
          <AnimatedCounter value={storageUsedGb} decimals={2} />
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '9.5px', fontWeight: 600 }}>
          / 10 GB
        </span>
      </div>

      {/* Subtle indicator arrow that gently highlights on hover */}
      {onClick && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: isHovered ? 'var(--text-primary)' : 'var(--text-muted)',
            opacity: isHovered ? 0.9 : 0.35,
            transition: 'all 0.15s ease',
            transform: isHovered ? 'translate(0.5px, -0.5px)' : 'none',
            flexShrink: 0,
            marginLeft: '1px',
          }}
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      )}
    </div>
  );
};
