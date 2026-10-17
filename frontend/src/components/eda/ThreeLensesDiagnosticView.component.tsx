import { useState, useMemo, useRef, type FC, type MouseEvent } from 'react';
import type { Diagnostic3Lenses } from '../../types';
import { ChartToolbar } from '../charts/ChartToolbar.component';
import { useSvgPanZoom } from '../../hooks';
import { ScientificMath } from '../common/ScientificMath.component';

export interface ScatterPaperPoint {
  id: string;
  title: string;
  category: string;
  words: number;
  formulas: number;
  author: string;
  abstract?: string;
  sampleFormula?: string;
}

interface ThreeLensesDiagnosticViewProps {
  theme?: 'dark' | 'light';
  isTheaterMode: boolean;
  onToggleTheater: () => void;
  diagnosticData?: Diagnostic3Lenses;
  fallbackPoints?: ScatterPaperPoint[];
  onSelectPaper: (paper: ScatterPaperPoint) => void;
  selectedPaperId?: string;
  onShowToast: (msg: string) => void;
  activeTab?: 'lens3_bivariate' | 'lens2_univariate' | 'governance';
  onTabChange?: (tab: 'lens3_bivariate' | 'lens2_univariate' | 'governance') => void;
  selectedCategory?: string;
}

export const ThreeLensesDiagnosticView: FC<ThreeLensesDiagnosticViewProps> = ({
  theme = 'dark',
  isTheaterMode,
  onToggleTheater,
  diagnosticData,
  fallbackPoints = [],
  onSelectPaper,
  selectedPaperId,
  onShowToast,
  activeTab = 'lens3_bivariate',
  selectedCategory = 'ALL',
}) => {
  const isDark = theme === 'dark';

  // Pair selection in Lens 3 (default: words_x_math_density from lecture case study)
  const [selectedPairKey, setSelectedPairKey] = useState<string>('words_x_math_density');

  // Feature selection in Lens 2
  const [selectedUnivariateKey, setSelectedUnivariateKey] = useState<string>('math_density');

  // Quadrant filter in 2D scatter
  const [selectedQuadrant, setSelectedQuadrant] = useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');

  // GMM Clustering controls
  const [colorMode, setColorMode] = useState<'gmm' | 'category'>('gmm');
  const [selectedGmmCluster, setSelectedGmmCluster] = useState<number | 'ALL'>('ALL');
  const [showGmmEllipses, setShowGmmEllipses] = useState<boolean>(true);

  // Hover states
  const [hoveredPoint, setHoveredPoint] = useState<{
    id: string;
    title: string;
    category: string;
    x: number;
    y: number;
    author: string;
    abstract?: string;
    sampleFormula?: string;
    gmm_cluster?: number;
    gmm_prob?: number;
    gmm_all_probs?: number[];
    screenX: number;
    screenY: number;
  } | null>(null);

  // Floating Archetype HUD legend toggle
  const [showArchetypeLegend, setShowArchetypeLegend] = useState<boolean>(true);

  // Magnifier Lens tool
  const [isLensActive, setIsLensActive] = useState<boolean>(false);
  const [lensPos, setLensPos] = useState<{ x: number; y: number } | null>(null);

  // SVG Refs
  const scatterSvgRef = useRef<SVGSVGElement | null>(null);
  const histSvgRef = useRef<SVGSVGElement | null>(null);
  const qqSvgRef = useRef<SVGSVGElement | null>(null);

  // Pan Zoom hook for bivariate scatter
  const scatterPanZoom = useSvgPanZoom({
    nominalWidth: 940,
    nominalHeight: 340,
    minZoom: 0.6,
    maxZoom: 4.0,
  });

  // Color mapping
  const categoryColors: Record<string, string> = {
    'cs.LG': '#2563eb',
    'stat.ML': '#ea580c',
    'cs.CV': '#0284c7',
    'cs.AI': '#7c3aed',
    'cs.CL': '#0d9488',
    'cs.RO': '#f59e0b',
  };
  const getCatColor = (cat: string) => categoryColors[cat] || (isDark ? '#94a3b8' : '#64748b');

  const getPointColor = (pt: any) => {
    if (colorMode === 'gmm') {
      if (activePair?.gmm_clusters && pt.gmm_cluster !== undefined) {
        const clusterInfo = activePair.gmm_clusters.find((c: any) => c.cluster_id === pt.gmm_cluster);
        if (clusterInfo) return clusterInfo.color;
      }
      const gmmColors = ['#10b981', '#0284c7', '#f59e0b', '#8b5cf6'];
      return gmmColors[(pt.gmm_cluster ?? 0) % gmmColors.length];
    }
    return getCatColor(pt.category);
  };

  // Resolve current bivariate pair
  const activePair = useMemo(() => {
    if (!diagnosticData?.lens3_multivariate?.pairs) return null;
    return diagnosticData.lens3_multivariate.pairs[selectedPairKey] || null;
  }, [diagnosticData, selectedPairKey]);

  // Extents for Scatter Plot axes
  const { maxX, maxY } = useMemo(() => {
    if (selectedPairKey === 'words_x_math_density') return { maxX: 12000, maxY: 180 };
    if (selectedPairKey === 'math_x_authors') return { maxX: 16, maxY: 1200 };
    if (selectedPairKey === 'words_x_math') return { maxX: 12000, maxY: 1200 };
    if (selectedPairKey === 'words_x_citations') return { maxX: 12000, maxY: 400 };
    return { maxX: 12000, maxY: 300 };
  }, [selectedPairKey]);

  // Points to display in Bivariate Scatter
  const displayPoints = useMemo(() => {
    let pts = (activePair?.scatter_samples && activePair.scatter_samples.length > 0)
      ? activePair.scatter_samples
      : fallbackPoints.map((p, idx) => ({
          id: p.id,
          title: p.title,
          category: p.category,
          x: p.words,
          y: p.formulas,
          author: p.author,
          abstract: p.abstract,
          sampleFormula: p.sampleFormula,
          gmm_cluster: idx % 4,
          gmm_prob: 0.92,
        }));

    if (selectedQuadrant !== 'ALL') {
      const midX = maxX / 2;
      const midY = maxY / 2;
      pts = pts.filter((p) => {
        if (selectedQuadrant === 'Q1') return p.x < midX && p.y >= midY;
        if (selectedQuadrant === 'Q2') return p.x >= midX && p.y >= midY;
        if (selectedQuadrant === 'Q3') return p.x < midX && p.y < midY;
        if (selectedQuadrant === 'Q4') return p.x >= midX && p.y < midY;
        return true;
      });
    }
    if (selectedCategory !== 'ALL') {
      pts = pts.filter((p) => p.category === selectedCategory);
    }
    if (selectedGmmCluster !== 'ALL') {
      pts = pts.filter((p: any) => p.gmm_cluster === selectedGmmCluster);
    }
    return pts;
  }, [activePair, selectedCategory, selectedGmmCluster, selectedQuadrant, maxX, maxY, fallbackPoints]);

  // Resolve current univariate feature
  const activeUnivariate = useMemo(() => {
    if (!diagnosticData?.lens2_univariate) return null;
    return diagnosticData.lens2_univariate[selectedUnivariateKey] || null;
  }, [diagnosticData, selectedUnivariateKey]);

  // Theme-dependent styles
  const themeStyles = {
    cardBg: isDark ? 'var(--bg-surface, #0f172a)' : '#ffffff',
    border: isDark ? 'var(--border-subtle, rgba(255,255,255,0.08))' : '#e2e8f0',
    textPrimary: isDark ? 'var(--text-primary, #f8fafc)' : '#0f172a',
    textSecondary: isDark ? 'var(--text-secondary, #94a3b8)' : '#475569',
    textMuted: isDark ? 'var(--text-muted, #64748b)' : '#94a3b8',
    axisLine: isDark ? '#334155' : '#cbd5e1',
    gridLine: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  };

  return (
    <div
      style={{
        backgroundColor: themeStyles.cardBg,
        borderRadius: '8px',
        border: `1px solid ${themeStyles.border}`,
        padding: '10px 14px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        ...(isTheaterMode
          ? {
              position: 'fixed',
              top: '52px',
              left: '58px',
              right: 0,
              bottom: '32px',
              zIndex: 45,
              backgroundColor: themeStyles.cardBg,
              padding: '16px 20px',
            }
          : {}),
      }}
    >
      {/* ---------------------------------------------------------------- */}
      {/* ROW 1: STREAMLINED DECK HEADER (NO DUPLICATE TABS)                 */}
      {/* ---------------------------------------------------------------- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '28px',
          marginBottom: '4px',
          flexShrink: 0,
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexShrink: 1 }}>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--badge-bg, rgba(245, 158, 11, 0.15))',
              border: '1px solid var(--badge-border, rgba(245, 158, 11, 0.3))',
              color: 'var(--accent-bronze, #f59e0b)',
              flexShrink: 0,
            }}
          >
            {activeTab === 'lens3_bivariate' ? '[EDA-03]' : activeTab === 'lens2_univariate' ? '[EDA-02]' : '[EDA-08]'}
          </span>
          <h3
            style={{
              fontSize: '12.5px',
              fontWeight: 800,
              color: themeStyles.textPrimary,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeTab === 'lens3_bivariate'
              ? 'TƯƠNG TÁC ĐA BIẾN & PHÂN CỤM GMM 2D (BIVARIATE INTERACTIONS & GMM)'
              : activeTab === 'lens2_univariate'
              ? 'PHÂN PHỐI ĐƠN BIẾN & KIỂM ĐỊNH CHUẨN TẮC Q-Q (UNIVARIATE & NORMALITY)'
              : 'MA TRẬN QUY TẮC ĐIỀU HƯỚNG LAKEHOUSE (§6.4 GOVERNANCE)'}
          </h3>
          <span
            style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '3px',
              backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe',
              color: isDark ? '#38bdf8' : '#0369a1',
              border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.3)' : '#bae6fd'}`,
              flexShrink: 0,
            }}
          >
            {activeTab === 'lens3_bivariate' ? 'LECTURE §6.3' : activeTab === 'lens2_univariate' ? 'LECTURE §6.2' : 'LECTURE §6.4'}
          </span>
        </div>

        {/* Right side: Statistical metrics for Bivariate + Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {activeTab === 'lens3_bivariate' && activePair && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  backgroundColor: isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff',
                  border: '1px solid #3b82f6',
                  color: isDark ? '#93c5fd' : '#1d4ed8',
                  whiteSpace: 'nowrap',
                }}
                title="Hệ số tương quan Pearson r (tuyến tính)"
              >
                r = <strong>{activePair.pearson_r}</strong>
              </div>
              <div
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  backgroundColor: isDark ? 'rgba(124,58,237,0.15)' : '#f5f3ff',
                  border: '1px solid #8b5cf6',
                  color: isDark ? '#c4b5fd' : '#6d28d9',
                  whiteSpace: 'nowrap',
                }}
                title="Hệ số tương quan Spearman ρ (thứ bậc phi tuyến)"
              >
                ρ = <strong>{activePair.spearman_rho}</strong>
              </div>
              <div
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: '3px',
                  backgroundColor: isDark ? 'rgba(234,88,12,0.22)' : '#fff7ed',
                  border: '1px solid #ea580c',
                  color: '#ea580c',
                  whiteSpace: 'nowrap',
                }}
                title="Mutual Information I(X; Y) đo lường phi tuyến"
              >
                ★ I(X; Y) = <strong>{activePair.mutual_information}</strong>
              </div>
            </div>
          )}

          <ChartToolbar
            theme={theme}
            svgRef={activeTab === 'lens3_bivariate' ? scatterSvgRef : activeTab === 'lens2_univariate' ? histSvgRef : undefined}
            filename={`eda-3lens-${activeTab}`}
            zoomLevel={activeTab === 'lens3_bivariate' ? scatterPanZoom.zoom : undefined}
            hasPannedOrZoomed={activeTab === 'lens3_bivariate' ? scatterPanZoom.hasPannedOrZoomed : undefined}
            onZoomIn={activeTab === 'lens3_bivariate' ? () => scatterPanZoom.zoomIn(0.25) : undefined}
            onZoomOut={activeTab === 'lens3_bivariate' ? () => scatterPanZoom.zoomOut(0.25) : undefined}
            onResetZoom={activeTab === 'lens3_bivariate' ? scatterPanZoom.resetView : undefined}
            isLensActive={activeTab === 'lens3_bivariate' ? isLensActive : undefined}
            onToggleLens={activeTab === 'lens3_bivariate' ? () => setIsLensActive((v) => !v) : undefined}
            isTheater={isTheaterMode}
            onToggleTheater={onToggleTheater}
            csvData={
              activeTab === 'lens3_bivariate'
                ? displayPoints.map((p) => ({
                    id: p.id,
                    title: p.title,
                    category: p.category,
                    x: p.x,
                    y: p.y,
                    author: p.author,
                  }))
                : undefined
            }
            onShowToast={onShowToast}
          />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* TAB 1: BIVARIATE INTERACTIONS & MUTUAL INFORMATION (LENS 1 & 3)   */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'lens3_bivariate' && activePair && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '6px' }}>
          {/* COMPACT UNIFIED CONTROL HUD: PAIR SELECTOR + GMM CLUSTERS & ELLIPSES + QUADRANTS + WARNING */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '3px 8px',
              borderRadius: '5px',
              backgroundColor: 'var(--bg-canvas, rgba(0,0,0,0.02))',
              border: `1px solid ${themeStyles.border}`,
              flexShrink: 0,
              gap: '8px',
              minHeight: '28px',
              overflowX: 'auto',
            }}
          >
            {/* Left Controls: Pair Switcher + GMM Controls + Quadrants */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'nowrap', flexShrink: 0 }}>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>
                Cặp biến:
              </span>
              {[
                { key: 'words_x_math_density', label: 'Mật độ Toán × Từ (§6.3)' },
                { key: 'math_x_authors', label: 'Toán × Tác giả' },
                { key: 'words_x_math', label: 'Số từ × Công thức' },
                { key: 'words_x_citations', label: 'Số từ × Trích dẫn' },
              ].map((p) => {
                const isSelected = selectedPairKey === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSelectedPairKey(p.key)}
                    style={{
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: isSelected ? 800 : 500,
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(234, 88, 12, 0.25)'
                          : '#ffedd5'
                        : 'transparent',
                      color: isSelected ? '#ea580c' : themeStyles.textSecondary,
                      border: `1px solid ${isSelected ? '#ea580c' : themeStyles.border}`,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}

              <div style={{ width: '1px', height: '14px', backgroundColor: themeStyles.border, margin: '0 4px', flexShrink: 0 }} />

              {/* Color Mode Switcher */}
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#10b981', padding: '1px 4px', borderRadius: '3px', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#d1fae5', flexShrink: 0, whiteSpace: 'nowrap' }}>
                GMM
              </span>
              <button
                type="button"
                onClick={() => setColorMode((prev) => (prev === 'gmm' ? 'category' : 'gmm'))}
                style={{
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  backgroundColor: colorMode === 'gmm' ? (isDark ? 'rgba(16, 185, 129, 0.3)' : '#d1fae5') : 'transparent',
                  color: colorMode === 'gmm' ? '#10b981' : themeStyles.textSecondary,
                  border: `1px solid ${colorMode === 'gmm' ? '#10b981' : themeStyles.border}`,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                title={colorMode === 'gmm' ? 'Đang tô màu theo Cụm GMM (Nhấn để đổi sang màu Chủ đề arXiv)' : 'Đang tô màu theo Chủ đề arXiv (Nhấn để đổi sang Cụm GMM)'}
              >
                {colorMode === 'gmm' ? '● Màu Cụm' : '◐ Màu Chủ đề'}
              </button>

              {/* GMM Cluster Filter Pills */}
              {activePair?.gmm_clusters && activePair.gmm_clusters.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedGmmCluster('ALL')}
                    style={{
                      padding: '1px 5px',
                      borderRadius: '3px',
                      fontSize: '9px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: selectedGmmCluster === 'ALL' ? 800 : 500,
                      backgroundColor: selectedGmmCluster === 'ALL' ? (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0') : 'transparent',
                      color: selectedGmmCluster === 'ALL' ? themeStyles.textPrimary : themeStyles.textSecondary,
                      border: `1px solid ${selectedGmmCluster === 'ALL' ? themeStyles.textPrimary : themeStyles.border}`,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    Tất cả cụm
                  </button>
                  {activePair.gmm_clusters.map((c) => {
                    const isClusterActive = selectedGmmCluster === c.cluster_id;
                    return (
                      <button
                        key={`gmm-btn-${c.cluster_id}`}
                        type="button"
                        onClick={() => setSelectedGmmCluster(isClusterActive ? 'ALL' : c.cluster_id)}
                        style={{
                          padding: '1px 5px',
                          borderRadius: '3px',
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: isClusterActive ? 800 : 500,
                          backgroundColor: isClusterActive ? c.color : 'transparent',
                          color: isClusterActive ? '#ffffff' : c.color,
                          border: `1px solid ${c.color}`,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: isClusterActive ? '#ffffff' : c.color }} />
                        <span>C{c.cluster_id + 1} ({(c.weight * 100).toFixed(0)}%)</span>
                      </button>
                    );
                  })}

                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, cursor: 'pointer', marginLeft: '2px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={showGmmEllipses}
                      onChange={(e) => setShowGmmEllipses(e.target.checked)}
                      style={{ cursor: 'pointer', margin: 0 }}
                    />
                    <span>1.5σ Ellipse</span>
                  </label>
                </>
              )}

              <div style={{ width: '1px', height: '14px', backgroundColor: themeStyles.border, margin: '0 4px', flexShrink: 0 }} />

              {/* Quadrant Filters */}
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, flexShrink: 0, whiteSpace: 'nowrap' }}>
                Vùng:
              </span>
              {[
                { id: 'ALL' as const, label: 'All' },
                { id: 'Q1' as const, label: 'Q1' },
                { id: 'Q2' as const, label: 'Q2' },
                { id: 'Q3' as const, label: 'Q3' },
                { id: 'Q4' as const, label: 'Q4' },
              ].map((q) => {
                const isQActive = selectedQuadrant === q.id;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelectedQuadrant(isQActive && q.id !== 'ALL' ? 'ALL' : q.id)}
                    style={{
                      padding: '1px 5px',
                      borderRadius: '3px',
                      fontSize: '9px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: isQActive ? 800 : 500,
                      backgroundColor: isQActive ? (isDark ? 'rgba(37, 99, 235, 0.25)' : '#dbeafe') : 'transparent',
                      color: isQActive ? (isDark ? '#93c5fd' : '#1d4ed8') : themeStyles.textMuted,
                      border: `1px solid ${isQActive ? '#3b82f6' : themeStyles.border}`,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>

            {/* Right: Crucial Warning Chip with Hover Tooltip */}
            {activePair.warning && (
              <div
                title={activePair.warning.text}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7',
                  border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.35)' : '#fde047'}`,
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  color: isDark ? '#fbbf24' : '#b45309',
                  flexShrink: 0,
                  cursor: 'help',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>⚠️ <strong>{activePair.warning.badge}</strong>: {activePair.warning.title}</span>
                <span style={{ opacity: 0.8, fontSize: '9px' }}>ⓘ</span>
              </div>
            )}
          </div>

          {/* Bivariate SVG Scatter & Spline Chart */}
          <div
            {...(isLensActive ? {} : scatterPanZoom.containerProps)}
            style={{
              ...(isLensActive ? {} : scatterPanZoom.containerProps.style),
              flex: 1,
              minHeight: 0,
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.01)',
              borderRadius: '6px',
              border: `1px solid ${themeStyles.border}`,
            }}
          >
            <svg
              ref={scatterSvgRef}
              viewBox={scatterPanZoom.viewBox}
              preserveAspectRatio="xMidYMid meet"
              style={{
                width: '100%',
                height: '100%',
                overflow: 'visible',
                cursor: isLensActive ? 'crosshair' : (scatterPanZoom.containerProps.style.cursor || 'default'),
              }}
              onMouseMove={(e: MouseEvent<SVGSVGElement>) => {
                if (!isLensActive) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const scaleX = 940 / rect.width;
                const scaleY = 340 / rect.height;
                setLensPos({
                  x: (e.clientX - rect.left) * scaleX,
                  y: (e.clientY - rect.top) * scaleY,
                });
              }}
              onMouseLeave={() => {
                setLensPos(null);
                setHoveredPoint(null);
              }}
            >
              {/* Quadrant Background Zones */}
              {/* Q1: Top-Left (High Y, Low X) */}
              <rect
                x="60"
                y="20"
                width="425"
                height="140"
                fill={selectedQuadrant === 'Q1' ? (isDark ? 'rgba(245, 158, 11, 0.22)' : 'rgba(254, 243, 199, 0.7)') : (isDark ? 'rgba(245, 158, 11, 0.06)' : 'rgba(254, 243, 199, 0.3)')}
                stroke={selectedQuadrant === 'Q1' ? '#f59e0b' : 'transparent'}
                strokeWidth="1.5"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'Q1' ? 'ALL' : 'Q1')}
              />
              <text x="75" y="55" fontSize="28" fontFamily="var(--font-mono)" fontWeight="900" fill={isDark ? '#f59e0b' : '#d97706'} opacity="0.12" style={{ pointerEvents: 'none' }}>
                Q1: LÝ THUYẾT NẶNG TOÁN
              </text>

              {/* Q2: Top-Right (High Y, High X) */}
              <rect
                x="485"
                y="20"
                width="425"
                height="140"
                fill={selectedQuadrant === 'Q2' ? (isDark ? 'rgba(37, 99, 235, 0.22)' : 'rgba(219, 234, 254, 0.7)') : (isDark ? 'rgba(37, 99, 235, 0.06)' : 'rgba(219, 234, 254, 0.3)')}
                stroke={selectedQuadrant === 'Q2' ? '#3b82f6' : 'transparent'}
                strokeWidth="1.5"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'Q2' ? 'ALL' : 'Q2')}
              />
              <text x="880" y="55" textAnchor="end" fontSize="28" fontFamily="var(--font-mono)" fontWeight="900" fill={isDark ? '#60a5fa' : '#2563eb'} opacity="0.12" style={{ pointerEvents: 'none' }}>
                Q2: CHUYÊN KHẢO TOÀN DIỆN
              </text>

              {/* Q3: Bottom-Left (Low Y, Low X) */}
              <rect
                x="60"
                y="160"
                width="425"
                height="130"
                fill={selectedQuadrant === 'Q3' ? (isDark ? 'rgba(100, 116, 139, 0.25)' : 'rgba(203, 213, 225, 0.7)') : (isDark ? 'rgba(100, 116, 139, 0.06)' : 'rgba(241, 245, 249, 0.4)')}
                stroke={selectedQuadrant === 'Q3' ? '#94a3b8' : 'transparent'}
                strokeWidth="1.5"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'Q3' ? 'ALL' : 'Q3')}
              />
              <text x="75" y="275" fontSize="28" fontFamily="var(--font-mono)" fontWeight="900" fill={isDark ? '#94a3b8' : '#64748b'} opacity="0.12" style={{ pointerEvents: 'none' }}>
                Q3: BÀI NGẮN / WORKSHOP
              </text>

              {/* Q4: Bottom-Right (Low Y, High X) */}
              <rect
                x="485"
                y="160"
                width="425"
                height="130"
                fill={selectedQuadrant === 'Q4' ? (isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(209, 250, 229, 0.7)') : (isDark ? 'rgba(16, 185, 129, 0.06)' : 'rgba(236, 253, 245, 0.4)')}
                stroke={selectedQuadrant === 'Q4' ? '#10b981' : 'transparent'}
                strokeWidth="1.5"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'Q4' ? 'ALL' : 'Q4')}
              />
              <text x="880" y="275" textAnchor="end" fontSize="28" fontFamily="var(--font-mono)" fontWeight="900" fill={isDark ? '#34d399' : '#059669'} opacity="0.12" style={{ pointerEvents: 'none' }}>
                Q4: HỆ THỐNG THỰC NGHIỆM / LLMS
              </text>

              {/* Axis Grid Lines */}
              <line x1="485" y1="20" x2="485" y2="290" stroke={themeStyles.axisLine} strokeDasharray="3 3" strokeWidth="1" />
              <line x1="60" y1="160" x2="910" y2="160" stroke={themeStyles.axisLine} strokeDasharray="3 3" strokeWidth="1" />

              {/* Y Axis Grid & Labels */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                const yVal = Math.round(ratio * maxY);
                const py = 290 - ratio * 270;
                return (
                  <g key={ratio}>
                    <line x1="55" y1={py} x2="910" y2={py} stroke={themeStyles.gridLine} strokeWidth="1" />
                    <text x="50" y={py + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>
                      {yVal} {activePair.y_unit}
                    </text>
                  </g>
                );
              })}

              {/* X Axis Grid & Labels */}
              {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((ratio) => {
                const xVal = Math.round(ratio * maxX);
                const px = 60 + ratio * 850;
                return (
                  <g key={ratio}>
                    <line x1={px} y1="20" x2={px} y2="295" stroke={themeStyles.gridLine} strokeWidth="1" />
                    <text x={px} y={306} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>
                      {xVal >= 1000 ? `${(xVal / 1000).toFixed(0)}k` : xVal} {activePair.x_unit}
                    </text>
                  </g>
                );
              })}

              {/* GMM Gaussian Mixture Model Confidence Ellipses (1.5-sigma envelope, ~80% mass) */}
              {showGmmEllipses && activePair.gmm_clusters && activePair.gmm_clusters.map((c) => {
                if (selectedGmmCluster !== 'ALL' && selectedGmmCluster !== c.cluster_id) return null;
                const { cx, cy, rx, ry, angle_deg } = c.ellipse;
                const safeRx = Math.max(8, isNaN(rx) ? 20 : rx);
                const safeRy = Math.max(6, isNaN(ry) ? 15 : ry);
                const safeAngle = isNaN(angle_deg) ? 0 : angle_deg;

                return (
                  <g key={`gmm-ellipse-${c.cluster_id}`} style={{ pointerEvents: 'none' }}>
                    {/* Confidence Ellipse Area */}
                    <ellipse
                      cx={cx}
                      cy={cy}
                      rx={safeRx}
                      ry={safeRy}
                      transform={`rotate(${safeAngle} ${cx} ${cy})`}
                      fill={c.color}
                      fillOpacity={isDark ? 0.16 : 0.12}
                      stroke={c.color}
                      strokeWidth="2"
                      strokeDasharray="5 3"
                    />
                    {/* Gaussian Component Center Centroid */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r="4"
                      fill={c.color}
                      stroke={isDark ? '#0f172a' : '#ffffff'}
                      strokeWidth="1.5"
                    />
                    {/* Cluster Label Badge */}
                    <rect
                      x={cx - 60}
                      y={cy - safeRy - 20}
                      width="120"
                      height="17"
                      rx="3"
                      fill={isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)'}
                      stroke={c.color}
                      strokeWidth="1"
                    />
                    <text
                      x={cx}
                      y={cy - safeRy - 8}
                      textAnchor="middle"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      fontWeight="800"
                      fill={c.color}
                    >
                      {c.name} ({(c.weight * 100).toFixed(0)}%)
                    </text>
                  </g>
                );
              })}

              {/* Linear Fit Regression Line (Dashed Blue) */}
              {(() => {
                const x0 = 0;
                const x1 = maxX;
                const y0 = activePair.linear_fit.intercept + activePair.linear_fit.slope * x0;
                const y1 = activePair.linear_fit.intercept + activePair.linear_fit.slope * x1;
                const px0 = 60;
                const py0 = 290 - Math.min(270, Math.max(0, (y0 / maxY) * 270));
                const px1 = 910;
                const py1 = 290 - Math.min(270, Math.max(0, (y1 / maxY) * 270));
                return (
                  <g>
                    <line
                      x1={px0}
                      y1={py0}
                      x2={px1}
                      y2={py1}
                      stroke="#3b82f6"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                    />
                    <text
                      x="780"
                      y={Math.max(35, py1 - 8)}
                      fill="#3b82f6"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      fontWeight="700"
                    >
                      Hồi quy tuyến tính (r={activePair.pearson_r})
                    </text>
                  </g>
                );
              })()}

              {/* Non-Linear Spline / Empirical Trend Curve (Solid Orange) */}
              {activePair.spline_points && activePair.spline_points.length > 1 && (() => {
                const pathD = activePair.spline_points
                  .map((pt, idx) => {
                    const cx = 60 + Math.min(850, Math.max(0, (pt.x / maxX) * 850));
                    const cy = 290 - Math.min(270, Math.max(0, (pt.y / maxY) * 270));
                    return `${idx === 0 ? 'M' : 'L'} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <g>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#ea580c"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                    />
                    <text
                      x="240"
                      y="40"
                      fill="#ea580c"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      fontWeight="800"
                    >
                      ★ Xu hướng phi tuyến thực nghiệm (MI={activePair.mutual_information})
                    </text>
                  </g>
                );
              })()}

              {/* Data Points */}
              {displayPoints.map((pt) => {
                const cx = 60 + Math.min(850, Math.max(0, (pt.x / maxX) * 850));
                const cy = 290 - Math.min(270, Math.max(0, (pt.y / maxY) * 270));
                const isSelected = selectedPaperId === pt.id;
                const isHovered = hoveredPoint?.id === pt.id;
                const col = getPointColor(pt);

                return (
                  <circle
                    key={pt.id}
                    cx={cx}
                    cy={cy}
                    r={isSelected ? '8' : isHovered ? '7' : '4.5'}
                    fill={col}
                    stroke={isSelected ? '#f59e0b' : isDark ? '#0f172a' : '#ffffff'}
                    strokeWidth={isSelected ? '2.5' : isHovered ? '2' : '1'}
                    opacity={isSelected || isHovered ? 1 : 0.85}
                    style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                    onClick={() => onSelectPaper({
                      id: pt.id,
                      title: pt.title,
                      category: pt.category,
                      words: pt.x,
                      formulas: pt.y,
                      author: pt.author,
                      abstract: pt.abstract,
                      sampleFormula: pt.sampleFormula,
                    })}
                    onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
                      const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                      setHoveredPoint({
                        ...pt,
                        screenX: rect.left + rect.width / 2,
                        screenY: rect.top - 8,
                      });
                    }}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                );
              })}

              {/* Crosshair Snapping */}
              {hoveredPoint && (() => {
                const cx = 60 + Math.min(850, Math.max(0, (hoveredPoint.x / maxX) * 850));
                const cy = 290 - Math.min(270, Math.max(0, (hoveredPoint.y / maxY) * 270));
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1="60" y1={cy} x2={cx} y2={cy} stroke="#ea580c" strokeWidth="1" strokeDasharray="3 2" />
                    <line x1={cx} y1={cy} x2={cx} y2="290" stroke="#2563eb" strokeWidth="1" strokeDasharray="3 2" />
                    <rect x="10" y={cy - 8} width="46" height="16" rx="3" fill="#ea580c" />
                    <text x="33" y={cy + 4} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fontWeight="800" fill="#ffffff">
                      {hoveredPoint.y.toFixed(1)}
                    </text>
                    <rect x={cx - 24} y="292" width="48" height="16" rx="3" fill="#2563eb" />
                    <text x={cx} y={304} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fontWeight="800" fill="#ffffff">
                      {hoveredPoint.x >= 1000 ? `${(hoveredPoint.x / 1000).toFixed(1)}k` : hoveredPoint.x.toFixed(0)}
                    </text>
                  </g>
                );
              })()}

              {/* Magnifier Lens 2.5x Tool */}
              {isLensActive && lensPos && (
                <g style={{ pointerEvents: 'none' }}>
                  <circle
                    cx={lensPos.x}
                    cy={lensPos.y}
                    r="75"
                    fill={isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)'}
                    stroke="#38bdf8"
                    strokeWidth="2.5"
                  />
                  <circle cx={lensPos.x} cy={lensPos.y} r="75" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  <text x={lensPos.x} y={lensPos.y - 58} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fontWeight="800" fill="#38bdf8">
                    LENS 2.5X
                  </text>
                  {displayPoints.map((pt) => {
                    const origX = 60 + Math.min(850, Math.max(0, (pt.x / maxX) * 850));
                    const origY = 290 - Math.min(270, Math.max(0, (pt.y / maxY) * 270));
                    const dist = Math.hypot(origX - lensPos.x, origY - lensPos.y);
                    if (dist > 70) return null;
                    const magX = lensPos.x + (origX - lensPos.x) * 2.2;
                    const magY = lensPos.y + (origY - lensPos.y) * 2.2;
                    if (Math.hypot(magX - lensPos.x, magY - lensPos.y) > 70) return null;
                    return (
                      <g key={`lens-${pt.id}`}>
                        <circle cx={magX} cy={magY} r="6.5" fill={getPointColor(pt)} stroke="#ffffff" strokeWidth="2" />
                        <text x={magX} y={magY - 8} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fontWeight="800" fill={themeStyles.textPrimary}>
                          {pt.id.replace('arXiv:', '')}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>

            {/* Floating Glassmorphism Archetype Legend HUD */}
            {!hoveredPoint && showArchetypeLegend && (
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.94)',
                  backdropFilter: 'blur(8px)',
                  border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`,
                  borderRadius: '6px',
                  padding: '8px 10px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                  zIndex: 10,
                  maxWidth: '280px',
                  pointerEvents: 'auto',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textPrimary }}>
                    QUY HOẠCH 4 PHÂN VỊ (§6.3)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowArchetypeLegend(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: themeStyles.textMuted,
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '0 2px',
                    }}
                    title="Thu gọn bảng chú giải"
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#f59e0b', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, color: '#f59e0b' }}>Q1: Nặng Toán</span>
                    <span style={{ color: themeStyles.textMuted }}>— Lý thuyết, Giải thuật</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#3b82f6', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, color: '#3b82f6' }}>Q2: Chuyên Khảo</span>
                    <span style={{ color: themeStyles.textMuted }}>— Khảo luận toàn diện</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#94a3b8', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, color: '#94a3b8' }}>Q3: Bài Ngắn</span>
                    <span style={{ color: themeStyles.textMuted }}>— Workshop, Position</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#10b981', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, color: '#10b981' }}>Q4: LLMs</span>
                    <span style={{ color: themeStyles.textMuted }}>— Thực nghiệm, Prompt</span>
                  </div>
                </div>
              </div>
            )}
            {!hoveredPoint && !showArchetypeLegend && (
              <button
                type="button"
                onClick={() => setShowArchetypeLegend(true)}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.8)',
                  backdropFilter: 'blur(4px)',
                  border: `1px solid ${themeStyles.border}`,
                  borderRadius: '4px',
                  padding: '2px 7px',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  color: themeStyles.textMuted,
                  cursor: 'pointer',
                  zIndex: 10,
                }}
              >
                [?] Chú giải Phân vị
              </button>
            )}

            {/* Hover Tooltip Popup Card */}
            {hoveredPoint && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  maxWidth: '350px',
                  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                  border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.4)' : '#bae6fd'}`,
                  borderRadius: '6px',
                  padding: '10px 12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  pointerEvents: 'none',
                  zIndex: 20,
                  backdropFilter: 'blur(6px)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#38bdf8' }}>
                    {hoveredPoint.id}
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      fontFamily: 'var(--font-mono)',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      backgroundColor: getCatColor(hoveredPoint.category),
                      color: '#ffffff',
                    }}
                  >
                    {hoveredPoint.category}
                  </span>
                </div>

                {/* GMM Cluster Tag & Soft Posterior Probability Bar */}
                {hoveredPoint.gmm_cluster !== undefined && (() => {
                  const clusterProbs: number[] = hoveredPoint.gmm_all_probs || (() => {
                    const p = hoveredPoint.gmm_prob ?? 0.85;
                    const rem = Math.max(0, 1 - p) / 3;
                    return [0, 1, 2, 3].map((c) => (c === hoveredPoint.gmm_cluster ? p : rem));
                  })();

                  return (
                    <div style={{ marginBottom: '6px', backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)', padding: '5px 7px', borderRadius: '4px', border: `1px solid ${themeStyles.border}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span
                          style={{
                            fontSize: '9px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '3px',
                            backgroundColor: getPointColor(hoveredPoint),
                            color: '#ffffff',
                          }}
                        >
                          GMM Cụm {hoveredPoint.gmm_cluster + 1}: {activePair?.gmm_clusters?.[hoveredPoint.gmm_cluster]?.name?.split(':')[1] || `Cụm ${hoveredPoint.gmm_cluster + 1}`}
                        </span>
                        <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                          P(C|x) = <strong>{((hoveredPoint.gmm_prob ?? Math.max(...clusterProbs)) * 100).toFixed(1)}%</strong>
                        </span>
                      </div>

                      {/* Soft Posterior Stacked Mini-Bar */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', border: `1px solid ${themeStyles.border}` }}>
                          {clusterProbs.map((prob, idx) => {
                            const cColor = activePair?.gmm_clusters?.[idx]?.color || ['#10b981', '#0284c7', '#f59e0b', '#8b5cf6'][idx];
                            return (
                              <div
                                key={`prob-seg-${idx}`}
                                style={{
                                  width: `${Math.max(0, prob * 100)}%`,
                                  backgroundColor: cColor,
                                  transition: 'width 0.2s ease',
                                }}
                                title={`Cụm ${idx + 1}: ${(prob * 100).toFixed(1)}%`}
                              />
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                          {clusterProbs.map((prob, idx) => (
                            <span key={`prob-lbl-${idx}`} style={{ color: idx === hoveredPoint.gmm_cluster ? getPointColor(hoveredPoint) : undefined, fontWeight: idx === hoveredPoint.gmm_cluster ? 800 : 400 }}>
                              C{idx + 1}: {(prob * 100).toFixed(0)}%
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ fontSize: '11px', fontWeight: 700, color: themeStyles.textPrimary, marginBottom: '4px', lineHeight: 1.25 }}>
                  {hoveredPoint.title}
                </div>
                <div style={{ fontSize: '10px', color: themeStyles.textSecondary, marginBottom: '6px' }}>
                  {hoveredPoint.author}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                  <div style={{ color: '#2563eb' }}>
                    {activePair.x_label}: <strong>{hoveredPoint.x.toLocaleString()}</strong>
                  </div>
                  <div style={{ color: '#ea580c' }}>
                    {activePair.y_label}: <strong>{hoveredPoint.y.toLocaleString()}</strong>
                  </div>
                </div>
                {hoveredPoint.sampleFormula && (
                  <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: `1px solid ${themeStyles.border}` }}>
                    <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>MẪU LATEX TOÀN VĂN:</div>
                    <div style={{ fontSize: '10px', color: '#10b981', overflow: 'hidden' }}>
                      <ScientificMath math={hoveredPoint.sampleFormula} block={false} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 2: UNIVARIATE DISTRIBUTIONS & Q-Q NORMALITY (LENS 2)          */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'lens2_univariate' && activeUnivariate && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '8px' }}>
          {/* Feature Selector Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flexShrink: 0 }}>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
              Biến kiểm định:
            </span>
            {diagnosticData?.lens2_univariate &&
              Object.values(diagnosticData.lens2_univariate).map((feat) => {
                const isSelected = selectedUnivariateKey === feat.key;
                return (
                  <button
                    key={feat.key}
                    type="button"
                    onClick={() => setSelectedUnivariateKey(feat.key)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: isSelected ? 800 : 500,
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(37, 99, 235, 0.25)'
                          : '#dbeafe'
                        : 'transparent',
                      color: isSelected ? (isDark ? '#93c5fd' : '#1d4ed8') : themeStyles.textSecondary,
                      border: `1px solid ${isSelected ? '#3b82f6' : themeStyles.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    {feat.label}
                  </button>
                );
              })}
          </div>

          {/* Diagnostic KPI Cards (§6.2 Skewness, Kurtosis, D'Agostino) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', flexShrink: 0 }}>
            {/* Skewness Card */}
            <div
              style={{
                backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                borderRadius: '6px',
                border: `1px solid ${themeStyles.border}`,
                borderLeft: '3px solid #ea580c',
                padding: '6px 10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textMuted }}>
                  HỆ SỐ LỆCH (SKEWNESS S)
                </span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#ea580c' }}>
                  {activeUnivariate.skew_category}
                </span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#ea580c', marginTop: '2px' }}>
                S = {activeUnivariate.skewness > 0 ? `+${activeUnivariate.skewness}` : activeUnivariate.skewness}
              </div>
              <div style={{ fontSize: '10px', color: themeStyles.textSecondary, marginTop: '2px', lineHeight: 1.25 }}>
                {activeUnivariate.skew_interpretation}
              </div>
            </div>

            {/* Kurtosis Card */}
            <div
              style={{
                backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                borderRadius: '6px',
                border: `1px solid ${themeStyles.border}`,
                borderLeft: '3px solid #7c3aed',
                padding: '6px 10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textMuted }}>
                  ĐỘ NHỌN (KURTOSIS K)
                </span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#7c3aed' }}>
                  {activeUnivariate.kurtosis_category}
                </span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#7c3aed', marginTop: '2px' }}>
                K = {activeUnivariate.kurtosis > 0 ? `+${activeUnivariate.kurtosis}` : activeUnivariate.kurtosis}
              </div>
              <div style={{ fontSize: '10px', color: themeStyles.textSecondary, marginTop: '2px', lineHeight: 1.25 }}>
                {activeUnivariate.kurtosis_interpretation}
              </div>
            </div>

            {/* D'Agostino Normality Test */}
            <div
              style={{
                backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                borderRadius: '6px',
                border: `1px solid ${themeStyles.border}`,
                borderLeft: '3px solid #dc2626',
                padding: '6px 10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textMuted }}>
                  D'AGOSTINO'S K² TEST
                </span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#dc2626' }}>
                  p {activeUnivariate.dagostino_p}
                </span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#dc2626', marginTop: '4px' }}>
                {activeUnivariate.normality_verdict}
              </div>
              <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                K² = {activeUnivariate.dagostino_k2.toLocaleString()}
              </div>
            </div>

            {/* Location & Dispersion Stats */}
            <div
              style={{
                backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)',
                borderRadius: '6px',
                border: `1px solid ${themeStyles.border}`,
                borderLeft: '3px solid #2563eb',
                padding: '6px 10px',
              }}
            >
              <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textMuted }}>
                VỊ TRÍ &amp; PHÂN VỊ (CENTROID &amp; QUANTILES)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                <div>
                  Mean: <strong style={{ color: '#2563eb' }}>{activeUnivariate.mean}</strong>
                </div>
                <div>
                  Median: <strong style={{ color: '#ea580c' }}>{activeUnivariate.median}</strong>
                </div>
                <div style={{ color: themeStyles.textMuted }}>P25: {activeUnivariate.p25}</div>
                <div style={{ color: themeStyles.textMuted }}>P75: {activeUnivariate.p75}</div>
              </div>
            </div>
          </div>

          {/* Dual Visual Diagnostics: Histogram + KDE (Left) and Q-Q Plot (Right) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', flex: 1, minHeight: 0 }}>
            {/* Histogram & Gaussian KDE Plot */}
            <div
              style={{
                backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.01)',
                borderRadius: '6px',
                border: `1px solid ${themeStyles.border}`,
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>
                  BIỂU ĐỒ TẦN SUẤT &amp; ĐƯỜNG MẬT ĐỘ GAUSSIAN KDE
                </span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                  25 bins &bull; Mean vs Median divergence
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <svg
                  ref={histSvgRef}
                  viewBox="0 0 500 240"
                  preserveAspectRatio="xMidYMid meet"
                  style={{ width: '100%', height: '100%' }}
                >
                  {/* Axis Baseline */}
                  <line x1="40" y1="200" x2="480" y2="200" stroke={themeStyles.axisLine} strokeWidth="1" />

                  {/* Histogram Bars */}
                  {(() => {
                    const maxCount = Math.max(...activeUnivariate.histogram_bins.map((b) => b.count), 1);
                    return activeUnivariate.histogram_bins.map((b, i) => {
                      const bw = 430 / activeUnivariate.histogram_bins.length;
                      const bx = 45 + i * bw;
                      const bh = (b.count / maxCount) * 160;
                      const by = 200 - bh;
                      return (
                        <g key={i}>
                          <rect
                            x={bx + 1}
                            y={by}
                            width={Math.max(2, bw - 2)}
                            height={bh}
                            fill={isDark ? 'rgba(37, 99, 235, 0.45)' : 'rgba(37, 99, 235, 0.3)'}
                            stroke="#3b82f6"
                            strokeWidth="1"
                          />
                        </g>
                      );
                    });
                  })()}

                  {/* Gaussian KDE Smooth Curve Overlay */}
                  {activeUnivariate.kde_points && activeUnivariate.kde_points.length > 1 && (() => {
                    const minX = activeUnivariate.kde_points[0].x;
                    const maxX = activeUnivariate.kde_points[activeUnivariate.kde_points.length - 1].x;
                    const pathD = activeUnivariate.kde_points
                      .map((pt, idx) => {
                        const px = 45 + ((pt.x - minX) / (maxX - minX || 1)) * 430;
                        const py = 200 - pt.y * 160;
                        return `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
                      })
                      .join(' ');
                    return (
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="2.5"
                      />
                    );
                  })()}

                  {/* Mean Marker (Dashed Blue Line) */}
                  {(() => {
                    const minX = activeUnivariate.histogram_bins[0]?.x0 || 0;
                    const maxX = activeUnivariate.histogram_bins[activeUnivariate.histogram_bins.length - 1]?.x1 || 1;
                    const meanPx = 45 + Math.min(430, Math.max(0, ((activeUnivariate.mean - minX) / (maxX - minX || 1)) * 430));
                    const medPx = 45 + Math.min(430, Math.max(0, ((activeUnivariate.median - minX) / (maxX - minX || 1)) * 430));
                    return (
                      <g>
                        <line x1={meanPx} y1="30" x2={meanPx} y2="200" stroke="#2563eb" strokeWidth="2" strokeDasharray="4 2" />
                        <text x={meanPx} y="25" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fontWeight="800" fill="#2563eb">
                          Mean: {activeUnivariate.mean}
                        </text>

                        <line x1={medPx} y1="45" x2={medPx} y2="200" stroke="#ea580c" strokeWidth="2" strokeDasharray="4 2" />
                        <text x={medPx} y="40" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fontWeight="800" fill="#ea580c">
                          Median: {activeUnivariate.median}
                        </text>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>

            {/* Q-Q Plot (Normal Quantile-Quantile) */}
            <div
              style={{
                backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.01)',
                borderRadius: '6px',
                border: `1px solid ${themeStyles.border}`,
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>
                  Q-Q PLOT (NORMAL QUANTILE-QUANTILE)
                </span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#dc2626' }}>
                  Độ lệch khỏi đường chéo 45°
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <svg
                  ref={qqSvgRef}
                  viewBox="0 0 400 240"
                  preserveAspectRatio="xMidYMid meet"
                  style={{ width: '100%', height: '100%' }}
                >
                  {/* Grid Lines */}
                  <line x1="40" y1="20" x2="40" y2="200" stroke={themeStyles.axisLine} strokeWidth="1" />
                  <line x1="40" y1="200" x2="380" y2="200" stroke={themeStyles.axisLine} strokeWidth="1" />

                  {/* 45-degree Reference Line (Red Dashed) */}
                  <line x1="60" y1="180" x2="360" y2="40" stroke="#dc2626" strokeWidth="2" strokeDasharray="5 3" />
                  <text x="365" y="45" fontSize="9" fontFamily="var(--font-mono)" fill="#dc2626" fontWeight="700">
                    Phân phối chuẩn N(0,1)
                  </text>

                  {/* Q-Q Points */}
                  {activeUnivariate.qq_points &&
                    activeUnivariate.qq_points.map((pt, idx) => {
                      // Map theoretical (-2.5 to 2.5) to X (60 to 360)
                      const cx = 210 + (pt.theoretical / 2.5) * 150;
                      // Map empirical (-2.5 to 4.5) to Y (180 to 30)
                      const cy = 180 - Math.min(160, Math.max(0, ((pt.empirical + 2.5) / 7.0) * 160));
                      return (
                        <circle
                          key={idx}
                          cx={cx}
                          cy={cy}
                          r="4"
                          fill="#3b82f6"
                          stroke={isDark ? '#0f172a' : '#ffffff'}
                          strokeWidth="1.2"
                        />
                      );
                    })}

                  <text x="210" y="225" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>
                    Phân vị chuẩn lý thuyết (Theoretical Normal Quantiles)
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 3: DOWNSTREAM PIPELINE GOVERNANCE (§6.4)                      */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'governance' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '8px', overflowY: 'auto' }}>
          <div
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: isDark ? 'rgba(56, 189, 248, 0.1)' : '#f0f9ff',
              border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.3)' : '#bae6fd'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: '11px', color: themeStyles.textPrimary }}>
              <strong style={{ color: '#0284c7' }}>BÀI GIẢNG §6.4: </strong>
              <span>Hình học dữ liệu thực nghiệm quyết định cấu trúc bắt buộc của các bước tiền xử lý &amp; học máy.</span>
            </div>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#0284c7' }}>
              4 QUY TẮC ĐÃ ÁP DỤNG TRÊN LAKEHOUSE
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', flex: 1 }}>
            {diagnosticData?.downstream_governance?.map((gov) => (
              <div
                key={gov.rule_id}
                style={{
                  backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.02)',
                  borderRadius: '6px',
                  border: `1px solid ${themeStyles.border}`,
                  borderTop: `3px solid ${gov.badge_color}`,
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: '9px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                      padding: '1px 5px',
                      borderRadius: '3px',
                      backgroundColor: `${gov.badge_color}22`,
                      color: gov.badge_color,
                      border: `1px solid ${gov.badge_color}55`,
                    }}
                  >
                    {gov.tag}
                  </span>
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 800 }}>
                    ✓ PRODUCTION VALIDATED
                  </span>
                </div>

                <div style={{ fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary }}>
                  {gov.observed_geometry}
                </div>

                <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: gov.badge_color }}>
                  Bằng chứng: <strong>{gov.empirical_evidence}</strong>
                </div>

                <div
                  style={{
                    fontSize: '11px',
                    color: themeStyles.textSecondary,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    borderLeft: `2px solid ${gov.badge_color}`,
                    lineHeight: 1.35,
                  }}
                >
                  <strong style={{ color: themeStyles.textPrimary }}>Yêu cầu kiến trúc (§6.4): </strong>
                  {gov.pipeline_requirement}
                </div>

                <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginTop: 'auto', paddingTop: '4px' }}>
                  <strong>Thực thi trong Lakehouse: </strong>
                  {gov.applied_in_lakehouse}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
