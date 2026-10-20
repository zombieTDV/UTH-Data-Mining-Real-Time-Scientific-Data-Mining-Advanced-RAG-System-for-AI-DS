import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { fetchEdaSummary } from '../../services';
import { StatCard } from './StatCard.component';
import { AnimatedCounter } from './AnimatedCounter.component';
import { useLakehouseStreamStore } from '../../store';
import { useTranslation } from '../../hooks';

export const MetricsBento: FC = () => {
  const { language } = useTranslation();
  const {
    storageStats,
    totalVectors,
    totalCorpus,
    live,
    viewMode,
    setViewMode,
  } = useLakehouseStreamStore();

  const isTotalView = viewMode === 'total';

  // Metrics from storageStats or calibrated baseline
  const activeData = storageStats?.activeLakehouse;
  const backupData = storageStats?.backupStorage;
  const totalBucket = storageStats?.totalBucket;

  const sourceBreakdown = storageStats?.sourceBreakdown || activeData?.sourceBreakdown;
  const doiCount = sourceBreakdown?.doi ?? 0;
  const arxivCount = sourceBreakdown?.arxiv ?? 0;
  const cvfCount = sourceBreakdown?.cvf ?? 0;
  const openreviewCount = sourceBreakdown?.openreview ?? 0;
  const zenodoCount = sourceBreakdown?.zenodo ?? 0;
  const totalCorpusCount = doiCount + arxivCount + cvfCount + openreviewCount + zenodoCount;
  const arxivGb = activeData?.arxivHtmlSizeGb ?? 0;
  const doiGb = activeData?.openalexSizeGb ?? 0;
  const silverMb = activeData?.silverParquetSizeMb ?? 0;
  const activeVectors = totalVectors || (activeData?.activeVectors ?? 0);
  const activeVectorMb = activeData?.activeVectorsSizeMb ?? 0;
  const backupGb = backupData?.totalSizeGb ?? 0;
  const budgetGb = totalBucket?.freeTierQuotaGb || 20;

  // Active vs Total calculations linked directly to real-time storageUsedGb
  const activeGb = activeData?.totalSizeGb ?? 0;
  const activePct = activeData?.usedPercentage ?? 0;
  const totalGb = totalBucket?.totalSizeGb ?? 0;
  const totalPct = totalBucket?.usedPercentage ?? 0;

  const displayGb = isTotalView ? totalGb : activeGb;
  const displayPct = isTotalView ? totalPct : activePct;
  const remainingFreeGb = Math.max(0, budgetGb - activeGb).toFixed(3);

  const [currentFormulas, setCurrentFormulas] = useState(0);
  useEffect(() => {
    fetchEdaSummary().then((eda) => setCurrentFormulas(eda?.dataset_overview?.total_math_formulas ?? 0)).catch(() => undefined);
  }, []);

  // Segment widths relative to the lakehouse disk budget (LAKEHOUSE_BUDGET_GB)
  const doiBarPct = Math.min(100, (doiGb / budgetGb) * 100);
  const arxivBarPct = Math.min(100, (arxivGb / budgetGb) * 100);
  const silverBarPct = Math.min(100, ((silverMb / 1024) / budgetGb) * 100);
  const backupBarPct = Math.min(100, (backupGb / budgetGb) * 100);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gap: '14px',
      marginBottom: '28px',
    }}>
      {/* 1. Corpus Scale Card */}
      <StatCard
        label={language === 'vi' ? 'Quy mô Tập dữ liệu' : 'Corpus Scale'}
        badge={language === 'vi' ? 'Bài báo độc nhất' : 'Unique papers'}
        badgeColor="var(--accent-emerald)"
        value={<AnimatedCounter value={totalCorpus || totalCorpusCount} />}
        unit={language === 'vi' ? 'bài' : 'works'}
        description={language === 'vi' ? 'Tầng 1 luồng trực tiếp · Tầng 2 cận khứ · Tầng 3 nền tảng kinh điển' : 'Tier 1 live stream · Tier 2 near-past · Tier 3 historical archive'}
        footerLeft={<>Tier 2: <AnimatedCounter value={live?.corpus.tier2_rows ?? 0} /> · Tier 3: <AnimatedCounter value={live?.corpus.tier3_rows ?? 0} /></>}
        footerRight={<>Tier 1: <AnimatedCounter value={live?.corpus.tier1_rows ?? arxivCount} /></>}
        glowColor="rgba(96, 165, 250, 0.08)"
      />

      {/* 2. Gold Zone Vector Lakehouse */}
      <StatCard
        label={language === 'vi' ? 'Kho Vector Gold Zone' : 'Gold Zone Vector Lakehouse'}
        badge="768 Dim"
        badgeColor="var(--accent-gold)"
        value={<AnimatedCounter value={activeVectors} />}
        description={language === 'vi' ? 'Đoạn ngữ cảnh Qdrant HNSW (thời gian thực)' : 'Qdrant contextual chunks (live count)'}
        footerLeft={<>{language === 'vi' ? 'Vectors:' : 'Vectors:'} <AnimatedCounter value={activeVectors} /> ({activeVectorMb.toFixed(1)} MB)</>}
        footerRight={<>{language === 'vi' ? 'Số bài:' : 'Papers:'} <AnimatedCounter value={totalCorpus} /></>}
        glowColor="rgba(234, 179, 8, 0.08)"
      />

      {/* 3. MinIO S3 Multi-Tier Storage Card */}
      <div style={{
        gridColumn: 'span 4',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Glow backdrop */}
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '90px',
          height: '90px',
          background: isTotalView
            ? 'radial-gradient(circle at top right, rgba(245, 158, 11, 0.12), transparent 70%)'
            : 'radial-gradient(circle at top right, rgba(16, 185, 129, 0.12), transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Card Header & View Mode Switch */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {language === 'vi' ? 'Lưu trữ MinIO S3 Lakehouse' : 'MinIO S3 Storage Lens'}
            </span>

            {/* Toggle switch between Active vs Total */}
            <div style={{
              display: 'inline-flex',
              background: 'var(--bg-elevated)',
              padding: '2px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              gap: '2px',
            }}>
              <button
                type="button"
                onClick={() => setViewMode('active')}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: !isTotalView ? 'var(--bg-surface)' : 'transparent',
                  color: !isTotalView ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: !isTotalView ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {language === 'vi' ? 'Đang dùng' : 'Active'}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('total')}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: isTotalView ? 'var(--bg-surface)' : 'transparent',
                  color: isTotalView ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: isTotalView ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {language === 'vi' ? 'Tổng hồ' : 'Total'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              <AnimatedCounter value={displayGb} decimals={3} />
            </span>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              GB
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              (
              {isTotalView ? (
                <>
                  <AnimatedCounter value={displayPct} decimals={1} suffix="%" /> {language === 'vi' ? '(kèm Backup)' : '(w/ Backup)'}
                </>
              ) : (
                <>
                  <AnimatedCounter value={displayPct} decimals={1} suffix={language === 'vi' ? '% ngân sách' : '% of budget'} />
                </>
              )}
              )
            </span>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {isTotalView
              ? (language === 'vi'
                  ? `Tổng dung lượng hồ: ${(totalBucket?.totalObjects ?? 0).toLocaleString()} đối tượng (${backupGb} GB bản sao lưu)`
                  : `Total Bucket: ${(totalBucket?.totalObjects ?? 0).toLocaleString()} objects (${backupGb} GB archived snapshots)`)
              : (language === 'vi'
                  ? `Pipeline đang dùng: ${(activeData?.totalObjects ?? 0).toLocaleString()} đối tượng (trong hạn mức ${budgetGb} GB)`
                  : `Active Pipeline: ${(activeData?.totalObjects ?? 0).toLocaleString()} objects (within the ${budgetGb} GB budget)`)}
          </div>

          {/* Multi-Tier Segmented Progress Bar */}
          <div style={{ marginTop: '12px' }}>
            <div style={{
              height: '7px',
              background: 'var(--track-bg)',
              borderRadius: '3px',
              overflow: 'hidden',
              display: 'flex',
              position: 'relative',
            }}>
              {/* DOI Publishers Segment (Blue) */}
              <div
                title={`DOI & Publishers: ${doiGb} GB`}
                style={{
                  width: `${doiBarPct}%`,
                  height: '100%',
                  background: '#2563eb',
                }}
              />
              {/* arXiv HTML5 Segment (Purple) */}
              <div
                title={`arXiv HTML5: ${arxivGb} GB`}
                style={{
                  width: `${arxivBarPct}%`,
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
              {/* Archive segment (Amber) */}
              {isTotalView && (
                <div
                  title={`Archived snapshots: ${backupGb} GB`}
                  style={{
                    width: `${backupBarPct}%`,
                    height: '100%',
                    background: '#f59e0b',
                  }}
                />
              )}
            </div>

            {/* Segment legend */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '5px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '1px', background: '#2563eb', display: 'inline-block' }} />
                DOI
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '1px', background: '#8b5cf6', display: 'inline-block' }} />
                arXiv
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '1px', background: '#10b981', display: 'inline-block' }} />
                Parquet
              </span>
              {isTotalView && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '1px', background: '#f59e0b', display: 'inline-block' }} />
                  Backup
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '14px',
          paddingTop: '10px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
        }}>
          <span>
            {isTotalView ? (
              language === 'vi' ? 'MinIO cục bộ (không tính phí tải)' : 'Local MinIO (no egress fees)'
            ) : (
              <>{language === 'vi' ? 'Còn trống:' : 'Free Left:'} <AnimatedCounter value={Number(remainingFreeGb)} decimals={3} suffix=" GB" /></>
            )}
          </span>
          <span style={{ color: isTotalView ? '#f59e0b' : 'var(--accent-emerald)' }}>
            {isTotalView
              ? `Backup: +${backupGb} GB`
              : (language === 'vi' ? `An toàn trong hạn mức ${budgetGb}GB` : `Safe in ${budgetGb}GB Quota`)}
          </span>
        </div>
      </div>

      {/* 4. Mathematical Extraction Engine */}
      <StatCard
        label={language === 'vi' ? 'Bộ Trích xuất Công thức Toán học' : 'Mathematical Extraction Engine'}
        badge="LaTeX Parser"
        badgeColor="var(--accent-violet)"
        value={<><AnimatedCounter value={currentFormulas} /> {language === 'vi' ? 'Công thức' : 'Formulas'}</>}
        description={language === 'vi' ? 'Làm sạch và chuẩn hóa sang cú pháp LaTeX chuẩn trên Silver & Gold' : 'Cleaned and normalized into pure LaTeX syntax across Silver & Gold'}
        footerLeft="Dual-Pass Regex + MathML"
        footerRight="Formula AST Tokenizer"
        gridColumn="span 6"
      >
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(124, 58, 237, 0.08)',
          border: '1px solid rgba(124, 58, 237, 0.2)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--accent-violet)',
        }}>
          {'$L_{distill} = \\|z_t - \\hat{z}_s\\|^2$'}
        </div>
      </StatCard>

      {/* 5. Inference Infrastructure */}
      <StatCard
        label={language === 'vi' ? 'Hạ tầng Truy xuất Suy luận RAG' : 'Inference Infrastructure'}
        badge="Local"
        badgeColor="var(--accent-emerald)"
        value="Unified MLOps & RAG"
        description={language === 'vi' ? 'Truy xuất vector mật độ cao ANN · Qdrant HNSW (Cosine)' : 'Vector dense ANN retrieval · Qdrant HNSW (cosine)'}
        footerLeft="MinIO S3 API"
        footerRight="Sub-50ms Latency"
        gridColumn="span 6"
      >
        <div style={{
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--accent-emerald)',
          textAlign: 'right',
        }}>
          <div>{language === 'vi' ? `Hạn mức ${budgetGb}.00 GB` : `${budgetGb}.00 GB budget`}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {language === 'vi' ? 'Không giới hạn số lượt truy vấn' : 'No request quotas'}
          </div>
        </div>
      </StatCard>
    </div>
  );
};
