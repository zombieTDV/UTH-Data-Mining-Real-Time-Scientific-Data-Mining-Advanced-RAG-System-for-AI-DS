import { useState, useMemo, type FC, type MouseEvent } from 'react';
import type { Diagnostic3Lenses } from '../../types';
import { ChartToolbar } from '../charts/ChartToolbar.component';
import { AxisTitle, ChartLegend } from '../charts/ChartAxes.component';
import { useSvgPanZoom, useTranslation } from '../../hooks';
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
  selectedCategory = 'ALL',
}) => {
  const { language } = useTranslation();
  const isVi = language === 'vi';
  const isDark = theme === 'dark';

  // Sub-tab switcher across the Statistical Lenses
  const [activeTab, setActiveTab] = useState<'lens3_bivariate' | 'lens2_univariate'>('lens3_bivariate');

  // Pair selection in Lens 3 (default: words_x_math_density from lecture case study)
  const [selectedPairKey, setSelectedPairKey] = useState<string>('words_x_math_density');

  // Feature selection in Lens 2
  const [selectedUnivariateKey, setSelectedUnivariateKey] = useState<string>('math_density');

  // Quadrant filter in 2D scatter
  const [selectedQuadrant, setSelectedQuadrant] = useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');

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
    screenX: number;
    screenY: number;
  } | null>(null);

  // Magnifier Lens tool
  const [isLensActive, setIsLensActive] = useState<boolean>(false);
  const [lensPos, setLensPos] = useState<{ x: number; y: number } | null>(null);

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

  // Resolve current bivariate pair
  const activePair = useMemo(() => {
    if (!diagnosticData?.lens3_multivariate?.pairs) return null;
    return diagnosticData.lens3_multivariate.pairs[selectedPairKey] || null;
  }, [diagnosticData, selectedPairKey]);

  // Points to display in Bivariate Scatter
  const displayPoints = useMemo(() => {
    let pts = (activePair?.scatter_samples && activePair.scatter_samples.length > 0)
      ? activePair.scatter_samples
      : fallbackPoints.map((p) => ({
          id: p.id,
          title: p.title,
          category: p.category,
          x: p.words,
          y: p.formulas,
          author: p.author,
          abstract: p.abstract,
          sampleFormula: p.sampleFormula,
        }));

    if (selectedCategory !== 'ALL') {
      pts = pts.filter((p) => p.category === selectedCategory);
    }
    return pts;
  }, [activePair, selectedCategory, fallbackPoints]);

  // Extents for Scatter Plot axes
  const { maxX, maxY } = useMemo(() => {
    if (!activePair) return { maxX: 12000, maxY: 300 };
    if (selectedPairKey === 'words_x_math_density') return { maxX: 12000, maxY: 180 };
    if (selectedPairKey === 'math_x_authors') return { maxX: 16, maxY: 1200 };
    if (selectedPairKey === 'words_x_math') return { maxX: 12000, maxY: 1200 };
    if (selectedPairKey === 'words_x_citations') return { maxX: 12000, maxY: 400 };
    const max_x = Math.max(...displayPoints.map((p) => p.x), 100);
    const max_y = Math.max(...displayPoints.map((p) => p.y), 10);
    return { maxX: max_x * 1.1, maxY: max_y * 1.1 };
  }, [activePair, selectedPairKey, displayPoints]);

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
      {/* ROW 1: HEADER & 3-LENS SUB-TAB CONTROLS                           */}
      {/* ---------------------------------------------------------------- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '28px',
          marginBottom: '6px',
          flexShrink: 0,
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 800,
              color: themeStyles.textPrimary,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isVi ? 'CHẨN ĐOÁN PHÂN PHỐI & TƯƠNG TÁC ĐA BIẾN' : 'DISTRIBUTION & MULTIVARIATE INTERACTION DIAGNOSTICS'}
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
            }}
          >
            {isVi ? 'LĂNG KÍNH CHẨN ĐOÁN THỐNG KÊ' : 'STATISTICAL DIAGNOSTIC LENSES'}
          </span>
        </div>

        {/* Statistical Lens Pill Switcher Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {[
            {
              id: 'lens3_bivariate' as const,
              label: isVi ? 'LĂNG KÍNH ĐA BIẾN: TƯƠNG TÁC & MUTUAL INFO' : 'BIVARIATE LENS: INTERACTION & MUTUAL INFO',
              icon: '☍',
            },
            {
              id: 'lens2_univariate' as const,
              label: isVi ? 'LĂNG KÍNH ĐƠN BIẾN: PHÂN PHỐI & Q-Q NORMALITY' : 'UNIVARIATE LENS: DISTRIBUTION & Q-Q NORMALITY',
              icon: '◬',
            },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: isActive ? 800 : 600,
                  backgroundColor: isActive
                    ? isDark
                      ? 'rgba(37, 99, 235, 0.25)'
                      : '#dbeafe'
                    : isDark
                    ? 'rgba(255,255,255,0.05)'
                    : '#f1f5f9',
                  color: isActive ? (isDark ? '#93c5fd' : '#1d4ed8') : themeStyles.textSecondary,
                  border: `1px solid ${isActive ? '#3b82f6' : themeStyles.border}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}

          {/* Theater Mode Toggle */}
          <button
            type="button"
            onClick={onToggleTheater}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              backgroundColor: isTheaterMode
                ? isDark
                  ? 'rgba(245, 158, 11, 0.25)'
                  : '#fef3c7'
                : isDark
                ? 'rgba(255,255,255,0.06)'
                : '#f1f5f9',
              color: isTheaterMode ? '#f59e0b' : themeStyles.textSecondary,
              border: `1px solid ${isTheaterMode ? '#f59e0b' : themeStyles.border}`,
              cursor: 'pointer',
            }}
            title="Phóng đại toàn màn hình 100% (Theater Mode)"
          >
            <span>{isTheaterMode ? (isVi ? 'Thu Nhỏ' : 'Collapse') : (isVi ? 'Rạp Hát' : 'Theater')}</span>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* TAB 1: BIVARIATE INTERACTIONS & MUTUAL INFORMATION               */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'lens3_bivariate' && activePair && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '6px' }}>
          {/* Pair Selector & Metric Capsule Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 8px',
              borderRadius: '5px',
              backgroundColor: 'var(--bg-canvas, rgba(0,0,0,0.02))',
              border: `1px solid ${themeStyles.border}`,
              flexShrink: 0,
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            {/* Pair Switcher Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
                {isVi ? 'Cặp biến tương tác:' : 'Interaction Pair:'}
              </span>
              {[
                { key: 'words_x_math_density', label: isVi ? 'Mật độ Toán × Số từ' : 'Math Density × Words' },
                { key: 'math_x_authors', label: isVi ? 'Toán × Tác giả' : 'Math × Authors' },
                { key: 'words_x_math', label: isVi ? 'Số từ × Công thức' : 'Words × Math' },
                { key: 'words_x_citations', label: isVi ? 'Số từ × Trích dẫn' : 'Words × Citations' },
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
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Interaction Metric Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  backgroundColor: isDark ? 'rgba(37,99,235,0.15)' : '#eff6ff',
                  border: '1px solid #3b82f6',
                  color: isDark ? '#93c5fd' : '#1d4ed8',
                }}
              >
                Pearson <strong>r = {activePair.pearson_r}</strong> (p = {activePair.pearson_p})
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
                }}
              >
                Spearman <strong>ρ = {activePair.spearman_rho}</strong>
              </div>
              <div
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '3px',
                  backgroundColor: isDark ? 'rgba(234,88,12,0.22)' : '#fff7ed',
                  border: '1px solid #ea580c',
                  color: '#ea580c',
                  boxShadow: '0 0 6px rgba(234,88,12,0.2)',
                }}
              >
                ★ Mutual Info: <strong>I(X; Y) = {activePair.mutual_information}</strong>
              </div>
            </div>
          </div>

          {/* Row: Quadrant Filters, Category Slicers & ChartToolbar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 8px',
              borderRadius: '5px',
              backgroundColor: 'var(--bg-canvas, rgba(0,0,0,0.02))',
              border: `1px solid ${themeStyles.border}`,
              flexShrink: 0,
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                {isVi ? 'Phân vị:' : 'Quadrant:'}
              </span>
              {[
                { id: 'ALL' as const, label: isVi ? 'Tất cả' : 'All' },
                { id: 'Q1' as const, label: isVi ? 'Q1 Lý thuyết' : 'Q1 Theory' },
                { id: 'Q2' as const, label: isVi ? 'Q2 Chuyên khảo' : 'Q2 Monograph' },
                { id: 'Q3' as const, label: isVi ? 'Q3 Bài ngắn' : 'Q3 Short' },
                { id: 'Q4' as const, label: isVi ? 'Q4 LLMs' : 'Q4 LLMs' },
              ].map((q) => {
                const isQActive = selectedQuadrant === q.id;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelectedQuadrant(isQActive && q.id !== 'ALL' ? 'ALL' : q.id)}
                    style={{
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: isQActive ? 700 : 500,
                      backgroundColor: isQActive ? (isDark ? 'rgba(37, 99, 235, 0.25)' : '#dbeafe') : 'transparent',
                      color: isQActive ? (isDark ? '#93c5fd' : '#1d4ed8') : themeStyles.textMuted,
                      border: `1px solid ${isQActive ? '#3b82f6' : themeStyles.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ChartToolbar
                theme={theme}
                zoomLevel={scatterPanZoom.zoom}
                hasPannedOrZoomed={scatterPanZoom.hasPannedOrZoomed}
                onZoomIn={() => scatterPanZoom.zoomIn(0.25)}
                onZoomOut={() => scatterPanZoom.zoomOut(0.25)}
                onResetZoom={scatterPanZoom.resetView}
                isLensActive={isLensActive}
                onToggleLens={() => setIsLensActive((v) => !v)}
                onShowToast={onShowToast}
              />
            </div>
          </div>

          <div style={{ padding: '0 2px 6px' }}>
            <ChartLegend
              title={isVi ? 'Màu chấm = chuyên mục:' : 'Point color = category:'}
              items={[
                ...Object.entries(categoryColors).map(([cat, color]) => ({ label: cat, color, mark: 'dot' as const })),
                { label: isVi ? 'Khác' : 'Other', color: isDark ? '#94a3b8' : '#64748b', mark: 'dot' },
                { label: isVi ? `Hồi quy tuyến tính (r = ${activePair.pearson_r})` : `Linear fit (r = ${activePair.pearson_r})`, color: '#3b82f6', mark: 'dashed' },
                { label: isVi ? 'Xu hướng phi tuyến (spline)' : 'Non-linear trend (spline)', color: '#ea580c', mark: 'line' },
                { label: isVi ? 'Nền 4 góc = nhóm Q1-Q4 (bấm để lọc)' : '4 Quadrants = Q1-Q4 (click to filter)', color: '#94a3b8', mark: 'area' },
              ]}
              note={isVi ? 'Mỗi chấm = 1 bài báo' : 'Each point = 1 paper'}
            />
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
              <text
                x="272"
                y="46"
                textAnchor="middle"
                fontSize="13"
                fontFamily="var(--font-mono)"
                fontWeight="800"
                letterSpacing="1px"
                fill={isDark ? '#f59e0b' : '#d97706'}
                opacity={selectedQuadrant === 'Q1' ? (isDark ? 0.8 : 0.9) : (isDark ? 0.22 : 0.3)}
                style={{ pointerEvents: 'none' }}
              >
                {isVi ? 'Q1 · LÝ THUYẾT (NẶNG TOÁN)' : 'Q1 · THEORY (MATH-HEAVY)'}
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
              <text
                x="697"
                y="46"
                textAnchor="middle"
                fontSize="13"
                fontFamily="var(--font-mono)"
                fontWeight="800"
                letterSpacing="1px"
                fill={isDark ? '#60a5fa' : '#2563eb'}
                opacity={selectedQuadrant === 'Q2' ? (isDark ? 0.8 : 0.9) : (isDark ? 0.22 : 0.3)}
                style={{ pointerEvents: 'none' }}
              >
                {isVi ? 'Q2 · CHUYÊN KHẢO TOÀN DIỆN' : 'Q2 · COMPREHENSIVE MONOGRAPHS'}
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
              <text
                x="272"
                y="278"
                textAnchor="middle"
                fontSize="13"
                fontFamily="var(--font-mono)"
                fontWeight="800"
                letterSpacing="1px"
                fill={isDark ? '#94a3b8' : '#64748b'}
                opacity={selectedQuadrant === 'Q3' ? (isDark ? 0.8 : 0.9) : (isDark ? 0.22 : 0.3)}
                style={{ pointerEvents: 'none' }}
              >
                {isVi ? 'Q3 · BÀI BÁO NGẮN & WORKSHOP' : 'Q3 · SHORT PAPERS & WORKSHOPS'}
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
              <text
                x="697"
                y="278"
                textAnchor="middle"
                fontSize="13"
                fontFamily="var(--font-mono)"
                fontWeight="800"
                letterSpacing="1px"
                fill={isDark ? '#34d399' : '#059669'}
                opacity={selectedQuadrant === 'Q4' ? (isDark ? 0.8 : 0.9) : (isDark ? 0.22 : 0.3)}
                style={{ pointerEvents: 'none' }}
              >
                {isVi ? 'Q4 · HỆ THỐNG THỰC NGHIỆM & LLMs' : 'Q4 · EMPIRICAL SYSTEMS & LLMs'}
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
                      {yVal}
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
                    <text x={px} y="306" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>
                      {xVal >= 1000 ? `${(xVal / 1000).toFixed(0)}k` : xVal}
                    </text>
                  </g>
                );
              })}
              <AxisTitle axis="y" x={22} y={155} text={`${activePair.y_label} (${activePair.y_unit})`} />
              <AxisTitle axis="x" x={485} y={326} text={`${activePair.x_label} (${activePair.x_unit})`} />

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
                      x="890"
                      y={Math.min(275, Math.max(35, py1 - 8))}
                      textAnchor="end"
                      fill="#3b82f6"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      fontWeight="700"
                    >
                      {isVi ? `Hồi quy tuyến tính (r=${activePair.pearson_r})` : `Linear fit (r=${activePair.pearson_r})`}
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
                  </g>
                );
              })()}

              {/* Data Points */}
              {displayPoints.map((pt) => {
                const cx = 60 + Math.min(850, Math.max(0, (pt.x / maxX) * 850));
                const cy = 290 - Math.min(270, Math.max(0, (pt.y / maxY) * 270));
                const isSelected = selectedPaperId === pt.id;
                const isHovered = hoveredPoint?.id === pt.id;
                const col = getCatColor(pt.category);

                // Determine if point falls into the selected quadrant
                const isLeft = cx < 485;
                const isTop = cy <= 160;
                const inQuadrant =
                  selectedQuadrant === 'ALL' ||
                  (selectedQuadrant === 'Q1' && isLeft && isTop) ||
                  (selectedQuadrant === 'Q2' && !isLeft && isTop) ||
                  (selectedQuadrant === 'Q3' && isLeft && !isTop) ||
                  (selectedQuadrant === 'Q4' && !isLeft && !isTop);

                return (
                  <circle
                    key={pt.id}
                    cx={cx}
                    cy={cy}
                    r={isSelected ? '8' : isHovered ? '7' : inQuadrant ? (selectedQuadrant !== 'ALL' ? '5.5' : '4.5') : '3'}
                    fill={col}
                    stroke={isSelected ? '#f59e0b' : (selectedQuadrant !== 'ALL' && inQuadrant ? '#ffffff' : (isDark ? '#0f172a' : '#ffffff'))}
                    strokeWidth={isSelected ? '2.5' : isHovered ? '2' : (selectedQuadrant !== 'ALL' && inQuadrant ? '1.5' : '1')}
                    opacity={isSelected || isHovered ? 1 : inQuadrant ? (selectedQuadrant !== 'ALL' ? 1 : 0.85) : 0.12}
                    style={{ cursor: 'pointer', transition: 'r 0.15s ease, opacity 0.2s ease' }}
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
                        <circle cx={magX} cy={magY} r="6.5" fill={getCatColor(pt.category)} stroke="#ffffff" strokeWidth="2" />
                        <text x={magX} y={magY - 8} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fontWeight="800" fill={themeStyles.textPrimary}>
                          {pt.id.replace('arXiv:', '')}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>

            {/* Hover Tooltip Popup Card */}
            {hoveredPoint && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  maxWidth: '340px',
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
              {isVi ? 'Biến kiểm định:' : 'Test Feature:'}
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
                  {isVi ? 'HỆ SỐ LỆCH (SKEWNESS S)' : 'SKEWNESS (S)'}
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
                  {isVi ? 'ĐỘ NHỌN (KURTOSIS K)' : 'KURTOSIS (K)'}
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
                {isVi ? 'VỊ TRÍ & PHÂN VỊ (CENTROID & QUANTILES)' : 'CENTROID & QUANTILES'}
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
                  {isVi ? 'BIỂU ĐỒ TẦN SUẤT & ĐƯỜNG MẬT ĐỘ GAUSSIAN KDE' : 'FREQUENCY HISTOGRAM & GAUSSIAN KDE'}
                </span>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                  {isVi ? '25 khoảng · Phân kỳ Mean vs Median' : '25 bins · Mean vs Median divergence'}
                </span>
              </div>
              <ChartLegend
                items={[
                  { label: isVi ? 'Số bài trong mỗi khoảng (25 khoảng)' : 'Paper count per bin (25 bins)', color: '#3b82f6', mark: 'bar' },
                  { label: isVi ? 'Mật độ KDE (chuẩn hóa theo đỉnh)' : 'KDE density (normalized)', color: '#06b6d4', mark: 'line' },
                  { label: isVi ? 'Trung bình (mean)' : 'Mean', color: '#2563eb', mark: 'dashed' },
                  { label: isVi ? 'Trung vị (median)' : 'Median', color: '#ea580c', mark: 'dashed' },
                ]}
              />
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <svg
                  viewBox="0 0 500 240"
                  preserveAspectRatio="xMidYMid meet"
                  style={{ width: '100%', height: '100%' }}
                >
                  {/* Axis Baseline */}
                  <line x1="40" y1="200" x2="480" y2="200" stroke={themeStyles.axisLine} strokeWidth="1" />
                  <line x1="40" y1="40" x2="40" y2="200" stroke={themeStyles.axisLine} strokeWidth="1" />
                  {(() => {
                    const bins = activeUnivariate.histogram_bins;
                    const maxCount = Math.max(...bins.map((b) => b.count), 1);
                    const minX = bins[0]?.x0 ?? 0;
                    const maxX = bins[bins.length - 1]?.x1 ?? 1;
                    const fmt = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Number.isInteger(v) ? `${v}` : v.toFixed(1));
                    return (
                      <g>
                        {[0, 0.5, 1].map((r) => (
                          <text key={`y${r}`} x="36" y={200 - r * 160 + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>
                            {Math.round(r * maxCount)}
                          </text>
                        ))}
                        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
                          <text key={`x${r}`} x={45 + r * 430} y="212" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>
                            {fmt(minX + r * (maxX - minX))}
                          </text>
                        ))}
                      </g>
                    );
                  })()}
                  <AxisTitle axis="y" x={12} y={120} text={isVi ? 'Số bài báo' : 'Paper count'} fontSize={10} />
                  <AxisTitle axis="x" x={260} y={232} text={`${activeUnivariate.label} (${activeUnivariate.unit})`} fontSize={10} />

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
                  {isVi ? 'Độ lệch khỏi đường chéo 45°' : 'Deviation from 45° reference line'}
                </span>
              </div>
              <ChartLegend
                items={[
                  { label: isVi ? 'Phân vị của dữ liệu' : 'Sample quantiles', color: '#3b82f6', mark: 'dot' },
                  { label: isVi ? 'Đường y = x (nếu là phân phối chuẩn)' : 'y = x line (Normal distribution)', color: '#dc2626', mark: 'dashed' },
                ]}
              />
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <svg
                  viewBox="0 0 400 240"
                  preserveAspectRatio="xMidYMid meet"
                  style={{ width: '100%', height: '100%' }}
                >
                  {/* Grid Lines */}
                  <line x1="40" y1="20" x2="40" y2="200" stroke={themeStyles.axisLine} strokeWidth="1" />
                  <line x1="40" y1="200" x2="380" y2="200" stroke={themeStyles.axisLine} strokeWidth="1" />

                  {/* Reference y = x (where the points would lie if the variable were normal). X: z in [-2.5, 2.5] -> 60..360,
                      Y: z in [-2.5, 4.5] -> 180..20, so z = 2.5 sits at y = 180 - (5 / 7) * 160 */}
                  <line x1="60" y1="180" x2="360" y2={180 - (5 / 7) * 160} stroke="#dc2626" strokeWidth="2" strokeDasharray="5 3" />
                  {[-2, -1, 0, 1, 2].map((z) => (
                    <text key={`qx${z}`} x={210 + (z / 2.5) * 150} y="212" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>{z}</text>
                  ))}
                  {[-2, 0, 2, 4].map((z) => (
                    <text key={`qy${z}`} x="36" y={180 - ((z + 2.5) / 7) * 160 + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>{z}</text>
                  ))}
                  <AxisTitle axis="y" x={14} y={110} text={isVi ? 'Phân vị thực nghiệm (z)' : 'Sample quantiles (z)'} fontSize={10} />

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

                  <AxisTitle axis="x" x={210} y={232} text={isVi ? 'Phân vị lý thuyết của phân phối chuẩn (z)' : 'Theoretical quantiles (z)'} fontSize={10} />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
