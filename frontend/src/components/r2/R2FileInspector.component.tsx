import { useState, type FC } from 'react';
import type { R2FileItem } from './R2FileTree.component';
import { ParquetTableViewer, type ParquetColumn } from './ParquetTableViewer.component';
import { JsonTreeViewer } from './JsonTreeViewer.component';
import { LanceDbInspector, type LanceMetaInfo } from './LanceDbInspector.component';
import {
  BronzeVaultGlyph,
  SilverColumnarGlyph,
  GoldPrismGlyph,
  LanceVectorGlyph,
  FileFormatBadge,
} from './R2Glyphs.component';

export interface FilePreviewData {
  key: string;
  name: string;
  extension: string;
  size_bytes: number;
  size_formatted: string;
  total_rows?: number;
  column_count?: number;
  schema_columns?: ParquetColumn[];
  sample_rows?: Record<string, any>[];
  json_data?: any;
  lance_meta?: LanceMetaInfo;
  raw_text?: string;
  preview_type: 'parquet' | 'json' | 'lance' | 'binary' | string;
  last_modified?: string;
}

export interface R2FileInspectorProps {
  selectedFile: R2FileItem | null;
  previewData: FilePreviewData | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export const R2FileInspector: FC<R2FileInspectorProps> = ({
  selectedFile,
  previewData,
  isLoading,
  error,
  onRetry,
}) => {
  const [copiedKey, setCopiedKey] = useState(false);

  const handleCopyKey = () => {
    if (!selectedFile) return;
    navigator.clipboard.writeText(`s3://uth-scientific-lakehouse/${selectedFile.key}`);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // State 1: No file selected
  if (!selectedFile) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--text-muted, #94a3b8)',
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderRadius: '8px',
          border: '1px dashed var(--border-subtle, #334155)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            color: '#f97316',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
          Cloudflare R2 Object Storage Inspector
        </div>
        <p style={{ maxWidth: '440px', fontSize: '13px', lineHeight: '1.6', marginTop: '8px' }}>
          Select any Lakehouse object from the file navigator on the left to inspect columnar Parquet tables, JSON payloads, or 768-D LanceDB vector stores.
        </p>

        {/* Lakehouse Zone Quick Overview */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
            marginTop: '28px',
            maxWidth: '560px',
            width: '100%',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '6px',
              backgroundColor: 'rgba(245, 158, 11, 0.05)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '12px', color: '#f59e0b' }}>
              <BronzeVaultGlyph size={14} />
              BRONZE VAULT
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '4px' }}>
              Raw HTML5 & OAI-PMH preprint archives (11,660 arXiv + OpenAlex)
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: '6px',
              backgroundColor: 'rgba(6, 182, 212, 0.05)',
              border: '1px solid rgba(6, 182, 212, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '12px', color: '#06b6d4' }}>
              <SilverColumnarGlyph size={14} />
              SILVER COLUMNAR
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '4px' }}>
              Cleaned, typed Parquet tables (36.4k papers, CVF, OpenReview)
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: '6px',
              backgroundColor: 'rgba(234, 179, 8, 0.05)',
              border: '1px solid rgba(234, 179, 8, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '12px', color: '#eab308' }}>
              <GoldPrismGlyph size={14} />
              GOLD ANALYTICAL
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '4px' }}>
              Aggregated insights, Louvain communities, and velocity trends
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: '6px',
              backgroundColor: 'rgba(139, 92, 246, 0.05)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '12px', color: '#a78bfa' }}>
              <LanceVectorGlyph size={14} color="#a78bfa" />
              LANCEDB 768-D
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '4px' }}>
              164,702 vectors with Tantivy FTS & IVF-PQ Cosine indexing
            </div>
          </div>
        </div>
      </div>
    );
  }

  // State 2: Loading
  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '40px',
          color: 'var(--text-muted, #94a3b8)',
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle, #334155)',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(249, 115, 22, 0.2)',
            borderTopColor: '#f97316',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '16px',
          }}
        />
        <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary, #f8fafc)' }}>
          Reading {selectedFile.name}...
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', marginTop: '6px' }}>
          Resolving disk cache / S3 preview payload (Zero redundant R2 egress)
        </div>
      </div>
    );
  }

  // State 3: Error
  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '40px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-card, #1e293b)',
          borderRadius: '8px',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            color: '#ef4444',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#ef4444' }}>
          Failed to Load Preview
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', marginTop: '8px', maxWidth: '400px' }}>
          {error}
        </p>
        <button
          onClick={onRetry}
          style={{
            marginTop: '16px',
            padding: '7px 16px',
            borderRadius: '6px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#ef4444',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Retry Preview Extraction
        </button>
      </div>
    );
  }

  // State 4: Content Ready
  const previewType = previewData?.preview_type || (selectedFile.extension === 'parquet' ? 'parquet' : selectedFile.extension === 'lance' ? 'lance' : selectedFile.extension === 'json' ? 'json' : 'binary');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', gap: '12px' }}>
      {/* Top File Locator Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          backgroundColor: 'var(--bg-card, #1e293b)',
          border: '1px solid var(--border-subtle, #334155)',
          borderRadius: '6px',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <FileFormatBadge extension={selectedFile.extension} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted, #94a3b8)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            s3://uth-scientific-lakehouse/{selectedFile.key}
          </span>
        </div>

        <button
          onClick={handleCopyKey}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle, #334155)',
            backgroundColor: 'transparent',
            color: copiedKey ? '#10b981' : 'var(--text-muted, #94a3b8)',
            fontSize: '11px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {copiedKey ? 'URI Copied' : 'Copy S3 URI'}
        </button>
      </div>

      {/* Embedded Component Viewer */}
      <div style={{ flex: 1, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        {previewType === 'parquet' && (
          <ParquetTableViewer
            fileName={previewData?.name || selectedFile.name}
            totalRows={previewData?.total_rows ?? selectedFile.row_count}
            columns={previewData?.schema_columns || []}
            sampleRows={previewData?.sample_rows || []}
            sizeFormatted={previewData?.size_formatted || selectedFile.size_formatted}
            lastModified={previewData?.last_modified || selectedFile.last_modified}
          />
        )}

        {previewType === 'json' && (
          <JsonTreeViewer
            fileName={previewData?.name || selectedFile.name}
            jsonData={previewData?.json_data ?? {}}
            sizeFormatted={previewData?.size_formatted || selectedFile.size_formatted}
            lastModified={previewData?.last_modified || selectedFile.last_modified}
          />
        )}

        {previewType === 'lance' && (
          <LanceDbInspector
            fileName={previewData?.name || selectedFile.name}
            meta={previewData?.lance_meta}
            columns={previewData?.schema_columns || []}
            sampleRows={previewData?.sample_rows || []}
            totalRows={previewData?.total_rows ?? selectedFile.row_count}
            sizeFormatted={previewData?.size_formatted || selectedFile.size_formatted}
            lastModified={previewData?.last_modified || selectedFile.last_modified}
          />
        )}

        {previewType === 'binary' && (
          <div
            style={{
              padding: '24px',
              backgroundColor: 'var(--bg-card, #1e293b)',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle, #334155)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '15px' }}>Binary Lakehouse Object</div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', marginTop: '8px' }}>
              This object is stored in raw binary format ({selectedFile.size_formatted}).
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
