import { useEffect } from 'react';
import { resetStorageSession } from '../../services';
import { useLakehouseStreamStore } from '../../store';
import { useTranslation } from '../../hooks';
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
  const { language } = useTranslation();

  const {
    sessionIngested,
    storageStats,
    refreshStorageStats,
  } = useLakehouseStreamStore();

  const handleResetSession = async () => {
    if (confirm(language === 'vi' ? 'Đặt lại bộ đếm phiên thu thập thời gian thực về mốc chuẩn?' : 'Reset real-time ingestion session counter back to baseline?')) {
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

  const bucketName = storageStats?.bucket ?? '';
  const activeData = storageStats?.activeLakehouse;
  const backupData = storageStats?.backupStorage;

  const arxivCount = (activeData?.arxivHtmlCount ?? 0);
  const arxivGb = (activeData?.arxivHtmlSizeGb ?? 0).toFixed(3);
  const doiCount = (storageStats?.sourceBreakdown?.doi ?? 0).toLocaleString();
  const doiGb = (Number((storageStats?.activeLakehouse?.openalexSizeBytes ?? 0) / (1024**3))).toFixed(3);
  const silverMb = (activeData?.silverParquetSizeMb ?? 0).toFixed(2);
  const goldChunks = (activeData?.activeVectors ?? 0).toLocaleString();
  const goldMb = (activeData?.activeVectorsSizeMb ?? 0).toFixed(2);
  const backupGb = (backupData?.totalSizeGb ?? 0).toFixed(3);

  const layers: LakehouseLayer[] = [
    {
      zone: 'BRONZE',
      name: language === 'vi' ? 'Dữ liệu arXiv HTML5 học thuật thô' : 'Raw arXiv Academic HTML5',
      storageType: language === 'vi' ? 'Lưu trữ đối tượng MinIO S3' : 'MinIO object store',
      format: 'W3C HTML5 (.html)',
      itemsCount: `${arxivCount.toLocaleString()} ${language === 'vi' ? 'tệp' : 'files'}`,
      sizeBytes: `${arxivGb} GB`,
      storageLocation: `s3://${bucketName}/bronze/arxiv/raw_html/`,
      color: '#3b82f6',
      description: language === 'vi'
        ? 'Bản thảo bài báo thô dạng HTML5 cào từ arXiv gồm đầy đủ các mục, bảng biểu, công thức toán và tài liệu tham khảo.'
        : 'Raw web-crawled HTML5 preprints from arXiv containing full academic sections, tables, math tags, and bibliography.'
    },
    {
      zone: 'BRONZE',
      name: language === 'vi' ? 'Hồ sơ Nhà xuất bản Khoa học & DOI' : 'DOI & Scientific Publisher Records',
      storageType: language === 'vi' ? 'Lưu trữ đối tượng MinIO S3' : 'MinIO object store',
      format: 'JSON / Persistent Identifiers',
      itemsCount: `${doiCount} ${language === 'vi' ? 'bài' : 'works'}`,
      sizeBytes: `${doiGb} GB`,
      storageLocation: `s3://${bucketName}/silver/tier2/near_past_papers.parquet`,
      color: '#2563eb',
      description: language === 'vi'
        ? 'Bản ghi khoa học liên nhà xuất bản (Nature, IEEE, Springer, ACM) với liên kết DOI trực tiếp, đồ thị trích dẫn và tác giả.'
        : 'Cross-publisher academic records (Nature, IEEE, Springer, ACM) with direct DOI links, citation graphs, and author affiliations.'
    },
    {
      zone: 'BRONZE',
      name: language === 'vi' ? 'Các gói lô thu hoạch OAI-PMH' : 'OAI-PMH Harvest Batches',
      storageType: language === 'vi' ? 'Lưu trữ đối tượng MinIO S3' : 'MinIO object store',
      format: language === 'vi' ? 'Gói nén JSON' : 'Compressed JSON Bundles',
      itemsCount: language === 'vi' ? '12 gói lô' : '12 batch bundles',
      sizeBytes: '21.24 MB',
      storageLocation: `s3://${bucketName}/bronze/arxiv/batches/`,
      color: '#60a5fa',
      description: language === 'vi'
        ? 'Các gói metadata cào thô thu thập qua giao thức arXiv OAI-PMH trên 5 chuyên ngành AI/DS.'
        : 'Raw metadata harvesting batches retrieved through arXiv OAI-PMH protocol across 5 AI/DS categories.'
    },
    {
      zone: 'BRONZE',
      name: language === 'vi' ? 'Kỷ yếu Hội nghị OpenReview & CVF' : 'OpenReview & CVF Conference Proceedings',
      storageType: language === 'vi' ? 'Lưu trữ đối tượng MinIO S3' : 'MinIO object store',
      format: 'Parquet & Raw Markdown',
      itemsCount: language === 'vi' ? '2.266 kỷ yếu (1.0k OpenRev + 1.3k CVF)' : '2,266 proceedings (1.0k OpenRev + 1.3k CVF)',
      sizeBytes: '29.4 MB',
      storageLocation: `s3://${bucketName}/silver/ (openreview, cvf)`,
      color: '#f59e0b',
      description: language === 'vi'
        ? 'Các bài báo hội nghị bình duyệt hàng đầu (ICLR, NeurIPS, CVPR, ICCV) kèm điểm số đánh giá và công thức toán.'
        : 'Peer-reviewed conference manuscripts and rating threads from ICLR, NeurIPS, CVPR, and ICCV with extracted mathematical claims.'
    },
    {
      zone: 'BRONZE',
      name: language === 'vi' ? 'Ấn phẩm Khoa học Mở Zenodo' : 'Zenodo Open Science Publications',
      storageType: language === 'vi' ? 'Bộ phân tích HTML5 & Lakehouse' : 'HTML5 parser & Lakehouse',
      format: 'HTML5 parsed sections (LaTeX preserved)',
      itemsCount: `${language === 'vi' ? '2.287 bản thảo' : '2,287 manuscripts'}`,
      sizeBytes: '184.2 MB',
      storageLocation: `s3://${bucketName}/bronze/zenodo/`,
      color: '#06b6d4',
      description: language === 'vi'
        ? 'Bản ghi khoa học mở từ Zenodo (mức tóm tắt metadata; không tải PDF).'
        : 'Open Science records harvested from Zenodo (abstract-level content; no PDFs are downloaded).'
    },
    {
      zone: 'SILVER',
      name: language === 'vi' ? 'Lakehouse Chuẩn hóa Chọn lọc' : 'Curated Canonical Lakehouse',
      storageType: 'Apache Arrow & MinIO',
      format: 'Apache Parquet (Snappy & Zstd)',
      itemsCount: `${(storageStats?.sourceBreakdown?.active_rag_papers ?? 0).toLocaleString()} ${language === 'vi' ? 'bài (Silver xuyên suốt Tier 1, 2, 3)' : 'papers (Silver across Tier 1, 2, 3)'}`,
      sizeBytes: `${silverMb} MB`,
      storageLocation: `s3://${bucketName}/silver/tier2/fulltext_papers.parquet`,
      color: '#10b981',
      description: language === 'vi'
        ? 'Bảng dữ liệu dạng cột Parquet đã khử trùng và chuẩn hóa schema liên kết qua DOI, arXiv, CVF và OpenReview.'
        : 'Deduplicated, schema-enforced columnar Parquet tables across DOI publishers, arXiv, CVF, and OpenReview.'
    },
    {
      zone: 'GOLD',
      name: language === 'vi' ? 'Kho Vector Ngữ cảnh Gold (Cache hoạt động)' : 'Contextual Vector Lakehouse (Active Cache)',
      storageType: language === 'vi' ? 'Lưu trữ đối tượng MinIO (Đồ thị & Gold Parquet)' : 'MinIO object store (Gold artifacts)',
      format: 'Parquet (zstd) & JSON',
      itemsCount: `${goldChunks} vectors`,
      sizeBytes: `${goldMb} MB`,
      storageLocation: `s3://${bucketName}/gold/ (mining artifacts, Gold Parquet)`,
      color: '#eab308',
      description: language === 'vi'
        ? 'Tập vector ngữ cảnh 768 chiều và các bảng Parquet tầng Gold bao phủ CVPR, OpenReview và arXiv.'
        : 'Contextualized 768-dimensional dense embeddings and Gold parquets spanning CVPR, OpenReview, and arXiv.'
    },
    {
      zone: 'BACKUP',
      name: language === 'vi' ? 'Kho Động cơ Vector Qdrant Hiệu năng cao' : 'High-Performance Vector Engine Store',
      storageType: 'Qdrant In-Memory Vector Store',
      format: 'Rust HNSW Multi-Segment Graph',
      itemsCount: `${(activeData?.activeVectors ?? 0).toLocaleString()} ${language === 'vi' ? 'điểm vector' : 'points'}`,
      sizeBytes: `${backupGb} GB`,
      storageLocation: 'Qdrant collection scientific_papers_gold',
      color: '#ec4899',
      description: language === 'vi'
        ? 'Cụm đồ thị vector HNSW viết bằng Rust trên Qdrant, tối ưu hóa cho truy vấn tương đồng Cosine dưới 50ms.'
        : 'Rust-based HNSW vector graph in Qdrant, tuned for sub-50ms cosine similarity retrieval.'
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {language === 'vi' ? 'Bảng Phân Tầng Hồ Lưu Trữ MinIO S3 (Granular Layers)' : 'MinIO S3 Granular Lakehouse Layers'}
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
              {language === 'vi' ? 'MinIO S3 (Độ trễ < 1ms)' : 'Local S3 (< 1ms Latency)'}
            </span>
          </div>
          <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
            Bucket: <code className="mono" style={{ color: 'var(--text-primary)' }}>{bucketName}</code> &bull; {language === 'vi' ? 'Điểm cuối S3: MinIO Lakehouse cục bộ' : 'S3 endpoint: Local MinIO Lakehouse'} &bull; 8 {language === 'vi' ? 'phân vùng dữ liệu' : 'storage layers'}
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Reset Session Button */}
          {sessionIngested > 0 && (
            <button
              type="button"
              onClick={handleResetSession}
              style={{
                padding: '5px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {language === 'vi' ? `Đặt lại phiên (+${sessionIngested})` : `Reset Session (+${sessionIngested})`}
            </button>
          )}
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
              <th style={{ padding: '10px 14px' }}>{language === 'vi' ? 'Định dạng' : 'Format'}</th>
              <th style={{ padding: '10px 14px' }}>{language === 'vi' ? 'Số lượng' : 'Count'}</th>
              <th style={{ padding: '10px 14px' }}>{language === 'vi' ? 'Kích thước' : 'Volume'}</th>
              <th style={{ padding: '10px 14px' }}>{language === 'vi' ? 'Tiền tố Đường dẫn S3' : 'Lakehouse Prefix'}</th>
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
