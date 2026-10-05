import { useState, useEffect, useMemo, useRef, useCallback, type FC, type MouseEvent } from 'react';
import type {
  AssociationRulesResponse,
  ClustersResponse,
  GraphResponse,
  TrendsResponse,
  ScatterPointItem,
  AssociationRuleItem,
} from '../api/types';
import {
  fetchAssociationRules,
  fetchClusters,
  fetchGraph,
  fetchTrends,
} from '../api/client';

// ============================================================================
// REUSABLE PAN & ZOOM HOOK & ON-CANVAS CONTROLS
// ============================================================================
interface PanZoomState {
  zoom: number;
  pan: { x: number; y: number };
  isDragging: boolean;
  containerRef: (node: HTMLDivElement | null) => void;
  handleMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseUp: () => void;
  handleMouseLeave: () => void;
  reset: () => void;
}

function useSvgPanZoom(minZoom = 0.5, maxZoom = 5.0): PanZoomState {
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const onWheelNative = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? 1.12 : 0.88;
      setZoom((prev) => {
        const next = Math.min(Math.max(prev * factor, minZoom), maxZoom);
        return parseFloat(next.toFixed(2));
      });
    },
    [minZoom, maxZoom]
  );

  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (nodeRef.current) {
        nodeRef.current.removeEventListener('wheel', onWheelNative);
      }
      if (node) {
        node.addEventListener('wheel', onWheelNative, { passive: false });
      }
      nodeRef.current = node;
    },
    [onWheelNative]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  const reset = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  return {
    zoom,
    pan,
    isDragging,
    containerRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    reset,
  };
}

