import type { FC } from 'react';
import { StatCard } from './StatCard.component';

export const MetricsBento: FC = () => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gap: '14px',
      marginBottom: '28px',
    }}>
      <StatCard
        label="Corpus Scale"
        badge="100% Ingested"
        badgeColor="var(--accent-emerald)"
        value="10,000"
        description="AI/DS Scientific Papers Indexed"
        footerLeft="ar5iv HTML5: 9,022"
        footerRight="OAI Batches: 12"
        glowColor="rgba(96, 165, 250, 0.08)"
      />

      <StatCard
        label="Gold Zone Vector Lakehouse"
        badge="384 Dim"
        badgeColor="var(--accent-gold)"
        value="143,523"
        description="LanceDB Contextual Chunks"
        footerLeft="MiniLM-L6-v2"
        footerRight="Cosine ANN Metric"
        glowColor="rgba(234, 179, 8, 0.08)"
      />

      <StatCard
        label="Cloudflare R2 Bucket"
        badge="55.24% of Free Tier"
        badgeColor="#f59e0b"
        value="5.524"
        unit="/ 10.0 GB"
        description=""
        footerLeft="Remaining: 4.476 GB"
        footerRight="Zero Egress Fees"
        progressPercent={55.24}
      />

      <StatCard
        label="Mathematical Extraction Engine"
        badge=""
        badgeColor="var(--accent-violet)"
        value="2,224,198 Formulas"
        description="Cleaned and normalized into pure LaTeX syntax across Silver & Gold"
        footerLeft=""
        footerRight=""
        gridColumn="span 6"
        progressPercent={undefined}
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

      <StatCard
        label="Inference Infrastructure"
        badge=""
        badgeColor="var(--accent-emerald)"
        value="Apple Silicon Metal (MPS)"
        description="Unified memory GPU offload · Qwen2.5-7B GGUF Q4_K_M (4.4 GB)"
        footerLeft=""
        footerRight=""
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
          textAlign: 'right'
        }}>
          <div>~6.0 tok/s</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Sub-50ms ANN</div>
        </div>
      </StatCard>
    </div>
  );
};
