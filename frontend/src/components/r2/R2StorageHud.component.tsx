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
  classAOperations?: string;
  classBOperations?: string;
  storageClass?: string;
  publicAccess?: string;
  overageGb?: number;
  estimatedOverageCostUsd?: number;
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
  classAOperations = '46.75k',
  classBOperations = '113.58k',
  storageClass = 'Standard',
  publicAccess = 'Enabled',
  overageGb = 2.18,
  estimatedOverageCostUsd = 0.033,
}) => {
  const isOverage = totalSizeGb > freeTierQuotaGb;
  const meterColor = isOverage ? '#f59e0b' : usedPercentage > 85 ? '#ef4444' : '#06b6d4';

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
      {/* Left: Bucket Identity & Telemetry Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            backgroundColor: 'rgba(249, 115, 22, 0.15)',
            border: '1px solid rgba(249, 115, 22, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f97316',
            flexShrink: 0,
          }}
        >
          {/* Cloudflare Flame Engine Icon */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="8" ry="2.5" />
            <path d="M4 5v5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V5" />
            <path d="M4 10v5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5v-5" />
            <path d="M4 15v4c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5v-4" />
            <circle cx="12" cy="5" r="1" fill="#f97316" />
          </svg>
        </div>

        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
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
              CLASS: {storageClass.toUpperCase()}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              PUBLIC ACCESS: {publicAccess.toUpperCase()}
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

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <CostShieldBadge active={true} />
            <span
              title="Cloudflare R2 Class A Operations (1,000,000 free per month)"
              style={{
                fontSize: '10.5px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(56, 189, 248, 0.25)',
              }}
            >
              Class A: {classAOperations} / 1M Free
            </span>
            <span
              title="Cloudflare R2 Class B Operations (10,000,000 free per month)"
              style={{
                fontSize: '10.5px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: '#a78bfa',
                backgroundColor: 'rgba(167, 139, 250, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(167, 139, 250, 0.25)',
              }}
            >
              Class B: {classBOperations} / 10M Free
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', fontFamily: 'var(--font-mono)' }}>
              • {totalObjects.toLocaleString()} objects indexed
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Free Tier Progress Gauge & Overage Pill */}
      <div style={{ flex: '1 1 290px', maxWidth: '380px', minWidth: '250px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', fontFamily: 'var(--font-mono)' }}>
            STORAGE USAGE (10 GB FREE TIER)
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: meterColor, fontFamily: 'var(--font-mono)' }}>
              {totalSizeGb.toFixed(2)} GB ({usedPercentage.toFixed(1)}%)
            </span>
            {isOverage && (
              <span
                title={`Cloudflare R2 Free Tier: First 10 GB free. Overage: ${overageGb.toFixed(2)} GB @ $0.015/GB-mo = ~$${estimatedOverageCostUsd.toFixed(3)}/mo`}
                style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: 'rgba(245, 158, 11, 0.2)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                }}
              >
                +{overageGb.toFixed(2)} GB OVERAGE (~$0.03/MO)
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            height: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '999px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
          }}
        >
          {/* Base Free Tier 10 GB portion */}
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, (Math.min(freeTierQuotaGb, totalSizeGb) / (freeTierQuotaGb * 1.3)) * 100)}%`,
              backgroundColor: '#06b6d4',
              borderRadius: isOverage ? '999px 0 0 999px' : '999px',
            }}
          />
          {/* Overage portion if > 10GB */}
          {isOverage && (
            <div
              style={{
                height: '100%',
                width: `${Math.min(30, ((totalSizeGb - freeTierQuotaGb) / (freeTierQuotaGb * 1.3)) * 100)}%`,
                backgroundColor: '#f59e0b',
                borderRadius: '0 999px 999px 0',
              }}
            />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>0 GB</span>
          <span style={{ fontSize: '10px', color: '#10b981', fontFamily: 'var(--font-mono)' }}>10 GB (Free Tier Limit)</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>13 GB</span>
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
