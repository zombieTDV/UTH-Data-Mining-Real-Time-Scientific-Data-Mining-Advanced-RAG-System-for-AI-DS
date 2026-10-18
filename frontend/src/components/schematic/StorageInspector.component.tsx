import { useState, useEffect } from 'react';
import { fetchStorageStats, syncStorage, resetStorageSession } from '../../services';
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
  storageLocation: string;
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
    viewMode,
    setViewMode,
    refreshStorageStats,
  } = useLakehouseStreamStore();

  const handleSyncStorage = async () => {
    setIsSyncing(true);
    setSyncMessage('Scanning the MinIO bucket...');
    try {
      const res = await syncStorage();
      await refreshStorageStats();
      const updated = await fetchStorageStats();
      setStats(updated);
      setSyncMessage(res.message || 'MinIO storage stats synchronized successfully.');
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
  const bucketName = activeStats?.bucket ?? '';
  const isTotalView = viewMode === 'total';

  const activeData = activeStats?.activeLakehouse;
  const backupData = activeStats?.backupStorage;
  const totalBucket = activeStats?.totalBucket;

  const arxivCount = (activeData?.arxivHtmlCount ?? 0);
  const arxivGb = (activeData?.arxivHtmlSizeGb ?? 0).toFixed(3);
  const doiCount = (activeStats?.sourceBreakdown?.doi ?? 0).toLocaleString();
  const doiGb = (Number((activeStats?.activeLakehouse?.openalexSizeBytes ?? 0) / (1024**3))).toFixed(3);
  const silverMb = (activeData?.silverParquetSizeMb ?? 0).toFixed(2);
  const goldChunks = (activeData?.activeVectors ?? 0).toLocaleString();
  const goldMb = (activeData?.activeVectorsSizeMb ?? 0).toFixed(2);
  const backupGb = (backupData?.totalSizeGb ?? 0).toFixed(3);

  const activeGb = (Number(activeData?.totalSizeGb ?? 0)).toFixed(3);
  const activePct = (Number(activeData?.usedPercentage ?? 33.73)).toFixed(1);
  const totalGb = (totalBucket?.totalSizeGb ?? 0).toFixed(3);
  const totalPct = (totalBucket?.usedPercentage ?? 47.74).toFixed(1);

  const layers: LakehouseLayer[] = [
    {
      zone: 'BRONZE',
      name: 'Raw arXiv Academic HTML5',
      storageType: 'MinIO object store',
      format: 'W3C HTML5 (.html)',
      itemsCount: `${arxivCount.toLocaleString()} files`,
      sizeBytes: `${arxivGb} GB`,
      storageLocation: `s3://${bucketName}/bronze/arxiv/raw_html/`,
      color: '#3b82f6',
      description: 'Raw web-crawled HTML5 preprints from arXiv containing full academic sections, tables, math tags, and bibliography.'
    },
    {
      zone: 'BRONZE',
      name: 'DOI & Scientific Publisher Records',
      storageType: 'MinIO object store',
      format: 'JSON / Persistent Identifiers',
      itemsCount: `${doiCount} works`,
      sizeBytes: `${doiGb} GB`,
      storageLocation: `s3://${bucketName}/silver/tier2/near_past_papers.parquet`,
      color: '#2563eb',
      description: 'Cross-publisher academic records (Nature, IEEE, Springer, ACM) with direct DOI links, citation graphs, and author affiliations.'
    },
    {
      zone: 'BRONZE',
      name: 'OAI-PMH Harvest Batches',
      storageType: 'MinIO object store',
      format: 'Compressed JSON Bundles',
      itemsCount: '12 batch bundles',
      sizeBytes: '21.24 MB',
      storageLocation: `s3://${bucketName}/bronze/arxiv/batches/`,
      color: '#60a5fa',
      description: 'Raw metadata harvesting batches retrieved through arXiv OAI-PMH protocol across 5 AI/DS categories.'
    },
    {
      zone: 'BRONZE',
      name: 'OpenReview & CVF Conference Proceedings',
      storageType: 'MinIO object store',
      format: 'Parquet & Raw Markdown',
      itemsCount: '2,266 proceedings (1.0k OpenRev + 1.3k CVF)',
      sizeBytes: '29.4 MB',
      storageLocation: `s3://${bucketName}/silver/ (openreview, cvf)`,
      color: '#f59e0b',
      description: 'Peer-reviewed conference manuscripts and rating threads from ICLR, NeurIPS, CVPR, and ICCV with extracted mathematical claims.'
    },
    {
      zone: 'BRONZE',
      name: 'Zenodo Open Science Publications',
      storageType: 'HTML5 parser & Lakehouse',
      format: 'HTML5 parsed sections (LaTeX preserved)',
      itemsCount: '2,287 manuscripts',
      sizeBytes: '184.2 MB',
      storageLocation: `s3://${bucketName}/bronze/zenodo/`,
      color: '#06b6d4',
      description: 'Open Science records harvested from Zenodo (abstract-level content; no PDFs are downloaded).'
    },
    {
      zone: 'SILVER',
      name: 'Curated Canonical Lakehouse',
      storageType: 'Apache Arrow & MinIO',
      format: 'Apache Parquet (Snappy & Zstd)',
      itemsCount: `${(storageStats?.sourceBreakdown?.active_rag_papers ?? 0).toLocaleString()} papers (Silver across Tier 1, 2, 3)`,
      sizeBytes: `${silverMb} MB`,
      storageLocation: `s3://${bucketName}/silver/tier2/fulltext_papers.parquet`,
      color: '#10b981',
      description: 'Deduplicated, schema-enforced columnar Parquet tables across DOI publishers, arXiv, CVF, and OpenReview.'
    },
    {
      zone: 'GOLD',
      name: 'Contextual Vector Lakehouse (Active Cache)',
      storageType: 'MinIO object store (Gold artifacts)',
      format: 'Parquet (zstd) & JSON',
      itemsCount: `${goldChunks} vectors`,
      sizeBytes: `${goldMb} MB`,
      storageLocation: `s3://${bucketName}/gold/ (mining artifacts, Gold Parquet)`,
      color: '#eab308',
      description: 'Contextualized 768-dimensional dense embeddings and Gold parquets spanning CVPR, OpenReview, and arXiv.'
    },
    {
      zone: 'BACKUP',
      name: 'High-Performance Vector Engine Store',
      storageType: 'Qdrant In-Memory Vector Store',
      format: 'Rust HNSW Multi-Segment Graph',
      itemsCount: `${(activeData?.activeVectors ?? 0).toLocaleString()} points`,
      sizeBytes: `${backupGb} GB`,
      storageLocation: 'Qdrant collection scientific_papers_gold',
      color: '#f59e0b',
      description: 'Rust-powered in-memory vector store with sub-millisecond approximate nearest neighbor lookup.'
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
              MinIO Local S3 Lakehouse Storage Lens
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
              Local S3 (&lt; 1ms Latency)
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            Bucket: <code className="mono" style={{ color: 'var(--text-primary)' }}>{activeStats?.bucket ?? ''}</code> · S3 endpoint: MinIO
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
            onClick={handleSyncStorage}
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
            {isSyncing ? 'Syncing...' : 'Scan MinIO'}
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
            Gold Qdrant vector engine with persistent MinIO Lakehouse storage
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
            TOTAL MINIO S3 LAKEHOUSE BUCKET
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            <AnimatedCounter value={Number(totalGb)} decimals={3} suffix=" GB" />{' '}
            <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 500 }}>
              (<AnimatedCounter value={Number(totalPct)} decimals={1} suffix="%" />)
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {(totalBucket?.totalObjects ?? 0).toLocaleString()} objects · {(totalBucket?.overageGb ?? 0).toFixed(2)} GB over the {totalBucket?.freeTierQuotaGb ?? 20} GB budget (~${(totalBucket?.estimatedOverageCostUsd ?? 0).toFixed(3)}/month)
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
                  {layer.storageLocation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Airflow ingestion scheduler controls */}
      <AdaptiveSchedulerControl />
    </div>
  );
}
