import { useState, useMemo, type FC } from 'react';

export interface JsonTreeViewerProps {
  fileName: string;
  jsonData: any;
  sizeFormatted?: string;
  lastModified?: string;
}

export const JsonTreeViewer: FC<JsonTreeViewerProps> = ({
  fileName,
  jsonData,
  sizeFormatted,
  lastModified,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');

  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(jsonData, null, 2);
    } catch {
      return String(jsonData);
    }
  }, [jsonData]);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = useMemo(() => {
    return jsonString.split('\n');
  }, [jsonString]);

  const filteredLines = useMemo(() => {
    if (!searchTerm.trim()) return lines;
    const term = searchTerm.toLowerCase();
    return lines.filter(line => line.toLowerCase().includes(term));
  }, [lines, searchTerm]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* JSON Metadata Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '8px',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', fontFamily: 'var(--font-mono)' }}>
              {fileName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', display: 'flex', gap: '10px' }}>
              {sizeFormatted && <span>Size: <strong>{sizeFormatted}</strong></span>}
              <span>Lines: <strong>{lines.length}</strong></span>
              {lastModified && <span>Updated: <strong>{lastModified}</strong></span>}
            </div>
          </div>
        </div>

        {/* View mode toggle & Copy button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-card, #1e293b)',
              padding: '2px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle, #334155)',
            }}
          >
            <button
              onClick={() => setViewMode('formatted')}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: viewMode === 'formatted' ? '#f59e0b' : 'transparent',
                color: viewMode === 'formatted' ? '#0f172a' : 'inherit',
                fontWeight: viewMode === 'formatted' ? 700 : 500,
              }}
            >
              Tree
            </button>
            <button
              onClick={() => setViewMode('raw')}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: viewMode === 'raw' ? '#f59e0b' : 'transparent',
                color: viewMode === 'raw' ? '#0f172a' : 'inherit',
                fontWeight: viewMode === 'raw' ? 700 : 500,
              }}
            >
              Raw
            </button>
          </div>

          <button
            onClick={handleCopy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              backgroundColor: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.15)',
              color: copied ? '#10b981' : '#f59e0b',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy JSON
              </>
            )}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              position: 'absolute',
              left: '10px',
              color: 'var(--text-muted, #64748b)',
              pointerEvents: 'none',
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search JSON keys and values..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 12px 7px 32px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle, #334155)',
              backgroundColor: 'var(--bg-card, #1e293b)',
              color: 'inherit',
              outline: 'none',
              fontFamily: 'var(--font-mono)',
            }}
          />
        </div>
        {searchTerm && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', whiteSpace: 'nowrap' }}>
            {filteredLines.length} match{filteredLines.length === 1 ? '' : 'es'}
          </span>
        )}
      </div>

      {/* Code Editor / Tree Box */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: '#0a0f1d',
          border: '1px solid var(--border-subtle, #1e293b)',
          borderRadius: '8px',
          padding: '12px',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '12px',
          lineHeight: '1.6',
          color: '#e2e8f0',
        }}
      >
        {viewMode === 'raw' ? (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {searchTerm
              ? filteredLines.join('\n')
              : jsonString}
          </pre>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredLines.map((line, idx) => {
              // Highlight keys vs values
              const colonIdx = line.indexOf(':');
              let renderedContent = line;

              if (colonIdx > -1) {
                const keyPart = line.substring(0, colonIdx);
                const valPart = line.substring(colonIdx + 1);

                return (
                  <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                    <span
                      style={{
                        userSelect: 'none',
                        color: '#475569',
                        width: '36px',
                        textAlign: 'right',
                        paddingRight: '6px',
                        fontSize: '10.5px',
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span style={{ flex: 1, whiteSpace: 'pre' }}>
                      <span style={{ color: '#38bdf8' }}>{keyPart}</span>
                      <span style={{ color: '#94a3b8' }}>:</span>
                      <span style={{ color: valPart.includes('"') ? '#a5b4fc' : '#34d399' }}>
                        {valPart}
                      </span>
                    </span>
                  </div>
                );
              }

              return (
                <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                  <span
                    style={{
                      userSelect: 'none',
                      color: '#475569',
                      width: '36px',
                      textAlign: 'right',
                      paddingRight: '6px',
                      fontSize: '10.5px',
                    }}
                  >
                    {idx + 1}
                  </span>
                  <span style={{ flex: 1, whiteSpace: 'pre', color: '#94a3b8' }}>{renderedContent}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
