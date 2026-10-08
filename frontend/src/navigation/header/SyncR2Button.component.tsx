import { useState, type FC } from 'react';
import { syncR2Storage } from '../../services';
import { useLakehouseStreamStore } from '../../store';
import { useTranslation } from '../../hooks';

export interface SyncR2ButtonProps {
  onSyncComplete?: (message: string) => void;
}

export const SyncR2Button: FC<SyncR2ButtonProps> = ({ onSyncComplete }) => {
  const { language } = useTranslation();
  const { refreshStorageStats } = useLakehouseStreamStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setFeedback(null);
    try {
      const res = await syncR2Storage();
      await refreshStorageStats(true);
      setFeedback('success');
      onSyncComplete?.(res.message || 'R2 storage synchronized successfully');
      setTimeout(() => setFeedback(null), 3500);
    } catch {
      setFeedback('error');
      setTimeout(() => setFeedback(null), 3500);
    } finally {
      setIsSyncing(false);
    }
  };

  const buttonLabel = isSyncing
    ? (language === 'vi' ? 'Đang sync R2...' : 'Syncing R2...')
    : feedback === 'success'
    ? (language === 'vi' ? 'Đã sync R2' : 'Synced R2')
    : feedback === 'error'
    ? (language === 'vi' ? 'Sync lỗi' : 'Sync Failed')
    : (language === 'vi' ? 'Sync lên R2' : 'Sync Live R2');

  const tooltipText = language === 'vi'
    ? 'Đồng bộ tức thì với Cloudflare R2 bucket: Quét dung lượng, bảng Parquet Snappy và kiểm tra tính toàn vẹn đối tượng'
    : 'Synchronize immediately with Cloudflare R2 bucket: Scan volume, Snappy Parquet tables, and verify object integrity';

  // Palette states
  const isOk = feedback === 'success';
  const isErr = feedback === 'error';

  const containerBg = isSyncing
    ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.18) 0%, rgba(14, 165, 233, 0.08) 100%)'
    : isOk
    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(5, 150, 105, 0.08) 100%)'
    : isErr
    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.18) 0%, rgba(185, 28, 28, 0.08) 100%)'
    : isHovered
    ? 'linear-gradient(135deg, rgba(249, 115, 22, 0.16) 0%, rgba(234, 88, 12, 0.06) 100%)'
    : 'linear-gradient(135deg, rgba(249, 115, 22, 0.08) 0%, rgba(234, 88, 12, 0.02) 100%)';

  const containerBorder = isSyncing
    ? '1px solid rgba(56, 189, 248, 0.55)'
    : isOk
    ? '1px solid rgba(16, 185, 129, 0.55)'
    : isErr
    ? '1px solid rgba(239, 68, 68, 0.55)'
    : isHovered
    ? '1px solid rgba(249, 115, 22, 0.5)'
    : '1px solid rgba(249, 115, 22, 0.28)';

  const containerShadow = isSyncing
    ? '0 0 14px rgba(56, 189, 248, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
    : isOk
    ? '0 0 14px rgba(16, 185, 129, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
    : isErr
    ? '0 0 14px rgba(239, 68, 68, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
    : isHovered
    ? '0 3px 12px rgba(249, 115, 22, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
    : '0 1px 3px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.06)';

  const labelColor = isSyncing
    ? '#38bdf8'
    : isOk
    ? '#10b981'
    : isErr
    ? '#ef4444'
    : isHovered
    ? '#f97316'
    : 'var(--text-primary)';

  const badgeBg = isSyncing
    ? 'rgba(56, 189, 248, 0.16)'
    : isOk
    ? 'rgba(16, 185, 129, 0.16)'
    : isErr
    ? 'rgba(239, 68, 68, 0.16)'
    : 'rgba(249, 115, 22, 0.14)';

  const badgeBorder = isSyncing
    ? '1px solid rgba(56, 189, 248, 0.35)'
    : isOk
    ? '1px solid rgba(16, 185, 129, 0.35)'
    : isErr
    ? '1px solid rgba(239, 68, 68, 0.35)'
    : '1px solid rgba(249, 115, 22, 0.3)';

  const badgeText = isSyncing
    ? '#38bdf8'
    : isOk
    ? '#10b981'
    : isErr
    ? '#ef4444'
    : '#f97316';

  const dotColor = isSyncing
    ? '#38bdf8'
    : isOk
    ? '#10b981'
    : isErr
    ? '#ef4444'
    : '#f97316';

  const badgeLabel = isSyncing
    ? 'LIVE'
    : isOk
    ? 'OK'
    : isErr
    ? 'ERR'
    : 'R2';

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={isSyncing}
      title={tooltipText}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsActive(false);
      }}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        padding: '0 11px',
        height: '32px',
        borderRadius: '8px',
        backgroundColor: 'var(--bg-elevated)',
        backgroundImage: containerBg,
        border: containerBorder,
        boxShadow: containerShadow,
        color: labelColor,
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 700,
        cursor: isSyncing ? 'not-allowed' : 'pointer',
        boxSizing: 'border-box',
        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isActive && !isSyncing ? 'scale(0.97)' : isHovered && !isSyncing ? 'translateY(-1px)' : 'none',
        userSelect: 'none',
        letterSpacing: '0.01em',
      }}
    >
      {/* Dynamic Status Icon */}
      {isSyncing ? (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            animation: 'spin 0.85s linear infinite',
            flexShrink: 0,
          }}
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-1.19" />
        </svg>
      ) : isOk ? (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#10b981"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : isErr ? (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ) : (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f97316"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flexShrink: 0,
            transition: 'transform 0.18s ease',
            transform: isHovered ? 'rotate(15deg) scale(1.08)' : 'none',
          }}
        >
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
          <path d="M12 12v4" />
          <path d="m10.5 13.5 1.5-1.5 1.5 1.5" />
        </svg>
      )}

      {/* Button Text */}
      <span style={{ transition: 'color 0.15s ease' }}>{buttonLabel}</span>

      {/* Micro Status Tag */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3.5px',
          padding: '1px 5px',
          height: '16px',
          borderRadius: '4px',
          fontSize: '9px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 800,
          backgroundColor: badgeBg,
          border: badgeBorder,
          color: badgeText,
          letterSpacing: '0.04em',
          transition: 'all 0.18s ease',
        }}
      >
        <span
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            backgroundColor: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
            display: 'inline-block',
          }}
        />
        {badgeLabel}
      </span>
    </button>
  );
};
