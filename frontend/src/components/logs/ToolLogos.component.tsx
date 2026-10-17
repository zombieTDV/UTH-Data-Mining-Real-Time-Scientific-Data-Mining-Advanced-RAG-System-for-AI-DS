import { useState, useMemo, type FC, type ReactNode } from 'react';
import { useTranslation } from '../../hooks';
import { useLakehouseStreamStore } from '../../store';

export interface ToolItem {
  id: string;
  name: string;
  category: 'Storage' | 'Compute' | 'Vector DB' | 'Model & Engine' | 'Data Source';
  roleVi: string;
  roleEn: string;
  spec: string;
  specVi?: string;
  specEn?: string;
  status: 'Operational' | 'Active' | 'Synced';
  icon: ReactNode;
  metricBadge: string;
  metricBadgeVi?: string;
  metricBadgeEn?: string;
}

export const TOOLS_DATA: ToolItem[] = [
  {
    id: 'cloudflare-r2',
    name: 'Cloudflare R2',
    category: 'Storage',
    roleVi: 'Hồ dữ liệu Bronze & Bản sao dự phòng Gold',
    roleEn: 'Bronze Lakehouse & Gold Disaster Recovery',
    spec: 'S3 API · Zero Egress Fees · Phân vùng Bronze/Silver/Gold',
    specVi: 'S3 API · Không phí Egress · Phân vùng Bronze/Silver/Gold',
    specEn: 'S3 API · Zero Egress Fees · Bronze/Silver/Gold Partitions',
    status: 'Operational',
    metricBadge: '8.75 GB Active',
    metricBadgeVi: '8.75 GB Khả Dụng',
    metricBadgeEn: '8.75 GB Active',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M18.8 11.2C18.4 8.3 15.9 6 13 6c-2.4 0-4.5 1.5-5.4 3.7C5.3 10 3.5 12 3.5 14.5c0 2.8 2.2 5 5 5h10c2.5 0 4.5-2 4.5-4.5 0-2.1-1.5-3.8-3.5-4.3z" stroke="#F38020" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13 10l3 3.5-3 3.5M10 17l-3-3.5 3-3.5" stroke="#FAAD3F" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    id: 'duckdb',
    name: 'DuckDB OLAP',
    category: 'Compute',
    roleVi: 'Động cơ SQL phân tích cột nhúng trong bộ nhớ',
    roleEn: 'In-Process Vectorized Columnar SQL Engine',
    spec: 'SIMD Acceleration · Truy vấn Parquet không sao chép',
    specVi: 'Tăng tốc SIMD · Truy vấn Parquet không sao chép',
    specEn: 'SIMD Acceleration · Zero-Copy Parquet Query',
    status: 'Operational',
    metricBadge: '2,838,695 CT Toán',
    metricBadgeVi: '2,838,695 CT Toán',
    metricBadgeEn: '2,838,695 Formulas',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="#FFF000" strokeWidth="1.8"/>
        <circle cx="9" cy="9" r="2.5" fill="#FFF000"/>
        <path d="M14 9c0 2-2 3.5-5 3.5M9 16c4 0 7-1.5 7-4.5" stroke="#FFF000" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    id: 'lancedb',
    name: 'LanceDB Gold',
    category: 'Vector DB',
    roleVi: 'Hồ vector đa phương thức phục vụ tìm kiếm ngữ nghĩa',
    roleEn: 'Multi-Modal Vector Lakehouse (Gold Tier)',
    spec: '164,750 Embeddings · IVF-PQ Cosine ANN',
    specVi: '164,750 Embeddings · IVF-PQ Cosine ANN',
    specEn: '164,750 Embeddings · IVF-PQ Cosine ANN',
    status: 'Operational',
    metricBadge: '164,750 Vectors',
    metricBadgeVi: '164,750 Vectors',
    metricBadgeEn: '164,750 Vectors',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <polygon points="12 2 21 7 21 17 12 22 3 17 3 7" stroke="#22D3EE" strokeWidth="1.8" strokeLinejoin="round"/>
        <polyline points="12 2 12 22" stroke="#22D3EE" strokeWidth="1.5" strokeDasharray="2 2"/>
        <polyline points="3 7 12 12 21 7" stroke="#22D3EE" strokeWidth="1.5"/>
        <polyline points="3 17 12 12 21 17" stroke="#22D3EE" strokeWidth="1.5"/>
      </svg>
    )
  },
  {
    id: 'parquet',
    name: 'Apache Parquet',
    category: 'Storage',
    roleVi: 'Định dạng chuẩn hóa tầng Silver Lakehouse',
    roleEn: 'Silver Canonical Storage Columnar Format',
    spec: 'Nén Snappy · 11 Partitions (arXiv + OpenAlex + CVPR)',
    specVi: 'Nén Snappy · 11 Phân vùng (arXiv + OpenAlex + CVPR)',
    specEn: 'Snappy Compression · 11 Partitions (arXiv + OpenAlex + CVPR)',
    status: 'Synced',
    metricBadge: '321.68 MB',
    metricBadgeVi: '321.68 MB',
    metricBadgeEn: '321.68 MB',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="8" height="7" rx="1.5" stroke="#60A5FA" strokeWidth="1.6"/>
        <rect x="13" y="4" width="8" height="7" rx="1.5" stroke="#60A5FA" strokeWidth="1.6"/>
        <rect x="3" y="13" width="8" height="7" rx="1.5" stroke="#60A5FA" strokeWidth="1.6"/>
        <rect x="13" y="13" width="8" height="7" rx="1.5" stroke="#60A5FA" strokeWidth="1.6"/>
      </svg>
    )
  },
  {
    id: 'qwen',
    name: 'Qwen 2.5 7B',
    category: 'Model & Engine',
    roleVi: 'Mô hình sinh câu trả lời RAG Khoa học',
    roleEn: 'Scientific RAG Reasoning & Anti-Hallucination Gate',
    spec: 'Instruct Q4_K_M GGUF · Context Window 8k · tau >= 0.75',
    specVi: 'Instruct Q4_K_M GGUF · Cửa sổ ngữ cảnh 8k · tau >= 0.75',
    specEn: 'Instruct Q4_K_M GGUF · Context Window 8k · tau >= 0.75',
    status: 'Active',
    metricBadge: 'LLM Active',
    metricBadgeVi: 'LLM Hoạt Động',
    metricBadgeEn: 'LLM Active',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#A855F7" strokeWidth="1.8"/>
        <path d="M8 12c1.5-3 6.5-3 8 0-1.5 3-6.5 3-8 0z" stroke="#C084FC" strokeWidth="1.6"/>
        <circle cx="12" cy="12" r="2" fill="#E879F9"/>
      </svg>
    )
  },
  {
    id: 'hardware-accel',
    name: 'Hardware Accelerator',
    category: 'Compute',
    roleVi: 'Tăng tốc GPU và suy luận mô hình',
    roleEn: 'GPU Acceleration & Inference',
    spec: 'NVIDIA CUDA / Tensor Cores & Apple MPS Multi-Backend',
    specVi: 'NVIDIA CUDA / Tensor Cores & Apple MPS Multi-Backend',
    specEn: 'NVIDIA CUDA / Tensor Cores & Apple MPS Multi-Backend',
    status: 'Operational',
    metricBadge: 'CUDA / MPS',
    metricBadgeVi: 'CUDA / MPS',
    metricBadgeEn: 'CUDA / MPS',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="6" width="20" height="12" rx="2" stroke="#10b981" strokeWidth="1.8" />
        <path d="M6 12h12M12 6v12" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="6" cy="6" r="1" fill="#10b981" />
        <circle cx="18" cy="6" r="1" fill="#10b981" />
        <circle cx="6" cy="18" r="1" fill="#10b981" />
        <circle cx="18" cy="18" r="1" fill="#10b981" />
      </svg>
    )
  },
  {    id: 'nomic',
    name: 'Nomic Embed v1.5',
    category: 'Model & Engine',
    roleVi: 'Mô hình sinh Vector Embedding học thuật',
    roleEn: 'Academic Literature Dense Vector Embedding',
    spec: '768 Chiều · L2 Normalized · Matryoshka Projections',
    specVi: '768 Chiều · Chuẩn hóa L2 · Phép chiếu Matryoshka',
    specEn: '768-D Dense · L2 Normalized · Matryoshka Projections',
    status: 'Operational',
    metricBadge: '768-D Dense',
    metricBadgeVi: '768-D Dày',
    metricBadgeEn: '768-D Dense',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="4" stroke="#10B981" strokeWidth="1.8"/>
        <path d="M8 12h8M12 8v8" stroke="#34D399" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    id: 'arxiv',
    name: 'arXiv OAI-PMH & HTML5',
    category: 'Data Source',
    roleVi: 'Luồng thu thập tự động tiền ấn phẩm arXiv',
    roleEn: 'Real-time Scientific Harvesting & Parsing',
    spec: 'cs.AI, cs.LG, cs.CV, cs.CL · HTML5 Full-Text Structure',
    specVi: 'cs.AI, cs.LG, cs.CV, cs.CL · Cấu trúc toàn văn HTML5',
    specEn: 'cs.AI, cs.LG, cs.CV, cs.CL · HTML5 Full-Text Structure',
    status: 'Synced',
    metricBadge: '101 HTML5',
    metricBadgeVi: '101 HTML5',
    metricBadgeEn: '101 HTML5',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="#B91C1C" strokeWidth="1.8"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="#EF4444" strokeWidth="1.8"/>
        <path d="M9 7h6M9 11h4" stroke="#FCA5A5" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  },
  {
    id: 'openalex',
    name: 'OpenAlex Catalog',
    category: 'Data Source',
    roleVi: 'Cơ sở dữ liệu trích dẫn và liên kết tác giả toàn cầu',
    roleEn: 'Global Citation Graph & Bibliometric Catalog',
    spec: '9,621 Works · JSON-LD Metadata · Concept Hierarchies',
    specVi: '9,621 Bài báo · Siêu dữ liệu JSON-LD · Thứ bậc khái niệm',
    specEn: '9,621 Works · JSON-LD Metadata · Concept Hierarchies',
    status: 'Synced',
    metricBadge: '9,621 Works',
    metricBadgeVi: '9,621 Bài Báo',
    metricBadgeEn: '9,621 Works',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="#EC4899" strokeWidth="1.8"/>
        <circle cx="12" cy="12" r="4" stroke="#F472B6" strokeWidth="1.5"/>
        <line x1="12" y1="3" x2="12" y2="7" stroke="#F472B6" strokeWidth="1.5"/>
        <line x1="12" y1="17" x2="12" y2="21" stroke="#F472B6" strokeWidth="1.5"/>
      </svg>
    )
  }
];

