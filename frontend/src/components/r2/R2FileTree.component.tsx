import { useState, useMemo, type FC } from 'react';
import {
  BronzeVaultGlyph,
  SilverColumnarGlyph,
  GoldPrismGlyph,
  LanceVectorGlyph,
  FileFormatBadge,
} from './R2Glyphs.component';

export interface R2FileItem {
  key: string;
  name: string;
  zone: string;
  category: string;
  size_bytes: number;
  size_formatted: string;
  extension: string;
  last_modified?: string;
  row_count?: number;
}

export interface R2FileTreeProps {
  zones: Record<string, R2FileItem[]>;
  zoneStats: Record<string, { count: number; size_bytes: number; size_formatted: string }>;
  selectedKey: string | null;
  onSelectFile: (file: R2FileItem) => void;
}

export const R2FileTree: FC<R2FileTreeProps> = ({
  zones,
  zoneStats,
  selectedKey,
  onSelectFile,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedZones, setExpandedZones] = useState<Record<string, boolean>>({
    bronze: true,
    silver: true,
    gold: true,
    lancedb: true,
  });

  const toggleZone = (z: string) => {
    setExpandedZones((prev) => ({ ...prev, [z]: !prev[z] }));
  };

  const filteredZones = useMemo(() => {
    if (!searchQuery.trim()) return zones;
    const q = searchQuery.toLowerCase();
    const result: Record<string, R2FileItem[]> = {};
    for (const [z, items] of Object.entries(zones)) {
      result[z] = items.filter(
        (it) =>
          it.name.toLowerCase().includes(q) ||
          it.key.toLowerCase().includes(q) ||
          it.category.toLowerCase().includes(q) ||
          it.extension.toLowerCase().includes(q)
      );
    }
    return result;
  }, [zones, searchQuery]);

  const zoneConfigs = [
    {
      id: 'silver',
      name: 'SILVER COLUMNAR TABLES',
      subtitle: 'Cleaned Parquet Lakehouse',
      glyph: <SilverColumnarGlyph size={17} />,
      color: '#06b6d4',
    },
    {
      id: 'gold',
      name: 'GOLD ANALYTICAL LAYER',
      subtitle: 'Derived Parquet & Mining Artifacts',
      glyph: <GoldPrismGlyph size={17} />,
      color: '#eab308',
    },
    {
      id: 'lancedb',
      name: 'LANCEDB VECTOR INDEX',
      subtitle: '768-D Dense Embeddings & ANN',
      glyph: <LanceVectorGlyph size={17} />,
      color: '#10b981',
    },
    {
      id: 'bronze',
      name: 'BRONZE RAW VAULT',
      subtitle: 'Ingested JSON & HTML5 Preprints',
      glyph: <BronzeVaultGlyph size={17} />,
      color: '#f59e0b',
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-surface, #1e293b)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Header & Instant Search */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary, #94a3b8)', letterSpacing: '0.06em' }}>
            LAKEHOUSE FILE ASSETS
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)', fontFamily: 'var(--font-mono)' }}>
            4 ZONES ACTIVE
          </span>
        </div>

        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files by name or ext..."
            style={{
              width: '100%',
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
              borderRadius: '7px',
              padding: '7px 10px 7px 30px',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted, #64748b)"
            strokeWidth="2"
            style={{ position: 'absolute', left: '10px', top: '9px', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '7px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #64748b)',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Zone Accordion List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        {zoneConfigs.map((cfg) => {
          const items = filteredZones[cfg.id] || [];
          const stats = zoneStats[cfg.id] || { count: 0, size_formatted: '0 B' };
          const isExpanded = expandedZones[cfg.id] ?? true;

          return (
            <div key={cfg.id} style={{ marginBottom: '8px' }}>
              {/* Zone Folder Header */}
              <button
                type="button"
                onClick={() => toggleZone(cfg.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '7px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  color: 'var(--text-primary, #f8fafc)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center' }}>{cfg.glyph}</span>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: cfg.color }}>
                      {cfg.name}
                    </div>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted, #64748b)' }}>{cfg.subtitle}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary, #94a3b8)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      padding: '2px 5px',
                      borderRadius: '4px',
                    }}
                  >
                    {stats.size_formatted}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-muted, #64748b)"
                    strokeWidth="2.2"
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {/* File Items in Zone */}
              {isExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px', paddingLeft: '8px' }}>
                  {items.length === 0 ? (
                    <div style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--text-muted, #64748b)', fontStyle: 'italic' }}>
                      No matching files in zone
                    </div>
                  ) : (
                    items.map((file) => {
                      const isSelected = selectedKey === file.key;
                      return (
                        <button
                          key={file.key}
                          type="button"
                          onClick={() => onSelectFile(file)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                            border: `1px solid ${isSelected ? 'rgba(59, 130, 246, 0.45)' : 'transparent'}`,
                            cursor: 'pointer',
                            transition: 'all 0.12s ease',
                            textAlign: 'left',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, flex: 1 }}>
                            <FileFormatBadge extension={file.extension} />
                            <span
                              style={{
                                fontSize: '11.5px',
                                fontWeight: isSelected ? 700 : 500,
                                color: isSelected ? '#60a5fa' : 'var(--text-primary, #f8fafc)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={file.name}
                            >
                              {file.name}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                            {file.row_count != null && (
                              <span
                                style={{
                                  fontSize: '9.5px',
                                  color: 'var(--text-muted, #64748b)',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                {file.row_count > 1000
                                  ? `${(file.row_count / 1000).toFixed(1)}k rows`
                                  : `${file.row_count} rows`}
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: '9.5px',
                                color: 'var(--text-secondary, #94a3b8)',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {file.size_formatted}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
