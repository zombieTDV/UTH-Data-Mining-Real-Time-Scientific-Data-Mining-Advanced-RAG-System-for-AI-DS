import { useState, useEffect } from 'react';
import { fetchStorageStats, syncR2Storage, resetStorageSession } from '../../services';
import { useLakehouseStreamStore } from '../../store';
import { AnimatedCounter } from '../common';
import type { StorageStatsResponse } from '../../types';
import { AdaptiveSchedulerControl } from './AdaptiveSchedulerControl.component';

export interface LakehouseLayer {
  zone: 'BRONZE' | 'SILVER' | 'GOLD' | 'BACKUP';
  name: string;
  storageType: string;
  format: string;
  itemsCount: string;
  sizeBytes: string;
  r2Location: string;
  color: string;
  description: string;
}

export function StorageInspector() {
  const [stats, setStats] = useState<StorageStatsResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const {
    sessionIngested,
    storageStats,
    storageUsedGb,
    storageUsedPct,
    viewMode,
    setViewMode,
    refreshStorageStats,
  } = useLakehouseStreamStore();

  const handleSyncR2 = async () => {
    setIsSyncing(true);
    setSyncMessage('Scanning Cloudflare R2 bucket objects...');
    try {
      const res = await syncR2Storage();
      await refreshStorageStats();
      const updated = await fetchStorageStats();
      setStats(updated);
      setSyncMessage(res.message || 'R2 storage stats synchronized successfully.');
    } catch (e: any) {
      setSyncMessage(`Sync failed: ${e.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const handleResetSession = async () => {
    if (confirm('Reset real-time ingestion session counter back to baseline?')) {
      try {
        await resetStorageSession();
        await refreshStorageStats();
      } catch (e: any) {
        console.error('Failed to reset session:', e);
      }
    }
  };

  useEffect(() => {
    // Initial fetch once on mount; all subsequent real-time updates flow via SSE reactive store
    refreshStorageStats();
  }, [refreshStorageStats]);

  const activeStats = storageStats || stats;
  const isTotalView = viewMode === 'total';

  const activeData = activeStats?.activeLakehouse;
  const backupData = activeStats?.backupStorage;
  const totalBucket = activeStats?.totalBucket;

  const arxivCount = (activeData?.arxivHtmlCount ?? 11660) + sessionIngested;
  const arxivGb = (activeData?.arxivHtmlSizeGb ?? 3.763).toFixed(3);
  const openalexCount = (activeData?.openalexCount ?? 24754).toLocaleString();
  const openalexGb = (activeData?.openalexSizeGb ?? 3.971).toFixed(3);
  const silverMb = (activeData?.silverParquetSizeMb ?? 321.68).toFixed(2);
  const goldChunks = (activeData?.activeLanceDbVectors ?? 164702).toLocaleString();
  const goldMb = (activeData?.activeLanceDbSizeMb ?? 211.26).toFixed(2);
  const backupGb = (backupData?.totalSizeGb ?? 3.069).toFixed(3);

  const activeGb = (storageUsedGb || Number(activeData?.totalSizeGb ?? 8.073)).toFixed(3);
  const activePct = (storageUsedPct || Number(activeData?.usedPercentage ?? 80.73)).toFixed(1);
  const totalGb = (totalBucket?.totalSizeGb ?? 11.142).toFixed(3);
  const totalPct = (totalBucket?.usedPercentage ?? 111.42).toFixed(1);

  const layers: LakehouseLayer[] = [
    {
      zone: 'BRONZE',
      name: 'Raw arXiv Academic HTML5',
      storageType: 'Cloudflare R2 Object Store & Disk',
      format: 'W3C HTML5 (.html)',
      itemsCount: `${arxivCount.toLocaleString()} files`,
      sizeBytes: `${arxivGb} GB`,
      r2Location: 's3://uth-scientific-lakehouse/bronze/arxiv/raw_html/',
      color: '#3b82f6',
      description: 'Raw web-crawled HTML5 preprints from arXiv containing full academic sections, tables, math tags, and bibliography.'
    },
    {
      zone: 'BRONZE',
      name: 'OpenAlex Scientific Extended Corpus',
      storageType: 'Cloudflare R2 Object Store',
      format: 'JSON / Metadata Records',
      itemsCount: `${openalexCount} works`,
      sizeBytes: `${openalexGb} GB`,
      r2Location: 's3://uth-scientific-lakehouse/bronze/openalex/',
      color: '#8b5cf6',
      description: 'Global scientific catalog records with citation graphs, author affiliations, and open-access PDF links.'
    },
    {
      zone: 'BRONZE',
      name: 'OAI-PMH Harvest Batches',
      storageType: 'Cloudflare R2 Object Store',
      format: 'Compressed JSON Bundles',
      itemsCount: '12 batch bundles',
      sizeBytes: '21.24 MB',
      r2Location: 's3://uth-scientific-lakehouse/bronze/arxiv/batches/',
      color: '#60a5fa',
      description: 'Raw metadata harvesting batches retrieved through arXiv OAI-PMH protocol across 5 AI/DS categories.'
    },
    {
      zone: 'SILVER',
      name: 'Curated Canonical Lakehouse',
      storageType: 'Apache Arrow & Cloudflare R2',
      format: 'Apache Parquet (Snappy)',
      itemsCount: '11 Partitions (38,414 works)',
      sizeBytes: `${silverMb} MB`,
      r2Location: 's3://uth-scientific-lakehouse/silver/ (papers, cvf, openreview)',
      color: '#10b981',
      description: 'Deduplicated, schema-enforced columnar Parquet tables across arXiv, OpenAlex, CVPR 2024, and OpenReview.'
    },
    {
      zone: 'GOLD',
      name: 'Contextual Vector Lakehouse (Active Cache)',
      storageType: 'Local SSD NVMe Serving Index',
      format: 'Lance Columnar (.lance) & Parquet',
      itemsCount: `${goldChunks} vectors`,
      sizeBytes: `${goldMb} MB`,
      r2Location: 'data/gold/ & s3://uth-scientific-lakehouse/gold/ (lancedb, cvf, openreview)',
      color: '#eab308',
      description: 'Contextualized 768-dimensional dense embeddings and Gold parquets spanning CVPR, OpenReview, and arXiv.'
    },
    {
      zone: 'BACKUP',
      name: 'Cloud Disaster Recovery Vector Replica',
      storageType: 'Cloudflare R2 Cold Snapshots',
      format: 'LanceDB Multi-Segment Archives',
      itemsCount: '32 chunk segments',
      sizeBytes: `${backupGb} GB`,
      r2Location: 's3://uth-scientific-lakehouse/gold/lancedb/',
      color: '#f59e0b',
      description: 'Disaster recovery cloud backup replica enabling instant cluster reconstitution with zero egress fees.'
    }
  ];

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '24px',
    }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Cloudflare R2 Multi-Tier Storage Lens
            </h3>
            <span style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              padding: '2px 8px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.12)',
              color: 'var(--accent-emerald)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              Zero Egress Fees
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            Bucket: <code className="mono" style={{ color: 'var(--text-primary)' }}>{activeStats?.bucket || 'uth-scientific-lakehouse'}</code> · S3 Endpoint: Cloudflare Global Edge
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Active vs Total View Switcher */}
          <div style={{
            display: 'inline-flex',
            background: 'var(--bg-elevated)',
            padding: '3px',
            borderRadius: '14px',
            border: '1px solid var(--border-muted)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
          }}>
            <button
              type="button"
              onClick={() => setViewMode('active')}
              style={{
                background: !isTotalView ? 'var(--accent-emerald)' : 'transparent',
                color: !isTotalView ? '#ffffff' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '12px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontWeight: !isTotalView ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              Active (<AnimatedCounter value={Number(activeGb)} decimals={3} /> GB)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('total')}
              style={{
                background: isTotalView ? 'var(--accent-gold)' : 'transparent',
                color: isTotalView ? '#000000' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '12px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontWeight: isTotalView ? 600 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              Total Bucket (<AnimatedCounter value={Number(totalGb)} decimals={3} /> GB)
            </button>
          </div>

          {/* Sync Button */}
          <button
            type="button"
            onClick={handleSyncR2}
            disabled={isSyncing}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isSyncing ? 'Syncing...' : 'Sync Live R2'}
          </button>

          {/* Reset Session Button */}
          {sessionIngested > 0 && (
            <button
              type="button"
              onClick={handleResetSession}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
              }}
            >
              Reset Session (+{sessionIngested})
            </button>
          )}
        </div>
      </div>

      {syncMessage && (
        <div style={{
          padding: '8px 14px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          color: '#60a5fa',
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
          marginBottom: '16px',
        }}>
          {syncMessage}
        </div>
      )}

      {/* 3 Overview Metric Boxes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        marginBottom: '20px',
      }}>
        {/* Box 1: Primary Active Lakehouse */}
        <div style={{
          background: 'var(--bg-elevated)',
          padding: '14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            PRIMARY ACTIVE LAKEHOUSE
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            <AnimatedCounter value={Number(activeGb)} decimals={3} suffix=" GB" />{' '}
            <span style={{ fontSize: '13px', color: 'var(--accent-emerald)', fontWeight: 500 }}>
              (<AnimatedCounter value={Number(activePct)} decimals={1} suffix="% Free Quota" />)
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            arXiv HTML5 (3.76 GB) + OpenAlex (3.97 GB) + Parquet (316 MB)
          </div>
        </div>

        {/* Box 2: Disaster Recovery Backup */}
        <div style={{
          background: 'var(--bg-elevated)',
          padding: '14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            DISASTER RECOVERY SNAPSHOTS
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>
            <AnimatedCounter value={Number(backupGb)} decimals={3} suffix=" GB" />{' '}
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>(28 segments)</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Gold LanceDB cloud replica on R2 for instant cold recovery
          </div>
        </div>

        {/* Box 3: Total Physical Bucket */}
        <div style={{
          background: 'var(--bg-elevated)',
          padding: '14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            TOTAL CLOUDFLARE R2 BUCKET
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            <AnimatedCounter value={Number(totalGb)} decimals={3} suffix=" GB" />{' '}
            <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 500 }}>
              (<AnimatedCounter value={Number(totalPct)} decimals={1} suffix="%" />)
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            36,673 files · 1.14 GB overage (~$0.017/month / 400 VND)
          </div>
        </div>
      </div>

      {/* Granular Layers Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12px',
          textAlign: 'left'
        }}>
          <thead>
            <tr style={{
              borderBottom: '1px solid var(--border-muted)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              <th style={{ padding: '10px 14px' }}>Zone</th>
              <th style={{ padding: '10px 14px' }}>Dataset Name</th>
              <th style={{ padding: '10px 14px' }}>Format</th>
              <th style={{ padding: '10px 14px' }}>Count</th>
              <th style={{ padding: '10px 14px' }}>Volume</th>
              <th style={{ padding: '10px 14px' }}>Lakehouse Prefix</th>
            </tr>
          </thead>
          <tbody>
            {layers.map((layer, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: idx < layers.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <td style={{ padding: '12px 14px' }}>
                  <span style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    background: 'var(--badge-bg)',
                    color: layer.color,
                    border: '1px solid var(--badge-border)'
                  }}>
                    {layer.zone}
                  </span>
                </td>
                <td style={{ padding: '12px 14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {layer.name}
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {layer.description}
                  </div>
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  {layer.format}
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {layer.itemsCount}
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: layer.color }}>
                  {layer.sizeBytes}
                </td>
                <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {layer.r2Location}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Adaptive Ingestion Scheduler & R2 Cost-Guard Controls */}
      <AdaptiveSchedulerControl />
    </div>
  );
}
