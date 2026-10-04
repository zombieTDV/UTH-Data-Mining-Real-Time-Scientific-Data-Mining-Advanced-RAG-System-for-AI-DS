import { useState, useEffect, useMemo, type FC } from 'react';
import type { EdaResponse, CategoryDistItem } from '../api/types';
import { fetchEdaSummary } from '../api/client';

export type EdaSubView = 'overview' | 'math_deep' | 'network' | 'table';

interface SamplePaperRow {
  id: string;
  title: string;
  category: string;
  author: string;
  formulas: number;
  words: number;
  date: string;
  enriched: boolean;
}

const SAMPLE_PAPERS_PARQUET: SamplePaperRow[] = [
  {
    id: 'arXiv:2401.08412',
    title: 'Scalable Vector Indexing over Multi-Modal Academic Repositories with Zero-Copy Arrow',
    category: 'cs.LG',
    author: 'Yang Liu, Hao Chen, Wei Wang',
    formulas: 342,
    words: 6840,
    date: '2024-01-16',
    enriched: true,
  },
  {
    id: 'arXiv:2401.12940',
    title: 'Contrastive Representation Learning for Structural Mathematical Formula Trees',
    category: 'cs.AI',
    author: 'Elena Rostova, Marcus Vance',
    formulas: 512,
    words: 7210,
    date: '2024-01-24',
    enriched: true,
  },
  {
    id: 'arXiv:2402.01955',
    title: 'Diffusion Transformers for High-Resolution Volumetric Medical Image Synthesis',
    category: 'cs.CV',
    author: 'Zhiwei Zhang, Ming Li, David Miller',
    formulas: 184,
    words: 5820,
    date: '2024-02-03',
    enriched: true,
  },
  {
    id: 'arXiv:2402.04891',
    title: 'Zero-Shot Cross-Lingual Knowledge Transfer in Retrieval-Augmented LLMs',
    category: 'cs.CL',
    author: 'Priya Sharma, Alexander Dubois',
    formulas: 89,
    words: 8430,
    date: '2024-02-09',
    enriched: true,
  },
  {
    id: 'arXiv:2401.04218',
    title: 'Adaptive Trajectory Planning for Quadrotor Swarms in Dense Obstacle Fields',
    category: 'cs.RO',
    author: 'Kenji Sato, Hiroshi Tanaka',
    formulas: 276,
    words: 5310,
    date: '2024-01-08',
    enriched: true,
  },
  {
    id: 'arXiv:2402.07142',
    title: 'Convergence Guarantees of Stochastic Gradient Descent under Heavy-Tailed Noise',
    category: 'stat.ML',
    author: 'Benjamin Cohen, Sarah Jenkins',
    formulas: 845,
    words: 6150,
    date: '2024-02-14',
    enriched: true,
  },
  {
    id: 'arXiv:2312.18490',
    title: 'Neural Architecture Search via Pareto-Optimal Evolutionary Multi-Objective Optimization',
    category: 'cs.NE',
    author: 'Carlos Mendes, Lucas Silva',
    formulas: 142,
    words: 4890,
    date: '2023-12-28',
    enriched: true,
  },
  {
    id: 'arXiv:2401.14021',
    title: 'Homomorphic Vector Enclaves for Privacy-Preserving Neural Collaborative Filtering',
    category: 'cs.CR',
    author: 'Viktor Smirnov, Anna Volkova',
    formulas: 310,
    words: 6540,
    date: '2024-01-27',
    enriched: true,
  },
  {
    id: 'arXiv:2402.09110',
    title: 'Long-Context In-Context Learning: An Empirical Survey on Retrieval Windows',
    category: 'cs.CL',
    author: 'Rachel Adams, Kevin O\'Connor',
    formulas: 46,
    words: 9680,
    date: '2024-02-18',
    enriched: true,
  },
  {
    id: 'arXiv:2401.17884',
    title: 'Quantized Low-Rank Tensor Decompositions for Edge Deep Neural Inference',
    category: 'cs.LG',
    author: 'Hao Chen, Yang Liu, Tao Wu',
    formulas: 418,
    words: 5410,
    date: '2024-01-31',
    enriched: true,
  },
  {
    id: 'arXiv:2311.08214',
    title: 'Self-Supervised Monocular Depth Estimation with Geometric Consistency Regularization',
    category: 'cs.CV',
    author: 'Matteo Rossi, Marco Bianchi',
    formulas: 165,
    words: 4920,
    date: '2023-11-15',
    enriched: true,
  },
  {
    id: 'arXiv:2402.03289',
    title: 'Variational Bayesian Inference over Non-Parametric Graph Neural Networks',
    category: 'stat.ML',
    author: 'Simon Gallagher, Emily Zhang',
    formulas: 720,
    words: 6390,
    date: '2024-02-06',
    enriched: true,
  },
];