export const ToolLogosGrid: FC = () => {
  const { language } = useTranslation();
  const { storageStats, storageUsedGb } = useLakehouseStreamStore();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const categories = ['ALL', 'Storage', 'Compute', 'Vector DB', 'Model & Engine', 'Data Source'];

  const categoryLabels: Record<string, { vi: string; en: string }> = {
    ALL: { vi: 'TẤT CẢ', en: 'ALL' },
    Storage: { vi: 'Lưu Trữ', en: 'Storage' },
    Compute: { vi: 'Tính Toán', en: 'Compute' },
    'Vector DB': { vi: 'CSDL Vector', en: 'Vector DB' },
    'Model & Engine': { vi: 'Mô Hình & Động Cơ', en: 'Model & Engine' },
    'Data Source': { vi: 'Nguồn Dữ Liệu', en: 'Data Source' },
  };

  const dynamicToolsData = useMemo(() => {
    const r2Gb = storageStats?.total_size_gb ?? (storageUsedGb > 0 ? storageUsedGb : 8.75);
    const vectorCount = storageStats?.backupStorage?.vectorCount ?? 164750;
    const arxivCount = storageStats?.activeLakehouse?.arxivHtmlCount ?? 101;
    const openalexCount = storageStats?.activeLakehouse?.openalexCount ?? 9621;
    const silverMb = storageStats?.activeLakehouse?.silverParquetSizeMb ?? 321.68;
    const liveFormulas = 2838695;

    return TOOLS_DATA.map((t) => {
      if (t.id === 'cloudflare-r2') {
        return {
          ...t,
          metricBadge: `${r2Gb.toFixed(2)} GB Active`,
          metricBadgeVi: `${r2Gb.toFixed(2)} GB Khả Dụng`,
          metricBadgeEn: `${r2Gb.toFixed(2)} GB Active`,
        };
      }
      if (t.id === 'duckdb') {
        return {
          ...t,
          spec: `${liveFormulas.toLocaleString()} ${language === 'vi' ? 'Công thức' : 'Formulas'} · SIMD Acceleration · Zero-Copy`,
          specVi: `${liveFormulas.toLocaleString()} Công thức · Tăng tốc SIMD · Không sao chép`,
          specEn: `${liveFormulas.toLocaleString()} Formulas · SIMD Acceleration · Zero-Copy`,
          metricBadge: `${liveFormulas.toLocaleString()} ${language === 'vi' ? 'CT Toán' : 'Formulas'}`,
          metricBadgeVi: `${liveFormulas.toLocaleString()} CT Toán`,
          metricBadgeEn: `${liveFormulas.toLocaleString()} Formulas`,
        };
      }
      if (t.id === 'lancedb') {
        return {
          ...t,
          spec: `${vectorCount.toLocaleString()} Embeddings · IVF-PQ Cosine ANN`,
          specVi: `${vectorCount.toLocaleString()} Embeddings · IVF-PQ Cosine ANN`,
          specEn: `${vectorCount.toLocaleString()} Embeddings · IVF-PQ Cosine ANN`,
          metricBadge: `${vectorCount.toLocaleString()} Vectors`,
          metricBadgeVi: `${vectorCount.toLocaleString()} Vectors`,
          metricBadgeEn: `${vectorCount.toLocaleString()} Vectors`,
        };
      }
      if (t.id === 'arxiv') {
        return {
          ...t,
          metricBadge: `${arxivCount.toLocaleString()} HTML5`,
          metricBadgeVi: `${arxivCount.toLocaleString()} HTML5`,
          metricBadgeEn: `${arxivCount.toLocaleString()} HTML5`,
        };
      }
      if (t.id === 'openalex') {
        return {
          ...t,
          spec: `${openalexCount.toLocaleString()} Works · JSON-LD Metadata · Concept Hierarchies`,
          specVi: `${openalexCount.toLocaleString()} Bài báo · Siêu dữ liệu JSON-LD · Thứ bậc khái niệm`,
          specEn: `${openalexCount.toLocaleString()} Works · JSON-LD Metadata · Concept Hierarchies`,
          metricBadge: `${openalexCount.toLocaleString()} Works`,
          metricBadgeVi: `${openalexCount.toLocaleString()} Bài Báo`,
          metricBadgeEn: `${openalexCount.toLocaleString()} Works`,
        };
      }
      if (t.id === 'parquet') {
        return {
          ...t,
          metricBadge: `${silverMb.toFixed(2)} MB`,
          metricBadgeVi: `${silverMb.toFixed(2)} MB`,
          metricBadgeEn: `${silverMb.toFixed(2)} MB`,
        };
      }
      return t;
    });
  }, [storageStats, storageUsedGb, language]);

  const filteredTools = selectedCategory === 'ALL'
    ? dynamicToolsData
    : dynamicToolsData.filter((t) => t.category === selectedCategory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Category Filter Tabs & Collapsible Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
          <span style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', letterSpacing: '0.03em' }}>
            {language === 'vi' ? 'HẠ TẦNG KỸ THUẬT & CÔNG NGHỆ NỀN TẢNG' : 'TECHNICAL STACK & INFRASTRUCTURE NODES'}
          </span>
          <span style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            padding: '1px 6px',
            borderRadius: '4px',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            color: '#38bdf8',
            fontWeight: 700,
          }}>
            8 NODES ONLINE
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {!isCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    backgroundColor: selectedCategory === cat ? 'var(--bg-surface-elevated, #1e293b)' : 'var(--bg-canvas)',
                    border: selectedCategory === cat ? '1px solid var(--accent-silver, #38bdf8)' : '1px solid var(--border-subtle)',
                    color: selectedCategory === cat ? 'var(--text-primary)' : 'var(--text-muted)',
                    borderRadius: '6px',
                    padding: '3px 9px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {language === 'vi' ? categoryLabels[cat]?.vi || cat : categoryLabels[cat]?.en || cat}
                </button>
              ))}
            </div>
          )}

          {/* Collapse / Expand Button */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? (language === 'vi' ? 'Mở rộng hiển thị thẻ hạ tầng' : 'Expand Infrastructure Cards') : (language === 'vi' ? 'Thu gọn hạ tầng để tối đa hóa Terminal' : 'Collapse to Maximize Terminal')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: isCollapsed ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-canvas)',
              border: `1px solid ${isCollapsed ? 'rgba(56, 189, 248, 0.35)' : 'var(--border-subtle)'}`,
              color: isCollapsed ? '#38bdf8' : 'var(--text-secondary)',
              borderRadius: '6px',
              padding: '3px 10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span>{isCollapsed ? '▼' : '▲'}</span>
            <span>
              {isCollapsed
                ? (language === 'vi' ? 'MỞ RỘNG HẠ TẦNG (8)' : 'EXPAND STACK (8)')
                : (language === 'vi' ? 'THU GỌN' : 'COLLAPSE')}
            </span>
          </button>
        </div>
      </div>

      {/* Cards Grid (Rendered when expanded) or Compact Ribbon (when collapsed) */}
      {isCollapsed ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            padding: '6px 10px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            scrollbarWidth: 'none',
          }}
        >
          {dynamicToolsData.map((tool) => (
            <div
              key={tool.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                flexShrink: 0,
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span style={{ display: 'inline-flex', transform: 'scale(0.75)', transformOrigin: 'center' }}>{tool.icon}</span>
              <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{tool.name}</span>
              <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 700 }}>●</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px',
          }}
        >
        {filteredTools.map((tool) => (
          <div
            key={tool.id}
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
              position: 'relative',
              transition: 'border-color 0.2s ease, transform 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {/* Tool Icon Box */}
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-surface-elevated, #162035)',
                border: '1px solid var(--border-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
              }}
            >
              {tool.icon}
            </div>

            {/* Tool Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {tool.name}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(56, 189, 248, 0.12)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                    }}
                  >
                    {language === 'vi' ? (tool.metricBadgeVi || tool.metricBadge) : (tool.metricBadgeEn || tool.metricBadge)}
                  </span>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      backgroundColor: tool.status === 'Active' ? 'rgba(168, 85, 247, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                      color: tool.status === 'Active' ? '#c084fc' : '#10b981',
                      border: tool.status === 'Active' ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                      fontWeight: 800,
                    }}
                  >
                    {language === 'vi'
                      ? (tool.status === 'Active' ? 'HOẠT ĐỘNG' : tool.status === 'Synced' ? 'ĐỒNG BỘ' : 'SẴN SÀNG')
                      : tool.status}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '5px', lineHeight: 1.4 }}>
                {language === 'vi' ? tool.roleVi : tool.roleEn}
              </div>

              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={language === 'vi' ? (tool.specVi || tool.spec) : (tool.specEn || tool.spec)}
              >
                {language === 'vi' ? (tool.specVi || tool.spec) : (tool.specEn || tool.spec)}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
};

export const ToolLogos = ToolLogosGrid;
