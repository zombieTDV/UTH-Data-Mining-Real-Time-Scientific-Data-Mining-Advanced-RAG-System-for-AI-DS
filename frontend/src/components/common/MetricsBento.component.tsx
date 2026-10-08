import type { FC } from 'react';
import { StatCard } from './StatCard.component';
import { AnimatedCounter } from './AnimatedCounter.component';
import { ScientificMath } from './ScientificMath.component';
import { useLakehouseStreamStore } from '../../store';
import { useTranslation } from '../../hooks';

export const MetricsBento: FC = () => {
  const { language } = useTranslation();
  const {
    sessionIngested,
    storageStats,
    storageUsedGb,
    storageUsedPct,
    viewMode,
    setViewMode,
  } = useLakehouseStreamStore();

  const isTotalView = viewMode === 'total';

  // Metrics from storageStats or calibrated baseline
  const activeData = storageStats?.activeLakehouse;
  const backupData = storageStats?.backupStorage;
  const totalBucket = storageStats?.totalBucket;

  const arxivCount = (activeData?.arxivHtmlCount ?? 11660) + sessionIngested;
  const arxivGb = activeData?.arxivHtmlSizeGb ?? 3.763;
  const openalexCount = activeData?.openalexCount ?? 24754;
  const openalexGb = activeData?.openalexSizeGb ?? 3.971;
  const silverMb = activeData?.silverParquetSizeMb ?? 321.68;
  const activeVectors = activeData?.activeLanceDbVectors ?? 164702;
  const activeVectorMb = activeData?.activeLanceDbSizeMb ?? 211.26;
  const backupGb = backupData?.totalSizeGb ?? 3.069;

  // Active vs Total calculations linked directly to real-time storageUsedGb
  const activeGb = storageUsedGb || (activeData?.totalSizeGb ?? 8.277);
  const activePct = storageUsedPct || (activeData?.usedPercentage ?? 82.77);
  const totalGb = totalBucket?.totalSizeGb ?? 11.348;
  const totalPct = totalBucket?.usedPercentage ?? 113.48;

  const displayGb = isTotalView ? totalGb : activeGb;
  const displayPct = isTotalView ? totalPct : activePct;
  const remainingFreeGb = Math.max(0, 10.0 - activeGb).toFixed(3);

  const currentFormulas = 2220938;

  // Segment widths relative to 10GB Free Tier
  const arxivBarPct = Math.min(100, (arxivGb / 10.0) * 100);
  const openalexBarPct = Math.min(100, (openalexGb / 10.0) * 100);
  const silverBarPct = Math.min(100, ((silverMb / 1024) / 10.0) * 100);
  const backupBarPct = Math.min(100, (backupGb / 10.0) * 100);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gap: '14px',
      marginBottom: '28px',
    }}>
      {/* 1. Corpus Scale Card */}
      <StatCard
        label={language === 'vi' ? 'Quy mô Corpus' : 'Corpus Scale'}
        badge={language === 'vi' ? 'Hồ Medallion' : 'Medallion Lakehouse'}
        badgeColor="var(--accent-emerald)"
        value={<AnimatedCounter value={arxivCount + openalexCount} />}
        unit={language === 'vi' ? 'bài' : 'works'}
        description={language === 'vi' ? 'arXiv HTML5 + OpenAlex (cs.AI, cs.LG, cs.CV, cs.CL, cs.RO)' : 'arXiv HTML5 + OpenAlex (cs.AI, cs.LG, cs.CV, cs.CL, cs.RO)'}
        footerLeft={<>arXiv HTML5: <AnimatedCounter value={arxivCount} /></>}
        footerRight={<>OpenAlex: <AnimatedCounter value={openalexCount} /></>}
        glowColor="rgba(96, 165, 250, 0.08)"
      />

      {/* 2. Gold Zone Vector Lakehouse */}
      <StatCard
        label={language === 'vi' ? 'Hồ Vector Tầng Gold' : 'Gold Zone Vector Lakehouse'}
        badge="768 Dim"
        badgeColor="var(--accent-gold)"
        value={<AnimatedCounter value={activeVectors} />}
        description={language === 'vi' ? 'Đoạn ngữ cảnh LanceDB (Tìm kiếm ANN tốc độ cao)' : 'LanceDB Contextual Chunks (Fast ANN Search)'}
        footerLeft={<>{language === 'vi' ? 'Phục vụ NVMe: ' : 'NVMe Serving: '}<AnimatedCounter value={activeVectorMb} decimals={2} suffix=" MB" /></>}
        footerRight={<>{language === 'vi' ? 'Sao lưu Cloud: ' : 'Cloud Backup: '}<AnimatedCounter value={backupGb} decimals={3} suffix=" GB" /></>}
        glowColor="rgba(234, 179, 8, 0.08)"
      />

      {/* 3. Cloudflare R2 Multi-Tier Storage Card */}
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
              {language === 'vi' ? 'Lăng kính Lưu trữ Cloudflare R2' : 'Cloudflare R2 Storage Lens'}
            </span>

            {/* Toggle switch between Active vs Total */}
            <div style={{
              display: 'inline-flex',
              background: 'var(--bg-elevated)',
              padding: '2px',
              borderRadius: '12px',
              border: '1px solid var(--border-muted)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
            }}>
              <button
                type="button"
                onClick={() => setViewMode('active')}
                style={{
                  background: !isTotalView ? 'var(--accent-emerald)' : 'transparent',
                  color: !isTotalView ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '2px 7px',
                  cursor: 'pointer',
                  fontWeight: !isTotalView ? 600 : 400,
                  transition: 'all 0.15s ease',
                }}
              >
                {language === 'vi' ? 'Hoạt động' : 'Active'}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('total')}
                style={{
                  background: isTotalView ? 'var(--accent-gold)' : 'transparent',
                  color: isTotalView ? '#000000' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '2px 7px',
                  cursor: 'pointer',
                  fontWeight: isTotalView ? 600 : 400,
                  transition: 'all 0.15s ease',
                }}
              >
                {language === 'vi' ? 'Tổng thể' : 'Total'}
              </button>
            </div>
          </div>

          {/* Value Display */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              <AnimatedCounter value={displayGb} decimals={3} />
            </span>
            <span style={{ fontSize: '15px', color: 'var(--text-muted)', fontWeight: 500 }}>
              GB
            </span>
            <span style={{
              marginLeft: 'auto',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '4px',
              background: isTotalView ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              color: isTotalView ? '#f59e0b' : 'var(--accent-emerald)',
              border: `1px solid ${isTotalView ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
            }}>
              {isTotalView ? (
                <>
                  <AnimatedCounter value={displayPct} decimals={1} suffix="%" /> ({language === 'vi' ? 'kèm Sao lưu' : 'w/ Backup'})
                </>
              ) : (
                <>
                  <AnimatedCounter value={displayPct} decimals={1} suffix={`% ${language === 'vi' ? 'Hạn mức' : 'Free Tier'}`} />
                </>
              )}
            </span>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {isTotalView
              ? (language === 'vi'
                ? `Toàn bộ Bucket: 36,673 tệp (${backupGb} GB LanceDB Cloud Snapshots)`
                : `Total Bucket: 36,673 files (${backupGb} GB LanceDB Cloud Snapshots)`)
              : (language === 'vi'
                ? `Pipeline Hoạt động: 36,619 tệp (Trong hạn mức 10 GB miễn phí)`
                : `Active Pipeline: 36,619 files (Within 10 GB Free Tier)`)}
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
              {/* Backup LanceDB Segment (Amber) */}
              {isTotalView && (
                <div
                  title={`LanceDB Backup: ${backupGb} GB`}
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
                <span style={{ width: '6px', height: '6px', borderRadius: '1px', background: '#3b82f6', display: 'inline-block' }} />
                arXiv
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '1px', background: '#8b5cf6', display: 'inline-block' }} />
                OpenAlex
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '1px', background: '#10b981', display: 'inline-block' }} />
                Parquet
              </span>
              {isTotalView && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '1px', background: '#f59e0b', display: 'inline-block' }} />
                  {language === 'vi' ? 'Sao lưu' : 'Backup'}
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
              language === 'vi' ? 'Băng thông ra: $0.00 (Miễn phí)' : 'Egress: $0.00 (Zero Fee)'
            ) : (
              <>{language === 'vi' ? 'Còn trống: ' : 'Free Left: '}<AnimatedCounter value={Number(remainingFreeGb)} decimals={3} suffix=" GB" /></>
            )}
          </span>
          <span style={{ color: isTotalView ? '#f59e0b' : 'var(--accent-emerald)' }}>
            {isTotalView
              ? `Backup: +${backupGb} GB`
              : (language === 'vi' ? 'An toàn trong hạn mức 10GB' : 'Safe in 10GB Quota')}
          </span>
        </div>
      </div>

      {/* 4. Mathematical Extraction Engine */}
      <StatCard
        label={language === 'vi' ? 'Động cơ Trích xuất Công thức Toán học' : 'Mathematical Extraction Engine'}
        badge={language === 'vi' ? 'Trình phân tích LaTeX' : 'LaTeX Parser'}
        badgeColor="var(--accent-violet)"
        value={<><AnimatedCounter value={currentFormulas} /> {language === 'vi' ? 'Công thức' : 'Formulas'}</>}
        description={language === 'vi' ? 'Làm sạch và chuẩn hóa cú pháp LaTeX thuần túy qua các tầng Silver & Gold' : 'Cleaned and normalized into pure LaTeX syntax across Silver & Gold'}
        footerLeft="Dual-Pass Regex + MathML"
        footerRight={language === 'vi' ? 'Bộ tách từ AST Công thức' : 'Formula AST Tokenizer'}
        gridColumn="span 6"
      >
        <div style={{
          padding: '6px 14px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(124, 58, 237, 0.08)',
          border: '1px solid rgba(124, 58, 237, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '40px',
        }}>
          <ScientificMath math="\mathcal{L}_{\text{distill}} = \| z_t - \hat{z}_s \|_2^2" />
        </div>
      </StatCard>

      {/* 5. Inference Infrastructure */}
      <StatCard
        label={language === 'vi' ? 'Hạ tầng Suy luận & RAG' : 'Inference Infrastructure'}
        badge={language === 'vi' ? 'Không phí Egress' : 'Zero Egress'}
        badgeColor="var(--accent-emerald)"
        value={language === 'vi' ? 'MLOps & RAG Thống nhất' : 'Unified MLOps & RAG'}
        description={language === 'vi' ? 'Truy hồi Dense ANN Vector · Truy cập đĩa dạng cột LanceDB tốc độ cao' : 'Vector Dense ANN Retrieval · Fast LanceDB columnar disk access'}
        footerLeft="Cloudflare R2 S3 API"
        footerRight={language === 'vi' ? 'Độ trễ <50ms' : 'Sub-50ms Latency'}
        gridColumn="span 6"
      >
        <div style={{
          padding: '6px 14px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '40px',
          fontFamily: 'var(--font-mono)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 6px #10b981' }} />
            <span style={{ fontSize: '11.5px', color: 'var(--text-primary)', fontWeight: 700 }}>
              {language === 'vi' ? 'LanceDB NVMe + R2 Lakehouse' : 'LanceDB NVMe + R2 Lakehouse'}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--accent-emerald)', fontWeight: 800 }}>
              {language === 'vi' ? 'Hạn mức miễn phí 10.00 GB' : '10.00 GB Free Tier'}
            </div>
            <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
              {language === 'vi' ? 'Class A/B Egress Không giới hạn' : 'Class A/B Unlimited Egress'}
            </div>
          </div>
        </div>
      </StatCard>
    </div>
  );
};
