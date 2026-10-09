import { useState, useMemo, type FC } from 'react';
import { ParquetTypePill } from './R2Glyphs.component';

export interface ParquetColumn {
  name: string;
  type: string;
  nullable?: boolean;
}

export interface ParquetTableViewerProps {
  fileName: string;
  totalRows?: number;
  columns?: ParquetColumn[];
  sampleRows?: Record<string, any>[];
  sizeFormatted?: string;
  lastModified?: string;
}

export const ParquetTableViewer: FC<ParquetTableViewerProps> = ({
  fileName,
  totalRows,
  columns = [],
  sampleRows = [],
  sizeFormatted,
  lastModified,
}) => {
  const [filterText, setFilterText] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSchemaTiles, setShowSchemaTiles] = useState(true);

  // Filter rows across all columns
  const filteredRows = useMemo(() => {
    if (!filterText.trim()) return sampleRows;
    const q = filterText.toLowerCase();
    return sampleRows.filter((r) =>
      Object.values(r).some((val) =>
        String(val ?? '').toLowerCase().includes(q)
      )
    );
  }, [sampleRows, filterText]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* File Metadata Overview Banner */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: 'rgba(6, 182, 212, 0.08)',
          border: '1px solid rgba(6, 182, 212, 0.25)',
          borderRadius: '8px',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(6, 182, 212, 0.2)',
              color: '#06b6d4',
            }}
          >
            PARQUET COLUMNAR
          </span>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
            {fileName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', fontFamily: 'var(--font-mono)' }}>
            Total Corpus: <strong style={{ color: '#06b6d4' }}>{totalRows != null ? totalRows.toLocaleString() : 'N/A'}</strong> rows
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', fontFamily: 'var(--font-mono)' }}>
            Columns: <strong style={{ color: 'var(--text-primary, #f8fafc)' }}>{columns.length}</strong>
          </span>
          {sizeFormatted && (
            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', fontFamily: 'var(--font-mono)' }}>
              Size: <strong style={{ color: 'var(--text-primary, #f8fafc)' }}>{sizeFormatted}</strong>
            </span>
          )}
          {lastModified && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>
              Modified: {lastModified}
            </span>
          )}
        </div>
      </div>

      {/* Bespoke Schema Column Tiles Header */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface, #1e293b)',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          borderRadius: '8px',
          padding: '12px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary, #94a3b8)' }}>
              SCHEMA TILES ({columns.length} COLUMNS)
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>
              (PyArrow Columnar Layout)
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
              color: '#06b6d4',
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
              maxHeight: '140px',
              overflowY: 'auto',
              padding: '2px 0',
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

      {/* Data Grid Toolbar (Filter + Pagination) */}
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
          <input
            type="text"
            value={filterText}
            onChange={(e) => {
              setFilterText(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Filter sample records..."
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
          <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>
            Showing {filteredRows.length} of {sampleRows.length} sample rows (First 50 sampled)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
              borderRadius: '6px',
              padding: '5px 8px',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
          </select>

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

      {/* Interactive Columnar Data Table */}
      <div
        style={{
          flex: 1,
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
              {columns.map((col) => (
                <th
                  key={col.name}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-secondary, #94a3b8)',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{col.name}</span>
                    <span style={{ fontSize: '9px', opacity: 0.7 }}>({col.type})</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}
                >
                  No records match the current filter.
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
                      const val = row[col.name];
                      const rendered =
                        Array.isArray(val)
                          ? `[${val.length} items]`
                          : typeof val === 'object' && val !== null
                          ? JSON.stringify(val)
                          : String(val ?? 'null');

                      return (
                        <td
                          key={col.name}
                          style={{
                            padding: '8px 14px',
                            color: val == null ? 'var(--text-muted, #64748b)' : 'var(--text-primary, #f8fafc)',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={rendered}
                        >
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
  );
};