const PanZoomControls: FC<{
  zoom: number;
  onReset: () => void;
  label?: string;
}> = ({ zoom, onReset, label = 'VIEW' }) => (
  <div
    style={{
      position: 'absolute',
      top: '12px',
      right: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      backgroundColor: 'rgba(15, 23, 42, 0.90)',
      backdropFilter: 'blur(8px)',
      borderRadius: '8px',
      border: '1px solid #334155',
      padding: '4px 10px',
      zIndex: 20,
      userSelect: 'none',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
    }}
  >
    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#94a3b8', fontWeight: 700 }}>
      {label} &bull; <strong style={{ color: '#f8fafc' }}>{Math.round(zoom * 100)}%</strong>
    </span>
    <button
      type="button"
      onClick={onReset}
      title="Đặt lại khung nhìn về mặc định 100% (Reset View)"
      style={{
        backgroundColor: '#1e293b',
        border: '1px solid #475569',
        borderRadius: '5px',
        color: '#38bdf8',
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 800,
        padding: '3px 9px',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#334155';
        e.currentTarget.style.color = '#7dd3fc';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#1e293b';
        e.currentTarget.style.color = '#38bdf8';
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
      RESET
    </button>
  </div>
);

export const MiningPillarsView: FC = () => {
  const [activePillar, setActivePillar] = useState<1 | 2 | 3 | 4>(1);

  // Pillar 1 state
  const [rulesData, setRulesData] = useState<AssociationRulesResponse | null>(null);
  const [liftThreshold, setLiftThreshold] = useState<number>(1.5);
  const [hoveredRule, setHoveredRule] = useState<{ rule: AssociationRuleItem; x: number; y: number } | null>(null);

  // Pillar 2 state
  const [clustersData, setClustersData] = useState<ClustersResponse | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ point: ScatterPointItem; x: number; y: number } | null>(null);
  const [selectedClusterFilter, setSelectedClusterFilter] = useState<number | 'ALL'>('ALL');
  const clusterPanZoom = useSvgPanZoom(0.5, 5.0);

  // Pillar 3 state
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [hoveredGraphNode, setHoveredGraphNode] = useState<{ node: any; x: number; y: number } | null>(null);
  const graphPanZoom = useSvgPanZoom(0.5, 5.0);

  // Pillar 4 state
  const [trendsData, setTrendsData] = useState<TrendsResponse | null>(null);
  const [hoveredAnomaly, setHoveredAnomaly] = useState<{ item: any; x: number; y: number } | null>(null);
  const velocityPanZoom = useSvgPanZoom(0.5, 5.0);
  const anomalyPanZoom = useSvgPanZoom(0.5, 5.0);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAssociationRules(),
      fetchClusters(),
      fetchGraph(),
      fetchTrends(),
    ])
      .then(([rules, clusters, graph, trends]) => {
        setRulesData(rules);
        setClustersData(clusters);
        setGraphData(graph);
        setTrendsData(trends);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Filtered Rules by Lift
  const filteredRules = useMemo(() => {
    if (!rulesData) return [];
    return rulesData.rules.filter((r) => r.lift >= liftThreshold);
  }, [rulesData, liftThreshold]);

  // Dynamic Lift and Support bounds across mined corpus
  const maxLiftInCorpus = useMemo(() => {
    if (!rulesData?.rules?.length) return 3.5;
    return Math.max(...rulesData.rules.map((r) => r.lift));
  }, [rulesData]);

  const maxSupportInRules = useMemo(() => {
    if (!rulesData?.rules?.length) return 0.04;
    const maxSup = Math.max(...rulesData.rules.map((r) => r.support));
    return Math.max(0.04, Math.ceil(maxSup * 100) / 100);
  }, [rulesData]);

  // Filtered Scatter points by cluster
  const filteredClusterPoints = useMemo(() => {
    if (!clustersData) return [];
    if (selectedClusterFilter === 'ALL') return clustersData.scatter_2d;
    return clustersData.scatter_2d.filter((p) => p.cluster === selectedClusterFilter);
  }, [clustersData, selectedClusterFilter]);

  const clusterColors = ['#2563eb', '#0284c7', '#0d9488', '#f59e0b', '#7c3aed', '#e11d48'];

  if (loading) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', backgroundColor: '#ffffff', padding: '14px 24px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" className="animate-spin">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
            [ GOLD LAKEHOUSE ] Đang tải và dựng trực quan 4 Trụ cột Khai phá &amp; Modeling...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', fontFamily: 'var(--font-mono)', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
        [ ERROR ] Không thể nạp dữ liệu 4 Trụ cột Mining: {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', paddingBottom: '40px', position: 'relative' }}>
      {/* ============================================================== */}
      {/* 1. TOP HEADER & 4-PILLAR SELECTOR CARDS                        */}
      {/* ============================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
        }}
      >
        {/* Pillar 1 Card */}
        <button
          type="button"
          onClick={() => setActivePillar(1)}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: activePillar === 1 ? '2px solid #ea580c' : '1px solid #e2e8f0',
            borderTop: '4px solid #ea580c',
            padding: '14px 16px',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activePillar === 1 ? '0 4px 14px rgba(234, 88, 12, 0.15)' : '0 2px 6px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#ea580c' }}>
              TRỤ CỘT 01
            </span>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', backgroundColor: '#fff7ed', color: '#c2410c', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
              FP-GROWTH
            </span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
            LUẬT KẾT HỢP (RULES)
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            {rulesData?.rules.length || 0} Mined Rules &bull; Max Lift {maxLiftInCorpus.toFixed(1)}x
          </div>
        </button>

        {/* Pillar 2 Card */}
        <button
          type="button"
          onClick={() => setActivePillar(2)}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: activePillar === 2 ? '2px solid #2563eb' : '1px solid #e2e8f0',
            borderTop: '4px solid #2563eb',
            padding: '14px 16px',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activePillar === 2 ? '0 4px 14px rgba(37, 99, 235, 0.15)' : '0 2px 6px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#2563eb' }}>
              TRỤ CỘT 02
            </span>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
              K-MEANS 2D
            </span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
            PHÂN CỤM NGỮ NGHĨA
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            6 Cụm đề tài &bull; SVD 2D Manifold
          </div>
        </button>

        {/* Pillar 3 Card */}
        <button
          type="button"
          onClick={() => setActivePillar(3)}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: activePillar === 3 ? '2px solid #7c3aed' : '1px solid #e2e8f0',
            borderTop: '4px solid #7c3aed',
            padding: '14px 16px',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activePillar === 3 ? '0 4px 14px rgba(124, 58, 237, 0.15)' : '0 2px 6px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#7c3aed' }}>
              TRỤ CỘT 03
            </span>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', backgroundColor: '#f5f3ff', color: '#6d28d9', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
              LOUVAIN
            </span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
            ĐỒ THỊ KHOA HỌC (GRAPH)
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            120 Nodes &bull; 243 Edges &bull; PageRank
          </div>
        </button>

        {/* Pillar 4 Card */}
        <button
          type="button"
          onClick={() => setActivePillar(4)}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: activePillar === 4 ? '2px solid #10b981' : '1px solid #e2e8f0',
            borderTop: '4px solid #10b981',
            padding: '14px 16px',
            textAlign: 'left',
            cursor: 'pointer',
            boxShadow: activePillar === 4 ? '0 4px 14px rgba(16, 185, 129, 0.15)' : '0 2px 6px rgba(0,0,0,0.03)',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#10b981' }}>
              TRỤ CỘT 04
            </span>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', backgroundColor: '#ecfdf5', color: '#059669', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
              ISOLATION FOREST
            </span>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
            XU HƯỚNG &amp; DỊ BIỆT
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            +5,940% Surge &bull; 30 Novelty Outliers
          </div>
        </button>
      </div>

      {/* ============================================================== */}
      {/* 2. PILLAR 1: ASSOCIATION RULES & FP-GROWTH VISUAL CHARTS       */}
      {/* ============================================================== */}
      {activePillar === 1 && rulesData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Slicer / Threshold Filter Controls */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#0f172a' }}>
                LỌC NGƯỠNG LIFT TỐI THIỂU:
              </span>
              <input
                type="range"
                min="1.0"
                max={Math.max(10, Math.ceil(maxLiftInCorpus))}
                step="0.5"
                value={liftThreshold}
                onChange={(e) => setLiftThreshold(parseFloat(e.target.value))}
                style={{ accentColor: '#ea580c', cursor: 'pointer', width: '160px' }}
              />
              <span style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#ea580c' }}>
                &ge; {liftThreshold.toFixed(1)}x
              </span>
            </div>

            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#64748b' }}>
              Hiển thị: <strong>{filteredRules.length}</strong> / {rulesData.rules.length} quy tắc kết hợp mạnh
            </div>
          </div>

          {/* Row of Charts: Bubble Scatter Plot + Ranked Bar Chart */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '18px' }}>
            {/* Visual 1.1: Rule Bubble Scatter Plot */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    BIỂU ĐỒ BONG BÓNG PHÂN TÁN (RULE BUBBLE SCATTER PLOT)
                  </h3>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    Trục X: Support (%) &bull; Trục Y: Confidence (0–100%) &bull; Kích thước/Màu: Tỷ lệ Lift
                  </div>
                </div>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#ea580c', backgroundColor: '#fff7ed', padding: '2px 8px', borderRadius: '4px' }}>
                  BUBBLE LIFT
                </span>
              </div>

              {/* SVG Bubble Chart */}
              <div style={{ width: '100%', height: '260px' }}>
                <svg viewBox="0 0 560 260" style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                  {/* Grid Lines for Confidence 0% to 100% */}
                  {[0, 20, 40, 60, 80, 100].map((conf) => {
                    const y = 220 - (conf / 100) * 180;
                    return (
                      <g key={conf}>
                        <line x1="45" y1={y} x2="530" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                        <text x="40" y={y + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="#94a3b8">
                          {conf}%
                        </text>
                      </g>
                    );
                  })}

                  {/* X-axis ticks (Support 0% to maxSupportInRules) */}
                  {[1.0, 2.0, 3.0, 4.0].map((sup) => {
                    const x = 50 + (sup / (maxSupportInRules * 100)) * 470;
                    return (
                      <g key={sup}>
                        <line x1={x} y1="40" x2={x} y2="225" stroke="#f1f5f9" strokeWidth="1" />
                        <text x={x} y="238" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="#94a3b8">
                          {sup}%
                        </text>
                      </g>
                    );
                  })}

                  <line x1="45" y1="220" x2="530" y2="220" stroke="#cbd5e1" strokeWidth="1.5" />
                  <line x1="45" y1="40" x2="45" y2="220" stroke="#cbd5e1" strokeWidth="1.5" />

                  {/* Bubbles with calibrated log radius bounded strictly between 6px and 20px */}
                  {filteredRules.map((rule, idx) => {
                    const cx = 50 + Math.min(470, ((rule.support * 100) / (maxSupportInRules * 100)) * 470);
                    const cy = 220 - Math.min(180, (rule.confidence) * 180);
                    const normLift = Math.log(Math.max(1, rule.lift)) / Math.log(Math.max(2, maxLiftInCorpus));
                    const radius = 6 + Math.max(0, Math.min(1, normLift)) * 14;
                    const isHovered = hoveredRule?.rule.lift === rule.lift && hoveredRule.rule.support === rule.support;

                    const fillColor =
                      rule.lift >= maxLiftInCorpus * 0.7
                        ? '#dc2626'
                        : rule.lift >= maxLiftInCorpus * 0.3
                        ? '#ea580c'
                        : rule.lift >= 3.0
                        ? '#f59e0b'
                        : '#3b82f6';

                    return (
                      <circle
                        key={idx}
                        cx={cx}
                        cy={cy}
                        r={isHovered ? radius + 3 : radius}
                        fill={fillColor}
                        stroke="#ffffff"
                        strokeWidth={isHovered ? '2.5' : '1.5'}
                        opacity={isHovered ? 1 : 0.82}
                        style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                        onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
                          const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                          setHoveredRule({
                            rule,
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                          });
                        }}
                        onMouseLeave={() => setHoveredRule(null)}
                      />
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Visual 1.2: Horizontal Bar Chart of Top Lift Rules */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                XẾP HẠNG LUẬT KẾT HỢP THEO LIFT (BAR CHART)
              </h3>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)', marginBottom: '14px' }}>
                Đo lường độ liên kết vượt trội so với ngẫu nhiên
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredRules.slice(0, 7).map((rule, idx) => {
                  const barWidth = Math.min(100, Math.max(12, (rule.lift / maxLiftInCorpus) * 100));
                  const ant = rule.antecedents[0]?.replace('tag:', '').replace('cat:', '') || '';
                  const con = rule.consequents[0]?.replace('tag:', '').replace('cat:', '') || '';

                  return (
                    <div key={idx}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                          {ant} &rarr; <span style={{ color: '#2563eb' }}>{con}</span>
                        </span>
                        <span style={{ fontWeight: 800, color: '#ea580c' }}>
                          {rule.lift.toFixed(2)}x
                        </span>
                      </div>

                      <div style={{ width: '100%', height: '7px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${barWidth}%`,
                            backgroundColor: idx === 0 ? '#dc2626' : idx === 1 ? '#ea580c' : '#f59e0b',
                            borderRadius: '4px',
                          }}
                        />
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
      {/* 3. PILLAR 2: TOPIC CLUSTERING 2D VECTOR MANIFOLD CHARTS        */}
      {/* ============================================================== */}
      {activePillar === 2 && clustersData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Validity Scorecards Banner */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', borderTop: '4px solid #10b981', padding: '12px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
                SILHOUETTE SCORE
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                {clustersData.validity_metrics.silhouette_score}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                Độ tách biệt cụm chuẩn hóa
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', borderTop: '4px solid #f59e0b', padding: '12px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
                DAVIES-BOULDIN INDEX
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
                {clustersData.validity_metrics.davies_bouldin_index}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                Chỉ số phân tán nội cụm
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', borderTop: '4px solid #2563eb', padding: '12px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
                CALINSKI-HARABASZ INDEX
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                {clustersData.validity_metrics.calinski_harabasz_index}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                Tỷ số phương sai cụm
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', borderTop: '4px solid #7c3aed', padding: '12px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
                SỐ LƯỢNG CỤM (K-MEANS)
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#7c3aed', marginTop: '2px' }}>
                {clustersData.cluster_profiles.length} CLUSTERS
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                {(clustersData.scatter_2d?.length || 10000).toLocaleString()} Embeddings (768-D)
              </div>
            </div>
          </div>

          {/* Grand 2D Vector Semantic Manifold Scatter Plot */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '18px' }}>
            {/* Visual 2.1: 2D Manifold Scatter */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    BIỂU ĐỒ CỤM NGỮ NGHĨA 2D (SEMANTIC VECTOR MANIFOLD)
                  </h3>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    Chiếu giảm chiều Truncated SVD từ 768 chiều &bull; Rê chuột để xem tọa độ &amp; bài báo
                  </div>
                </div>

                {/* Cluster filter pills */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedClusterFilter('ALL')}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: selectedClusterFilter === 'ALL' ? 800 : 600,
                      backgroundColor: selectedClusterFilter === 'ALL' ? '#0f172a' : '#f1f5f9',
                      color: selectedClusterFilter === 'ALL' ? '#ffffff' : '#64748b',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    All
                  </button>
                  {[0, 1, 2, 3, 4, 5].map((cid) => (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => setSelectedClusterFilter(cid)}
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: selectedClusterFilter === cid ? 800 : 600,
                        backgroundColor: selectedClusterFilter === cid ? clusterColors[cid] : '#f1f5f9',
                        color: selectedClusterFilter === cid ? '#ffffff' : '#64748b',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      C#{cid}
                    </button>
                  ))}
                </div>
              </div>

              {/* SVG 2D Vector Space */}
              <div
                ref={clusterPanZoom.containerRef}
                onMouseDown={clusterPanZoom.handleMouseDown}
                onMouseMove={clusterPanZoom.handleMouseMove}
                onMouseUp={clusterPanZoom.handleMouseUp}
                onMouseLeave={clusterPanZoom.handleMouseLeave}
                style={{
                  width: '100%',
                  height: '340px',
                  backgroundColor: '#090d16',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: clusterPanZoom.isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                }}
              >
                <PanZoomControls
                  zoom={clusterPanZoom.zoom}
                  onReset={clusterPanZoom.reset}
                  label="2D MANIFOLD"
                />

                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '12px',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: '#64748b',
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    zIndex: 10,
                    border: '1px solid rgba(51, 65, 85, 0.5)',
                  }}
                >
                  ✥ Kéo chuột để di chuyển &bull; Lăn chuột để phóng to/thu nhỏ
                </div>

                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    transform: `translate(${clusterPanZoom.pan.x}px, ${clusterPanZoom.pan.y}px) scale(${clusterPanZoom.zoom})`,
                    transformOrigin: 'center center',
                    transition: clusterPanZoom.isDragging ? 'none' : 'transform 0.15s ease-out',
                  }}
                >
                  <svg viewBox="-1.2 -1.2 2.4 2.4" style={{ width: '100%', height: '100%', display: 'block' }}>
                    {/* Crosshairs */}
                    <line x1="-1.2" y1="0" x2="1.2" y2="0" stroke="#1e293b" strokeWidth="0.008" />
                    <line x1="0" y1="-1.2" x2="0" y2="1.2" stroke="#1e293b" strokeWidth="0.008" />
                    <circle cx="0" cy="0" r="0.5" fill="none" stroke="#1e293b" strokeWidth="0.006" strokeDasharray="0.02 0.02" />
                    <circle cx="0" cy="0" r="1.0" fill="none" stroke="#1e293b" strokeWidth="0.006" strokeDasharray="0.02 0.02" />

                    {/* Scatter points */}
                    {filteredClusterPoints.map((pt, i) => {
                      const color = clusterColors[pt.cluster % clusterColors.length];
                      const isHovered = hoveredPoint?.point.paper_id === pt.paper_id;

                      return (
                        <circle
                          key={i}
                          cx={pt.x * 2.2}
                          cy={pt.y * 2.2}
                          r={isHovered ? '0.045' : '0.024'}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth={isHovered ? '0.01' : '0.003'}
                          opacity={isHovered ? 1 : 0.8}
                          style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                          onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
                            if (clusterPanZoom.isDragging) return;
                            const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                            setHoveredPoint({
                              point: pt,
                              x: rect.left + rect.width / 2,
                              y: rect.top - 8,
                            });
                          }}
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>

            {/* Visual 2.2: Cluster Profiles & Size Bars */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                QUY MÔ CÁC CỤM ĐỀ TÀI (CLUSTER SIZE BREAKDOWN)
              </h3>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)', marginBottom: '14px' }}>
                Phân bổ {clustersData.cluster_profiles.reduce((acc, c) => acc + c.size, 0).toLocaleString()} bài báo khoa học theo {clustersData.cluster_profiles.length} chủ đề
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '330px' }}>
                {clustersData.cluster_profiles.map((c) => {
                  const color = clusterColors[c.cluster_id % clusterColors.length];
                  return (
                    <div key={c.cluster_id} style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ fontWeight: 800, color }}>
                          CỤM #{c.cluster_id}
                        </span>
                        <span style={{ fontWeight: 800, color: '#0f172a' }}>
                          {c.size} bài ({c.percentage}%)
                        </span>
                      </div>

                      <div style={{ width: '100%', height: '5px', backgroundColor: '#e2e8f0', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, c.percentage * 2.5)}%`, backgroundColor: color }} />
                      </div>

                      <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '6px' }}>
                        {c.dominant_categories.map((d) => `${d.category} (${d.count})`).join(', ')}
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
      {/* 4. PILLAR 3: CO-AUTHORSHIP GRAPH & PAGERANK CHARTS             */}
      {/* ============================================================== */}
      {activePillar === 3 && graphData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Visual 3.1: Co-authorship Network Graph & Visual Influencers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: '18px' }}>
            {/* SVG Network Visual */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    BIỂU ĐỒ MẠNG LƯỚI ĐỒ THỊ KHOA HỌC (CO-AUTHORSHIP NETWORK)
                  </h3>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    Bán kính node: PageRank Centrality &bull; Màu: Louvain Community &bull; Rê chuột để xem tác giả
                  </div>
                </div>

                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '2px 8px', borderRadius: '4px' }}>
                  {graphData.graph_export.nodes.length} NODES &bull; {graphData.graph_export.links.length} EDGES
                </span>
              </div>

              {/* SVG Network Render */}
              <div
                ref={graphPanZoom.containerRef}
                onMouseDown={graphPanZoom.handleMouseDown}
                onMouseMove={graphPanZoom.handleMouseMove}
                onMouseUp={graphPanZoom.handleMouseUp}
                onMouseLeave={graphPanZoom.handleMouseLeave}
                style={{
                  width: '100%',
                  height: '340px',
                  backgroundColor: '#090d16',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: graphPanZoom.isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                }}
              >
                <PanZoomControls
                  zoom={graphPanZoom.zoom}
                  onReset={graphPanZoom.reset}
                  label="GRAPH NETWORK"
                />

                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '12px',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: '#64748b',
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    zIndex: 10,
                    border: '1px solid rgba(51, 65, 85, 0.5)',
                  }}
                >
                  ✥ Kéo chuột để di chuyển &bull; Lăn chuột để phóng to/thu nhỏ
                </div>

                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    transform: `translate(${graphPanZoom.pan.x}px, ${graphPanZoom.pan.y}px) scale(${graphPanZoom.zoom})`,
                    transformOrigin: 'center center',
                    transition: graphPanZoom.isDragging ? 'none' : 'transform 0.15s ease-out',
                  }}
                >
                  <svg viewBox="0 0 600 340" style={{ width: '100%', height: '100%', display: 'block' }}>
                    {/* Edges */}
                    {graphData.graph_export.links.slice(0, 140).map((link, idx) => {
                      const srcIdx = graphData.graph_export.nodes.findIndex((n) => n.id === link.source);
                      const tgtIdx = graphData.graph_export.nodes.findIndex((n) => n.id === link.target);
                      if (srcIdx < 0 || tgtIdx < 0) return null;

                      // Deterministic coordinates based on index and community
                      const srcAngle = (srcIdx / graphData.graph_export.nodes.length) * Math.PI * 2;
                      const srcR = 100 + (srcIdx % 3) * 35;
                      const x1 = 300 + Math.cos(srcAngle) * srcR;
                      const y1 = 170 + Math.sin(srcAngle) * (srcR * 0.75);

                      const tgtAngle = (tgtIdx / graphData.graph_export.nodes.length) * Math.PI * 2;
                      const tgtR = 100 + (tgtIdx % 3) * 35;
                      const x2 = 300 + Math.cos(tgtAngle) * tgtR;
                      const y2 = 170 + Math.sin(tgtAngle) * (tgtR * 0.75);

                      return (
                        <line
                          key={idx}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="#334155"
                          strokeWidth="0.8"
                          strokeOpacity="0.4"
                        />
                      );
                    })}

                    {/* Nodes */}
                    {graphData.graph_export.nodes.slice(0, 70).map((node, idx) => {
                      const angle = (idx / 70) * Math.PI * 2;
                      const r = 90 + (node.community % 4) * 35;
                      const cx = 300 + Math.cos(angle) * r;
                      const cy = 170 + Math.sin(angle) * (r * 0.75);
                      const nodeRadius = Math.max(3.5, node.pagerank * 1200);
                      const color = clusterColors[node.community % clusterColors.length];
                      const isHovered = hoveredGraphNode?.node.id === node.id;

                      return (
                        <circle
                          key={node.id}
                          cx={cx}
                          cy={cy}
                          r={isHovered ? nodeRadius + 3 : nodeRadius}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth={isHovered ? '2' : '0.8'}
                          style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                          onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
                            if (graphPanZoom.isDragging) return;
                            const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                            setHoveredGraphNode({
                              node,
                              x: rect.left + rect.width / 2,
                              y: rect.top - 8,
                            });
                          }}
                          onMouseLeave={() => setHoveredGraphNode(null)}
                        />
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>

            {/* Visual 3.2: Top Influencers Leaderboard */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                XẾP HẠNG TẦM ẢNH HƯỞNG (PAGERANK CENTRALITY)
              </h3>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)', marginBottom: '14px' }}>
                Xác suất truyền tải tri thức theo mạng lưới liên kết đồng tác giả
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {graphData.top_influencers.slice(0, 8).map((inf, idx) => (
                  <div
                    key={inf.author}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: idx < 3 ? '#f5f3ff' : '#f8fafc',
                      border: idx < 3 ? '1px solid #ddd6fe' : '1px solid #e2e8f0',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 800, color: idx < 3 ? '#7c3aed' : '#64748b' }}>
                        #{idx + 1}
                      </span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{inf.author}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: '#059669', fontWeight: 800 }}>
                        {inf.pagerank.toFixed(5)}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '10px' }}>
                        {inf.degree} deg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. PILLAR 4: TREND VELOCITY & NOVELTY OUTLIER CHARTS           */}
      {/* ============================================================== */}
      {activePillar === 4 && trendsData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '18px' }}>
            {/* Visual 4.1: Clustered Column Chart for Growth Momentum */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    BIỂU ĐỒ CỘT SO SÁNH TỐC ĐỘ TĂNG TRƯỞNG (TREND VELOCITY)
                  </h3>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    So sánh số lượng bài báo: Quý gần nhất vs. Quý trước đó
                  </div>
                </div>

                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#059669', backgroundColor: '#ecfdf5', padding: '2px 8px', borderRadius: '4px' }}>
                  SURGE VELOCITY
                </span>
              </div>

              {/* Clustered Column SVG with Pan & Zoom */}
              <div
                ref={velocityPanZoom.containerRef}
                onMouseDown={velocityPanZoom.handleMouseDown}
                onMouseMove={velocityPanZoom.handleMouseMove}
                onMouseUp={velocityPanZoom.handleMouseUp}
                onMouseLeave={velocityPanZoom.handleMouseLeave}
                style={{
                  width: '100%',
                  height: '240px',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: velocityPanZoom.isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                }}
              >
                <PanZoomControls
                  zoom={velocityPanZoom.zoom}
                  onReset={velocityPanZoom.reset}
                  label="VELOCITY"
                />

                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '12px',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: '#64748b',
                    backgroundColor: 'rgba(255, 255, 255, 0.90)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    zIndex: 10,
                    border: '1px solid rgba(226, 232, 240, 0.9)',
                  }}
                >
                  ✥ Kéo chuột để di chuyển &bull; Lăn chuột để phóng to/thu nhỏ
                </div>

                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    transform: `translate(${velocityPanZoom.pan.x}px, ${velocityPanZoom.pan.y}px) scale(${velocityPanZoom.zoom})`,
                    transformOrigin: 'center center',
                    transition: velocityPanZoom.isDragging ? 'none' : 'transform 0.15s ease-out',
                  }}
                >
                  <svg viewBox="0 0 520 240" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    {/* Grid Lines */}
                    {[0, 600, 1200, 1800, 2400].map((v) => {
                      const y = 190 - (v / 2400) * 150;
                      return (
                        <g key={v}>
                          <line x1="45" y1={y} x2="500" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                          <text x="40" y={y + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="#94a3b8">
                            {v}
                          </text>
                        </g>
                      );
                    })}

                    <line x1="45" y1="190" x2="500" y2="190" stroke="#cbd5e1" strokeWidth="1" />

                    {/* Dual Columns per category */}
                    {trendsData.trend_velocity.slice(0, 6).map((trend, idx) => {
                      const groupX = 65 + idx * 72;
                      const prevH = Math.max(4, (trend.previous_quarter_papers / 2400) * 150);
                      const recentH = Math.max(8, (trend.recent_quarter_papers / 2400) * 150);

                      return (
                        <g key={trend.category}>
                          {/* Previous Quarter Bar */}
                          <rect
                            x={groupX}
                            y={190 - prevH}
                            width="16"
                            height={prevH}
                            rx="3"
                            fill="#94a3b8"
                          />

                          {/* Recent Quarter Bar */}
                          <rect
                            x={groupX + 18}
                            y={190 - recentH}
                            width="20"
                            height={recentH}
                            rx="3"
                            fill="#2563eb"
                          />

                          {/* Growth Percentage Label */}
                          <text
                            x={groupX + 18}
                            y={190 - recentH - 5}
                            textAnchor="middle"
                            fontSize="8"
                            fontFamily="var(--font-mono)"
                            fontWeight="800"
                            fill="#059669"
                          >
                            +{Math.round(trend.growth_rate_pct)}%
                          </text>

                          {/* Category Name */}
                          <text
                            x={groupX + 18}
                            y="206"
                            textAnchor="middle"
                            fontSize="10"
                            fontFamily="var(--font-mono)"
                            fontWeight="700"
                            fill="#0f172a"
                          >
                            {trend.category}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>

            {/* Visual 4.2: Novelty Outlier Scatter Plot (Isolation Forest) */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    BIỂU ĐỒ ĐIỂM DỊ BIỆT (NOVELTY OUTLIER SCATTER)
                  </h3>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    Các công trình dị biệt tiên phong do Isolation Forest gắn cờ
                  </div>
                </div>

                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>
                  {trendsData.anomalies.length} OUTLIERS
                </span>
              </div>

              {/* Anomaly Scatter SVG with Pan & Zoom */}
              <div
                ref={anomalyPanZoom.containerRef}
                onMouseDown={anomalyPanZoom.handleMouseDown}
                onMouseMove={anomalyPanZoom.handleMouseMove}
                onMouseUp={anomalyPanZoom.handleMouseUp}
                onMouseLeave={anomalyPanZoom.handleMouseLeave}
                style={{
                  width: '100%',
                  height: '240px',
                  backgroundColor: '#090d16',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: anomalyPanZoom.isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                }}
              >
                <PanZoomControls
                  zoom={anomalyPanZoom.zoom}
                  onReset={anomalyPanZoom.reset}
                  label="OUTLIERS"
                />

                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '12px',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    color: '#64748b',
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                    zIndex: 10,
                    border: '1px solid rgba(51, 65, 85, 0.5)',
                  }}
                >
                  ✥ Kéo chuột để di chuyển &bull; Lăn chuột để phóng to/thu nhỏ
                </div>

                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    transform: `translate(${anomalyPanZoom.pan.x}px, ${anomalyPanZoom.pan.y}px) scale(${anomalyPanZoom.zoom})`,
                    transformOrigin: 'center center',
                    transition: anomalyPanZoom.isDragging ? 'none' : 'transform 0.15s ease-out',
                  }}
                >
                  <svg viewBox="0 0 460 240" style={{ width: '100%', height: '100%' }}>
                    <line x1="40" y1="200" x2="430" y2="200" stroke="#334155" strokeWidth="1" />
                    <line x1="40" y1="20" x2="40" y2="200" stroke="#334155" strokeWidth="1" />

                    {/* Outlier Dots */}
                    {trendsData.anomalies.map((anom, idx) => {
                      const cx = 40 + Math.min(370, (anom.word_count / 42000) * 370);
                      const cy = 200 - Math.min(170, (anom.math_count / 4000) * 170);
                      const isHovered = hoveredAnomaly?.item.paper_id === anom.paper_id;

                      return (
                        <g key={idx}>
                          {/* Glow ring */}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isHovered ? '9' : '6'}
                            fill="rgba(239, 68, 68, 0.25)"
                          />
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isHovered ? '5' : '3.5'}
                            fill="#ef4444"
                            stroke="#ffffff"
                            strokeWidth="1.2"
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
                              if (anomalyPanZoom.isDragging) return;
                              const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                              setHoveredAnomaly({
                                item: anom,
                                x: rect.left + rect.width / 2,
                                y: rect.top - 8,
                              });
                            }}
                            onMouseLeave={() => setHoveredAnomaly(null)}
                          />
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* FLOATING TOOLTIPS FOR ALL 4 PILLAR CHARTS                      */}
      {/* ============================================================== */}
      {hoveredRule && (
        <div style={{ position: 'fixed', left: `${hoveredRule.x}px`, top: `${hoveredRule.y}px`, transform: 'translate(-50%, -100%)', backgroundColor: '#0f172a', color: '#ffffff', padding: '10px 14px', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 1000, pointerEvents: 'none', maxWidth: '300px', border: '1px solid #334155', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          <div style={{ color: '#ea580c', fontWeight: 800 }}>
            {hoveredRule.rule.antecedents.join(' + ')} &rarr; {hoveredRule.rule.consequents.join(' + ')}
          </div>
          <div style={{ marginTop: '4px', color: '#f8fafc' }}>
            Lift: <strong style={{ color: '#ea580c' }}>{hoveredRule.rule.lift.toFixed(3)}x</strong> &bull; Confidence: <strong style={{ color: '#10b981' }}>{(hoveredRule.rule.confidence * 100).toFixed(1)}%</strong>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>
            Support: {(hoveredRule.rule.support * 100).toFixed(2)}% &bull; Leverage: {hoveredRule.rule.leverage.toFixed(4)}
          </div>
        </div>
      )}

      {hoveredPoint && (
        <div style={{ position: 'fixed', left: `${hoveredPoint.x}px`, top: `${hoveredPoint.y}px`, transform: 'translate(-50%, -100%)', backgroundColor: '#0f172a', color: '#ffffff', padding: '10px 14px', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 1000, pointerEvents: 'none', maxWidth: '300px', border: '1px solid #334155', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          <div style={{ color: '#38bdf8', fontWeight: 800 }}>
            PAPER: {hoveredPoint.point.paper_id} &bull; CỤM #{hoveredPoint.point.cluster}
          </div>
          <div style={{ color: '#f8fafc', fontWeight: 600, marginTop: '3px' }}>
            {hoveredPoint.point.title}
          </div>
        </div>
      )}

      {hoveredGraphNode && (
        <div style={{ position: 'fixed', left: `${hoveredGraphNode.x}px`, top: `${hoveredGraphNode.y}px`, transform: 'translate(-50%, -100%)', backgroundColor: '#0f172a', color: '#ffffff', padding: '8px 12px', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 1000, pointerEvents: 'none', border: '1px solid #334155', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          <div style={{ color: '#c084fc', fontWeight: 800 }}>
            {hoveredGraphNode.node.label || hoveredGraphNode.node.id}
          </div>
          <div style={{ color: '#10b981', marginTop: '2px' }}>
            PageRank: <strong>{hoveredGraphNode.node.pagerank.toFixed(6)}</strong>
          </div>
          <div style={{ color: '#94a3b8', fontSize: '10px' }}>
            Liên kết: {hoveredGraphNode.node.degree} tác giả &bull; {hoveredGraphNode.node.paper_count} bài báo
          </div>
        </div>
      )}

      {hoveredAnomaly && (
        <div style={{ position: 'fixed', left: `${hoveredAnomaly.x}px`, top: `${hoveredAnomaly.y}px`, transform: 'translate(-50%, -100%)', backgroundColor: '#0f172a', color: '#ffffff', padding: '10px 14px', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 1000, pointerEvents: 'none', maxWidth: '320px', border: '1px solid #334155', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          <div style={{ color: '#ef4444', fontWeight: 800 }}>
            OUTLIER: arXiv:{hoveredAnomaly.item.paper_id} &bull; {hoveredAnomaly.item.primary_category}
          </div>
          <div style={{ color: '#f8fafc', fontWeight: 600, marginTop: '2px' }}>
            {hoveredAnomaly.item.title}
          </div>
          <div style={{ color: '#ea580c', marginTop: '4px' }}>
            {hoveredAnomaly.item.math_count} eq &bull; {hoveredAnomaly.item.word_count.toLocaleString()} words
          </div>
        </div>
      )}
    </div>
  );
};
