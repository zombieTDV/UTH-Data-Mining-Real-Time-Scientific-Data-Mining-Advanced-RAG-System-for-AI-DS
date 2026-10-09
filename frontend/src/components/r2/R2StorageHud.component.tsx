import type { FC } from 'react';
import { CostShieldBadge } from './R2Glyphs.component';

export interface R2StorageHudProps {
  bucketName: string;
  totalSizeGb: number;
  totalObjects: number;
  freeTierQuotaGb?: number;
  usedPercentage: number;
  lastSynced: string;
  isSyncing: boolean;
  onSync: () => void;
}

export const R2StorageHud: FC<R2StorageHudProps> = ({
  bucketName,
  totalSizeGb,
  totalObjects,
  freeTierQuotaGb = 10.0,
  usedPercentage,
  lastSynced,
  isSyncing,
  onSync,
}) => {
  const isHigh = usedPercentage > 85;
  const isMid = usedPercentage > 70 && !isHigh;
  const meterColor = isHigh ? '#ef4444' : isMid ? '#f59e0b' : '#06b6d4';

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface, #1e293b)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        borderRadius: '12px',
        padding: '16px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
      }}
    >
      {/* Left: Bucket Identity & Security Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'rgba(249, 115, 22, 0.15)',
            border: '1px solid rgba(249, 115, 22, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f97316',
          }}
        >
          {/* Cloudflare Flame Engine Icon */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="8" ry="2.5" />
            <path d="M4 5v5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V5" />
            <path d="M4 10v5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5v-5" />
            <path d="M4 15v4c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5v-4" />
            <circle cx="12" cy="5" r="1" fill="#f97316" />
          </svg>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary, #f8fafc)', letterSpacing: '-0.01em' }}>
              {bucketName}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(249, 115, 22, 0.15)',
                color: '#f97316',
                border: '1px solid rgba(249, 115, 22, 0.3)',
              }}
            >
              CLOUDFLARE R2
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                color: 'var(--text-secondary, #94a3b8)',
              }}
            >
              REGION: AUTO (APAC)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
            <CostShieldBadge active={true} />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', fontFamily: 'var(--font-mono)' }}>
              • {totalObjects.toLocaleString()} objects indexed
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Free Tier Progress Gauge */}
      <div style={{ flex: '1 1 280px', maxWidth: '360px', minWidth: '240px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', fontFamily: 'var(--font-mono)' }}>
            FREE TIER QUOTA (10 GB)
          </span>
          <span style={{ fontSize: '12px', fontWeight: 800, color: meterColor, fontFamily: 'var(--font-mono)' }}>
            {totalSizeGb.toFixed(3)} GB ({usedPercentage.toFixed(1)}%)
          </span>
        </div>

        <div
          style={{
            height: '7px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '999px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, (totalSizeGb / freeTierQuotaGb) * 100)}%`,
              backgroundColor: meterColor,
              borderRadius: '999px',
              transition: 'width 0.4s ease',
              boxShadow: `0 0 10px ${meterColor}66`,
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>0 GB</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>$0.00 / Free Tier</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>10 GB</span>
        </div>
      </div>

      {/* Right: Manual Pull Action & Timestamp */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
        <button
          type="button"
          onClick={onSync}
          disabled={isSyncing}
          title="Manually scans Cloudflare R2 bucket to update the asset inventory snapshot"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 15px',
            borderRadius: '7px',
            backgroundColor: isSyncing ? 'rgba(59, 130, 246, 0.2)' : '#2563eb',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: isSyncing ? 'spin 1s linear infinite' : 'none',
            }}
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          <span>{isSyncing ? 'SYNCING R2...' : 'FETCH REMOTE SNAPSHOT'}</span>
        </button>

        <span style={{ fontSize: '10.5px', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>
          Last Synced: <strong style={{ color: 'var(--text-secondary, #94a3b8)' }}>{lastSynced}</strong>
        </span>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
