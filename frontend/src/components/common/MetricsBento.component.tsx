import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { fetchEdaSummary } from '../../services';
import { StatCard } from './StatCard.component';
import { AnimatedCounter } from './AnimatedCounter.component';
import { useLakehouseStreamStore } from '../../store';

export const MetricsBento: FC = () => {
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
        label="Corpus Scale"
        badge="Unique papers (dedup registry)"
        badgeColor="var(--accent-emerald)"
        value={<AnimatedCounter value={totalCorpus || totalCorpusCount} />}
        unit="works"
        description="Tier 1 live stream · Tier 2 near-past · Tier 3 historical archive"
        footerLeft={<>Tier 2: <AnimatedCounter value={live?.corpus.tier2_rows ?? 0} /> · Tier 3: <AnimatedCounter value={live?.corpus.tier3_rows ?? 0} /></>}
        footerRight={<>Tier 1: <AnimatedCounter value={live?.corpus.tier1_rows ?? arxivCount} /></>}
        glowColor="rgba(96, 165, 250, 0.08)"
      />

      {/* 2. Gold Zone Vector Lakehouse */}
      <StatCard
        label="Gold Zone Vector Lakehouse"
        badge="768 Dim"
        badgeColor="var(--accent-gold)"
        value={<AnimatedCounter value={activeVectors} />}
        description="Qdrant contextual chunks (live count)"
        footerLeft={<>Vectors: <AnimatedCounter value={activeVectors} /> ({activeVectorMb.toFixed(1)} MB)</>}
        footerRight={<>Papers: <AnimatedCounter value={totalCorpus} /></>}
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
              MinIO S3 Storage Lens
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
                Active
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
                Total
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
                  <AnimatedCounter value={displayPct} decimals={1} suffix="%" /> (w/ Backup)
                </>
              ) : (
                <>
                  <AnimatedCounter value={displayPct} decimals={1} suffix="% of budget" />
                </>
              )}
            </span>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {isTotalView
              ? `Total Bucket: ${(totalBucket?.totalObjects ?? 0).toLocaleString()} objects (${backupGb} GB archived snapshots)`
              : `Active Pipeline: ${(activeData?.totalObjects ?? 0).toLocaleString()} objects (within the ${budgetGb} GB budget)`}
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
              'Local MinIO (no egress fees)'
            ) : (
              <>Free Left: <AnimatedCounter value={Number(remainingFreeGb)} decimals={3} suffix=" GB" /></>
            )}
          </span>
          <span style={{ color: isTotalView ? '#f59e0b' : 'var(--accent-emerald)' }}>
            {isTotalView ? `Backup: +${backupGb} GB` : 'Safe in 10GB Quota'}
          </span>
        </div>
      </div>

      {/* 4. Mathematical Extraction Engine */}
      <StatCard
        label="Mathematical Extraction Engine"
        badge="LaTeX Parser"
        badgeColor="var(--accent-violet)"
        value={<><AnimatedCounter value={currentFormulas} /> Formulas</>}
        description="Cleaned and normalized into pure LaTeX syntax across Silver & Gold"
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
        label="Inference Infrastructure"
        badge="Local"
        badgeColor="var(--accent-emerald)"
        value="Unified MLOps & RAG"
        description="Vector dense ANN retrieval · Qdrant HNSW (cosine)"
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
          <div>10.00 GB budget</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>No request quotas</div>
        </div>
      </StatCard>
    </div>
  );
};
