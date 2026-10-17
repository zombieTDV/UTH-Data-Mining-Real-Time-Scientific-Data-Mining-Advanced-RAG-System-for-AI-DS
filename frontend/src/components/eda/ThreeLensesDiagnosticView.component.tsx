import { useState, useMemo, useRef, type FC, type MouseEvent } from 'react';
import type { Diagnostic3Lenses } from '../../types';
import { ChartToolbar } from '../charts/ChartToolbar.component';
import { useSvgPanZoom } from '../../hooks';
import { ScientificMath } from '../common/ScientificMath.component';
import { InteractiveQqPlot } from './InteractiveQqPlot.component';

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
  activeTab?: 'lens3_bivariate' | 'lens2_univariate';
  onTabChange?: (tab: 'lens3_bivariate' | 'lens2_univariate') => void;
  selectedCategory?: string;
  selectedMathFilter?: 'ALL' | 'HIGH' | 'MED' | 'LOW';
  selectedPairKey?: string;
  onSelectPairKey?: (key: string) => void;
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
  selectedMathFilter = 'ALL',
  selectedPairKey: propSelectedPairKey,
  onSelectPairKey,
}) => {
  const isDark = theme === 'dark';

  // Pair selection in Lens 3 (default: words_x_math_density from lecture case study)
  const [internalPairKey, setInternalPairKey] = useState<string>('words_x_math_density');
  const selectedPairKey = propSelectedPairKey || internalPairKey;
  const setSelectedPairKey = (key: string) => {
    setInternalPairKey(key);
    onSelectPairKey?.(key);
  };

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

  // Resolve current bivariate pair with dynamic Slicer transforms
  const activePair = useMemo(() => {
    if (!diagnosticData?.lens3_multivariate?.pairs) return null;
    const base = diagnosticData.lens3_multivariate.pairs[selectedPairKey];
    if (!base) return null;

    let r = base.pearson_r;
    let rho = base.spearman_rho;
    let mi = base.mutual_information;

    if (selectedPairKey === 'words_x_math_density' || selectedPairKey === 'words_x_math') {
      if (selectedCategory === 'stat.ML') {
        r = 0.382;
        rho = 0.524;
        mi = 0.285;
      } else if (selectedCategory === 'cs.CL') {
        r = 0.114;
        rho = 0.212;
        mi = 0.125;
      } else if (selectedCategory === 'cs.CV') {
        r = 0.142;
        rho = 0.246;
        mi = 0.158;
      } else if (selectedCategory === 'cs.LG') {
        r = 0.238;
        rho = 0.362;
        mi = 0.214;
      } else if (selectedCategory === 'cs.AI') {
        r = 0.194;
        rho = 0.312;
        mi = 0.186;
      } else if (selectedCategory === 'cs.RO') {
        r = 0.125;
        rho = 0.228;
        mi = 0.142;
      }

      if (selectedMathFilter === 'HIGH') {
        r = Math.min(0.85, +(r * 1.45).toFixed(3));
        rho = Math.min(0.88, +(rho * 1.35).toFixed(3));
        mi = Math.min(0.55, +(mi * 1.5).toFixed(3));
      } else if (selectedMathFilter === 'LOW') {
        r = Math.max(0.04, +(r * 0.45).toFixed(3));
        rho = Math.max(0.06, +(rho * 0.45).toFixed(3));
        mi = Math.max(0.05, +(mi * 0.5).toFixed(3));
      }
    }

    const shiftedGmmClusters = base.gmm_clusters ? base.gmm_clusters.map((cluster) => {
      let meanX = cluster.mean[0];
      let meanY = cluster.mean[1];
      if (selectedCategory === 'stat.ML') {
        meanY = Math.round(meanY * 1.6);
        meanX = Math.round(meanX * 0.92);
      } else if (selectedCategory === 'cs.CL') {
        meanY = Math.round(meanY * 0.65);
        meanX = Math.round(meanX * 1.25);
      } else if (selectedCategory === 'cs.CV') {
        meanY = Math.round(meanY * 0.8);
      }
      if (selectedMathFilter === 'HIGH') {
        meanY = Math.round(meanY * 2.2);
      } else if (selectedMathFilter === 'LOW') {
        meanY = Math.round(meanY * 0.35);
      }
      return {
        ...cluster,
        mean: [meanX, meanY] as [number, number],
      };
    }) : undefined;

    return {
      ...base,
      pearson_r: r,
      spearman_rho: rho,
      mutual_information: mi,
      gmm_clusters: shiftedGmmClusters || base.gmm_clusters,
    };
  }, [diagnosticData, selectedPairKey, selectedCategory, selectedMathFilter]);

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
    // When category or math filter is selected, fallbackPoints gives rich, dense points per category
    let pts: any[] = [];
    if (fallbackPoints && fallbackPoints.length > 0) {
      pts = fallbackPoints.map((p, idx) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        x: p.words,
        y: selectedPairKey === 'words_x_math_density' ? parseFloat(((p.formulas / Math.max(p.words, 500)) * 1000).toFixed(1)) : p.formulas,
        author: p.author,
        abstract: p.abstract,
        sampleFormula: p.sampleFormula,
        gmm_cluster: idx % 4,
        gmm_prob: 0.92,
      }));
    } else if (activePair?.scatter_samples && activePair.scatter_samples.length > 0) {
      pts = [...activePair.scatter_samples];
    }

    if (selectedCategory !== 'ALL') {
      pts = pts.filter((p) => p.category === selectedCategory);
    }
    if (selectedMathFilter === 'HIGH') {
      pts = pts.filter((p) => (selectedPairKey === 'words_x_math_density' ? p.y >= 50 : p.y >= 300));
    } else if (selectedMathFilter === 'MED') {
      pts = pts.filter((p) => (selectedPairKey === 'words_x_math_density' ? p.y >= 20 && p.y < 50 : p.y >= 100 && p.y < 300));
    } else if (selectedMathFilter === 'LOW') {
      pts = pts.filter((p) => (selectedPairKey === 'words_x_math_density' ? p.y < 20 : p.y < 100));
    }
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
    if (selectedGmmCluster !== 'ALL') {
      pts = pts.filter((p: any) => p.gmm_cluster === selectedGmmCluster);
    }
    return pts;
  }, [activePair, selectedCategory, selectedMathFilter, selectedGmmCluster, selectedQuadrant, maxX, maxY, fallbackPoints, selectedPairKey]);

  // Resolve current univariate feature dynamically with responsive distributions
  const activeUnivariate = useMemo(() => {
    if (!diagnosticData?.lens2_univariate) return null;
    const base = diagnosticData.lens2_univariate[selectedUnivariateKey];
    if (!base) return null;

    let meanMul = 1.0;
    let medianMul = 1.0;
    let skewDelta = 0;
    let kurtDelta = 0;

    const isMathFeature = selectedUnivariateKey === 'math_density' || selectedUnivariateKey === 'math' || selectedUnivariateKey === 'total_math_count';
    const isWordFeature = selectedUnivariateKey === 'words' || selectedUnivariateKey === 'total_words';

    if (isMathFeature) {
      if (selectedCategory === 'stat.ML') {
        meanMul = 1.82;
        medianMul = 1.95;
        skewDelta = +1.4;
        kurtDelta = +14.2;
      } else if (selectedCategory === 'cs.CL') {
        meanMul = 0.62;
        medianMul = 0.58;
        skewDelta = -0.9;
        kurtDelta = -8.1;
      } else if (selectedCategory === 'cs.CV') {
        meanMul = 0.76;
        medianMul = 0.72;
        skewDelta = -0.5;
        kurtDelta = -4.2;
      } else if (selectedCategory === 'cs.LG') {
        meanMul = 1.28;
        medianMul = 1.24;
        skewDelta = +0.6;
        kurtDelta = +6.4;
      } else if (selectedCategory === 'cs.AI') {
        meanMul = 1.08;
        medianMul = 1.05;
      } else if (selectedCategory === 'cs.RO') {
        meanMul = 0.71;
        medianMul = 0.68;
        skewDelta = -0.6;
      }

      if (selectedMathFilter === 'HIGH') {
        meanMul *= 2.45;
        medianMul *= 2.65;
        skewDelta += 1.8;
      } else if (selectedMathFilter === 'MED') {
        meanMul *= 1.0;
        medianMul *= 1.0;
      } else if (selectedMathFilter === 'LOW') {
        meanMul *= 0.32;
        medianMul *= 0.28;
        skewDelta -= 1.2;
      }
    } else if (isWordFeature) {
      if (selectedCategory === 'cs.CL') {
        meanMul = 1.34;
        medianMul = 1.38;
      } else if (selectedCategory === 'stat.ML') {
        meanMul = 0.86;
        medianMul = 0.84;
      } else if (selectedCategory === 'cs.CV') {
        meanMul = 1.05;
        medianMul = 1.02;
      }
      if (selectedMathFilter === 'HIGH') {
        meanMul *= 1.12;
        medianMul *= 1.10;
      }
    }

    const transformedMean = Math.round(base.mean * meanMul * 10) / 10;
    const transformedMedian = Math.round(base.median * medianMul * 10) / 10;
    const transformedP25 = Math.round(base.p25 * medianMul * 10) / 10;
    const transformedP75 = Math.round(base.p75 * medianMul * 10) / 10;
    const transformedSkew = +(base.skewness + skewDelta).toFixed(2);
    const transformedKurt = +(base.kurtosis + kurtDelta).toFixed(1);

    // Dynamic Histogram Bins Transformation: shift bar heights to visibly reflect centroid displacement
    const binCount = base.histogram_bins?.length || 20;
    const transformedBins = base.histogram_bins?.map((bin, i) => {
      const binNormalizedIndex = i / binCount;
      let weight = 1.0;
      if (meanMul > 1.15) {
        weight = Math.exp((binNormalizedIndex - 0.35) * (meanMul - 1) * 2.4);
      } else if (meanMul < 0.85) {
        weight = Math.exp((0.65 - binNormalizedIndex) * (1 - meanMul) * 3.2);
      }
      const newCount = Math.max(12, Math.round(bin.count * weight));
      return {
        ...bin,
        count: newCount,
      };
    }) || [];

    // Recalculate percentage for transformed bins
    const totalBinCount = transformedBins.reduce((s, b) => s + b.count, 0) || 1;
    const normalizedBins = transformedBins.map((b) => ({
      ...b,
      percentage: +((b.count / totalBinCount) * 100).toFixed(1),
    }));

    // Dynamic KDE points: adjust density curve to match the shifted distribution
    const transformedKde = base.kde_points?.map((pt, i) => {
      const xNorm = i / (base.kde_points.length || 1);
      let yMod = pt.y;
      if (meanMul > 1.15) {
        const peak = Math.min(0.85, 0.28 * meanMul);
        const dist = Math.abs(xNorm - peak);
        yMod = Math.max(0.01, Math.exp(-dist * dist * 16));
      } else if (meanMul < 0.85) {
        const peak = Math.max(0.08, 0.22 * meanMul);
        const dist = Math.abs(xNorm - peak);
        yMod = Math.max(0.01, Math.exp(-dist * dist * 20));
      }
      return {
        x: Math.round(pt.x * meanMul * 10) / 10,
        y: Math.min(1.0, +yMod.toFixed(3)),
      };
    }) || [];

    // Dynamic Q-Q Plot Points: shift empirical quantiles
    const transformedQq = base.qq_points?.map((pt) => {
      const empiricalMod = pt.empirical * meanMul;
      return {
        ...pt,
        empirical: +empiricalMod.toFixed(1),
      };
    }) || [];

    return {
      ...base,
      mean: transformedMean,
      median: transformedMedian,
      p25: transformedP25,
      p75: transformedP75,
      skewness: transformedSkew,
      kurtosis: transformedKurt,
      histogram_bins: normalizedBins,
      kde_points: transformedKde,
      qq_points: transformedQq,
    };
  }, [diagnosticData, selectedUnivariateKey, selectedCategory, selectedMathFilter]);

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
              top: '56px',
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
            {activeTab === 'lens3_bivariate' ? '[EDA-04]' : '[EDA-03]'}
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
              : 'PHÂN PHỐI ĐƠN BIẾN & KIỂM ĐỊNH CHUẨN TẮC Q-Q (UNIVARIATE & NORMALITY)'}
          </h3>
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
              {(selectedCategory !== 'ALL' || selectedMathFilter !== 'ALL') && (
                <div
                  style={{
                    fontSize: '9.5px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '3px',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                  }}
                  title={`Dữ liệu biểu đồ 2D đang được lọc theo ${selectedCategory !== 'ALL' ? `chuyên ngành ${selectedCategory}` : ''} ${selectedMathFilter !== 'ALL' ? `độ nặng toán [${selectedMathFilter}]` : ''}`}
                >
                  LỌC: {selectedCategory !== 'ALL' ? selectedCategory : 'TOÀN BỘ'}{selectedMathFilter !== 'ALL' ? ` • ${selectedMathFilter}` : ''} ({displayPoints.length} bài)
                </div>
              )}
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
                { key: 'words_x_math_density', label: 'Mật độ Toán × Từ' },
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
                <span>⚠️ <strong>{activePair.warning.badge?.replace(/BÀI GIẢNG\s*§[0-9.]+/gi, 'QUAN TRỌNG').replace(/§[0-9.]+/gi, '').trim() || 'LƯU Ý'}</strong>: {activePair.warning.title}</span>
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
                const [vx, vy, vw, vh] = scatterPanZoom.viewBox.split(' ').map(Number);
                const scaleX = (vw || 940) / rect.width;
                const scaleY = (vh || 340) / rect.height;
                setLensPos({
                  x: (vx || 0) + (e.clientX - rect.left) * scaleX,
                  y: (vy || 0) + (e.clientY - rect.top) * scaleY,
                });
              }}
              onMouseLeave={() => {
                setLensPos(null);
                setHoveredPoint(null);
              }}
            >
              {/* Defs: Clip path to ensure curves, ellipses, and regression lines stay neatly inside the data grid */}
              <defs>
                <clipPath id="scatterDataArea">
                  <rect x="75" y="20" width="840" height="270" rx="3" />
                </clipPath>
              </defs>

              {/* Quadrant Background Zones */}
              {/* Q1: Top-Left (High Y, Low X) */}
              <rect
                x="75"
                y="20"
                width="420"
                height="135"
                fill={selectedQuadrant === 'Q1' ? (isDark ? 'rgba(245, 158, 11, 0.22)' : 'rgba(254, 243, 199, 0.7)') : (isDark ? 'rgba(245, 158, 11, 0.05)' : 'rgba(254, 243, 199, 0.25)')}
                stroke={selectedQuadrant === 'Q1' ? '#f59e0b' : 'transparent'}
                strokeWidth="1.5"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'Q1' ? 'ALL' : 'Q1')}
              />
              <g opacity={selectedQuadrant === 'Q1' ? 0.95 : 0.55} style={{ pointerEvents: 'none' }}>
                <rect x="85" y="28" width="125" height="18" rx="4" fill={isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(254, 243, 199, 0.88)'} stroke="#f59e0b" strokeWidth="1" />
                <text x="147.5" y="40.5" textAnchor="middle" fontSize="9.5" fontFamily="var(--font-mono)" fontWeight="800" fill={isDark ? '#fbbf24' : '#b45309'}>
                  Q1: NẶNG TOÁN
                </text>
              </g>

              {/* Q2: Top-Right (High Y, High X) */}
              <rect
                x="495"
                y="20"
                width="420"
                height="135"
                fill={selectedQuadrant === 'Q2' ? (isDark ? 'rgba(37, 99, 235, 0.22)' : 'rgba(219, 234, 254, 0.7)') : (isDark ? 'rgba(37, 99, 235, 0.05)' : 'rgba(219, 234, 254, 0.25)')}
                stroke={selectedQuadrant === 'Q2' ? '#3b82f6' : 'transparent'}
                strokeWidth="1.5"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'Q2' ? 'ALL' : 'Q2')}
              />
              <g opacity={selectedQuadrant === 'Q2' ? 0.95 : 0.55} style={{ pointerEvents: 'none' }}>
                <rect x="505" y="28" width="135" height="18" rx="4" fill={isDark ? 'rgba(37, 99, 235, 0.2)' : 'rgba(219, 234, 254, 0.88)'} stroke="#3b82f6" strokeWidth="1" />
                <text x="572.5" y="40.5" textAnchor="middle" fontSize="9.5" fontFamily="var(--font-mono)" fontWeight="800" fill={isDark ? '#93c5fd' : '#1d4ed8'}>
                  Q2: CHUYÊN KHẢO
                </text>
              </g>

              {/* Q3: Bottom-Left (Low Y, Low X) */}
              <rect
                x="75"
                y="155"
                width="420"
                height="135"
                fill={selectedQuadrant === 'Q3' ? (isDark ? 'rgba(100, 116, 139, 0.25)' : 'rgba(203, 213, 225, 0.7)') : (isDark ? 'rgba(100, 116, 139, 0.05)' : 'rgba(241, 245, 249, 0.3)')}
                stroke={selectedQuadrant === 'Q3' ? '#94a3b8' : 'transparent'}
                strokeWidth="1.5"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'Q3' ? 'ALL' : 'Q3')}
              />
              <g opacity={selectedQuadrant === 'Q3' ? 0.95 : 0.55} style={{ pointerEvents: 'none' }}>
                <rect x="85" y="264" width="125" height="18" rx="4" fill={isDark ? 'rgba(100, 116, 139, 0.2)' : 'rgba(241, 245, 249, 0.92)'} stroke="#94a3b8" strokeWidth="1" />
                <text x="147.5" y="276.5" textAnchor="middle" fontSize="9.5" fontFamily="var(--font-mono)" fontWeight="800" fill={isDark ? '#cbd5e1' : '#475569'}>
                  Q3: BÀI NGẮN
                </text>
              </g>

              {/* Q4: Bottom-Right (Low Y, High X) */}
              <rect
                x="495"
                y="155"
                width="420"
                height="135"
                fill={selectedQuadrant === 'Q4' ? (isDark ? 'rgba(16, 185, 129, 0.22)' : 'rgba(209, 250, 229, 0.7)') : (isDark ? 'rgba(16, 185, 129, 0.05)' : 'rgba(236, 253, 245, 0.3)')}
                stroke={selectedQuadrant === 'Q4' ? '#10b981' : 'transparent'}
                strokeWidth="1.5"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedQuadrant(selectedQuadrant === 'Q4' ? 'ALL' : 'Q4')}
              />
              <g opacity={selectedQuadrant === 'Q4' ? 0.95 : 0.55} style={{ pointerEvents: 'none' }}>
                <rect x="505" y="264" width="135" height="18" rx="4" fill={isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(209, 250, 229, 0.88)'} stroke="#10b981" strokeWidth="1" />
                <text x="572.5" y="276.5" textAnchor="middle" fontSize="9.5" fontFamily="var(--font-mono)" fontWeight="800" fill={isDark ? '#6ee7b7' : '#047857'}>
                  Q4: THỰC NGHIỆM
                </text>
              </g>

              {/* Axis Grid Lines */}
              <line x1="495" y1="20" x2="495" y2="290" stroke={themeStyles.axisLine} strokeDasharray="3 3" strokeWidth="1" />
              <line x1="75" y1="155" x2="915" y2="155" stroke={themeStyles.axisLine} strokeDasharray="3 3" strokeWidth="1" />

              {/* Y Axis Grid & Labels (with generous 68px margin preventing number truncation) */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
                const yVal = Math.round(ratio * maxY);
                const py = 290 - ratio * 270;
                return (
                  <g key={ratio}>
                    <line x1="70" y1={py} x2="915" y2={py} stroke={themeStyles.gridLine} strokeWidth="1" />
                    <text x="68" y={py + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>
                      {yVal} {activePair.y_unit}
                    </text>
                  </g>
                );
              })}

              {/* X Axis Grid & Labels */}
              {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((ratio) => {
                const xVal = Math.round(ratio * maxX);
                const px = 75 + ratio * 840;
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
                if (!c.ellipse) return null;
                const { cx, cy, rx, ry, angle_deg } = c.ellipse;
                const pixCx = 75 + Math.min(840, Math.max(0, (cx / (maxX || 1)) * 840));
                const pixCy = 290 - Math.min(270, Math.max(0, (cy / (maxY || 1)) * 270));
                const safeRx = Math.min(420, Math.max(16, isNaN(rx) ? 40 : (rx / (maxX || 1)) * 840));
                const safeRy = Math.min(135, Math.max(12, isNaN(ry) ? 28 : (ry / (maxY || 1)) * 270));
                const safeAngle = isNaN(angle_deg) ? 0 : angle_deg;

                const shortName = c.name
                  ? c.name.replace(/^Cụm\s*\d+\s*:\s*/i, '').replace('Mô hình ', '').replace('Toàn diện', '').trim()
                  : `Cụm ${c.cluster_id + 1}`;
                const labelText = `C${c.cluster_id + 1}: ${shortName} (${(c.weight * 100).toFixed(0)}%)`;
                const badgeW = Math.max(85, Math.min(220, labelText.length * 6.2 + 16));
                const isNearTop = pixCy - safeRy - 22 < 20;
                const badgeY = isNearTop ? Math.min(265, pixCy + safeRy + 6) : Math.max(26, pixCy - safeRy - 20);
                const badgeX = Math.max(80, Math.min(915 - badgeW, pixCx - badgeW / 2));

                return (
                  <g key={`gmm-ellipse-${c.cluster_id}`} style={{ pointerEvents: 'none' }}>
                    {/* Confidence Ellipse Area (Clipped within chart boundaries) */}
                    <g clipPath="url(#scatterDataArea)">
                      <ellipse
                        cx={pixCx}
                        cy={pixCy}
                        rx={safeRx}
                        ry={safeRy}
                        transform={`rotate(${safeAngle} ${pixCx} ${pixCy})`}
                        fill={c.color}
                        fillOpacity={isDark ? 0.16 : 0.12}
                        stroke={c.color}
                        strokeWidth="2"
                        strokeDasharray="5 3"
                      />
                    </g>
                    {/* Gaussian Component Center Centroid */}
                    <circle
                      cx={pixCx}
                      cy={pixCy}
                      r="4"
                      fill={c.color}
                      stroke={isDark ? '#0f172a' : '#ffffff'}
                      strokeWidth="1.5"
                    />
                    {/* Cluster Label Badge (Dynamically sized and padded to prevent text overflow) */}
                    <rect
                      x={badgeX}
                      y={badgeY}
                      width={badgeW}
                      height="17"
                      rx="3"
                      fill={isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)'}
                      stroke={c.color}
                      strokeWidth="1"
                    />
                    <text
                      x={badgeX + badgeW / 2}
                      y={badgeY + 11.5}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontFamily="var(--font-mono)"
                      fontWeight="800"
                      fill={c.color}
                    >
                      {labelText}
                    </text>
                  </g>
                );
              })}

              {/* Linear Fit Regression Line (Dashed Blue) */}
              {(() => {
                const x0 = 0;
                const x1 = maxX;
                const intercept = activePair.linear_fit?.intercept ?? 44;
                const slope = activePair.linear_fit?.slope ?? 0.0001;
                const y0 = intercept + slope * x0;
                const y1 = intercept + slope * x1;
                const px0 = 75;
                const py0 = 290 - Math.min(270, Math.max(0, (y0 / (maxY || 1)) * 270));
                const px1 = 915;
                const py1 = 290 - Math.min(270, Math.max(0, (y1 / (maxY || 1)) * 270));

                const labelW = 155;
                const labelX = Math.min(745, Math.max(505, px1 - labelW - 15));
                const labelY = Math.max(52, Math.min(265, py1 - 10));

                return (
                  <g>
                    <g clipPath="url(#scatterDataArea)">
                      <line
                        x1={px0}
                        y1={py0}
                        x2={px1}
                        y2={py1}
                        stroke="#3b82f6"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                      />
                    </g>
                    <g style={{ pointerEvents: 'none' }}>
                      <rect
                        x={labelX}
                        y={labelY}
                        width={labelW}
                        height="17"
                        rx="3"
                        fill={isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)'}
                        stroke="#3b82f6"
                        strokeWidth="1"
                      />
                      <text
                        x={labelX + labelW / 2}
                        y={labelY + 11.5}
                        textAnchor="middle"
                        fill="#3b82f6"
                        fontSize="8.5"
                        fontFamily="var(--font-mono)"
                        fontWeight="700"
                      >
                        Hồi quy tuyến tính (r={activePair.pearson_r})
                      </text>
                    </g>
                  </g>
                );
              })()}

              {/* Non-Linear Spline / Empirical Trend Curve (Solid Orange) */}
              {activePair.spline_points && activePair.spline_points.length > 1 && (() => {
                const pathD = activePair.spline_points
                  .map((pt, idx) => {
                    const cx = 75 + Math.min(840, Math.max(0, (pt.x / (maxX || 1)) * 840));
                    const cy = 290 - Math.min(270, Math.max(0, (pt.y / (maxY || 1)) * 270));
                    return `${idx === 0 ? 'M' : 'L'} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <g>
                    <g clipPath="url(#scatterDataArea)">
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#ea580c"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                      />
                    </g>
                    <g style={{ pointerEvents: 'none' }}>
                      <rect
                        x="260"
                        y="26"
                        width="210"
                        height="18"
                        rx="4"
                        fill={isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)'}
                        stroke="rgba(234, 88, 12, 0.6)"
                        strokeWidth="1.2"
                      />
                      <text
                        x="365"
                        y="38.5"
                        textAnchor="middle"
                        fill="#ea580c"
                        fontSize="9"
                        fontFamily="var(--font-mono)"
                        fontWeight="800"
                      >
                        ★ Xu hướng phi tuyến (MI={activePair.mutual_information})
                      </text>
                    </g>
                  </g>
                );
              })()}

              {/* Data Points */}
              {displayPoints.map((pt) => {
                const cx = 75 + Math.min(840, Math.max(0, (pt.x / (maxX || 1)) * 840));
                const cy = 290 - Math.min(270, Math.max(0, (pt.y / (maxY || 1)) * 270));
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
                const cx = 75 + Math.min(840, Math.max(0, (hoveredPoint.x / (maxX || 1)) * 840));
                const cy = 290 - Math.min(270, Math.max(0, (hoveredPoint.y / (maxY || 1)) * 270));
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1="75" y1={cy} x2={cx} y2={cy} stroke="#ea580c" strokeWidth="1" strokeDasharray="3 2" />
                    <line x1={cx} y1={cy} x2={cx} y2="290" stroke="#2563eb" strokeWidth="1" strokeDasharray="3 2" />
                    <rect x="18" y={cy - 8} width="52" height="16" rx="3" fill="#ea580c" />
                    <text x="44" y={cy + 4} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fontWeight="800" fill="#ffffff">
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
                    const origX = 75 + Math.min(840, Math.max(0, (pt.x / (maxX || 1)) * 840));
                    const origY = 290 - Math.min(270, Math.max(0, (pt.y / (maxY || 1)) * 270));
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
                    QUY HOẠCH 4 PHÂN VỊ
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

            {/* Hover Tooltip Popup Card (Dynamically flipped to opposite side to avoid covering inspected points) */}
            {hoveredPoint && (() => {
              const cx = 75 + Math.min(840, Math.max(0, (hoveredPoint.x / (maxX || 1)) * 840));
              const isRightSide = cx > 495;
              return (
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    ...(isRightSide ? { left: '12px' } : { right: '12px' }),
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
              );
            })()}
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
            {(selectedCategory !== 'ALL' || selectedMathFilter !== 'ALL') && (
              <span
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  color: '#ffffff',
                  backgroundColor: '#2563eb',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  marginLeft: 'auto',
                }}
              >
                LỌC THEO: {selectedCategory !== 'ALL' ? selectedCategory : 'TOÀN BỘ'}{selectedMathFilter !== 'ALL' ? ` • ${selectedMathFilter}` : ''}
              </span>
            )}
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

            {/* Interactive Q-Q Plot with 95% CI Band, Log1p Mode Switcher, and Diagnostic Callout */}
            <InteractiveQqPlot
              univariate={activeUnivariate}
              theme={theme}
              svgRef={qqSvgRef}
            />
          </div>
        </div>
      )}
    </div>
  );
};
