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

  const buttonText = isSyncing
    ? (language === 'vi' ? 'Đang sync R2...' : 'Syncing R2...')
    : feedback === 'success'
    ? (language === 'vi' ? 'Đã sync R2 ✓' : 'Synced R2 ✓')
    : feedback === 'error'
    ? (language === 'vi' ? 'Sync lỗi ✕' : 'Sync Failed ✕')
    : (language === 'vi' ? 'Sync lên R2' : 'Sync Live R2');

  const tooltipText = language === 'vi'
    ? 'Đồng bộ tức thì với Cloudflare R2 bucket: Quét dung lượng, bảng Parquet Snappy và kiểm tra tính toàn vẹn đối tượng'
    : 'Synchronize immediately with Cloudflare R2 bucket: Scan volume, Snappy Parquet tables, and verify object integrity';

  const badgeBg = isSyncing
    ? 'rgba(56, 189, 248, 0.18)'
    : feedback === 'success'
    ? 'rgba(16, 185, 129, 0.18)'
    : feedback === 'error'
    ? 'rgba(239, 68, 68, 0.18)'
    : 'var(--badge-bg)';

  const badgeBorder = isSyncing
    ? '1px solid rgba(56, 189, 248, 0.5)'
    : feedback === 'success'
    ? '1px solid rgba(16, 185, 129, 0.5)'
    : feedback === 'error'
    ? '1px solid rgba(239, 68, 68, 0.5)'
    : '1px solid var(--badge-border)';

  const textColor = isSyncing
    ? '#38bdf8'
    : feedback === 'success'
    ? '#10b981'
    : feedback === 'error'
    ? '#ef4444'
    : 'var(--text-primary)';

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={isSyncing}
      title={tooltipText}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '0 11px',
        height: '32px',
        borderRadius: '8px',
        backgroundColor: badgeBg,
        border: badgeBorder,
        color: textColor,
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 700,
        cursor: isSyncing ? 'not-allowed' : 'pointer',
        boxSizing: 'border-box',
        transition: 'all 0.15s ease',
        userSelect: 'none',
        letterSpacing: '0.02em',
      }}
    >
      {/* Cloud & Sync Icon */}
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
          animation: isSyncing ? 'spin 1s linear infinite' : 'none',
          flexShrink: 0,
        }}
      >
        {isSyncing ? (
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-1.19" />
        ) : feedback === 'success' ? (
          <polyline points="20 6 9 17 4 12" />
        ) : (
          <>
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            <polyline points="12 12 15 15 12 18" />
          </>
        )}
      </svg>
      <span>{buttonText}</span>
    </button>
  );
};