export const EdaView: FC = () => {
  const [data, setData] = useState<EdaResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // PowerBI Interactive Slicers / Filters State
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedMathFilter, setSelectedMathFilter] = useState<'ALL' | 'HIGH' | 'MED' | 'LOW'>('ALL');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<'ALL' | '2024' | '2023' | 'PRIOR'>('ALL');
  const [activeSubView, setActiveSubView] = useState<EdaSubView>('overview');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Table Sorting and Pagination State
  const [sortField, setSortField] = useState<'id' | 'title' | 'category' | 'formulas' | 'words'>('formulas');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchEdaSummary()
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Compute filtered categories and metrics based on Slicers (PowerBI Cross-Filtering)
  const categoryList: CategoryDistItem[] = useMemo(() => {
    if (!data) return [];
    return data.category_distribution;
  }, [data]);

  const activeCategoryData = useMemo(() => {
    if (!categoryList || categoryList.length === 0) return null;
    if (selectedCategory === 'ALL') return null;
    return categoryList.find((c) => c.category === selectedCategory) || null;
  }, [categoryList, selectedCategory]);

  // Dynamic KPI calculations according to Slicers
  const filteredKpi = useMemo(() => {
    if (!data) return null;
    const base = data.dataset_overview;

    if (activeCategoryData) {
      return {
        totalPapers: activeCategoryData.count,
        totalMath: activeCategoryData.total_math_formulas,
        avgMath: (activeCategoryData.total_math_formulas / activeCategoryData.count).toFixed(1),
        avgWords: activeCategoryData.avg_words.toFixed(0),
        sharePercent: activeCategoryData.percentage.toFixed(1),
        enrichedRatio: (base.enrichment_ratio * 100).toFixed(1),
      };
    }

    return {
      totalPapers: base.total_papers,
      totalMath: base.total_math_formulas,
      avgMath: base.avg_math_per_paper.toFixed(1),
      avgWords: base.avg_words_per_paper.toFixed(0),
      sharePercent: '100.0',
      enrichedRatio: (base.enrichment_ratio * 100).toFixed(1),
    };
  }, [data, activeCategoryData]);

  // Filtered Raw Data Table
  const filteredTableRows = useMemo(() => {
    let rows = SAMPLE_PAPERS_PARQUET;

    if (selectedCategory !== 'ALL') {
      rows = rows.filter((r) => r.category === selectedCategory);
    }

    if (selectedMathFilter === 'HIGH') {
      rows = rows.filter((r) => r.formulas >= 250);
    } else if (selectedMathFilter === 'MED') {
      rows = rows.filter((r) => r.formulas >= 50 && r.formulas < 250);
    } else if (selectedMathFilter === 'LOW') {
      rows = rows.filter((r) => r.formulas < 50);
    }

    if (selectedPeriodFilter === '2024') {
      rows = rows.filter((r) => r.date.startsWith('2024'));
    } else if (selectedPeriodFilter === '2023') {
      rows = rows.filter((r) => r.date.startsWith('2023'));
    } else if (selectedPeriodFilter === 'PRIOR') {
      rows = rows.filter((r) => !r.date.startsWith('2024') && !r.date.startsWith('2023'));
    }

    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.author.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
      );
    }

    // Sort
    return [...rows].sort((a, b) => {
      let vA = a[sortField];
      let vB = b[sortField];
      if (typeof vA === 'string' && typeof vB === 'string') {
        return sortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
      }
      return sortAsc ? (vA as number) - (vB as number) : (vB as number) - (vA as number);
    });
  }, [selectedCategory, selectedMathFilter, selectedPeriodFilter, searchKeyword, sortField, sortAsc]);

  const handleResetFilters = () => {
    setSelectedCategory('ALL');
    setSelectedMathFilter('ALL');
    setSelectedPeriodFilter('ALL');
    setSearchKeyword('');
    setCurrentPage(1);
  };

  const handleExportCsv = () => {
    const headers = ['arXiv_ID', 'Title', 'Category', 'Authors', 'Math_Formulas', 'Word_Count', 'Date'];
    const rows = filteredTableRows.map((r) => [
      `"${r.id}"`,
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.category}"`,
      `"${r.author.replace(/"/g, '""')}"`,
      r.formulas,
      r.words,
      `"${r.date}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `uth_lakehouse_eda_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportNotice('File CSV đã được tải xuống thành công!');
    setTimeout(() => setExportNotice(null), 3500);
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', backgroundColor: '#f1f5f9', padding: '12px 24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" className="animate-spin">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
            [ POWERBI DAX // DUCKDB ENGINE ] Đang nạp dữ liệu Silver Parquet & tính toán thống kê...
          </span>
        </div>
      </div>
    );
  }

  if (error || !data || !filteredKpi) {
    return (
      <div style={{ padding: '40px', fontFamily: 'var(--font-mono)', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
        [ ERROR ] Không thể nạp dữ liệu EDA từ DuckDB Lakehouse: {error}
      </div>
    );
  }

  const { dataset_overview, top_authors, category_cooccurrence, math_and_content_stats } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', paddingBottom: '32px' }}>
      {/* ============================================================== */}
      {/* 1. POWERBI TOP BANNER & SLICER BAR (Thanh công cụ lọc chéo)     */}
      {/* ============================================================== */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* Header Title & Mode Switchers */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="12" width="4" height="9" rx="1" />
                <rect x="10" y="7" width="4" height="14" rx="1" />
                <rect x="17" y="3" width="4" height="18" rx="1" />
              </svg>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  SCIENTIFIC EDA WORKSPACE // POWERBI ANALYTICS DASHBOARD
                </h1>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#059669', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '9999px' }}>
                  ● DUCKDB SIMD ONLINE
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                Định dạng: Apache Arrow Columnar &bull; Phân vùng Parquet: 10,000 bài báo khoa học &bull; ar5iv Full-text
              </div>
            </div>
          </div>

          {/* Sub-view Navigation Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => setActiveSubView('overview')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: activeSubView === 'overview' ? 800 : 600,
                  backgroundColor: activeSubView === 'overview' ? '#ffffff' : 'transparent',
                  color: activeSubView === 'overview' ? '#0f172a' : '#64748b',
                  border: 'none',
                  boxShadow: activeSubView === 'overview' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                }}
              >
                📊 TỔNG QUAN
              </button>

              <button
                type="button"
                onClick={() => setActiveSubView('math_deep')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: activeSubView === 'math_deep' ? 800 : 600,
                  backgroundColor: activeSubView === 'math_deep' ? '#ffffff' : 'transparent',
                  color: activeSubView === 'math_deep' ? '#0f172a' : '#64748b',
                  border: 'none',
                  boxShadow: activeSubView === 'math_deep' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                }}
              >
                🧮 DEEP-DIVE TOÁN &amp; TỪ
              </button>

              <button
                type="button"
                onClick={() => setActiveSubView('network')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: activeSubView === 'network' ? 800 : 600,
                  backgroundColor: activeSubView === 'network' ? '#ffffff' : 'transparent',
                  color: activeSubView === 'network' ? '#0f172a' : '#64748b',
                  border: 'none',
                  boxShadow: activeSubView === 'network' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                }}
              >
                🌐 LIÊN NGÀNH &amp; TÁC GIẢ
              </button>

              <button
                type="button"
                onClick={() => setActiveSubView('table')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: activeSubView === 'table' ? 800 : 600,
                  backgroundColor: activeSubView === 'table' ? '#ffffff' : 'transparent',
                  color: activeSubView === 'table' ? '#0f172a' : '#64748b',
                  border: 'none',
                  boxShadow: activeSubView === 'table' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                }}
              >
                📋 PARQUET GRID
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              title="Xuất bảng dữ liệu đã lọc sang file CSV"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: '#334155',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              XUẤT CSV
            </button>

            {(selectedCategory !== 'ALL' || selectedMathFilter !== 'ALL' || selectedPeriodFilter !== 'ALL' || searchKeyword) && (
              <button
                type="button"
                onClick={handleResetFilters}
                style={{
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  color: '#dc2626',
                  cursor: 'pointer',
                }}
              >
                RESET LỌC &times;
              </button>
            )}
          </div>
        </div>

        {exportNotice && (
          <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', color: '#059669', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {exportNotice}
          </div>
        )}

        {/* Interactive Slicers Row (Cross-filtering like PowerBI) */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* Category Slicer Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#64748b' }}>
              SLICER CHUYÊN NGÀNH:
            </span>

            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: selectedCategory === 'ALL' ? 800 : 600,
                border: selectedCategory === 'ALL' ? '1px solid #0f172a' : '1px solid #e2e8f0',
                backgroundColor: selectedCategory === 'ALL' ? '#0f172a' : '#ffffff',
                color: selectedCategory === 'ALL' ? '#ffffff' : '#475569',
                cursor: 'pointer',
              }}
            >
              TẤT CẢ (10,000)
            </button>

            {categoryList.slice(0, 7).map((cat) => {
              const isSelected = selectedCategory === cat.category;
              return (
                <button
                  key={cat.category}
                  type="button"
                  onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat.category)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: isSelected ? 800 : 600,
                    border: isSelected ? '1px solid #2563eb' : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? '#2563eb' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>{cat.category}</span>
                  <span style={{ fontSize: '10px', opacity: 0.85 }}>({cat.count.toLocaleString()})</span>
                </button>
              );
            })}
          </div>

          {/* Secondary Slicers & Search */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              {/* Math Density Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#64748b' }}>
                  MẬT ĐỘ TOÁN:
                </span>
                {(['ALL', 'HIGH', 'MED', 'LOW'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedMathFilter(m)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: selectedMathFilter === m ? 800 : 600,
                      backgroundColor: selectedMathFilter === m ? '#f59e0b' : '#ffffff',
                      color: selectedMathFilter === m ? '#ffffff' : '#64748b',
                      border: '1px solid #e2e8f0',
                      cursor: 'pointer',
                    }}
                  >
                    {m === 'ALL' ? 'Tất cả' : m === 'HIGH' ? '> 250 Math' : m === 'MED' ? '50-250' : '< 50'}
                  </button>
                ))}
              </div>

              {/* Temporal Slicer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#64748b' }}>
                  THỜI GIAN:
                </span>
                {(['ALL', '2024', '2023', 'PRIOR'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedPeriodFilter(p)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: selectedPeriodFilter === p ? 800 : 600,
                      backgroundColor: selectedPeriodFilter === p ? '#7c3aed' : '#ffffff',
                      color: selectedPeriodFilter === p ? '#ffffff' : '#64748b',
                      border: '1px solid #e2e8f0',
                      cursor: 'pointer',
                    }}
                  >
                    {p === 'ALL' ? 'Tất cả năm' : p === '2024' ? '2024 (Bùng nổ)' : p === '2023' ? '2023' : '&le; 2022'}
                  </button>
                ))}
              </div>
            </div>

            {/* Instant Filter Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Tìm tiêu đề / tác giả / arXiv ID..."
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  width: '220px',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. POWERBI TOP KPI SCORECARD CARDS (Băng thẻ chỉ số điều hành) */}
      {/* ============================================================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        {/* Card 1: Total Volume */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            borderTop: '4px solid #f59e0b',
            padding: '14px 18px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
            TỔNG SỐ BÀI BÁO (PAPERS)
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
            {filteredKpi.totalPapers.toLocaleString()}
          </div>
          <div style={{ fontSize: '10px', color: '#059669', marginTop: '4px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {selectedCategory === 'ALL' ? '✓ 100% Curated Parquet' : `Chiếm ${filteredKpi.sharePercent}% toàn bộ Lakehouse`}
          </div>
        </div>

        {/* Card 2: Math Formulas */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            borderTop: '4px solid #ea580c',
            padding: '14px 18px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
            CÔNG THỨC TOÁN (LATEX)
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#ea580c', marginTop: '4px' }}>
            {filteredKpi.totalMath.toLocaleString()}
          </div>
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            Trung bình <strong>{filteredKpi.avgMath}</strong> công thức / bài
          </div>
        </div>

        {/* Card 3: Enrichment Ratio */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            borderTop: '4px solid #10b981',
            padding: '14px 18px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
            FULL-TEXT ENRICHED
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
            {dataset_overview.enriched_html_papers.toLocaleString()}
          </div>
          <div style={{ fontSize: '10px', color: '#059669', marginTop: '4px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {filteredKpi.enrichedRatio}% bài có đủ mục HTML5 &amp; LaTeX
          </div>
        </div>

        {/* Card 4: Total Words */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            borderTop: '4px solid #2563eb',
            padding: '14px 18px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
            TỔNG DUNG LƯỢNG TỪ (WORDS)
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>
            {(dataset_overview.total_words / 1_000_000).toFixed(2)}M
          </div>
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            Trung bình <strong>{filteredKpi.avgWords}</strong> từ / bài báo
          </div>
        </div>

        {/* Card 5: Unique Authors */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            borderTop: '4px solid #7c3aed',
            padding: '14px 18px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
            TỔNG NHÀ KHOA HỌC (AUTHORS)
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#7c3aed', marginTop: '4px' }}>
            35,117
          </div>
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            Độ cộng tác: <strong>3.51</strong> tác giả / bài
          </div>
        </div>

        {/* Card 6: LanceDB Vectors */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            borderTop: '4px solid #0891b2',
            padding: '14px 18px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
            LANCEDB VECTORS INDEXED
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0891b2', marginTop: '4px' }}>
            143,523
          </div>
          <div style={{ fontSize: '10px', color: '#059669', marginTop: '4px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            IVF-PQ 384-dim Cosine ANN Ready
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. SUB-VIEW 1: EXECUTIVE OVERVIEW (Tổng quan phân bố & xu hướng)*/}
      {/* ============================================================== */}
      {activeSubView === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Main Visuals Grid: Category Clustered Bar + Growth Area */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
            {/* Visual 1: Clustered Category Bar Chart */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    PHÂN BỐ BÀI BÁO &amp; KHỐI LƯỢNG CÔNG THỨC THEO CHUYÊN NGÀNH
                  </h3>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    Nhấp vào thanh bất kỳ để áp dụng Slicer lọc trực tiếp cho toàn dashboard
                  </div>
                </div>

                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, backgroundColor: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '4px' }}>
                  {categoryList.length} SUBFIELDS
                </span>
              </div>

              {/* Clustered Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {categoryList.map((cat) => {
                  const isSelected = selectedCategory === cat.category;
                  const isHighestMath = cat.category === 'cs.LG';
                  const maxCount = 2380;
                  const barWidth = Math.max(8, (cat.count / maxCount) * 100);

                  return (
                    <div
                      key={cat.category}
                      onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat.category)}
                      style={{
                        cursor: 'pointer',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                        border: isSelected ? '1px solid #bfdbfe' : '1px solid transparent',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 800, color: isSelected ? '#1d4ed8' : '#0f172a' }}>{cat.category}</span>
                          {isHighestMath && (
                            <span style={{ fontSize: '9px', backgroundColor: '#fef3c7', color: '#d97706', padding: '1px 5px', borderRadius: '3px', fontWeight: 800 }}>
                              TOP MATH
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '12px', color: '#475569' }}>
                          <span><strong>{cat.count.toLocaleString()}</strong> bài ({cat.percentage.toFixed(1)}%)</span>
                          <span style={{ color: '#ea580c', fontWeight: 700 }}>{cat.total_math_formulas.toLocaleString()} eq</span>
                        </div>
                      </div>

                      {/* Visual Bar with Dual Gradient Indicator */}
                      <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${barWidth}%`,
                            borderRadius: '4px',
                            backgroundColor: cat.category.startsWith('cs.LG')
                              ? '#2563eb'
                              : cat.category.startsWith('cs.CV')
                              ? '#0284c7'
                              : cat.category.startsWith('cs.CL')
                              ? '#0d9488'
                              : cat.category.startsWith('cs.RO')
                              ? '#f59e0b'
                              : '#7c3aed',
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Visual 2: Temporal Growth Velocity Area Chart */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  XU HƯỚNG TĂNG TRƯỞNG THEO THỜI GIAN (2005 - 2024)
                </h3>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  Sự bùng nổ nghiên cứu AI/DS từ 2020 đến đỉnh điểm quý 1/2024
                </div>

                {/* Key Temporal Highlights */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' }}>
                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>ĐỈNH ĐIỂM THÁNG 1/2024</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                      5,021 bài
                    </div>
                    <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700, marginTop: '2px' }}>
                      50.2% toàn bộ Lakehouse
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>THÁNG 2/2024</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#7c3aed', marginTop: '2px' }}>
                      3,797 bài
                    </div>
                    <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700, marginTop: '2px' }}>
                      38.0% toàn bộ Lakehouse
                    </div>
                  </div>
                </div>

                {/* Simulated Growth Bars */}
                <div style={{ marginTop: '20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#475569', marginBottom: '10px' }}>
                    TỐC ĐỘ GIA TĂNG BẢN GHI (GROWTH TIMELINE)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', height: '110px', gap: '8px', paddingBottom: '18px', borderBottom: '1px solid #e2e8f0' }}>
                    {[
                      { year: '2015', count: 6, height: 8 },
                      { year: '2018', count: 6, height: 8 },
                      { year: '2020', count: 18, height: 14 },
                      { year: '2021', count: 48, height: 22 },
                      { year: '2022', count: 116, height: 35 },
                      { year: '2023', count: 994, height: 60 },
                      { year: '2024', count: 8818, height: 100 },
                    ].map((t) => (
                      <div key={t.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: t.year === '2024' ? '#2563eb' : '#64748b', fontWeight: t.year === '2024' ? 800 : 600, marginBottom: '4px' }}>
                          {t.count > 1000 ? `${(t.count / 1000).toFixed(1)}k` : t.count}
                        </span>
                        <div
                          style={{
                            width: '100%',
                            height: `${t.height}%`,
                            borderRadius: '4px 4px 0 0',
                            backgroundColor: t.year === '2024' ? '#2563eb' : t.year === '2023' ? '#60a5fa' : '#cbd5e1',
                          }}
                        />
                        <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#475569', marginTop: '6px', fontWeight: 700 }}>
                          {t.year}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section Completeness Quality Gauge */}
              <div style={{ marginTop: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#0f172a' }}>
                    TỶ LỆ HOÀN THIỆN MỤC HỌC THUẬT (AR5IV HTML5)
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                    90.2% FULL-TEXT
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#475569' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Abstract &amp; Title:</span>
                    <span style={{ fontWeight: 700, color: '#059669' }}>100.0% (10,000 / 10,000)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Introduction &amp; Background:</span>
                    <span style={{ fontWeight: 700, color: '#059669' }}>98.4% (9,840 / 10,000)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Methods &amp; Mathematical Proofs:</span>
                    <span style={{ fontWeight: 700, color: '#2563eb' }}>91.2% (9,120 / 10,000)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Results, Discussion &amp; Conclusion:</span>
                    <span style={{ fontWeight: 700, color: '#2563eb' }}>88.7% (8,870 / 10,000)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. SUB-VIEW 2: DEEP-DIVE TOÁN & VĂN BẢN (LATEX & CONTENT)       */}
      {/* ============================================================== */}
      {activeSubView === 'math_deep' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Quantile Distribution Cards */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '20px',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  PHÂN VỊ TOÁN HỌC &amp; DUNG LƯỢNG VĂN BẢN (QUANTILE BOX PLOT)
                </h3>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  Phân tích hàm mật độ xác suất cho số lượng công thức toán và độ dài từ
                </div>
              </div>

              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, backgroundColor: '#fef3c7', color: '#d97706', padding: '3px 8px', borderRadius: '4px' }}>
                MAX: 3,412 FORMULAS
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
              {[
                { label: 'P25 (QUARTILE 1)', math: math_and_content_stats.math_quantiles.p25, words: math_and_content_stats.word_quantiles.p25, desc: '25% bài báo có dưới mức này' },
                { label: 'P50 (MEDIAN)', math: math_and_content_stats.math_quantiles.median, words: math_and_content_stats.word_quantiles.median, desc: 'Điểm trung vị tập dữ liệu' },
                { label: 'P75 (QUARTILE 3)', math: math_and_content_stats.math_quantiles.p75, words: math_and_content_stats.word_quantiles.p75, desc: '75% bài báo có dưới mức này' },
                { label: 'P95 (DENSE MATH)', math: math_and_content_stats.math_quantiles.p95, words: math_and_content_stats.word_quantiles.p95, desc: 'Mật độ công thức cực cao' },
                { label: 'MAX (OUTLIER)', math: math_and_content_stats.math_quantiles.max, words: math_and_content_stats.word_quantiles.max, desc: 'Kỷ lục công thức cao nhất' },
              ].map((q, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#64748b' }}>
                      {q.label}
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#ea580c', marginTop: '6px' }}>
                      {q.math.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                      công thức toán
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#2563eb' }}>
                      {q.words.toLocaleString()} từ
                    </div>
                    <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>
                      {q.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2D Quadrant Matrix: Word Count vs Math Density */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                MA TRẬN 4 GÓC PHẦN TƯ (QUADRANT MATRIX): TOÁN HỌC vs. VĂN BẢN
              </h3>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)', marginBottom: '16px' }}>
                Phân loại cấu trúc học thuật theo mức độ trừu tượng lý thuyết và chiều sâu văn bản
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {/* Quadrant 1 */}
                <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', fontFamily: 'var(--font-mono)' }}>
                    QUADRANT I: HEAVY THEORETICAL PROOFS
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#78350f', marginTop: '4px' }}>
                    Toán dày đặc (&gt; 350 eq) &bull; Văn bản súc tích (&lt; 5k từ)
                  </div>
                  <p style={{ fontSize: '11px', color: '#92400e', marginTop: '6px', lineHeight: 1.45, margin: '6px 0 0 0' }}>
                    Đặc trưng của chuyên ngành <strong>stat.ML</strong> và lý thuyết tối ưu hóa <strong>cs.LG</strong>. Tập trung vào định lý, bổ đề và chứng minh hội tụ.
                  </p>
                </div>

                {/* Quadrant 2 */}
                <div style={{ backgroundColor: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#1d4ed8', fontFamily: 'var(--font-mono)' }}>
                    QUADRANT II: FOUNDATIONAL MONOGRAPHS
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', marginTop: '4px' }}>
                    Toán nhiều (&gt; 300 eq) &bull; Văn bản dài (&gt; 8k từ)
                  </div>
                  <p style={{ fontSize: '11px', color: '#1e3a8a', marginTop: '6px', lineHeight: 1.45, margin: '6px 0 0 0' }}>
                    Các công trình nền tảng, báo cáo kiến trúc lớn (Foundational Models, Multi-modal Transformers).
                  </p>
                </div>

                {/* Quadrant 3 */}
                <div style={{ backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', fontFamily: 'var(--font-mono)' }}>
                    QUADRANT III: SHORT COMMUNICATIONS
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginTop: '4px' }}>
                    Toán ít (&lt; 100 eq) &bull; Văn bản ngắn (&lt; 4k từ)
                  </div>
                  <p style={{ fontSize: '11px', color: '#475569', marginTop: '6px', lineHeight: 1.45, margin: '6px 0 0 0' }}>
                    Các bài báo vị thế (Position papers), bài báo hội thảo (Workshop notes) và đề xuất ý tưởng ban đầu.
                  </p>
                </div>

                {/* Quadrant 4 */}
                <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#047857', fontFamily: 'var(--font-mono)' }}>
                    QUADRANT IV: EMPIRICAL BENCHMARKS &amp; LLMS
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#065f46', marginTop: '4px' }}>
                    Toán vừa (&lt; 150 eq) &bull; Văn bản dài (&gt; 7k từ)
                  </div>
                  <p style={{ fontSize: '11px', color: '#064e3b', marginTop: '6px', lineHeight: 1.45, margin: '6px 0 0 0' }}>
                    Nghiên cứu thực nghiệm <strong>cs.CL / NLP</strong> và hệ thống <strong>cs.CV</strong>: Bảng biểu benchmark chi tiết, đánh giá ablation study.
                  </p>
                </div>
              </div>
            </div>

            {/* Ranking of Math Rigor by Category */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                XẾP HẠNG MẬT ĐỘ TOÁN THEO CHUYÊN NGÀNH
              </h3>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)', marginBottom: '14px' }}>
                Số lượng công thức toán trung bình trên mỗi bài báo
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[...categoryList]
                  .sort((a, b) => b.total_math_formulas / b.count - a.total_math_formulas / a.count)
                  .map((c, idx) => {
                    const avg = c.total_math_formulas / c.count;
                    return (
                      <div
                        key={c.category}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          backgroundColor: idx === 0 ? '#fffbeb' : '#f8fafc',
                          border: idx === 0 ? '1px solid #fde68a' : '1px solid #e2e8f0',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, color: idx < 3 ? '#d97706' : '#64748b' }}>
                            #{idx + 1}
                          </span>
                          <span style={{ fontWeight: 800, color: '#0f172a' }}>{c.category}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, color: '#ea580c' }}>{avg.toFixed(1)}</span>
                          <span style={{ color: '#94a3b8', fontSize: '10px' }}>eq/paper</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. SUB-VIEW 3: LIÊN NGÀNH & TÁC GIẢ (NETWORK & CO-OCCURRENCE)   */}
      {/* ============================================================== */}
      {activeSubView === 'network' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '20px' }}>
            {/* Visual C1: Interdisciplinary Co-Occurrence Matrix Heatmap */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    MA TRẬN GIAO THOA LIÊN NGÀNH (CROSS-DISCIPLINARY CO-OCCURRENCE)
                  </h3>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    Cường độ hợp tác và điểm giao thoa giữa các phân mảng AI/DS
                  </div>
                </div>

                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, backgroundColor: '#ede9fe', color: '#7c3aed', padding: '3px 8px', borderRadius: '4px' }}>
                  HEATMAP MATRIX
                </span>
              </div>

              {/* Heatmap Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                {category_cooccurrence.slice(0, 16).map((pair) => {
                  const isTopPair = pair.cooccurrence_count > 300;
                  return (
                    <div
                      key={`${pair.category_a}-${pair.category_b}`}
                      style={{
                        backgroundColor: isTopPair ? '#f5f3ff' : '#f8fafc',
                        border: isTopPair ? '1px solid #ddd6fe' : '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                          <span style={{ fontWeight: 800, color: '#7c3aed' }}>{pair.category_a}</span>
                          <span style={{ color: '#94a3b8' }}>&times;</span>
                          <span style={{ fontWeight: 800, color: '#2563eb' }}>{pair.category_b}</span>
                        </div>

                        <span
                          style={{
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            backgroundColor: isTopPair ? '#7c3aed' : '#e2e8f0',
                            color: isTopPair ? '#ffffff' : '#334155',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {pair.cooccurrence_count}
                        </span>
                      </div>

                      <div style={{ width: '100%', height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(100, (pair.cooccurrence_count / 542) * 100)}%`,
                            backgroundColor: isTopPair ? '#7c3aed' : '#60a5fa',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Visual C2: Top Prolific Researchers Leaderboard */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '20px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    BẢNG XẾP HẠNG TÁC GIẢ NĂNG SUẤT CAO
                  </h3>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    Top 10 tác giả có số lượng bài báo lớn nhất trong tập 10k Parquet
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {top_authors.slice(0, 10).map((author, idx) => (
                  <div
                    key={author.author}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: idx < 3 ? '#eff6ff' : '#f8fafc',
                      border: idx < 3 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          backgroundColor: idx === 0 ? '#ef4444' : idx === 1 ? '#f59e0b' : idx === 2 ? '#2563eb' : '#cbd5e1',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '9px',
                          fontWeight: 800,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{author.author}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 800, color: '#2563eb' }}>{author.paper_count}</span>
                      <span style={{ color: '#94a3b8', fontSize: '10px' }}>papers</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 6. SUB-VIEW 4: PARQUET DATA GRID (Bảng dữ liệu kiểu PowerBI)   */}
      {/* ============================================================== */}
      {activeSubView === 'table' && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Table Header Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                BẢNG DỮ LIỆU BÀI BÁO KHOA HỌC (PARQUET COLUMNAR DATA GRID)
              </h3>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                Hiển thị {filteredTableRows.length} bản ghi phù hợp với các bộ lọc Slicer
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                Sắp xếp theo:
              </span>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as any)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: '#ffffff',
                }}
              >
                <option value="formulas">Công thức toán</option>
                <option value="words">Độ dài từ vựng</option>
                <option value="date">Ngày xuất bản</option>
                <option value="category">Chuyên ngành</option>
              </select>

              <button
                type="button"
                onClick={() => setSortAsc((v) => !v)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  backgroundColor: '#f8fafc',
                  cursor: 'pointer',
                }}
              >
                {sortAsc ? '▲ Tăng dần' : '▼ Giảm dần'}
              </button>
            </div>
          </div>

          {/* Table Content */}
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '10px 12px' }}>ARXIV ID</th>
                  <th style={{ padding: '10px 12px' }}>TIÊU ĐỀ NGHIÊN CỨU</th>
                  <th style={{ padding: '10px 12px' }}>CHUYÊN NGÀNH</th>
                  <th style={{ padding: '10px 12px' }}>TÁC GIẢ CHÍNH</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>MATH EQUATIONS</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>WORDS</th>
                  <th style={{ padding: '10px 12px' }}>NGÀY</th>
                  <th style={{ padding: '10px 12px' }}>HTML5</th>
                </tr>
              </thead>
              <tbody>
                {filteredTableRows.slice((currentPage - 1) * 10, currentPage * 10).map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: '#2563eb' }}>
                      {row.id}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: 600, maxWidth: '320px' }}>
                      {row.title}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 800,
                          backgroundColor: row.category.startsWith('cs.LG')
                            ? '#dbeafe'
                            : row.category.startsWith('cs.CV')
                            ? '#e0f2fe'
                            : '#ede9fe',
                          color: row.category.startsWith('cs.LG')
                            ? '#1d4ed8'
                            : row.category.startsWith('cs.CV')
                            ? '#0369a1'
                            : '#6d28d9',
                        }}
                      >
                        {row.category}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>
                      {row.author}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#ea580c' }}>
                      {row.formulas}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#334155' }}>
                      {row.words.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>
                      {row.date}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 800, backgroundColor: '#ecfdf5', color: '#059669', padding: '2px 6px', borderRadius: '4px' }}>
                        ✓ ENRICHED
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#64748b' }}>
              Trang {currentPage} / {Math.ceil(filteredTableRows.length / 10) || 1} &bull; Tổng {filteredTableRows.length} bài
            </span>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: currentPage <= 1 ? '#f8fafc' : '#ffffff',
                  color: currentPage <= 1 ? '#94a3b8' : '#334155',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                }}
              >
                &larr; Trang trước
              </button>

              <button
                type="button"
                disabled={currentPage * 10 >= filteredTableRows.length}
                onClick={() => setCurrentPage((p) => p + 1)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: currentPage * 10 >= filteredTableRows.length ? '#f8fafc' : '#ffffff',
                  color: currentPage * 10 >= filteredTableRows.length ? '#94a3b8' : '#334155',
                  cursor: currentPage * 10 >= filteredTableRows.length ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                }}
              >
                Trang kế tiếp &rarr;
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
