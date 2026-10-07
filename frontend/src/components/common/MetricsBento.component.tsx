import type { FC } from 'react';
import { StatCard } from './StatCard.component';
import { AnimatedCounter } from './AnimatedCounter.component';
import { useLakehouseStreamStore } from '../../store';

export const MetricsBento: FC = () => {
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
  const conferenceCount = activeData?.conferenceCount ?? 2000;
  const silverMb = activeData?.silverParquetSizeMb ?? 321.68;
  const activeVectors = (activeData?.activeLanceDbVectors ?? 164702) + (sessionIngested * 16);
  const activeVectorMb = (activeData?.activeLanceDbSizeMb ?? 211.26) + (sessionIngested * 0.04);
  const backupGb = backupData?.totalSizeGb ?? 3.069;

  // Active vs Total calculations linked directly to real-time storageUsedGb
  const activeGb = storageUsedGb || (activeData?.totalSizeGb ?? 8.073);
  const activePct = storageUsedPct || (activeData?.usedPercentage ?? 80.73);
  const totalGb = totalBucket?.totalSizeGb ?? 11.142;
  const totalPct = totalBucket?.usedPercentage ?? 111.42;

  const displayGb = isTotalView ? totalGb : activeGb;
  const displayPct = isTotalView ? totalPct : activePct;
  const remainingFreeGb = Math.max(0, 10.0 - activeGb).toFixed(3);

  const currentFormulas = 2220938 + (sessionIngested * 24);

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
        label="Corpus Scale"
        badge="Medallion Lakehouse"
        badgeColor="var(--accent-emerald)"
        value={<AnimatedCounter value={arxivCount + openalexCount + conferenceCount} />}
        unit="works"
        description="arXiv HTML5 + OpenAlex + CVPR / OpenReview Conferences"
        footerLeft={<>arXiv HTML5: <AnimatedCounter value={arxivCount} /></>}
        footerRight={<>OpenAlex: <AnimatedCounter value={openalexCount} /></>}
        glowColor="rgba(96, 165, 250, 0.08)"
      />

      {/* 2. Gold Zone Vector Lakehouse */}
      <StatCard
        label="Gold Zone Vector Lakehouse"
        badge="768 Dim"
        badgeColor="var(--accent-gold)"
        value={<AnimatedCounter value={activeVectors} />}
        description="LanceDB Contextual Chunks (Fast ANN Search)"
        footerLeft={<>NVMe Serving: <AnimatedCounter value={activeVectorMb} decimals={2} suffix=" MB" /></>}
        footerRight={<>Cloud Backup: <AnimatedCounter value={backupGb} decimals={3} suffix=" GB" /></>}
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
              Cloudflare R2 Storage Lens
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
                  <AnimatedCounter value={displayPct} decimals={1} suffix="% Free Tier" />
                </>
              )}
            </span>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {isTotalView
              ? `Total Bucket: 36,673 files (${backupGb} GB LanceDB Cloud Snapshots)`
              : `Active Pipeline: 36,619 files (Within 10 GB Free Tier)`}
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
              {/* Backup LanceDB Segment (Amber) - only displayed or highlighted */}
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
              'Egress: $0.00 (Zero Fee)'
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
        badge="Zero Egress"
        badgeColor="var(--accent-emerald)"
        value="Unified MLOps & RAG"
        description="Vector Dense ANN Retrieval · Fast LanceDB columnar disk access"
        footerLeft="Cloudflare R2 S3 API"
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
          <div>10.00 GB Free Tier</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Class A/B Unlimited Egress</div>
        </div>
      </StatCard>
    </div>
  );
};
