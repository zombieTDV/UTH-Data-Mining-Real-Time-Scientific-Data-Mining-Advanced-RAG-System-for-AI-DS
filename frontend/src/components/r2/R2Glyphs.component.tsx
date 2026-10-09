import type { FC } from 'react';

export interface GlyphProps {
  size?: number;
  color?: string;
  className?: string;
}

/** Bronze Raw Vault Glyph: Geometric wireframe Hexagon Node with raw byte-stream brackets */
export const BronzeVaultGlyph: FC<GlyphProps> = ({ size = 16, color = '#f59e0b' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" />
    <path d="M12 7v5" strokeDasharray="1 1" />
    <circle cx="12" cy="14" r="1.5" fill={color} />
  </svg>
);

/** Silver Columnar Glyph: Vectorized 3-slice Columnar Partition Matrix representing Parquet */
export const SilverColumnarGlyph: FC<GlyphProps> = ({ size = 16, color = '#06b6d4' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
    <line x1="3" y1="9" x2="21" y2="9" strokeDasharray="2 2" />
    <circle cx="6" cy="6" r="0.75" fill={color} />
    <circle cx="12" cy="6" r="0.75" fill={color} />
    <circle cx="18" cy="6" r="0.75" fill={color} />
  </svg>
);

/** Gold Knowledge Glyph: Faceted Golden Prism Diamond representing analytical gold data */
export const GoldPrismGlyph: FC<GlyphProps> = ({ size = 16, color = '#eab308' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h12l4 7-10 11L2 10l4-7z" />
    <path d="M2 10h20" />
    <path d="M12 21L8 10l4-7 4 7-4 11z" />
  </svg>
);

/** LanceDB Vector Glyph: Multidimensional 768-D Tensor Hypercube representing embedding space */
export const LanceVectorGlyph: FC<GlyphProps> = ({ size = 16, color = '#10b981' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="10" height="10" rx="1.5" />
    <rect x="10" y="10" width="10" height="10" rx="1.5" strokeDasharray="2 2" />
    <line x1="14" y1="4" x2="20" y2="10" />
    <line x1="4" y1="14" x2="10" y2="20" />
    <line x1="4" y1="4" x2="10" y2="10" />
    <line x1="14" y1="14" x2="20" y2="20" />
    <circle cx="9" cy="9" r="1.5" fill={color} />
  </svg>
);

/** Cloudflare Cost Shield Badge: Security emblem guaranteeing 0 background requests */
export const CostShieldBadge: FC<{ active?: boolean }> = ({ active = true }) => (
  <div
    title="Cloudflare R2 Cost Protection Shield: Automated background polling is locked OFF. Only manual triggers make S3 API calls."
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '6px',
      backgroundColor: active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
      border: `1px solid ${active ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
      color: active ? '#10b981' : '#ef4444',
      fontSize: '11px',
      fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.04em',
    }}
  >
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
    <span>0 REAL-TIME REQ // FREE TIER SHIELD</span>
  </div>
);

/** Parquet Type Pill */
export const ParquetTypePill: FC<{ type: string }> = ({ type }) => {
  const tLower = type.toLowerCase();
  let bg = 'rgba(100, 116, 139, 0.16)';
  let color = '#94a3b8';
  let label = type;

  if (tLower.includes('string') || tLower.includes('utf8') || tLower.includes('str')) {
    bg = 'rgba(59, 130, 246, 0.14)';
    color = '#60a5fa';
    label = 'string';
  } else if (tLower.includes('int') || tLower.includes('i64') || tLower.includes('i32')) {
    bg = 'rgba(16, 185, 129, 0.14)';
    color = '#34d399';
    label = 'int64';
  } else if (tLower.includes('float') || tLower.includes('f32') || tLower.includes('double')) {
    bg = 'rgba(245, 158, 11, 0.14)';
    color = '#fbbf24';
    label = 'float32';
  } else if (tLower.includes('list') || tLower.includes('array')) {
    bg = 'rgba(168, 85, 247, 0.14)';
    color = '#c084fc';
    label = 'list';
  } else if (tLower.includes('timestamp') || tLower.includes('date')) {
    bg = 'rgba(236, 72, 153, 0.14)';
    color = '#f472b6';
    label = 'timestamp';
  }

  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '10.5px',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        padding: '2px 7px',
        borderRadius: '4px',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${color}33`,
      }}
    >
      {label}
    </span>
  );
};

/** File Format Tag Badge */
export const FileFormatBadge: FC<{ extension: string }> = ({ extension }) => {
  const ext = extension.toLowerCase();
  let bg = 'rgba(148, 163, 184, 0.12)';
  let color = '#94a3b8';
  let label = ext.toUpperCase();

  if (ext === 'parquet') {
    bg = 'rgba(6, 182, 212, 0.15)';
    color = '#06b6d4';
    label = 'PARQUET';
  } else if (ext === 'json') {
    bg = 'rgba(245, 158, 11, 0.15)';
    color = '#f59e0b';
    label = 'JSON';
  } else if (ext === 'lance') {
    bg = 'rgba(16, 185, 129, 0.15)';
    color = '#10b981';
    label = 'LANCE 768-D';
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: '9.5px',
        fontWeight: 800,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
        padding: '2px 6px',
        borderRadius: '3px',
        backgroundColor: bg,
        color: color,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  );
};
