import { useState, useMemo, useEffect, type FC } from 'react';
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

export interface LanceColumn {
  name: string;
  type: string;
  nullable?: boolean;
  desc?: string;
}

export interface LanceDbInspectorProps {
  fileName: string;
  meta?: LanceMetaInfo;
  columns?: LanceColumn[];
  sampleRows?: Record<string, any>[];
  totalRows?: number;
  sizeFormatted?: string;
  lastModified?: string;
}

interface CellPopoverInfo {
  rowIdx: number;
  colName: string;
  colType: string;
  cellKey: string;
  rawValue: any;
  formattedValue: string;
  x: number;
  y: number;
}

export const LanceDbInspector: FC<LanceDbInspectorProps> = ({
  fileName,
  meta,
  columns: propColumns,
  sampleRows: propSampleRows = [],
  totalRows,
  sizeFormatted = '3.19 GB',
  lastModified = '2026-10-07 23:25:00',
}) => {
  const [copiedUri, setCopiedUri] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSchemaTiles, setShowSchemaTiles] = useState(false);
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});
  const [activePopover, setActivePopover] = useState<CellPopoverInfo | null>(null);
  const [copiedCellKey, setCopiedCellKey] = useState<string | null>(null);

  // Close popover on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePopover(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const defaultColumns: LanceColumn[] = [
    { name: 'chunk_id', type: 'string', desc: 'Unique chunk identifier (paper_id + section hash)' },
    { name: 'paper_id', type: 'string', desc: 'Canonical academic identifier (arXiv ID, DOI, OpenReview ID)' },
    { name: 'title', type: 'string', desc: 'Paper title string' },
    { name: 'authors', type: 'list<string>', desc: 'Author name array' },
    { name: 'primary_category', type: 'string', desc: 'Discipline code (e.g. cs.CV, cs.LG, cs.AI)' },
    { name: 'section_title', type: 'string', desc: 'Section header' },
    { name: 'section_type', type: 'string', desc: 'Section typology (abstract, intro, methods, results)' },
    { name: 'text', type: 'string', desc: 'Chunk raw text indexed by Tantivy FTS' },
    { name: 'context_text', type: 'string', desc: 'Hierarchical structural breadcrumb context' },
    { name: 'word_count', type: 'int64', desc: 'Token / word count of the chunk' },
    { name: 'vector', type: 'fixed_size_list<float>[768]', desc: '768-D Dense Matryoshka embedding (nomic-embed-text-v1.5)' },
  ];

  const columns: LanceColumn[] = useMemo(() => {
    if (propColumns && propColumns.length > 0) {
      return propColumns.map((col) => {
        const fallback = defaultColumns.find((d) => d.name === col.name);
        return {
          name: col.name,
          type: col.type,
          nullable: col.nullable ?? true,
          desc: fallback?.desc || `LanceDB column '${col.name}'`,
        };
      });
    }
    return defaultColumns;
  }, [propColumns]);

  const handleToggleColumn = (colName: string) => {
    setExpandedColumns((prev) => ({
      ...prev,
      [colName]: !prev[colName],
    }));
  };

  const formatCellValue = (val: any): string => {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch {
        return String(val);
      }
    }
    return String(val);
  };

  const handleCellClick = (
    e: React.MouseEvent,
    rowIdx: number,
    colName: string,
    colType: string,
    rawValue: any
  ) => {
    const formatted = formatCellValue(rawValue);
    const cellKey = `${rowIdx}-${colName}`;

    // Triple-click: Instant clipboard copy
    if (e.detail >= 3) {
      navigator.clipboard.writeText(formatted);
      setCopiedCellKey(cellKey);
      setActivePopover(null);
      window.getSelection()?.removeAllRanges();
      setTimeout(() => {
        setCopiedCellKey(null);
      }, 1500);
      return;
    }

    // Double-click: Open floating anchored popover card
    if (e.detail === 2) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const popoverWidth = 520;
      const popoverHeight = 340;

      let x = rect.left + window.scrollX;
      let y = rect.bottom + window.scrollY + 6;

      if (x + popoverWidth > window.innerWidth - 20) {
        x = window.innerWidth - popoverWidth - 20;
      }
      if (x < 10) x = 10;

      if (y + popoverHeight > window.innerHeight - 20) {
        y = Math.max(10, rect.top + window.scrollY - popoverHeight - 6);
      }

      setActivePopover({
        rowIdx,
        colName,
        colType,
        cellKey,
        rawValue,
        formattedValue: formatted,
        x,
        y,
      });
    }
  };

  // Filter sample records
  const filteredRows = useMemo(() => {
    if (!filterText.trim()) return propSampleRows;
    const q = filterText.toLowerCase();
    return propSampleRows.filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? '').toLowerCase().includes(q)
      )
    );
  }, [propSampleRows, filterText]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', gap: '14px' }}>
      {/* Top Banner */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          backgroundColor: 'rgba(139, 92, 246, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.25)',
          borderRadius: '8px',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
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
              <span style={{ fontWeight: 800, fontSize: '15px', fontFamily: 'var(--font-mono)' }}>
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
          type="button"
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
        }}
      >
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border-subtle, #334155)',
          }}
        >
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
            TOTAL VECTOR CHUNKS
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#a78bfa' }}>
            {(totalRows ?? currentMeta.total_chunks).toLocaleString()}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
            OpenReview: {currentMeta.openreview_chunks} | CVPR: {currentMeta.cvpr_chunks}
          </div>
        </div>

        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border-subtle, #334155)',
          }}
        >
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
            EMBEDDING DIMENSION
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#38bdf8' }}>
            {currentMeta.vector_dimension}-D Float32
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
            Nomic Matryoshka Space
          </div>
        </div>

        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border-subtle, #334155)',
          }}
        >
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
            STORAGE FOOTPRINT
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#10b981' }}>
            {sizeFormatted}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
            R2 Cloudflare Remote
          </div>
        </div>

        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border-subtle, #334155)',
          }}
        >
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted, #94a3b8)', fontWeight: 600 }}>
            QUERY LATENCY
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#f59e0b' }}>
            Sub-2.0s
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
            With Projection & IVF-PQ
          </div>
        </div>
      </div>

      {/* Dual Indices Section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px 14px',
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle, #334155)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          ACTIVE DUAL INDICES (LANCEDB LAKEHOUSE)
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
          {currentMeta.indices.map((idx) => (
            <div
              key={idx.name}
              style={{
                padding: '10px 12px',
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
              <div style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-muted, #94a3b8)' }}>
                Type: <strong>{idx.type}</strong> | Target: <code>{idx.column}</code>
              </div>
              {idx.partitions && (
                <div style={{ fontSize: '10.5px', marginTop: '2px', color: 'var(--text-muted, #94a3b8)' }}>
                  Centroids: <strong>{idx.partitions}</strong> | Sub-Vectors: <strong>{idx.sub_vectors}</strong>
                </div>
              )}
              {idx.size_mb && (
                <div style={{ fontSize: '10px', marginTop: '2px', color: 'var(--text-muted, #64748b)' }}>
                  Index Size: {idx.size_mb.toFixed(2)} MB
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Schema Tiles Header (Collapsible) */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface, #1e293b)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          borderRadius: '8px',
          padding: '8px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary, #94a3b8)' }}>
              SCHEMA TILES ({columns.length} COLUMNS)
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>
              (Arrow Table Definition)
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowSchemaTiles(!showSchemaTiles)}
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              background: 'transparent',
              border: 'none',
              color: '#a78bfa',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {showSchemaTiles ? '▲ Hide Schema Tiles' : '▼ View Schema Tiles'}
          </button>
        </div>

        {showSchemaTiles && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              maxHeight: '130px',
              overflowY: 'auto',
              paddingTop: '8px',
            }}
          >
            {columns.map((c) => (
              <div
                key={c.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary, #f8fafc)' }}>
                  {c.name}
                </span>
                <ParquetTypePill type={c.type} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* LanceDB Chunks & Values Grid Section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {/* Table Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(139, 92, 246, 0.2)',
                  color: '#a78bfa',
                }}
              >
                LANCEDB RECORDS
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary, #94a3b8)' }}>
                Sample Vector Chunks ({filteredRows.length} of {propSampleRows.length || 0})
              </span>
            </div>

            <input
              type="text"
              value={filterText}
              onChange={(e) => {
                setFilterText(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search title, text, chunk_id..."
              style={{
                width: '240px',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                borderRadius: '6px',
                padding: '6px 10px',
                color: 'var(--text-primary, #f8fafc)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>
                Rows per page:
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                  borderRadius: '4px',
                  color: 'var(--text-primary, #f8fafc)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  padding: '4px 6px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '5px 10px',
                  borderRadius: '5px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: currentPage <= 1 ? 'var(--text-muted, #64748b)' : 'var(--text-primary, #f8fafc)',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                ◀ Prev
              </button>

              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary, #94a3b8)' }}>
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: '5px 10px',
                  borderRadius: '5px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: currentPage >= totalPages ? 'var(--text-muted, #64748b)' : 'var(--text-primary, #f8fafc)',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Next ▶
              </button>
            </div>
          </div>
        </div>

        {/* Columnar Data Table */}
        <div
          style={{
            minHeight: '460px',
            maxHeight: '620px',
            overflow: 'auto',
            backgroundColor: 'var(--bg-surface, #1e293b)',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
            borderRadius: '8px',
            boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.2)',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '11.5px',
              fontFamily: 'var(--font-mono)',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: 'rgba(0, 0, 0, 0.35)', position: 'sticky', top: 0, zIndex: 10 }}>
                <th
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-muted, #64748b)',
                    width: '45px',
                    fontWeight: 800,
                  }}
                >
                  #
                </th>
                {columns.map((col) => {
                  const isExpanded = expandedColumns[col.name] ?? false;
                  return (
                    <th
                      key={col.name}
                      onDoubleClick={() => handleToggleColumn(col.name)}
                      title={`Double-click column header to toggle expansion (${isExpanded ? 'Expanded' : 'Compact'})`}
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        color: isExpanded ? '#38bdf8' : 'var(--text-primary, #f8fafc)',
                        whiteSpace: isExpanded ? 'normal' : 'nowrap',
                        maxWidth: isExpanded ? 'none' : '260px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        transition: 'color 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{col.name}</span>
                        <ParquetTypePill type={col.type} />
                        {isExpanded && (
                          <span
                            style={{
                              fontSize: '8.5px',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: '3px',
                              backgroundColor: '#38bdf8',
                              color: '#0f172a',
                              letterSpacing: '0.04em',
                            }}
                          >
                            EXPANDED
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}
                  >
                    No vector chunk records found in current view.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, idx) => {
                  const rowIndex = (currentPage - 1) * pageSize + idx + 1;
                  return (
                    <tr
                      key={rowIndex}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                        transition: 'background-color 0.1s ease',
                      }}
                    >
                      <td
                        style={{
                          padding: '8px 12px',
                          color: 'var(--text-muted, #64748b)',
                          fontWeight: 600,
                        }}
                      >
                        {rowIndex}
                      </td>

                      {columns.map((col) => {
                        const rawVal = row[col.name];
                        const formatted = formatCellValue(rawVal);
                        const isExpanded = expandedColumns[col.name] ?? false;
                        const cellKey = `${rowIndex}-${col.name}`;
                        const isCopied = copiedCellKey === cellKey;

                        let rendered: React.ReactNode = formatted;
                        if (rawVal === null || rawVal === undefined) {
                          rendered = <span style={{ color: 'var(--text-muted, #64748b)', fontStyle: 'italic' }}>null</span>;
                        } else if (col.name === 'vector') {
                          rendered = (
                            <span
                              style={{
                                color: '#a78bfa',
                                backgroundColor: 'rgba(139, 92, 246, 0.15)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                fontSize: '10.5px',
                                fontWeight: 700,
                              }}
                            >
                              [768-D Float32 Vector]
                            </span>
                          );
                        } else if (Array.isArray(rawVal)) {
                          rendered = (
                            <span style={{ color: '#38bdf8' }}>
                              [{rawVal.map((v) => String(v)).join(', ')}]
                            </span>
                          );
                        } else if (typeof rawVal === 'boolean') {
                          rendered = (
                            <span style={{ color: rawVal ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                              {String(rawVal)}
                            </span>
                          );
                        } else if (typeof rawVal === 'number') {
                          rendered = <span style={{ color: '#f59e0b' }}>{rawVal.toLocaleString()}</span>;
                        }

                        return (
                          <td
                            key={col.name}
                            onClick={(e) => handleCellClick(e, rowIndex, col.name, col.type, rawVal)}
                            title="Double-click to expand in popover / Triple-click to copy"
                            style={{
                              padding: '8px 12px',
                              maxWidth: isExpanded ? 'none' : '260px',
                              whiteSpace: isExpanded ? 'normal' : 'nowrap',
                              overflow: isExpanded ? 'visible' : 'hidden',
                              textOverflow: isExpanded ? 'clip' : 'ellipsis',
                              wordBreak: isExpanded ? 'break-word' : 'normal',
                              color: isExpanded ? 'var(--text-primary, #f8fafc)' : 'var(--text-secondary, #cbd5e1)',
                              cursor: 'pointer',
                              position: 'relative',
                              outline: isCopied ? '1px solid #10b981' : 'none',
                              backgroundColor: isCopied ? 'rgba(16, 185, 129, 0.1)' : undefined,
                            }}
                          >
                            {isCopied && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '-12px',
                                  left: '8px',
                                  zIndex: 50,
                                  backgroundColor: '#10b981',
                                  color: '#0f172a',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  fontFamily: 'var(--font-mono)',
                                  boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  pointerEvents: 'none',
                                }}
                              >
                                <span>✓ Copied to clipboard!</span>
                              </div>
                            )}

                            {rendered}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Anchored Overlay Card (Destroys on Mouse Leave or ESC) */}
      {activePopover && (
        <div
          onMouseLeave={() => setActivePopover(null)}
          style={{
            position: 'fixed',
            top: `${activePopover.y}px`,
            left: `${activePopover.x}px`,
            width: '520px',
            maxWidth: '90vw',
            maxHeight: '340px',
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.96)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(167, 139, 250, 0.4)',
            borderRadius: '10px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.65), 0 0 20px rgba(167, 139, 250, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Popover Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              backgroundColor: 'rgba(167, 139, 250, 0.1)',
              borderBottom: '1px solid rgba(167, 139, 250, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#c084fc' }}>
                {activePopover.colName}
              </span>
              <ParquetTypePill type={activePopover.colType} />
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted, #94a3b8)', fontFamily: 'var(--font-mono)' }}>
                Row #{activePopover.rowIdx}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted, #94a3b8)', fontFamily: 'var(--font-mono)' }}>
                {activePopover.formattedValue.length.toLocaleString()} chars
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(activePopover.formattedValue);
                  setCopiedCellKey(activePopover.cellKey);
                  setTimeout(() => setCopiedCellKey(null), 1500);
                }}
                title="Copy content to clipboard"
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(167, 139, 250, 0.2)',
                  border: '1px solid rgba(167, 139, 250, 0.4)',
                  color: '#c084fc',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => setActivePopover(null)}
                title="Close (or move mouse away)"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #94a3b8)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 700,
                  padding: '2px',
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Popover Content */}
          <div
            style={{
              padding: '14px',
              overflowY: 'auto',
              flex: 1,
              fontSize: '12px',
              lineHeight: '1.65',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary, #f8fafc)',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
            }}
          >
            {activePopover.formattedValue}
          </div>

          {/* Popover Footer */}
          <div
            style={{
              padding: '6px 14px',
              fontSize: '10px',
              color: 'var(--text-muted, #64748b)',
              borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
            }}
          >
            <span>Hover outside to dismiss // Press ESC // Triple-click cell to copy</span>
            <span style={{ color: '#a78bfa', fontWeight: 600 }}>LanceDB Vector Table</span>
          </div>
        </div>
      )}
    </div>
  );
};
