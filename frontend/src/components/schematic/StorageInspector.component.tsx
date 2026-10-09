import { useState, useEffect } from 'react';
import { fetchStorageStats, syncR2Storage, resetStorageSession } from '../../services';
import { useLakehouseStreamStore } from '../../store';
import { useTranslation } from '../../hooks';
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
  const { language } = useTranslation();
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
    resetSessionInStore,
  } = useLakehouseStreamStore();

  const handleSyncR2 = async () => {
    setIsSyncing(true);
    setSyncMessage(language === 'vi' ? 'Đang quét các đối tượng bucket Cloudflare R2...' : 'Scanning Cloudflare R2 bucket objects...');
    try {
      const res = await syncR2Storage();
      await refreshStorageStats();
      const updated = await fetchStorageStats();
      setStats(updated);
      setSyncMessage(res.message || (language === 'vi' ? 'Đã đồng bộ thống kê lưu trữ R2 thành công.' : 'R2 storage stats synchronized successfully.'));
    } catch (e: any) {
      setSyncMessage(`${language === 'vi' ? 'Đồng bộ thất bại:' : 'Sync failed:'} ${e.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 4000);
    }
  };

  const handleResetSession = async () => {
    if (confirm(language === 'vi' ? 'Đặt lại bộ đếm phiên nhập thời gian thực về mốc chuẩn?' : 'Reset real-time ingestion session counter back to baseline?')) {
      try {
        await resetStorageSession();
        resetSessionInStore();
        await refreshStorageStats(true);
        const updated = await fetchStorageStats();
        setStats(updated);
        setSyncMessage(language === 'vi' ? 'Đã đặt lại phiên cào về mốc cơ sở chuẩn (36,414 bài).' : 'Session counter reset to baseline (36,414 works).');
      } catch (e: any) {
        console.error('Failed to reset session:', e);
      } finally {
        setTimeout(() => setSyncMessage(null), 3500);
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

  const arxivCount = (activeData?.arxivHtmlCount ?? 11698) + sessionIngested;
  const arxivGb = (activeData?.arxivHtmlSizeGb ?? 3.763).toFixed(3);
  const openalexCount = (activeData?.openalexCount ?? 24756).toLocaleString();
  const openalexGb = (activeData?.openalexSizeGb ?? 4.066).toFixed(3);
  const silverMb = (activeData?.silverParquetSizeMb ?? 321.68).toFixed(2);
  const goldChunks = (activeData?.activeLanceDbVectors ?? 164750).toLocaleString();
  const backupGb = (backupData?.totalSizeGb ?? 4.107).toFixed(3);

  const activeGb = (storageUsedGb || Number(activeData?.totalSizeGb ?? 8.191)).toFixed(3);
  const activePct = (storageUsedPct || Number(activeData?.usedPercentage ?? 81.91)).toFixed(1);
  const totalGb = (totalBucket?.totalSizeGb ?? 11.43).toFixed(3);
  const totalPct = (totalBucket?.usedPercentage ?? 114.3).toFixed(1);

  // Segment widths relative to 10GB Free Tier limit
  const arxivBarPct = Math.min(100, (Number(arxivGb) / 10.0) * 100);
  const openalexBarPct = Math.min(100, (Number(openalexGb) / 10.0) * 100);
  const silverBarPct = Math.min(100, ((Number(silverMb) / 1024) / 10.0) * 100);
  const backupBarPct = Math.min(100, (Number(backupGb) / 10.0) * 100);
  const remainingFreeGb = Math.max(0, 10.0 - Number(activeGb)).toFixed(3);

  const layers: LakehouseLayer[] = [
    {
      zone: 'BRONZE',
      name: language === 'vi' ? 'Dữ liệu arXiv HTML5 học thuật thô' : 'Raw arXiv Academic HTML5',
      storageType: language === 'vi' ? 'Lưu trữ đối tượng Cloudflare R2 & Đĩa' : 'Cloudflare R2 Object Store & Disk',
      format: 'W3C HTML5 (.html)',
      itemsCount: `${arxivCount.toLocaleString()} ${language === 'vi' ? 'tệp' : 'files'}`,
      sizeBytes: `${arxivGb} GB`,
      r2Location: 's3://uth-scientific-lakehouse/bronze/arxiv/raw_html/',
      color: '#3b82f6',
      description: language === 'vi'
        ? 'Bản thảo HTML5 thu thập thô từ arXiv chứa đầy đủ các phần học thuật, bảng biểu, thẻ toán học và thư mục trích dẫn.'
        : 'Raw web-crawled HTML5 preprints from arXiv containing full academic sections, tables, math tags, and bibliography.'
    },
    {
      zone: 'BRONZE',
      name: language === 'vi' ? 'Kho dữ liệu mở rộng khoa học OpenAlex' : 'OpenAlex Scientific Extended Corpus',
      storageType: language === 'vi' ? 'Lưu trữ đối tượng Cloudflare R2' : 'Cloudflare R2 Object Store',
      format: language === 'vi' ? 'JSON / Bản ghi siêu dữ liệu' : 'JSON / Metadata Records',
      itemsCount: `${openalexCount} ${language === 'vi' ? 'bài' : 'works'}`,
      sizeBytes: `${openalexGb} GB`,
      r2Location: 's3://uth-scientific-lakehouse/bronze/openalex/',
      color: '#8b5cf6',
      description: language === 'vi'
        ? 'Danh mục khoa học toàn cầu với đồ thị trích dẫn, cơ quan liên kết của tác giả và liên kết PDF truy cập mở.'
        : 'Global scientific catalog records with citation graphs, author affiliations, and open-access PDF links.'
    },
    {
      zone: 'BRONZE',
      name: language === 'vi' ? 'Các gói lô thu hoạch OAI-PMH' : 'OAI-PMH Harvest Batches',
      storageType: language === 'vi' ? 'Lưu trữ đối tượng Cloudflare R2' : 'Cloudflare R2 Object Store',
      format: language === 'vi' ? 'Gói nén JSON' : 'Compressed JSON Bundles',
      itemsCount: language === 'vi' ? '12 gói lô' : '12 batch bundles',
      sizeBytes: '21.24 MB',
      r2Location: 's3://uth-scientific-lakehouse/bronze/arxiv/batches/',
      color: '#60a5fa',
      description: language === 'vi'
        ? 'Các gói siêu dữ liệu thô thu thập qua giao thức arXiv OAI-PMH trên 5 danh mục AI/DS.'
        : 'Raw metadata harvesting batches retrieved through arXiv OAI-PMH protocol across 5 AI/DS categories.'
    },
    {
      zone: 'SILVER',
      name: language === 'vi' ? 'Lakehouse chuẩn hóa chọn lọc' : 'Curated Canonical Lakehouse',
      storageType: 'Apache Arrow & Cloudflare R2',
      format: 'Apache Parquet (Snappy)',
      itemsCount: language === 'vi' ? '11 Phân vùng (36,414 bài)' : '11 Partitions (36,414 works)',
      sizeBytes: `${silverMb} MB`,
      r2Location: 's3://uth-scientific-lakehouse/silver/ (papers, cvf, openreview)',
      color: '#10b981',
      description: language === 'vi'
        ? 'Các bảng Parquet dạng cột đã khử trùng lặp và tuân thủ schema từ arXiv, OpenAlex, CVPR 2024 và OpenReview.'
        : 'Deduplicated, schema-enforced columnar Parquet tables across arXiv, OpenAlex, CVPR 2024, and OpenReview.'
    },
    {
      zone: 'GOLD',
      name: language === 'vi' ? 'Hồ Vector LanceDB Tầng Gold (Lưu trữ Đám mây R2)' : 'Gold Layer Vector Lakehouse (Cloudflare R2)',
      storageType: language === 'vi' ? 'Lưu trữ đối tượng Cloudflare R2 (Chỉ mục IVF-PQ)' : 'Cloudflare R2 Object Store (IVF-PQ Index)',
      format: 'Lance Columnar (.lance) & Arrow',
      itemsCount: `${goldChunks} vectors (85 ${language === 'vi' ? 'tệp' : 'files'})`,
      sizeBytes: `${backupGb} GB`,
      r2Location: 's3://uth-scientific-lakehouse/gold/lancedb/',
      color: '#f59e0b',
      description: language === 'vi'
        ? 'Toàn bộ 164,750 vector embeddings 768 chiều nhúng bởi Nomic AI kèm chỉ mục IVF-PQ phục vụ RAG và tìm kiếm thông minh.'
        : 'Complete 164,750 768-dimensional dense embeddings indexed with IVF-PQ for sub-second RAG retrieval.'
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
              {language === 'vi' ? 'Lăng kính Lưu trữ Đa tầng Cloudflare R2' : 'Cloudflare R2 Multi-Tier Storage Lens'}
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
              {language === 'vi' ? 'Không phí Egress' : 'Zero Egress Fees'}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            Bucket: <code className="mono" style={{ color: 'var(--text-primary)' }}>{activeStats?.bucket || 'uth-scientific-lakehouse'}</code> · {language === 'vi' ? 'Điểm cuối S3: Mạng biên toàn cầu Cloudflare' : 'S3 Endpoint: Cloudflare Global Edge'}
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
              {language === 'vi' ? 'Bronze + Silver' : 'Bronze + Silver'} (<AnimatedCounter value={Number(activeGb)} decimals={3} /> GB)
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
              {language === 'vi' ? 'Toàn bộ Bucket (+Gold)' : 'Total Bucket (+Gold)'} (<AnimatedCounter value={Number(totalGb)} decimals={3} /> GB)
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
            {isSyncing ? (language === 'vi' ? 'Đang đồng bộ...' : 'Syncing...') : (language === 'vi' ? 'Đồng bộ Live R2' : 'Sync Live R2')}
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
              {language === 'vi' ? 'Đặt lại phiên' : 'Reset Session'} (+{sessionIngested})
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
        {/* Box 1: Bronze + Silver Zone */}
        <div style={{
          background: 'var(--bg-elevated)',
          padding: '14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {language === 'vi' ? 'TẦNG BRONZE + SILVER (VẬN HÀNH)' : 'BRONZE + SILVER ZONE (OPERATION)'}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            <AnimatedCounter value={Number(activeGb)} decimals={3} suffix=" GB" />{' '}
            <span style={{ fontSize: '13px', color: 'var(--accent-emerald)', fontWeight: 500 }}>
              (<AnimatedCounter value={Number(activePct)} decimals={1} suffix={`% ${language === 'vi' ? 'Hạn mức' : 'Free Quota'}`} />)
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            arXiv HTML5 (3.76 GB) + OpenAlex (3.97 GB) + Parquet (316 MB)
          </div>
        </div>

        {/* Box 2: Gold Vector Lakehouse */}
        <div style={{
          background: 'var(--bg-elevated)',
          padding: '14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {language === 'vi' ? 'TẦNG GOLD VECTOR LAKEHOUSE (RAG)' : 'GOLD LAYER VECTOR LAKEHOUSE (RAG)'}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>
            <AnimatedCounter value={Number(backupGb)} decimals={3} suffix=" GB" />{' '}
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>(164,750 vectors · 85 {language === 'vi' ? 'tệp' : 'files'})</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {language === 'vi' ? 'LanceDB IVF-PQ index phục vụ Semantic Search & Grounded RAG' : 'LanceDB IVF-PQ index serving Semantic Search & Grounded RAG'}
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
            {language === 'vi' ? 'TỔNG LƯU TRỮ BUCKET CLOUDFLARE R2' : 'TOTAL CLOUDFLARE R2 BUCKET'}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
            <AnimatedCounter value={Number(totalGb)} decimals={3} suffix=" GB" />{' '}
            <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 500 }}>
              (<AnimatedCounter value={Number(totalPct)} decimals={1} suffix="%" />)
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {language === 'vi' ? '36,751 tệp (gồm Bronze, Silver & Gold Vector)' : '36,751 files (across Bronze, Silver & Gold Vector)'}
          </div>
        </div>
      </div>

      {/* Multi-Tier Segmented Progress Bar (10GB Free Tier Quota) */}
      <div style={{
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
        padding: '14px 18px',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {language === 'vi' ? 'Phân bổ Dung lượng Hạn mức Miễn phí 10GB Cloudflare R2' : 'Cloudflare R2 10GB Free Tier Allocation'}
            </span>
            <span style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              padding: '1px 6px',
              borderRadius: '4px',
              background: isTotalView ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: isTotalView ? '#f59e0b' : 'var(--accent-emerald)',
              fontWeight: 700,
            }}>
              {isTotalView ? `${totalPct}% (Kèm Backup)` : `${activePct}% Hạn mức`}
            </span>
          </div>
          <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {isTotalView
              ? (language === 'vi' ? 'Băng thông Egress: $0.00 (Miễn phí)' : 'Egress Bandwidth: $0.00 (Zero Fee)')
              : (<>{language === 'vi' ? 'Còn trống trong hạn mức: ' : 'Free Quota Remaining: '}<strong>{remainingFreeGb} GB</strong></>)}
          </div>
        </div>

        {/* The Multi-Tier Progress Track */}
        <div style={{
          height: '10px',
          background: 'var(--track-bg)',
          borderRadius: '5px',
          overflow: 'hidden',
          display: 'flex',
          position: 'relative',
        }}>
          {/* arXiv HTML5 Segment (Blue) */}
          <div
            title={`arXiv HTML5: ${arxivGb} GB`}
            style={{
              width: `${arxivBarPct}%`,
              height: '100%',
              background: '#3b82f6',
            }}
          />
          {/* OpenAlex Segment (Purple) */}
          <div
            title={`OpenAlex Corpus: ${openalexGb} GB`}
            style={{
              width: `${openalexBarPct}%`,
              height: '100%',
              background: '#8b5cf6',
            }}
          />
          {/* Silver Parquet Segment (Emerald) */}
          <div
            title={`Silver Parquet: ${silverMb} MB`}
            style={{
              width: `${Math.max(1, silverBarPct)}%`,
              height: '100%',
              background: '#10b981',
            }}
          />
          {/* Gold LanceDB Segment (Amber) */}
          {isTotalView && (
            <div
              title={`Gold LanceDB: ${backupGb} GB`}
              style={{
                width: `${backupBarPct}%`,
                height: '100%',
                background: '#f59e0b',
              }}
            />
          )}
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '8px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#3b82f6', display: 'inline-block' }} />
              arXiv Raw HTML5 ({arxivGb} GB)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#8b5cf6', display: 'inline-block' }} />
              OpenAlex Records ({openalexGb} GB)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981', display: 'inline-block' }} />
              Silver Parquet ({silverMb} MB)
            </span>
            {isTotalView && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#f59e0b', display: 'inline-block' }} />
                {language === 'vi' ? 'Gold LanceDB Vectors' : 'Gold LanceDB Vectors'} ({backupGb} GB)
              </span>
            )}
          </div>
          <span style={{ color: isTotalView ? '#f59e0b' : 'var(--accent-emerald)', fontWeight: 600 }}>
            {isTotalView
              ? `+${backupGb} GB Gold Vectors`
              : (language === 'vi' ? 'An toàn trong hạn mức 10GB' : 'Within 10GB Free Tier')}
          </span>
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
              <th style={{ padding: '10px 14px' }}>{language === 'vi' ? 'Tầng' : 'Zone'}</th>
              <th style={{ padding: '10px 14px' }}>{language === 'vi' ? 'Tên Tập Dữ Liệu' : 'Dataset Name'}</th>
              <th style={{ padding: '10px 14px' }}>{language === 'vi' ? 'Định Dạng' : 'Format'}</th>
              <th style={{ padding: '10px 14px' }}>{language === 'vi' ? 'Số Lượng' : 'Count'}</th>
              <th style={{ padding: '10px 14px' }}>{language === 'vi' ? 'Dung Lượng' : 'Volume'}</th>
              <th style={{ padding: '10px 14px' }}>{language === 'vi' ? 'Tiền Tố Lakehouse' : 'Lakehouse Prefix'}</th>
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
