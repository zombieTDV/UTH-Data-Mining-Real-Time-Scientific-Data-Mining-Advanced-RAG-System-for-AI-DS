import { useState, type FC } from 'react';
import { LanceVectorGlyph, ParquetTypePill } from './R2Glyphs.component';

export interface LanceIndexInfo {
  name: string;
  type: string;
  column: string;
  status: string;
  size_mb?: number;
  partitions?: number;
  sub_vectors?: number;
}

export interface LanceMetaInfo {
  table_name: string;
  vector_column: string;
  vector_dimension: number;
  embedding_model: string;
  total_chunks: number;
  openreview_chunks?: number;
  cvpr_chunks?: number;
  indices: LanceIndexInfo[];
  version: number;
  s3_storage_uri: string;
}

export interface LanceDbInspectorProps {
  fileName: string;
  meta?: LanceMetaInfo;
  sizeFormatted?: string;
  lastModified?: string;
}

export const LanceDbInspector: FC<LanceDbInspectorProps> = ({
  fileName,
  meta,
  sizeFormatted = '3.19 GB',
  lastModified = '2026-10-07 23:25:00',
}) => {
  const [copiedUri, setCopiedUri] = useState(false);

  const defaultMeta: LanceMetaInfo = {
    table_name: 'scientific_papers_gold',
    vector_column: 'vector',
    vector_dimension: 768,
    embedding_model: 'nomic-ai/nomic-embed-text-v1.5 (Matryoshka 768-D)',
    total_chunks: 164702,
    openreview_chunks: 1985,
    cvpr_chunks: 1991,
    indices: [
      {
        name: 'text_idx',
        type: 'Tantivy FTS',
        column: 'text',
        status: 'ONLINE',
        size_mb: 64.46,
      },
      {
        name: 'vector_idx',
        type: 'IVF-PQ (Cosine)',
        column: 'vector',
        partitions: 256,
        sub_vectors: 48,
        status: 'ONLINE (Sub-2s Querying)',
        size_mb: 10.80,
      },
    ],
    version: 13,
    s3_storage_uri: 's3://uth-scientific-lakehouse/gold/lancedb/scientific_papers_gold.lance',
  };

  const currentMeta = meta || defaultMeta;

  const handleCopyUri = () => {
    navigator.clipboard.writeText(currentMeta.s3_storage_uri);
    setCopiedUri(true);
    setTimeout(() => setCopiedUri(false), 2000);
  };

  const columns = [
    { name: 'chunk_id', type: 'string', desc: 'Unique chunk identifier (paper_id + section hash)' },
    { name: 'paper_id', type: 'string', desc: 'Canonical academic identifier (arXiv ID, DOI, OpenReview ID)' },
    { name: 'title', type: 'string', desc: 'Paper title string' },
    { name: 'authors', type: 'list<string>', desc: 'Author name array' },
    { name: 'primary_category', type: 'string', desc: 'Discipline code (e.g. cs.CV, cs.LG, cs.AI)' },
    { name: 'section_title', type: 'string', desc: 'Section header' },
    { name: 'section_type', type: 'string', desc: 'Section typology (abstract, intro, methods, results)' },
    { name: 'text', type: 'string', desc: 'Chunk raw text indexed by Tantivy FTS' },
    { name: 'context_text', type: 'string', desc: 'Hierarchical structural breadcrumb context' },
    { name: 'doi', type: 'string', desc: 'Digital Object Identifier' },
    { name: 'vector', type: 'vec768', desc: '768-D Dense Matryoshka embedding (nomic-embed-text-v1.5)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', overflowY: 'auto' }}>
      {/* Top Banner */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          backgroundColor: 'rgba(139, 92, 246, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.25)',
          borderRadius: '8px',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: 'rgba(139, 92, 246, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a78bfa',
            }}
          >
            <LanceVectorGlyph size={22} color="#a78bfa" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '16px', fontFamily: 'var(--font-mono)' }}>
                {fileName || `${currentMeta.table_name}.lance`}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                v{currentMeta.version} STABLE
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
              Cloudflare R2 Native Vector Lakehouse // 768-D Nomic Embeddings // Updated {lastModified}
            </div>
          </div>
        </div>

        <button
          onClick={handleCopyUri}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '6px',
            border: '1px solid rgba(139, 92, 246, 0.4)',
            backgroundColor: copiedUri ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.15)',
            color: copiedUri ? '#10b981' : '#c084fc',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {copiedUri ? 'Copied S3 URI!' : 'Copy S3 URI'}
        </button>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border-subtle, #334155)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
            TOTAL VECTOR CHUNKS
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#a78bfa' }}>
            {currentMeta.total_chunks.toLocaleString()}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
            OpenReview: {currentMeta.openreview_chunks} | CVPR: {currentMeta.cvpr_chunks}
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border-subtle, #334155)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
            EMBEDDING DIMENSION
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#38bdf8' }}>
            {currentMeta.vector_dimension}-D Float32
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
            Nomic Matryoshka Space
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border-subtle, #334155)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
            STORAGE FOOTPRINT
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#10b981' }}>
            {sizeFormatted}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
            R2 Cloudflare Remote
          </div>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border-subtle, #334155)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
            QUERY LATENCY
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: '#f59e0b' }}>
            Sub-2.0s
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
            With Projection & IVF-PQ
          </div>
        </div>
      </div>

      {/* Dual Indices Section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '16px',
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle, #334155)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          ACTIVE DUAL INDICES (LANCEDB LAKEHOUSE)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          {currentMeta.indices.map((idx) => (
            <div
              key={idx.name}
              style={{
                padding: '12px 14px',
                borderRadius: '6px',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-subtle, #334155)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#c084fc' }}>
                  {idx.name}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                  }}
                >
                  {idx.status}
                </span>
              </div>
              <div style={{ fontSize: '11px', marginTop: '6px', color: 'var(--text-muted, #94a3b8)' }}>
                Type: <strong>{idx.type}</strong> | Target: <code>{idx.column}</code>
              </div>
              {idx.partitions && (
                <div style={{ fontSize: '11px', marginTop: '3px', color: 'var(--text-muted, #94a3b8)' }}>
                  Centroids: <strong>{idx.partitions}</strong> | Sub-Vectors: <strong>{idx.sub_vectors}</strong>
                </div>
              )}
              {idx.size_mb && (
                <div style={{ fontSize: '10.5px', marginTop: '3px', color: 'var(--text-muted, #64748b)' }}>
                  Index Size: {idx.size_mb.toFixed(2)} MB
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Schema Table */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '16px',
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle, #334155)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '13px' }}>
          LANCEDB TABLE SCHEMA ({columns.length} COLUMNS)
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle, #334155)', color: 'var(--text-muted, #94a3b8)' }}>
                <th style={{ textAlign: 'left', padding: '8px' }}>Column</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '8px' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.name} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: '8px' }}><ParquetTypePill type={c.type} /></td>
                  <td style={{ padding: '8px', color: 'var(--text-muted, #94a3b8)' }}>{c.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
