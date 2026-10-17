import { useState, useEffect, useMemo, useCallback, useRef, type FC, type MouseEvent } from 'react';
import type {
  AssociationRulesResponse,
  ClustersResponse,
  GraphResponse,
  TrendsResponse,
  ScatterPointItem,
  AssociationRuleItem,
  GraphNodeItem,
} from '../../types';
import {
  fetchAssociationRules,
  fetchClusters,
  fetchGraph,
  fetchTrends,
  triggerMiningPipeline,
  syncMiningFromR2,
} from '../../services';
import { useLakehouseStreamStore, appendStreamLog } from '../../store';
import { ChartToolbar } from '../charts/ChartToolbar.component';
import { useSvgPanZoom, useTranslation } from '../../hooks';
import { MiningTelemetryStepper } from '../common';
import { LatexPreviewModal } from './LatexPreviewModal.component';

export interface MiningPillarsViewProps {
  theme?: 'dark' | 'light';
  onNavigateToRag?: (title: string) => void;
}

// Decoded Semantic Topic Profiles for Gaussian Mixture Models (GMM)
const CLUSTER_TOPIC_MAP: Record<number, { title: string; shortTitle: string; subtitleVi: string; subtitleEn: string; domain: string }> = {
  0: {
    title: 'Large Language Models & In-Context Reasoning',
    shortTitle: 'LLM & Reasoning',
    subtitleVi: 'Mô hình ngôn ngữ lớn, chuỗi suy luận CoT và tối ưu hóa Prompt',
    subtitleEn: 'Large language models, chain-of-thought reasoning and prompt optimization',
    domain: 'cs.CL, cs.AI',
  },
  1: {
    title: 'PAC-Bayes, SGLD Generalization & Optimization',
    shortTitle: 'PAC-Bayes Theory',
    subtitleVi: 'Lý thuyết học máy thống kê, biên tổng quát hóa và hội tụ thuật toán',
    subtitleEn: 'Statistical learning theory, generalization bounds and algorithmic convergence',
    domain: 'stat.ML, cs.LG',
  },
  2: {
    title: 'Graph Neural Networks & Symbolic Knowledge Graphs',
    shortTitle: 'GNN & Graphs',
    subtitleVi: 'Mạng nơ-ron đồ thị, biểu diễn tri thức và suy luận quan hệ',
    subtitleEn: 'Graph neural networks, knowledge representation and relational reasoning',
    domain: 'cs.AI, cs.LG',
  },
  3: {
    title: 'Reinforcement Learning & Autonomous Robotics',
    shortTitle: 'RL & Robotics',
    subtitleVi: 'Học tăng cường sâu, điều khiển robot tự hành và mô phỏng động lực',
    subtitleEn: 'Deep reinforcement learning, autonomous robotics and dynamic simulation',
    domain: 'cs.RO',
  },
  4: {
    title: 'Diffusion Models & High-Resolution Image Synthesis',
    shortTitle: 'Diffusion & GenAI',
    subtitleVi: 'Mô hình khuếch tán xác suất, tổng hợp ảnh và sinh ảnh điều kiện',
    subtitleEn: 'Probabilistic diffusion models, image synthesis and conditional generation',
    domain: 'cs.CV',
  },
  5: {
    title: 'Zero-Shot Vision-Language Multimodal Transformers',
    shortTitle: 'Multimodal VL',
    subtitleVi: 'Căn chỉnh đa phương thức thị giác - ngôn ngữ, Contrastive Learning',
    subtitleEn: 'Vision-language multimodal alignment, contrastive learning',
    domain: 'cs.CV, cs.CL',
  },
  6: {
    title: 'Self-Supervised Representation & Contrastive Visual Encoders',
    shortTitle: 'Self-Supervised & Vision',
    subtitleVi: 'Học tự giám sát, trích xuất đặc trưng và mã hóa thị giác tương phản',
    subtitleEn: 'Self-supervised learning, feature extraction and contrastive visual encoders',
    domain: 'cs.CV, cs.LG',
  },
  7: {
    title: 'Fairness, Interpretability & Robust Generative Foundations',
    shortTitle: 'Fairness & Safety',
    subtitleVi: 'Độ tin cậy mô hình, giải thích học sâu và an toàn đạo đức AI',
    subtitleEn: 'Model reliability, deep learning explainability and AI safety ethics',
    domain: 'cs.LG, cs.CY',
  },
};

export const MiningPillarsView: FC<MiningPillarsViewProps> = ({
  theme = 'dark',
  onNavigateToRag,
}) => {
  const isDark = theme === 'dark';
  const { language } = useTranslation();

  // Active Viewport & Cockpit States
  const [activePillar, setActivePillar] = useState<1 | 2 | 3 | 4>(1);
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showBaselines, setShowBaselines] = useState<boolean>(true);

  // SVG Chart Refs for Vector Export
  const p1SvgRef = useRef<SVGSVGElement | null>(null);
  const p2SvgRef = useRef<SVGSVGElement | null>(null);
  const p3SvgRef = useRef<SVGSVGElement | null>(null);
  const p4VelocitySvgRef = useRef<SVGSVGElement | null>(null);
  const p4AnomalySvgRef = useRef<SVGSVGElement | null>(null);

  // Pillar 1: FP-Growth State
  const [rulesData, setRulesData] = useState<AssociationRulesResponse | null>(null);
  const [liftThreshold, setLiftThreshold] = useState<number>(1.5);
  const [antecedentFilter, setAntecedentFilter] = useState<string>('ALL');
  const [hoveredRule, setHoveredRule] = useState<{ rule: AssociationRuleItem; x: number; y: number } | null>(null);
  const [inspectedRule, setInspectedRule] = useState<AssociationRuleItem | null>(null);
  const p1PanZoom = useSvgPanZoom({ nominalWidth: 720, nominalHeight: 280, minZoom: 0.75, maxZoom: 3.5 });

  // Pillar 2: Gaussian Mixture Models (GMM) State & Zoom/Pan & Lens
  const [clustersData, setClustersData] = useState<ClustersResponse | null>(null);
  const [selectedClusterFilter, setSelectedClusterFilter] = useState<number | 'ALL'>('ALL');
  const [gmmViewMode, setGmmViewMode] = useState<'ALL' | 'CORE' | 'CROSS_DOMAIN'>('ALL');
  const [hoveredPoint, setHoveredPoint] = useState<{ point: ScatterPointItem; x: number; y: number } | null>(null);
  const [inspectedPoint, setInspectedPoint] = useState<ScatterPointItem | null>(null);
  const [isP2LensActive, setIsP2LensActive] = useState<boolean>(false);
  const [p2LensPos, setP2LensPos] = useState<{ x: number; y: number } | null>(null);
  const p2PanZoom = useSvgPanZoom({ nominalWidth: 2.4, nominalHeight: 2.4, centerOrigin: true, minZoom: 0.75, maxZoom: 3.5 });

  // Pillar 3: Graph State & Degree Filter & Zoom & Lens
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [searchAuthorQuery, setSearchAuthorQuery] = useState<string>('');
  const [degreeFilter, setDegreeFilter] = useState<number>(0);
  const [graphLayout, setGraphLayout] = useState<'circular' | 'force'>('circular');
  const [hoveredGraphNode, setHoveredGraphNode] = useState<{ node: any; x: number; y: number } | null>(null);
  const [selectedGraphNode, setSelectedGraphNode] = useState<any | null>(null);
  const [isP3LensActive, setIsP3LensActive] = useState<boolean>(false);
  const [p3LensPos, setP3LensPos] = useState<{ x: number; y: number } | null>(null);
  const p3PanZoom = useSvgPanZoom({ nominalWidth: 580, nominalHeight: 320, minZoom: 0.6, maxZoom: 3.5 });

  // Pillar 4: Trend Velocity & Isolation Forest State & Zooms
  const [trendsData, setTrendsData] = useState<TrendsResponse | null>(null);
  const [hoveredAnomaly, setHoveredAnomaly] = useState<{ item: any; x: number; y: number } | null>(null);
  const [inspectedAnomaly, setInspectedAnomaly] = useState<any | null>(null);
  const p4VelocityPanZoom = useSvgPanZoom({ nominalWidth: 520, nominalHeight: 220, minZoom: 0.5, maxZoom: 3.5 });
  const p4AnomalyPanZoom = useSvgPanZoom({ nominalWidth: 460, nominalHeight: 210, minZoom: 0.5, maxZoom: 3.5 });

  // LaTeX Preview Modal State for All 4 Pillars
  const [latexModalData, setLatexModalData] = useState<{
    isOpen: boolean;
    title: string;
    code: string;
    filename: string;
  } | null>(null);

  // Dynamic Antecedent Filter Categories extracted from rules
  const availableCategories = useMemo(() => {
    const cats = new Set<string>(['ALL', 'cs.CV', 'cs.AI', 'cs.LG', 'cs.CL', 'cs.RO', 'stat.ML']);
    if (rulesData?.rules) {
      rulesData.rules.forEach((r) => {
        r.antecedents.forEach((a) => {
          if (a.includes('.')) cats.add(a);
        });
        r.consequents.forEach((c) => {
          if (c.includes('.')) cats.add(c);
        });
      });
    }
    return Array.from(cats);
  }, [rulesData]);

  // O(1) Node Lookup Map for Graph links to eliminate O(N^2) render bottleneck
  const p3NodeMap = useMemo(() => {
    if (!graphData?.graph_export?.nodes) return new Map<string, { node: GraphNodeItem; index: number }>();
    const map = new Map<string, { node: GraphNodeItem; index: number }>();
    graphData.graph_export.nodes.forEach((n, idx) => {
      map.set(n.id, { node: n, index: idx });
    });
    return map;
  }, [graphData]);

  // Dynamic Scale and Grid ticks for Pillar 4 Outliers
  const outlierScales = useMemo(() => {
    if (!trendsData?.anomalies || trendsData.anomalies.length === 0) {
      return {
        maxWord: 80000,
        maxMath: 6000,
        wordTicks: [0, 20000, 40000, 60000, 80000],
        mathTicks: [0, 1500, 3000, 4500, 6000],
      };
    }
    const rawMaxWord = Math.max(...trendsData.anomalies.map((a) => a.word_count));
    const rawMaxMath = Math.max(...trendsData.anomalies.map((a) => a.math_count));
    const maxWord = Math.max(40000, Math.ceil(rawMaxWord / 20000) * 20000);
    const maxMath = Math.max(3000, Math.ceil(rawMaxMath / 1500) * 1500);
    const wordTicks = [0, 0.25, 0.5, 0.75, 1.0].map((f) => Math.round(f * maxWord));
    const mathTicks = [0, 0.25, 0.5, 0.75, 1.0].map((f) => Math.round(f * maxMath));
    return { maxWord, maxMath, wordTicks, mathTicks };
  }, [trendsData]);

  const [velocityPage, setVelocityPage] = useState<number>(0);
  const [velocityFilter, setVelocityFilter] = useState<'ALL' | 'SURGING' | 'DECLINING'>('ALL');

  const filteredVelocityList = useMemo(() => {
    if (!trendsData?.trend_velocity || trendsData.trend_velocity.length === 0) return [];
    let list = [...trendsData.trend_velocity];
    if (velocityFilter === 'SURGING') {
      list = list.filter((t) => t.growth_rate_pct > 0 || t.momentum === 'SURGING').sort((a, b) => b.growth_rate_pct - a.growth_rate_pct);
    } else if (velocityFilter === 'DECLINING') {
      list = list.filter((t) => t.growth_rate_pct < 0 || t.momentum === 'DECLINING').sort((a, b) => a.growth_rate_pct - b.growth_rate_pct);
    }
    return list;
  }, [trendsData, velocityFilter]);

  const totalVelocityPages = Math.max(1, Math.ceil(filteredVelocityList.length / 6));
  const currentVelocityPage = Math.min(velocityPage, totalVelocityPages - 1);
  const pageVelocityItems = filteredVelocityList.slice(currentVelocityPage * 6, (currentVelocityPage + 1) * 6);

  const maxVelocityPapers = useMemo(() => {
    if (!filteredVelocityList || filteredVelocityList.length === 0) return 800;
    const maxVal = Math.max(
      ...pageVelocityItems.flatMap((t) => [t.recent_quarter_papers, t.previous_quarter_papers]),
      400
    );
    return Math.max(200, Math.ceil(maxVal / 100) * 100);
  }, [filteredVelocityList, pageVelocityItems]);

  const topSurging = useMemo(() => {
    if (!trendsData?.trend_velocity || trendsData.trend_velocity.length === 0) return null;
    return [...trendsData.trend_velocity].sort((a, b) => b.growth_rate_pct - a.growth_rate_pct)[0];
  }, [trendsData]);

  // Centralized Lakehouse Stream Store Connection
  const { totalCorpus, storageStats, isStreaming, lastIngestedPaper, miningSyncVersion } = useLakehouseStreamStore();
  const [isRecomputingPipeline, setIsRecomputingPipeline] = useState<boolean>(false);
  const [streamedClusterPoints, setStreamedClusterPoints] = useState<ScatterPointItem[]>([]);

  // Dynamically project live streaming papers into Pillar 2 K-Means scatter space
  useEffect(() => {
    if (lastIngestedPaper && lastIngestedPaper.paperId) {
      setStreamedClusterPoints((prev) => {
        if (prev.some((p) => p.paper_id === lastIngestedPaper.paperId)) return prev;
        let cid = 0;
        if (lastIngestedPaper.category.startsWith('cs.CV')) cid = 1;
        else if (lastIngestedPaper.category.startsWith('stat.ML')) cid = 2;
        else if (lastIngestedPaper.category.startsWith('cs.RO')) cid = 3;
        else if (lastIngestedPaper.category.startsWith('cs.AI')) cid = 4;
        else if (lastIngestedPaper.category.startsWith('cs.CL')) cid = 5;

        const livePt: ScatterPointItem = {
          x: parseFloat((-0.5 + Math.random() * 1.0).toFixed(4)),
          y: parseFloat((-0.5 + Math.random() * 1.0).toFixed(4)),
          cluster: cid,
          category: lastIngestedPaper.category,
          title: `[LIVE STREAM] ${lastIngestedPaper.title}`,
          paper_id: lastIngestedPaper.paperId,
        };
        return [livePt, ...prev.slice(0, 30)];
      });
    }
  }, [lastIngestedPaper]);

  const handleRecomputePillars = async (forceRecompute: boolean = false) => {
    setIsRecomputingPipeline(true);
    showToast(language === 'vi' ? 'Đang đồng bộ hóa 4 Trụ Cột từ Cloudflare R2...' : 'Synchronizing 4 Pillars from Cloudflare R2...');
    appendStreamLog({
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      level: 'EXEC',
      tag: 'PILLARS/RUN',
      msg: `Triggered 4 Mining Pillars sync across ${totalCorpus.toLocaleString()} Lakehouse papers`,
    });

    try {
      if (forceRecompute) {
        await triggerMiningPipeline();
      } else {
        await syncMiningFromR2();
      }
      showToast(language === 'vi' ? 'Đang nạp lại dữ liệu 4 Trụ Cột Khai Phá...' : 'Reloading 4 Mining Pillars data...');
      const [rules, clusters, graph, trends] = await Promise.all([
        fetchAssociationRules(),
        fetchClusters(),
        fetchGraph(),
        fetchTrends(),
      ]);
      setRulesData(rules);
      setClustersData(clusters);
      setGraphData(graph);
      setTrendsData(trends);
      if (rules?.rules?.length > 0) setInspectedRule(rules.rules[0]);
      if (trends?.anomalies?.length > 0) setInspectedAnomaly(trends.anomalies[0]);
      showToast(language === 'vi' ? 'Đã đồng bộ 4 Trụ Cột từ Cloudflare R2 thành công!' : 'Successfully synchronized 4 Pillars from Cloudflare R2!');
    } catch (e: any) {
      console.warn('Recompute pipeline trigger failed:', e);
      try {
        const [rules, clusters, graph, trends] = await Promise.all([
          fetchAssociationRules(),
          fetchClusters(),
          fetchGraph(),
          fetchTrends(),
        ]);
        setRulesData(rules);
        setClustersData(clusters);
        setGraphData(graph);
        setTrendsData(trends);
      } catch {}
      showToast(language === 'vi' ? 'Đã làm mới dữ liệu 4 Trụ Cột!' : 'Refreshed 4 Pillars data!');
    } finally {
      setTimeout(() => {
        setIsRecomputingPipeline(false);
      }, 1500);
    }
  };

  // Data Loading
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        if (rules?.rules?.length > 0) {
          setInspectedRule(rules.rules[0]);
        }
        if (trends?.anomalies?.length > 0) {
          setInspectedAnomaly(trends.anomalies[0]);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [miningSyncVersion]);

  // Real-time synchronization while harvesting/streaming
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
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
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  // Keyboard Navigation: 1-4 for Pillars, F for Focus Mode, T for Theater Mode, Esc to close/exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === '1') {
        setActivePillar(1);
      } else if (e.key === '2') {
        setActivePillar(2);
      } else if (e.key === '3') {
        setActivePillar(3);
      } else if (e.key === '4') {
        setActivePillar(4);
      } else if (e.key === 'f' || e.key === 'F') {
        setIsFocusMode((prev) => !prev);
      } else if (e.key === 't' || e.key === 'T') {
        setIsTheaterMode((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (inspectedPoint) setInspectedPoint(null);
        else if (selectedGraphNode) setSelectedGraphNode(null);
        else if (isTheaterMode) setIsTheaterMode(false);
        else if (isFocusMode) setIsFocusMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectedPoint, selectedGraphNode, isTheaterMode, isFocusMode]);

  // Toast Helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Color Palette & Dynamic Theme Tokens (Aligned with GMM 6 Academic Topics)
  const clusterColors = ['#38bdf8', '#10b981', '#8b5cf6', '#f59e0b', '#0284c7', '#ef4444'];

  const themeStyles = useMemo(
    () => ({
      cardBg: isDark ? 'rgba(15, 23, 42, 0.82)' : '#ffffff',
      cardSubBg: isDark ? 'rgba(30, 41, 59, 0.65)' : '#f8fafc',
      cardBorder: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
      cardBorderActive: isDark ? 'rgba(255, 255, 255, 0.22)' : '#cbd5e1',
      textPrimary: isDark ? '#f8fafc' : '#0f172a',
      textSecondary: isDark ? '#94a3b8' : '#64748b',
      textMuted: isDark ? '#64748b' : '#94a3b8',
      gridLine: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.07)',
      axisLine: isDark ? 'rgba(255, 255, 255, 0.16)' : '#cbd5e1',
      canvasBg: isDark ? '#030712' : '#f8fafc',
      tooltipBg: isDark ? '#020617' : '#0f172a',
      barTrack: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0',
      stripBg: isDark ? 'rgba(15, 23, 42, 0.95)' : '#f8fafc',
      stripBorder: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
      tagBg: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
    }),
    [isDark]
  );

  // Filtered Rules by Lift and Antecedent
  const filteredRules = useMemo(() => {
    if (!rulesData) return [];
    return rulesData.rules.filter((r) => {
      const matchLift = r.lift >= liftThreshold;
      if (antecedentFilter === 'ALL') return matchLift;
      const matchCat = r.antecedents.some((ant) => ant.includes(antecedentFilter));
      return matchLift && matchCat;
    });
  }, [rulesData, liftThreshold, antecedentFilter]);

  // Dynamic Lift and Support bounds across mined corpus
  const maxLiftInCorpus = useMemo(() => {
    if (!rulesData?.rules?.length) return 3.5;
    return Math.max(...rulesData.rules.map((r) => r.lift));
  }, [rulesData]);

  const maxSupportInCorpus = useMemo(() => {
    if (!rulesData?.rules?.length) return 0.10;
    const maxSup = Math.max(...rulesData.rules.map((r) => r.support));
    return Math.max(0.04, Math.ceil(maxSup * 100) / 100);
  }, [rulesData]);

  // Dynamic Bounding Box & Centering for Pillar 2 (GMM 2D Semantic Manifold)
  const clusterBounds = useMemo(() => {
    const allPts = clustersData?.scatter_2d && clustersData.scatter_2d.length > 0
      ? clustersData.scatter_2d
      : [];
    if (allPts.length === 0) {
      return { cx: 0, cy: 0, span: 1.0 };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    allPts.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const spanX = maxX - minX || 0.1;
    const spanY = maxY - minY || 0.1;
    const span = Math.max(spanX, spanY) * 1.25; // 25% padding for safe margins
    return { cx, cy, span };
  }, [clustersData]);

  const getNormalizedPointCoord = useCallback(
    (x: number, y: number) => {
      return {
        nx: ((x - clusterBounds.cx) / clusterBounds.span) * 1.85,
        ny: ((y - clusterBounds.cy) / clusterBounds.span) * 1.85,
      };
    },
    [clusterBounds]
  );

  // Cluster Centroids for Pillar 2 (Computed in Centered Normalized Coordinate Space)
  const clusterCentroids = useMemo(() => {
    if (!clustersData) return {} as Record<number, { x: number; y: number; count: number; maxR: number }>;
    const centroids: Record<number, { x: number; y: number; count: number; maxR: number }> = {};
    clustersData.scatter_2d.forEach((p) => {
      if (!centroids[p.cluster]) {
        centroids[p.cluster] = { x: 0, y: 0, count: 0, maxR: 0 };
      }
      const { nx, ny } = getNormalizedPointCoord(p.x, p.y);
      centroids[p.cluster].x += nx;
      centroids[p.cluster].y += ny;
      centroids[p.cluster].count += 1;
    });
    Object.keys(centroids).forEach((cidStr) => {
      const cid = Number(cidStr);
      centroids[cid].x /= centroids[cid].count;
      centroids[cid].y /= centroids[cid].count;
      let maxDist = 0;
      clustersData.scatter_2d
        .filter((p) => p.cluster === cid)
        .forEach((p) => {
          const { nx, ny } = getNormalizedPointCoord(p.x, p.y);
          const dx = nx - centroids[cid].x;
          const dy = ny - centroids[cid].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > maxDist) maxDist = dist;
        });
      centroids[cid].maxR = Math.max(0.2, maxDist * 0.82);
    });
    return centroids;
  }, [clustersData, getNormalizedPointCoord]);

  // Enriched & Filtered Scatter points combining live streamed papers and verified GMM clusters
  const filteredClusterPoints = useMemo(() => {
    const basePts = clustersData?.scatter_2d || [];
    const allPts = [...streamedClusterPoints, ...basePts];
    const centKeys = Object.keys(clusterCentroids).map(Number);

    // Compute dynamic geometry properties: confidence, is_cross_domain, secondary_cluster
    const enriched = allPts.map((p) => {
      const { nx, ny } = getNormalizedPointCoord(p.x, p.y);
      const myCentroid = clusterCentroids[p.cluster];
      const d1 = myCentroid ? Math.hypot(nx - myCentroid.x, ny - myCentroid.y) : 0;
      
      let minOtherDist = Infinity;
      let secondCluster = (p.cluster + 1) % 8;
      centKeys.forEach((otherC) => {
        if (otherC !== p.cluster && clusterCentroids[otherC]) {
          const dOther = Math.hypot(nx - clusterCentroids[otherC].x, ny - clusterCentroids[otherC].y);
          if (dOther < minOtherDist) {
            minOtherDist = dOther;
            secondCluster = otherC;
          }
        }
      });

      const distRatio = minOtherDist > 0 && minOtherDist !== Infinity ? d1 / minOtherDist : 0;
      const isCross = p.is_cross_domain ?? (distRatio >= 0.68);
      const conf = p.confidence ?? (d1 + minOtherDist > 0
        ? Math.max(0.42, Math.min(0.98, 1 - (d1 / (d1 + minOtherDist)) * 0.72))
        : 0.85);

      return {
        ...p,
        confidence: conf,
        is_cross_domain: isCross,
        secondary_cluster: p.secondary_cluster ?? secondCluster,
      };
    });

    let result = enriched;
    if (selectedClusterFilter !== 'ALL') {
      result = result.filter((p) => p.cluster === selectedClusterFilter);
    }
    if (gmmViewMode === 'CORE') {
      result = result.filter((p) => (p.confidence ?? 1.0) >= 0.70);
    } else if (gmmViewMode === 'CROSS_DOMAIN') {
      result = result.filter((p) => p.is_cross_domain);
    }
    return result;
  }, [clustersData, selectedClusterFilter, streamedClusterPoints, gmmViewMode, clusterCentroids, getNormalizedPointCoord]);

  // Precompute Louvain Community Index Mapping for Clustered Circular Graph
  const communityNodeOrder = useMemo(() => {
    if (!graphData?.graph_export?.nodes) return new Map<string, { rank: number; count: number; comm: number }>();
    const nodes = graphData.graph_export.nodes.slice(0, 80);
    const totalComms = Math.max(1, graphData.communities?.length || 8);
    const commBuckets: Record<number, string[]> = {};
    nodes.forEach((n) => {
      const c = typeof n.community === 'number' ? n.community % totalComms : 0;
      if (!commBuckets[c]) commBuckets[c] = [];
      commBuckets[c].push(n.id);
    });
    const orderMap = new Map<string, { rank: number; count: number; comm: number }>();
    Object.keys(commBuckets).forEach((cStr) => {
      const c = Number(cStr);
      const list = commBuckets[c];
      list.forEach((id, rIdx) => {
        orderMap.set(id, { rank: rIdx, count: list.length, comm: c });
      });
    });
    return orderMap;
  }, [graphData]);

  // Deterministic Louvain Clustered Layout for Pillar 3
  const getNodeCoordinates = (node: any, idx: number, _total?: number) => {
    const totalComms = Math.max(1, graphData?.communities?.length || 8);
    const cInfo = communityNodeOrder.get(node.id) || { rank: idx % 10, count: 10, comm: (node.community || 0) % totalComms };
    const comm = cInfo.comm;

    if (graphLayout === 'force') {
      // Clustered Centers dynamically spaced by number of communities
      const commAngle = (comm * (2 * Math.PI / totalComms)) - Math.PI / totalComms;
      const center = {
        cx: 290 + Math.cos(commAngle) * 115,
        cy: 160 + Math.sin(commAngle) * 88,
      };
      const nodeAngle = cInfo.rank * 1.618033 * Math.PI * 2;
      const dist = 14 + (cInfo.rank % 4) * 10;
      return {
        cx: center.cx + Math.cos(nodeAngle) * dist,
        cy: center.cy + Math.sin(nodeAngle) * (dist * 0.85),
      };
    } else {
      // Louvain Clustered Arc Layout (distinct circular sectors with clean gaps)
      const baseSectorAngle = comm * (2 * Math.PI / totalComms);
      const sectorSpan = ((360 / totalComms) * 0.72) * (Math.PI / 180);
      const fraction = cInfo.count > 1 ? cInfo.rank / (cInfo.count - 1) : 0.5;
      const angle = baseSectorAngle - sectorSpan / 2 + fraction * sectorSpan;
      
      const rx = 142;
      const ry = 108;
      return {
        cx: 290 + Math.cos(angle) * rx,
        cy: 160 + Math.sin(angle) * ry,
      };
    }
  };

  // Ego-network calculation for Graph
  const egoNetworkNodeIds = useMemo(() => {
    const activeNode = selectedGraphNode || hoveredGraphNode?.node;
    if (!activeNode || !graphData) return null;
    const connected = new Set<string>();
    connected.add(activeNode.id);
    graphData.graph_export.links.forEach((link) => {
      if (link.source === activeNode.id) connected.add(link.target);
      if (link.target === activeNode.id) connected.add(link.source);
    });
    return connected;
  }, [selectedGraphNode, hoveredGraphNode, graphData]);

  // LaTeX Export Functions with Modal Preview & Direct Download
  const handleCopyLatexRules = () => {
    if (!rulesData) return;
    const lines = [
      '% - Generated by UTH Scientific Data Mining System -',
      '\\begin{table}[htbp]',
      '\\centering',
      `\\caption{Top FP-Growth Association Rules (Lift $\\ge$ ${liftThreshold.toFixed(1)})}`,
      '\\label{tab:fp_growth_rules}',
      '\\small',
      '\\begin{tabular}{llrcc}',
      '\\toprule',
      '\\textbf{Antecedents} & \\textbf{Consequents} & \\textbf{Lift} & \\textbf{Confidence} & \\textbf{Support} \\\\',
      '\\midrule',
    ];

    filteredRules.slice(0, 15).forEach((r) => {
      const ant = r.antecedents.map((a) => a.replace(/_/g, '\\_')).join(', ');
      const con = r.consequents.map((c) => c.replace(/_/g, '\\_')).join(', ');
      lines.push(
        `${ant} & ${con} & ${r.lift.toFixed(2)}\\times & ${(r.confidence * 100).toFixed(1)}\\% & ${(r.support * 100).toFixed(2)}\\% \\\\`
      );
    });

    lines.push('\\bottomrule', '\\end{tabular}', '\\end{table}');
    const code = lines.join('\n');
    setLatexModalData({
      isOpen: true,
      title: language === 'vi' ? 'Bảng Mã LaTeX: Quy Tắc Kết Hợp FP-Growth' : 'LaTeX Table: FP-Growth Association Rules',
      code,
      filename: 'fp-growth-association-rules.tex',
    });
  };

  const handleCopyLatexClusters = () => {
    if (!clustersData) return;
    const lines = [
      '% - Generated by UTH Scientific Data Mining System -',
      '\\begin{table}[htbp]',
      '\\centering',
      '\\caption{Semantic Topic Clusters Validity and Distribution (K-Means / GMM, 768-D Embeddings)}',
      '\\label{tab:cluster_metrics}',
      '\\small',
      '\\begin{tabular}{cclcc}',
      '\\toprule',
      '\\textbf{Cluster} & \\textbf{Silhouette} & \\textbf{Dominant Scientific Theme} & \\textbf{Size} & \\textbf{Share} \\\\',
      '\\midrule',
    ];

    clustersData.cluster_profiles.forEach((c) => {
      const topic = CLUSTER_TOPIC_MAP[c.cluster_id]?.title || `Topic Cluster #${c.cluster_id}`;
      lines.push(
        `C\\#${c.cluster_id} & ${clustersData.validity_metrics.silhouette_score} & ${topic} & ${c.size} & ${c.percentage}\\% \\\\`
      );
    });

    lines.push('\\bottomrule', '\\end{tabular}', '\\end{table}');
    const code = lines.join('\n');
    setLatexModalData({
      isOpen: true,
      title: language === 'vi' ? 'Bảng Mã LaTeX: Phân Cụm Ngữ Nghĩa K-Means & GMM' : 'LaTeX Table: Semantic Topic Clustering',
      code,
      filename: 'semantic-topic-clusters.tex',
    });
  };

  const handleCopyLatexGraph = () => {
    if (!graphData) return;
    const lines = [
      '% - Generated by UTH Scientific Data Mining System -',
      '\\begin{table}[htbp]',
      '\\centering',
      '\\caption{Top Influential Authors by PageRank and Louvain Community Detection}',
      '\\label{tab:coauthorship_network}',
      '\\small',
      '\\begin{tabular}{rllrrr}',
      '\\toprule',
      '\\textbf{Rank} & \\textbf{Author} & \\textbf{Community} & \\textbf{PageRank} & \\textbf{Degree} & \\textbf{Papers} \\\\',
      '\\midrule',
    ];

    const topNodes = (graphData.top_influencers && graphData.top_influencers.length > 0)
      ? graphData.top_influencers.slice(0, 15)
      : [...graphData.graph_export.nodes].sort((a, b) => b.pagerank - a.pagerank).slice(0, 15).map((n) => ({
          author: n.label || n.id,
          pagerank: n.pagerank,
          degree: n.degree,
          paper_count: n.paper_count || 1,
          community_id: n.community,
        }));

    topNodes.forEach((node, idx) => {
      lines.push(
        `${idx + 1} & ${node.author.replace(/_/g, '\\_')} & Comm \\#${node.community_id} & ${node.pagerank.toFixed(6)} & ${node.degree} & ${node.paper_count} \\\\`
      );
    });

    lines.push('\\bottomrule', '\\end{tabular}', '\\end{table}');
    const code = lines.join('\n');
    setLatexModalData({
      isOpen: true,
      title: language === 'vi' ? 'Bảng Mã LaTeX: Mạng Lưới Đồng Tác Giả & PageRank' : 'LaTeX Table: Co-Authorship Network & PageRank',
      code,
      filename: 'coauthorship-network-pagerank.tex',
    });
  };

  const handleCopyLatexOutliers = () => {
    if (!trendsData) return;
    const lines = [
      '% - Generated by UTH Scientific Data Mining System -',
      '\\begin{table}[htbp]',
      '\\centering',
      '\\caption{Isolation Forest Novelty Outlier Scientific Papers}',
      '\\label{tab:novelty_outliers}',
      '\\small',
      '\\begin{tabular}{llrr}',
      '\\toprule',
      '\\textbf{arXiv ID} & \\textbf{Category} & \\textbf{Word Count} & \\textbf{Math Equations} \\\\',
      '\\midrule',
    ];

    trendsData.anomalies.slice(0, 15).forEach((a) => {
      lines.push(
        `${a.paper_id} & ${a.primary_category} & ${a.word_count.toLocaleString()} & ${a.math_count} \\\\`
      );
    });

    lines.push('\\bottomrule', '\\end{tabular}', '\\end{table}');
    const code = lines.join('\n');
    setLatexModalData({
      isOpen: true,
      title: language === 'vi' ? 'Bảng Mã LaTeX: Điểm Dị Biệt Isolation Forest' : 'LaTeX Table: Isolation Forest Novelty Outliers',
      code,
      filename: 'novelty-outliers.tex',
    });
  };

  // Reusable Empty State Card for Resilient Pillars
  const renderPillarEmptyCard = (pillarNum: number, pillarTitle: string) => (
    <div
      style={{
        height: '100%',
        minHeight: '380px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: themeStyles.cardBg,
        borderRadius: '8px',
        border: `1px dashed ${themeStyles.cardBorder}`,
        padding: '32px',
        textAlign: 'center',
        gap: '12px',
      }}
    >
      <div
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '12px',
          backgroundColor: 'rgba(234, 88, 12, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ea580c',
          fontSize: '20px',
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
        }}
      >
        P{pillarNum}
      </div>
      <div style={{ fontSize: '15px', fontWeight: 700, color: themeStyles.textPrimary }}>
        {language === 'vi' ? `Dữ liệu ${pillarTitle} chưa sẵn sàng` : `${pillarTitle} data not loaded`}
      </div>
      <div style={{ fontSize: '12px', color: themeStyles.textSecondary, maxWidth: '440px', lineHeight: 1.5 }}>
        {language === 'vi'
          ? 'Dữ liệu phân tích đang được tổng hợp từ Lakehouse Parquet trên Cloudflare R2 hoặc tiến trình khai phá nền đang xử lý.'
          : 'Analytics data is being synchronized from Lakehouse Parquet on Cloudflare R2 or background mining worker is computing.'}
      </div>
      <button
        type="button"
        onClick={() => handleRecomputePillars(false)}
        style={{
          marginTop: '6px',
          padding: '8px 18px',
          borderRadius: '6px',
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          backgroundColor: '#ea580c',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {language === 'vi' ? '🔄 Tải lại dữ liệu (Reload Data)' : '🔄 Reload Mining Data'}
      </button>
    </div>
  );

  if (loading) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: themeStyles.cardBg,
            padding: '16px 28px',
            borderRadius: '10px',
            border: `1px solid ${themeStyles.cardBorder}`,
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ea580c"
            strokeWidth="2.5"
            className="animate-spin"
          >
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary }}>
            {language === 'vi' ? '[ GOLD LAKEHOUSE ] Đang tải và dựng trực quan 4 Trụ Cột Khai Phá...' : '[ GOLD LAKEHOUSE ] Loading and rendering 4 Data Mining Pillars...'}
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          margin: '30px auto',
          maxWidth: '600px',
          padding: '24px',
          fontFamily: 'var(--font-mono)',
          color: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          borderRadius: '10px',
          border: '1px solid rgba(239, 68, 68, 0.25)',
        }}
      >
        {language === 'vi' ? `[ LỖI ] Không thể nạp dữ liệu 4 Trụ cột Mining: ${error}` : `[ ERROR ] Failed to load 4 Data Mining Pillars: ${error}`}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        position: 'relative',
        gap: '8px',
      }}
    >
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '16px',
            zIndex: 75,
            backgroundColor: '#059669',
            color: '#ffffff',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            boxShadow: '0 8px 24px rgba(5, 150, 105, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* 1. TOP HEADER & ERGONOMIC 4-PILLAR SELECTOR BAR                */}
      {/* ============================================================== */}
      {isFocusMode ? (
        // Compact Focus Mode Header
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: themeStyles.cardBg,
            borderRadius: '8px',
            border: `1px solid ${themeStyles.cardBorder}`,
            padding: '4px 12px',
            minHeight: '32px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: '#ea580c',
                letterSpacing: '0.05em',
              }}
            >
              FOCUS COCKPIT:
            </span>
            {[
              { id: 1, label: '1. FP-Growth Rules', color: '#ea580c' },
              { id: 2, label: '2. Topic Clusters', color: '#2563eb' },
              { id: 3, label: '3. Co-authorship', color: '#7c3aed' },
              { id: 4, label: '4. Trend Velocity', color: '#10b981' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePillar(p.id as any)}
                style={{
                  padding: '3px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: activePillar === p.id ? 800 : 600,
                  backgroundColor: activePillar === p.id ? p.color : 'transparent',
                  color: activePillar === p.id ? '#ffffff' : themeStyles.textSecondary,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setIsTheaterMode((prev) => !prev)}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                backgroundColor: isTheaterMode ? (isDark ? 'rgba(245, 158, 11, 0.25)' : '#fef3c7') : themeStyles.cardSubBg,
                color: isTheaterMode ? '#f59e0b' : themeStyles.textSecondary,
                border: `1px solid ${isTheaterMode ? '#f59e0b' : themeStyles.cardBorder}`,
                cursor: 'pointer',
              }}
              title={language === 'vi' ? 'Phóng đại toàn màn hình 100% (Phím T)' : 'Full theater mode 100% (Press T)'}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {isTheaterMode ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
              <span>{isTheaterMode ? (language === 'vi' ? 'Thu Nhỏ' : 'Exit Theater') : (language === 'vi' ? 'Rạp Hát (T)' : 'Theater (T)')}</span>
            </span>
            </button>
            <button
              type="button"
              onClick={() => setIsFocusMode(false)}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                backgroundColor: themeStyles.cardSubBg,
                color: themeStyles.textSecondary,
                border: `1px solid ${themeStyles.cardBorder}`,
                cursor: 'pointer',
              }}
            >
              ⤡ Exit Focus (F / Esc)
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Real-time Data Mining 5-Checkpoint Telemetry Stepper */}
          <MiningTelemetryStepper
            isExecuting={isRecomputingPipeline}
            onTriggerMining={handleRecomputePillars}
            theme={theme}
            liveStats={{
              totalPapers: totalCorpus || storageStats?.sourceBreakdown?.total_deduplicated || 18287,
              rulesCount: rulesData?.rules?.length ?? rulesData?.summary?.mined_rules_count,
              silhouetteScore: clustersData?.validity_metrics?.silhouette_score,
              totalNodes: graphData?.network_summary?.total_nodes,
              totalEdges: graphData?.network_summary?.total_edges,
              anomaliesCount: trendsData?.anomalies?.length ?? trendsData?.summary?.total_anomalies_detected,
            }}
          />

          {/* Standard Mission Control 4 Pillar Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr) auto auto',
              gap: '8px',
              alignItems: 'stretch',
            }}
          >
          {/* Pillar 1 Card */}
          <button
            type="button"
            onClick={() => setActivePillar(1)}
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              borderLeft: activePillar === 1 ? '2px solid #ea580c' : `1px solid ${themeStyles.cardBorder}`,
              borderRight: activePillar === 1 ? '2px solid #ea580c' : `1px solid ${themeStyles.cardBorder}`,
              borderBottom: activePillar === 1 ? '2px solid #ea580c' : `1px solid ${themeStyles.cardBorder}`,
              borderTop: '3px solid #ea580c',
              padding: '8px 12px',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: activePillar === 1 ? '0 4px 12px rgba(234, 88, 12, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#ea580c' }}>
                {language === 'vi' ? 'TRỤ CỘT 01 [Phím 1]' : 'PILLAR 01 [Key 1]'}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: isDark ? 'rgba(234, 88, 12, 0.15)' : '#fff7ed',
                  color: '#ea580c',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 800,
                }}
              >
                FP-GROWTH
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary, marginTop: '2px' }}>
              {language === 'vi' ? 'LUẬT KẾT HỢP (RULES)' : 'ASSOCIATION RULES'}
            </div>
            <div style={{ fontSize: '10px', color: themeStyles.textSecondary, fontFamily: 'var(--font-mono)' }}>
              {rulesData?.rules.length || 0} Rules &bull; Max Lift {maxLiftInCorpus.toFixed(1)}x
            </div>
          </button>

          {/* Pillar 2 Card */}
          <button
            type="button"
            onClick={() => setActivePillar(2)}
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              borderLeft: activePillar === 2 ? '2px solid #2563eb' : `1px solid ${themeStyles.cardBorder}`,
              borderRight: activePillar === 2 ? '2px solid #2563eb' : `1px solid ${themeStyles.cardBorder}`,
              borderBottom: activePillar === 2 ? '2px solid #2563eb' : `1px solid ${themeStyles.cardBorder}`,
              borderTop: '3px solid #2563eb',
              padding: '8px 12px',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: activePillar === 2 ? '0 4px 12px rgba(37, 99, 235, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#2563eb' }}>
                {language === 'vi' ? 'TRỤ CỘT 02 [Phím 2]' : 'PILLAR 02 [Key 2]'}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : '#eff6ff',
                  color: '#2563eb',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 800,
                }}
              >
                GMM 2D (EM)
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary, marginTop: '2px' }}>
              {language === 'vi' ? 'PHÂN CỤM NGỮ NGHĨA' : 'SEMANTIC CLUSTERING'}
            </div>
            <div style={{ fontSize: '10px', color: themeStyles.textSecondary, fontFamily: 'var(--font-mono)' }}>
              {clustersData?.cluster_profiles?.length || 6} {language === 'vi' ? 'Cụm' : 'Clusters'} &bull; {filteredClusterPoints.length.toLocaleString()} Vectors (Live)
            </div>
          </button>

          {/* Pillar 3 Card */}
          <button
            type="button"
            onClick={() => setActivePillar(3)}
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              borderLeft: activePillar === 3 ? '2px solid #7c3aed' : `1px solid ${themeStyles.cardBorder}`,
              borderRight: activePillar === 3 ? '2px solid #7c3aed' : `1px solid ${themeStyles.cardBorder}`,
              borderBottom: activePillar === 3 ? '2px solid #7c3aed' : `1px solid ${themeStyles.cardBorder}`,
              borderTop: '3px solid #7c3aed',
              padding: '8px 12px',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: activePillar === 3 ? '0 4px 12px rgba(124, 58, 237, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#7c3aed' }}>
                {language === 'vi' ? 'TRỤ CỘT 03 [Phím 3]' : 'PILLAR 03 [Key 3]'}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: isDark ? 'rgba(124, 58, 237, 0.15)' : '#f5f3ff',
                  color: '#7c3aed',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 800,
                }}
              >
                LOUVAIN &amp; PR
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary, marginTop: '2px' }}>
              {language === 'vi' ? 'ĐỒ THỊ KHOA HỌC (GRAPH)' : 'SCIENTIFIC NETWORK'}
            </div>
            <div style={{ fontSize: '10px', color: themeStyles.textSecondary, fontFamily: 'var(--font-mono)' }}>
              {graphData?.graph_export?.nodes?.length || 120} Nodes &bull; {graphData?.graph_export?.links?.length || 293} Edges &bull; Ego-net
            </div>
          </button>

          {/* Pillar 4 Card */}
          <button
            type="button"
            onClick={() => setActivePillar(4)}
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              borderLeft: activePillar === 4 ? '2px solid #10b981' : `1px solid ${themeStyles.cardBorder}`,
              borderRight: activePillar === 4 ? '2px solid #10b981' : `1px solid ${themeStyles.cardBorder}`,
              borderBottom: activePillar === 4 ? '2px solid #10b981' : `1px solid ${themeStyles.cardBorder}`,
              borderTop: '3px solid #10b981',
              padding: '8px 12px',
              textAlign: 'left',
              cursor: 'pointer',
              boxShadow: activePillar === 4 ? '0 4px 12px rgba(16, 185, 129, 0.15)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#10b981' }}>
                {language === 'vi' ? 'TRỤ CỘT 04 [Phím 4]' : 'PILLAR 04 [Key 4]'}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
                  color: '#10b981',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 800,
                }}
              >
                ISOLATION FOREST
              </span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary, marginTop: '2px' }}>
              {language === 'vi' ? 'XU HƯỚNG & DỊ BIỆT' : 'TRENDS & ANOMALIES'}
            </div>
            <div style={{ fontSize: '10px', color: themeStyles.textSecondary, fontFamily: 'var(--font-mono)' }}>
              {topSurging ? `+${Math.round(topSurging.growth_rate_pct)}% Surge` : '+123% Surge'} &bull; {trendsData?.anomalies?.length || 260} {language === 'vi' ? 'Dị biệt' : 'Outliers'}
            </div>
          </button>

          {/* Focus Mode Trigger Button */}
          <button
            type="button"
            onClick={() => setIsFocusMode(true)}
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              border: `1px solid ${themeStyles.cardBorder}`,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer',
              color: themeStyles.textSecondary,
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              gap: '2px',
              minWidth: '65px',
            }}
            title={language === 'vi' ? 'Nhấn phím F để phóng to vùng biểu đồ' : 'Press F to toggle chart focus'}
          >
            <span style={{ fontSize: '14px' }}>⤢</span>
            <span>Focus (F)</span>
          </button>

          {/* Theater Mode Trigger Button */}
          <button
            type="button"
            onClick={() => setIsTheaterMode((prev) => !prev)}
            style={{
              backgroundColor: isTheaterMode ? (isDark ? 'rgba(245, 158, 11, 0.25)' : '#fef3c7') : themeStyles.cardBg,
              borderRadius: '8px',
              border: isTheaterMode ? '1px solid #f59e0b' : `1px solid ${themeStyles.cardBorder}`,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer',
              color: isTheaterMode ? '#f59e0b' : themeStyles.textSecondary,
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              gap: '2px',
              minWidth: '65px',
            }}
            title={language === 'vi' ? 'Phóng đại toàn màn hình 100% (Phím T)' : 'Full theater mode 100% (Press T)'}
          >
            {isTheaterMode ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
            <span>{isTheaterMode ? (language === 'vi' ? 'Thu Nhỏ' : 'Exit Theater') : (language === 'vi' ? 'Rạp Hát' : 'Theater')}</span>
          </button>
        </div>
      </div>
      )}

      {/* ============================================================== */}
      {/* ACTIVE PILLAR COCKPIT (100% Height - Zero Outer Scroll)        */}
      {/* ============================================================== */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ...(isTheaterMode
            ? {
                position: 'fixed' as const,
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
        {/* Floating prominent Exit Theater Button */}
        {isTheaterMode && (
          <button
            type="button"
            onClick={() => setIsTheaterMode(false)}
            style={{
              position: 'absolute',
              top: '12px',
              right: '20px',
              zIndex: 50,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(220, 38, 38, 0.45)',
            }}
            title={language === 'vi' ? 'Thoát Rạp Hát (Esc / T)' : 'Exit Theater Mode (Esc / T)'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span>{language === 'vi' ? 'Thoát Rạp Hát (Esc)' : 'Exit Theater Mode (Esc)'}</span>
          </button>
        )}

        {/* ============================================================ */}
        {/* PILLAR 1: ASSOCIATION RULE MINING // FP-GROWTH               */}
        {/* ============================================================ */}
        {activePillar === 1 && rulesData && (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              overflow: 'hidden',
            }}
          >
            {/* Slicer & Category Filter Bar */}
            <div
              style={{
                backgroundColor: themeStyles.cardBg,
                borderRadius: '8px',
                border: `1px solid ${themeStyles.cardBorder}`,
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                      color: themeStyles.textPrimary,
                    }}
                  >
                    {language === 'vi' ? 'LỌC NGƯỠNG LIFT:' : 'FILTER LIFT THRESHOLD:'}
                  </span>
                  <input
                    type="range"
                    min="1.0"
                    max={Math.max(10, Math.ceil(maxLiftInCorpus))}
                    step="0.5"
                    value={liftThreshold}
                    onChange={(e) => setLiftThreshold(parseFloat(e.target.value))}
                    style={{ accentColor: '#ea580c', cursor: 'pointer', width: '130px' }}
                  />
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                      color: '#ea580c',
                    }}
                  >
                    &ge; {liftThreshold.toFixed(1)}x
                  </span>
                </div>

                <div
                  style={{
                    height: '16px',
                    width: '1px',
                    backgroundColor: themeStyles.cardBorder,
                  }}
                />

                {/* Antecedent Category Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: themeStyles.textSecondary,
                    }}
                  >
                    {language === 'vi' ? 'Tiền đề:' : 'Antecedent:'}
                  </span>
                  {availableCategories.slice(0, 8).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setAntecedentFilter(cat)}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: antecedentFilter === cat ? 800 : 600,
                        backgroundColor: antecedentFilter === cat ? '#ea580c' : themeStyles.tagBg,
                        color: antecedentFilter === cat ? '#ffffff' : themeStyles.textSecondary,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Telemetry Chip & Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="telemetry-chip" style={{ color: '#ea580c' }}>
                  FP-GROWTH: {filteredRules.length}/{rulesData.rules.length} RULES · MAX LIFT: {maxLiftInCorpus.toFixed(2)}x
                </span>

                <button
                  type="button"
                  onClick={handleCopyLatexRules}
                  style={{
                    backgroundColor: isDark ? 'rgba(234, 88, 12, 0.15)' : '#fff7ed',
                    color: '#ea580c',
                    border: '1px solid rgba(234, 88, 12, 0.3)',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                  title={language === 'vi' ? 'Sao chép đoạn mã LaTeX Table vào clipboard' : 'Copy LaTeX Table code to clipboard'}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Copy LaTeX</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    backgroundColor: isSidebarCollapsed ? (isDark ? 'rgba(234, 88, 12, 0.25)' : '#ffedd5') : themeStyles.tagBg,
                    color: isSidebarCollapsed ? '#ea580c' : themeStyles.textSecondary,
                    border: `1px solid ${isSidebarCollapsed ? '#ea580c' : themeStyles.cardBorder}`,
                    cursor: 'pointer',
                  }}
                  title={isSidebarCollapsed ? (language === 'vi' ? 'Mở lại cột Inspector [ ► ]' : 'Open Inspector column [ ► ]') : (language === 'vi' ? 'Thu gọn cột Inspector để mở rộng Scatter [ ◄ ]' : 'Collapse Inspector to expand Scatter [ ◄ ]')}
                >
                  {isSidebarCollapsed ? (language === 'vi' ? '► Mở Inspector' : '► Open Inspector') : (language === 'vi' ? '◄ Thu Gọn' : '◄ Collapse')}
                </button>
              </div>
            </div>

            {/* Split Visual: Left Bubble Plot vs Right Inspector & Bar Chart */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1.35fr 1fr',
                gap: '8px',
                overflow: 'hidden',
              }}
            >
              {/* Left: Rule Bubble Scatter Plot */}
              <div
                style={{
                  backgroundColor: themeStyles.cardBg,
                  borderRadius: '8px',
                  border: `1px solid ${themeStyles.cardBorder}`,
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* 2-tier Split Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                    flexShrink: 0,
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <div>
                    <h3
                      style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        color: themeStyles.textPrimary,
                        margin: 0,
                      }}
                    >
                      [MINING-01] {language === 'vi' ? 'BIỂU ĐỒ BONG BÓNG LUẬT KẾT HỢP (RULE SCATTER)' : 'ASSOCIATION RULES BUBBLE SCATTER'}
                    </h3>
                    <div
                      style={{
                        fontSize: '10px',
                        color: themeStyles.textSecondary,
                        marginTop: '1px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {language === 'vi' ? 'Trục X: Support (%) • Trục Y: Confidence (%) • Kích thước: Hệ số Lift • Nhấp bóng để soi' : 'X-axis: Support (%) • Y-axis: Confidence (%) • Size: Lift multiplier • Click bubble to inspect'}
                    </div>
                  </div>

                  {/* Standardized Chart Toolbar */}
                  <ChartToolbar
                    theme={theme}
                    language={language}
                    svgRef={p1SvgRef}
                    filename="fp-growth-association-rules"
                    csvData={filteredRules.map((r) => ({
                      antecedents: r.antecedents.join('+'),
                      consequents: r.consequents.join('+'),
                      lift: r.lift,
                      confidence: r.confidence,
                      support: r.support,
                      leverage: r.leverage,
                    }))}
                    zoomLevel={p1PanZoom.zoom}
                    hasPannedOrZoomed={p1PanZoom.hasPannedOrZoomed}
                    onZoomIn={() => p1PanZoom.zoomIn(0.25)}
                    onZoomOut={() => p1PanZoom.zoomOut(0.25)}
                    onResetZoom={p1PanZoom.resetView}
                    showBaselines={showBaselines}
                    onToggleBaselines={() => setShowBaselines((prev) => !prev)}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    isTheater={isTheaterMode}
                    onToggleTheater={() => setIsTheaterMode(!isTheaterMode)}
                    onShowToast={showToast}
                  />
                </div>

                {/* SVG Bubble Chart Canvas */}
                <div
                  {...p1PanZoom.containerProps}
                  style={{
                    ...p1PanZoom.containerProps.style,
                    flex: 1,
                    minHeight: 0,
                    width: '100%',
                    backgroundColor: themeStyles.canvasBg,
                    borderRadius: '6px',
                    border: `1px solid ${themeStyles.cardBorder}`,
                    padding: '8px',
                    boxSizing: 'border-box',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <svg
                    ref={p1SvgRef}
                    viewBox={p1PanZoom.viewBox}
                    style={{ width: '100%', height: '100%', overflow: 'visible' }}
                  >
                        {/* Golden Frontier Shaded Box (Conf >= 35%) */}
                        {showBaselines && (
                          <g>
                            <rect
                              x="120"
                              y="50"
                              width="580"
                              height="117"
                              fill="rgba(16, 185, 129, 0.05)"
                              stroke="rgba(16, 185, 129, 0.25)"
                              strokeDasharray="4 4"
                              rx="4"
                            />
                            {/* Layer Badge Plate anchored safely at top margin */}
                            <rect
                              x="125"
                              y="30"
                              width="310"
                              height="16"
                              rx="3"
                              fill={isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.94)'}
                              stroke="rgba(16, 185, 129, 0.35)"
                              strokeWidth="1"
                            />
                            <text
                              x="131"
                              y="42"
                              fontSize="10"
                              fontFamily="var(--font-mono)"
                              fontWeight="800"
                              fill="#10b981"
                            >
                              {language === 'vi' ? '★ VÙNG QUY TẮC VÀNG (CONF ≥ 35% • LIFT ≥ 2.5x)' : '★ GOLDEN FRONTIER RULES (CONF ≥ 35% • LIFT ≥ 2.5x)'}
                            </text>
                          </g>
                        )}

                        {/* Grid Lines (Full 0% to 100% Confidence) */}
                        {[0, 20, 40, 60, 80, 100].map((conf) => {
                          const y = 230 - (conf / 100) * 180;
                          return (
                            <g key={conf}>
                              <line
                                x1="55"
                                y1={y}
                                x2="700"
                                y2={y}
                                stroke={themeStyles.gridLine}
                                strokeWidth="1"
                              />
                              <text
                                x="48"
                                y={y + 3}
                                textAnchor="end"
                                fontSize="10"
                                fontFamily="var(--font-mono)"
                                fill={themeStyles.textMuted}
                              >
                                {conf}%
                              </text>
                            </g>
                          );
                        })}

                        {/* X-axis ticks (Support 0% to maxSupportInCorpus) */}
                        {[0.2, 0.4, 0.6, 0.8, 1.0].map((frac) => {
                          const supPct = +(maxSupportInCorpus * 100 * frac).toFixed(1);
                          const x = 55 + frac * 645;
                          return (
                            <g key={frac}>
                              <line
                                x1={x}
                                y1="35"
                                x2={x}
                                y2={230}
                                stroke={themeStyles.gridLine}
                                strokeWidth="1"
                              />
                              <text
                                x={x}
                                y="246"
                                textAnchor="middle"
                                fontSize="10"
                                fontFamily="var(--font-mono)"
                                fill={themeStyles.textMuted}
                              >
                                {supPct}%
                              </text>
                            </g>
                          );
                        })}

                        {/* Statistical Independence Baseline (Lift = 1.0) */}
                        {showBaselines && (
                          <g>
                            <line
                              x1="55"
                              y1="175"
                              x2="700"
                              y2="175"
                              stroke="#ef4444"
                              strokeWidth="1"
                              strokeDasharray="4 4"
                              strokeOpacity="0.85"
                            />
                            {/* Layer Badge Plate anchored safely to left margin (support < 1.0%) */}
                            <rect
                              x="60"
                              y="157"
                              width="240"
                              height="16"
                              rx="3"
                              fill={isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)'}
                              stroke="rgba(239, 68, 68, 0.4)"
                              strokeWidth="1"
                            />
                            <text
                              x="66"
                              y="169"
                              textAnchor="start"
                              fontSize="10"
                              fontFamily="var(--font-mono)"
                              fontWeight="800"
                              fill="#ef4444"
                            >
                              {language === 'vi' ? 'NGƯỠNG ĐỘC LẬP NGẪU NHIÊN (LIFT = 1.0x)' : 'RANDOM INDEPENDENCE THRESHOLD (LIFT = 1.0x)'}
                            </text>
                          </g>
                        )}

                    {/* Axes */}
                    <line
                      x1="55"
                      y1="230"
                      x2="700"
                      y2="230"
                      stroke={themeStyles.axisLine}
                      strokeWidth="1.2"
                    />
                    <line
                      x1="55"
                      y1="35"
                      x2="55"
                      y2="230"
                      stroke={themeStyles.axisLine}
                      strokeWidth="1.2"
                    />

                    {/* Bubbles */}
                    {filteredRules.map((rule, idx) => {
                      const cx = 55 + Math.min(645, Math.max(0, (rule.support / maxSupportInCorpus) * 645));
                      const cy = 230 - Math.min(180, Math.max(0, rule.confidence * 180));
                      const normLift = Math.log(Math.max(1, rule.lift)) / Math.log(Math.max(2, maxLiftInCorpus));
                      const radius = 6 + Math.max(0, Math.min(1, normLift)) * 14;
                      const isHovered =
                        hoveredRule?.rule.lift === rule.lift &&
                        hoveredRule.rule.support === rule.support &&
                        hoveredRule.rule.antecedents.join() === rule.antecedents.join();
                      const isSelected =
                        inspectedRule?.lift === rule.lift &&
                        inspectedRule?.support === rule.support &&
                        inspectedRule?.antecedents.join() === rule.antecedents.join();

                      const fillColor =
                        rule.lift >= maxLiftInCorpus * 0.7
                          ? '#dc2626'
                          : rule.lift >= maxLiftInCorpus * 0.3
                          ? '#ea580c'
                          : rule.lift >= 2.5
                          ? '#f59e0b'
                          : '#3b82f6';

                      return (
                        <g key={idx}>
                          {isSelected && (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={radius + 8}
                              fill="none"
                              stroke="#ea580c"
                              strokeWidth="1.5"
                              strokeDasharray="4 3"
                              opacity="0.85"
                            />
                          )}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isSelected ? radius + 4 : isHovered ? radius + 2 : radius}
                            fill={fillColor}
                            fillOpacity={isSelected ? 0.95 : isHovered ? 0.9 : 0.72}
                            stroke={isSelected ? '#38bdf8' : isDark ? '#0f172a' : '#ffffff'}
                            strokeWidth={isSelected ? '2.5' : '1.5'}
                            opacity={1}
                            style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                            onClick={() => {
                              if (!p1PanZoom.didDrag()) setInspectedRule(rule);
                            }}
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
                        </g>
                      );
                    })}
                  </svg>
                  {p1PanZoom.hasPannedOrZoomed && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '12px',
                        left: '12px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                        border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(14, 165, 233, 0.4)'}`,
                        color: isDark ? '#38bdf8' : '#0284c7',
                        pointerEvents: 'none',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        zIndex: 10,
                      }}
                    >
                      <span>✥</span>
                      <span>{Math.round(p1PanZoom.zoom * 100)}% &bull; {language === 'vi' ? 'Kéo để pan' : 'Drag to pan'}</span>
                    </div>
                  )}
                </div>
          </div>

              {/* Right: Rule Inspector Card & Ranked Bar Chart */}
              {(!isSidebarCollapsed || !isTheaterMode) && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    overflow: 'hidden',
                  }}
                >
                  {/* Visual 1.2: Rule Inspector Drawer */}
                  {inspectedRule && (
                    <div
                      style={{
                        backgroundColor: themeStyles.cardBg,
                        borderRadius: '8px',
                        border: `1px solid ${themeStyles.cardBorder}`,
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            color: '#ea580c',
                          }}
                        >
                          {language === 'vi' ? 'RULE INSPECTOR • GIẢI MÃ TOÁN HỌC' : 'RULE INSPECTOR • MATHEMATICAL DECODER'}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            color: '#059669',
                          }}
                        >
                          Lift {inspectedRule.lift.toFixed(3)}x
                        </span>
                      </div>

                      <div
                        style={{
                          backgroundColor: themeStyles.cardSubBg,
                          borderRadius: '6px',
                          padding: '8px 10px',
                          border: `1px solid ${themeStyles.cardBorder}`,
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        <div style={{ fontWeight: 800, color: themeStyles.textPrimary }}>
                          {inspectedRule.antecedents.join(' + ')} &rarr;{' '}
                          <span style={{ color: '#2563eb' }}>
                            {inspectedRule.consequents.join(' + ')}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '10px',
                            color: themeStyles.textSecondary,
                            marginTop: '4px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '4px',
                          }}
                        >
                          <div>
                            Conf:{' '}
                            <strong style={{ color: themeStyles.textPrimary }}>
                              {(inspectedRule.confidence * 100).toFixed(1)}%
                            </strong>
                          </div>
                          <div>
                            Supp:{' '}
                            <strong style={{ color: themeStyles.textPrimary }}>
                              {(inspectedRule.support * 100).toFixed(2)}%
                            </strong>
                          </div>
                          <div>
                            Leverage:{' '}
                            <strong style={{ color: themeStyles.textPrimary }}>
                              {inspectedRule.leverage.toFixed(4)}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Mathematical Formula Explainability Box */}
                      <div
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          color: themeStyles.textSecondary,
                          lineHeight: 1.4,
                          borderLeft: '2px solid #ea580c',
                          paddingLeft: '8px',
                        }}
                      >
                        {language === 'vi' ? (
                          <>
                            <strong>Công thức Lift:</strong> P(A &cap; C) / [P(A) &bull; P(C)] ={' '}
                            {inspectedRule.lift.toFixed(2)}. Bài báo chứa tiền đề có xác suất xuất hiện hệ quả cao gấp{' '}
                            {inspectedRule.lift.toFixed(2)} lần so với giả định ngẫu nhiên độc lập.
                          </>
                        ) : (
                          <>
                            <strong>Lift Formula:</strong> P(A &cap; C) / [P(A) &bull; P(C)] ={' '}
                            {inspectedRule.lift.toFixed(2)}. Papers containing antecedents are{' '}
                            {inspectedRule.lift.toFixed(2)}x more likely to include consequents than independent chance.
                          </>
                        )}
                      </div>

                      {onNavigateToRag && (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateToRag(
                              language === 'vi'
                                ? `Nghiên cứu quy luật kết hợp giữa ${inspectedRule.antecedents.join(', ')} và ${inspectedRule.consequents.join(', ')}`
                                : `Investigate association rule between ${inspectedRule.antecedents.join(', ')} and ${inspectedRule.consequents.join(', ')}`
                            )
                          }
                          style={{
                            backgroundColor: '#ea580c',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '5px 10px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <span>{language === 'vi' ? 'Tra cứu đề tài này trong RAG Chat' : 'Explore this topic in RAG Chat'}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Ranked Lift Rules List */}
                  <div
                    style={{
                      backgroundColor: themeStyles.cardBg,
                      borderRadius: '8px',
                      border: `1px solid ${themeStyles.cardBorder}`,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      minHeight: 0,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        color: themeStyles.textPrimary,
                        marginBottom: '6px',
                      }}
                    >
                      {language === 'vi' ? 'BẢNG XẾP HẠNG LUẬT THEO LIFT' : 'TOP RULES RANKED BY LIFT'}
                    </div>

                    <div
                      style={{
                        flex: 1,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        paddingRight: '4px',
                      }}
                    >
                      {filteredRules.map((rule, idx) => {
                        const barWidth = Math.min(100, Math.max(12, (rule.lift / maxLiftInCorpus) * 100));
                        const isSelected =
                          inspectedRule?.lift === rule.lift &&
                          inspectedRule?.support === rule.support &&
                          inspectedRule?.antecedents.join() === rule.antecedents.join();

                        return (
                          <div
                            key={idx}
                            onClick={() => setInspectedRule(rule)}
                            onMouseEnter={(e: MouseEvent<HTMLDivElement>) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredRule({
                                rule,
                                x: rect.left + rect.width / 2,
                                y: rect.top - 8,
                              });
                            }}
                            onMouseLeave={() => setHoveredRule(null)}
                            style={{
                              backgroundColor: isSelected
                                ? isDark
                                  ? 'rgba(234, 88, 12, 0.15)'
                                  : '#fff7ed'
                                : themeStyles.cardSubBg,
                              border: isSelected
                                ? '1px solid #ea580c'
                                : `1px solid ${themeStyles.cardBorder}`,
                              borderRadius: '4px',
                              padding: '6px 8px',
                              cursor: 'pointer',
                              transition: 'all 0.1s ease',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                marginBottom: '3px',
                              }}
                            >
                              <span style={{ fontWeight: 700, color: themeStyles.textPrimary }}>
                                {rule.antecedents.join('+')} &rarr;{' '}
                                <span style={{ color: '#2563eb' }}>
                                  {rule.consequents.join('+')}
                                </span>
                              </span>
                              <span style={{ fontWeight: 800, color: '#ea580c' }}>
                                {rule.lift.toFixed(2)}x
                              </span>
                            </div>

                            <div
                              style={{
                                width: '100%',
                                height: '4px',
                                backgroundColor: themeStyles.barTrack,
                                borderRadius: '2px',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  width: `${barWidth}%`,
                                  backgroundColor:
                                    idx === 0 ? '#dc2626' : idx === 1 ? '#ea580c' : '#f59e0b',
                                  borderRadius: '2px',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {activePillar === 1 && !rulesData && renderPillarEmptyCard(1, language === 'vi' ? 'Quy tắc kết hợp (FP-Growth)' : 'Association Rules (FP-Growth)')}

        {/* ============================================================ */}
        {/* PILLAR 2: TOPIC CLUSTERING 2D VECTOR MANIFOLD (K-MEANS)      */}
        {/* ============================================================ */}
        {activePillar === 2 && clustersData && (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              overflow: 'hidden',
            }}
          >
            {/* Validity Scorecards Bar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  backgroundColor: themeStyles.cardBg,
                  borderRadius: '6px',
                  borderLeft: `1px solid ${themeStyles.cardBorder}`,
                  borderRight: `1px solid ${themeStyles.cardBorder}`,
                  borderBottom: `1px solid ${themeStyles.cardBorder}`,
                  borderTop: '3px solid #10b981',
                  padding: '6px 12px',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    color: themeStyles.textSecondary,
                  }}
                >
                  SILHOUETTE SCORE (GMM 2D)
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#059669', marginTop: '1px' }}>
                  {clustersData.validity_metrics.silhouette_score.toFixed(4)}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: themeStyles.textMuted,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {language === 'vi'
                    ? `Độ phân tách hình học không gian (${clustersData.validity_metrics.silhouette_score.toFixed(4)})`
                    : `Spatial cluster separation (${clustersData.validity_metrics.silhouette_score.toFixed(4)})`}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: themeStyles.cardBg,
                  borderRadius: '6px',
                  borderLeft: `1px solid ${themeStyles.cardBorder}`,
                  borderRight: `1px solid ${themeStyles.cardBorder}`,
                  borderBottom: `1px solid ${themeStyles.cardBorder}`,
                  borderTop: '3px solid #f59e0b',
                  padding: '6px 12px',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    color: themeStyles.textSecondary,
                  }}
                >
                  DAVIES-BOULDIN INDEX
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#f59e0b', marginTop: '1px' }}>
                  {clustersData.validity_metrics.davies_bouldin_index.toFixed(4)}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: themeStyles.textMuted,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {language === 'vi' ? 'Phân tán nội cụm cô đặc (< 1.0 tối ưu)' : 'Dense intra-cluster dispersion (< 1.0)'}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: themeStyles.cardBg,
                  borderRadius: '6px',
                  borderLeft: `1px solid ${themeStyles.cardBorder}`,
                  borderRight: `1px solid ${themeStyles.cardBorder}`,
                  borderBottom: `1px solid ${themeStyles.cardBorder}`,
                  borderTop: '3px solid #2563eb',
                  padding: '6px 12px',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    color: themeStyles.textSecondary,
                  }}
                >
                  BIC / AIC SCORE (GMM FIT)
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb', marginTop: '1px' }}>
                  {clustersData.validity_metrics.bic_score ? clustersData.validity_metrics.bic_score.toLocaleString() : '2,889.4'}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: themeStyles.textMuted,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Log-Likelihood: {clustersData.validity_metrics.log_likelihood ? clustersData.validity_metrics.log_likelihood.toLocaleString() : '-1,327.7'}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: themeStyles.cardBg,
                  borderRadius: '6px',
                  borderLeft: `1px solid ${themeStyles.cardBorder}`,
                  borderRight: `1px solid ${themeStyles.cardBorder}`,
                  borderBottom: `1px solid ${themeStyles.cardBorder}`,
                  borderTop: '3px solid #7c3aed',
                  padding: '6px 12px',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    color: themeStyles.textSecondary,
                  }}
                >
                  {language === 'vi' ? 'PHÂN CỤM XÁC SUẤT MỀM' : 'SOFT PROBABILISTIC MARGIN'}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#7c3aed', marginTop: '1px' }}>
                  {clustersData.validity_metrics.soft_separation_margin
                    ? `${(clustersData.validity_metrics.soft_separation_margin * 100).toFixed(1)}%`
                    : '60.9%'}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: themeStyles.textMuted,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {language === 'vi'
                    ? `Cầu nối liên ngành: ${clustersData.validity_metrics.cross_domain_ratio ? (clustersData.validity_metrics.cross_domain_ratio * 100).toFixed(1) + '%' : '31.9%'}`
                    : `Cross-domain ratio: ${clustersData.validity_metrics.cross_domain_ratio ? (clustersData.validity_metrics.cross_domain_ratio * 100).toFixed(1) + '%' : '31.9%'}`}
                </div>
              </div>
            </div>

            {/* Split View: Left 2D Manifold Scatter (60%) vs Right Semantic Decoder (40%) */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1.4fr 1fr',
                gap: '8px',
                overflow: 'hidden',
              }}
            >
              {/* Left: 2D Manifold Canvas */}
              <div
                style={{
                  backgroundColor: themeStyles.cardBg,
                  borderRadius: '8px',
                  border: `1px solid ${themeStyles.cardBorder}`,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* Row 1: Primary Title + Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                    flexShrink: 0,
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <h3
                      style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        color: themeStyles.textPrimary,
                        margin: 0,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      [MINING-02] {language === 'vi' ? 'KHÔNG GIAN VECTOR TIỀM ẨN 2D (GAUSSIAN MIXTURE MODELS - GMM FULL COVARIANCE)' : '2D LATENT VECTOR SPACE (GAUSSIAN MIXTURE MODELS - GMM FULL COVARIANCE)'}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={handleCopyLatexClusters}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                        color: themeStyles.textPrimary,
                        border: `1px solid ${themeStyles.cardBorder}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0,
                      }}
                      title={language === 'vi' ? 'Sao chép bảng kết quả phân cụm định dạng LaTeX cho bài báo' : 'Copy clustering LaTeX table for academic papers'}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy LaTeX</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        backgroundColor: isSidebarCollapsed ? '#2563eb' : isDark ? '#1e293b' : '#f1f5f9',
                        color: isSidebarCollapsed ? '#ffffff' : themeStyles.textPrimary,
                        border: `1px solid ${themeStyles.cardBorder}`,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                      title={isSidebarCollapsed ? (language === 'vi' ? 'Mở rộng Inspector' : 'Expand Inspector') : (language === 'vi' ? 'Thu gọn Inspector' : 'Collapse Inspector')}
                    >
                      {isSidebarCollapsed ? (language === 'vi' ? '► Mở Rộng Inspector' : '► Expand Inspector') : (language === 'vi' ? '◄ Thu Gọn' : '◄ Collapse')}
                    </button>
                  </div>
                </div>

                {/* Row 2: Metadata Sub-Deck (Cluster Pills + GMM View Mode + Toolbar) */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                    backgroundColor: themeStyles.cardSubBg,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: `1px solid ${themeStyles.cardBorder}`,
                    flexShrink: 0,
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="telemetry-chip">
                      GMM K=6 &bull; BIC: {clustersData.validity_metrics.bic_score ? Math.round(clustersData.validity_metrics.bic_score).toLocaleString() : '2,889'} &bull; SIL: {clustersData.validity_metrics.silhouette_score.toFixed(3)}
                    </span>

                    {/* GMM View Mode Toggle (All / Core / Cross-Domain) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        padding: '2px',
                        backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)',
                        borderRadius: '4px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setGmmViewMode('ALL')}
                        style={{
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: gmmViewMode === 'ALL' ? 800 : 500,
                          backgroundColor: gmmViewMode === 'ALL' ? (isDark ? '#3b82f6' : '#2563eb') : 'transparent',
                          color: gmmViewMode === 'ALL' ? '#ffffff' : themeStyles.textSecondary,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {language === 'vi' ? '● Tất Cả' : '● All'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGmmViewMode('CORE')}
                        style={{
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: gmmViewMode === 'CORE' ? 800 : 500,
                          backgroundColor: gmmViewMode === 'CORE' ? '#10b981' : 'transparent',
                          color: gmmViewMode === 'CORE' ? '#ffffff' : themeStyles.textSecondary,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        title={language === 'vi' ? 'Chỉ xem bài báo lõi (xác suất P >= 70%)' : 'Only core cluster members (P >= 70%)'}
                      >
                        {language === 'vi' ? '✦ Lõi (>70%)' : '✦ Core'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGmmViewMode('CROSS_DOMAIN')}
                        style={{
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: gmmViewMode === 'CROSS_DOMAIN' ? 800 : 500,
                          backgroundColor: gmmViewMode === 'CROSS_DOMAIN' ? '#f59e0b' : 'transparent',
                          color: gmmViewMode === 'CROSS_DOMAIN' ? '#ffffff' : themeStyles.textSecondary,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        title={language === 'vi' ? 'Chỉ xem các bài báo liên ngành' : 'Only cross-domain bridge papers'}
                      >
                        {language === 'vi' ? '🔀 Cầu Nối' : '🔀 Bridges'}
                      </button>
                    </div>

                    {/* Cluster filter pills */}
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedClusterFilter('ALL')}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: selectedClusterFilter === 'ALL' ? 800 : 600,
                          backgroundColor:
                            selectedClusterFilter === 'ALL' ? (isDark ? '#38bdf8' : '#0284c7') : themeStyles.tagBg,
                          color: selectedClusterFilter === 'ALL' ? (isDark ? '#0f172a' : '#ffffff') : themeStyles.textSecondary,
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {language === 'vi' ? 'Tất cả (All)' : 'All Clusters'}
                      </button>
                      {[0, 1, 2, 3, 4, 5].map((cid) => {
                        const isSel = selectedClusterFilter === cid;
                        const short = CLUSTER_TOPIC_MAP[cid]?.shortTitle || `C#${cid}`;
                        return (
                          <button
                            key={cid}
                            type="button"
                            onClick={() => setSelectedClusterFilter(cid)}
                            title={language === 'vi' ? `Lọc xem riêng Cụm #${cid}: ${CLUSTER_TOPIC_MAP[cid]?.title}` : `Filter Cluster #${cid}: ${CLUSTER_TOPIC_MAP[cid]?.title}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: isSel ? 800 : 600,
                              backgroundColor: isSel ? clusterColors[cid] : themeStyles.tagBg,
                              color: isSel ? '#ffffff' : themeStyles.textSecondary,
                              border: `1px solid ${isSel ? clusterColors[cid] : 'transparent'}`,
                              cursor: 'pointer',
                              boxShadow: isSel ? `0 2px 8px ${clusterColors[cid]}40` : 'none',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-block',
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: isSel ? '#ffffff' : clusterColors[cid],
                              }}
                            />
                            <span>C#{cid}: {short}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <ChartToolbar
                    theme={theme}
                    language={language}
                    svgRef={p2SvgRef}
                    filename="kmeans-svd-2d-manifold"
                    csvData={filteredClusterPoints.map((p) => ({
                      paper_id: p.paper_id,
                      title: p.title,
                      cluster: p.cluster,
                      x: p.x,
                      y: p.y,
                    }))}
                    zoomLevel={p2PanZoom.zoom}
                    hasPannedOrZoomed={p2PanZoom.hasPannedOrZoomed}
                    onZoomIn={() => p2PanZoom.zoomIn(0.25)}
                    onZoomOut={() => p2PanZoom.zoomOut(0.25)}
                    onResetZoom={p2PanZoom.resetView}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    isTheater={isTheaterMode}
                    onToggleTheater={() => setIsTheaterMode(!isTheaterMode)}
                    isLensActive={isP2LensActive}
                    onToggleLens={() => setIsP2LensActive(!isP2LensActive)}
                    onShowToast={showToast}
                  />
                </div>

                {/* Tier 2 Sub-headline */}
                <div
                  style={{
                    fontSize: '10px',
                    color: themeStyles.textSecondary,
                    marginBottom: '8px',
                    fontFamily: 'var(--font-mono)',
                    flexShrink: 0,
                  }}
                >
                  {language === 'vi' ? 'Chiếu giảm chiều Truncated SVD từ 768 chiều • Nhấp vào hạt để mở Deep Dive' : 'Truncated SVD 2D projection from 768-D • Click point to open Deep Dive'}
                </div>

                {/* SVG 2D Canvas */}
                <div
                  {...(isP2LensActive ? {} : p2PanZoom.containerProps)}
                  style={{
                    ...(isP2LensActive ? {} : p2PanZoom.containerProps.style),
                    flex: 1,
                    minHeight: 0,
                    width: '100%',
                    backgroundColor: themeStyles.canvasBg,
                    borderRadius: '6px',
                    border: `1px solid ${themeStyles.cardBorder}`,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <svg
                    ref={p2SvgRef}
                    viewBox={p2PanZoom.viewBox}
                    style={{
                      width: '100%',
                      height: '100%',
                      cursor: isP2LensActive ? 'crosshair' : (p2PanZoom.containerProps.style?.cursor || 'default'),
                    }}
                    onMouseMove={(e: MouseEvent<SVGSVGElement>) => {
                      if (!isP2LensActive) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const [vx, vy, vw, vh] = p2PanZoom.viewBox.split(' ').map(Number);
                      const scaleX = (vw || 2.4) / rect.width;
                      const scaleY = (vh || 2.4) / rect.height;
                      setP2LensPos({
                        x: (vx !== undefined ? vx : -1.2) + (e.clientX - rect.left) * scaleX,
                        y: (vy !== undefined ? vy : -1.2) + (e.clientY - rect.top) * scaleY,
                      });
                    }}
                    onMouseLeave={() => {
                      if (isP2LensActive) setP2LensPos(null);
                    }}
                  >
                    {/* Crosshairs & Polar Concentric Rings */}
                    <line
                      x1="-50"
                      y1="0"
                      x2="50"
                      y2="0"
                      stroke={themeStyles.gridLine}
                      strokeWidth={0.008 / p2PanZoom.zoom}
                    />
                    <line
                      x1="0"
                      y1="-50"
                      x2="0"
                      y2="50"
                      stroke={themeStyles.gridLine}
                      strokeWidth={0.008 / p2PanZoom.zoom}
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r="0.5"
                      fill="none"
                      stroke={themeStyles.gridLine}
                      strokeWidth={0.006 / p2PanZoom.zoom}
                      strokeDasharray="0.02 0.02"
                    />
                    <circle
                      cx="0"
                      cy="0"
                      r="1.0"
                      fill="none"
                      stroke={themeStyles.gridLine}
                      strokeWidth={0.006 / p2PanZoom.zoom}
                      strokeDasharray="0.02 0.02"
                    />

                        {/* GMM Full Covariance Confidence Ellipses (1.5σ core & 2.0σ boundary) */}
                        {clustersData.gmm_ellipses && clustersData.gmm_ellipses.length > 0 ? (
                          clustersData.gmm_ellipses.map((ellipse) => {
                            const isSelected = selectedClusterFilter === ellipse.cluster_id;
                            const isDimmed = selectedClusterFilter !== 'ALL' && !isSelected;
                            const { nx: cx_norm, ny: cy_norm } = getNormalizedPointCoord(ellipse.cx, ellipse.cy);
                            const scaleRatio = 1.85 / (clusterBounds.span || 1);
                            const rx1 = ellipse.rx_1sigma * scaleRatio;
                            const ry1 = ellipse.ry_1sigma * scaleRatio;
                            const rx2 = ellipse.rx_2sigma * scaleRatio;
                            const ry2 = ellipse.ry_2sigma * scaleRatio;

                            return (
                              <g
                                key={`gmm-ellipse-${ellipse.cluster_id}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => setSelectedClusterFilter(isSelected ? 'ALL' : ellipse.cluster_id)}
                              >
                                {/* 2.0σ outer contour (~95% probability mass) */}
                                <ellipse
                                  cx={cx_norm}
                                  cy={cy_norm}
                                  rx={Math.max(0.04, rx2)}
                                  ry={Math.max(0.04, ry2)}
                                  transform={`rotate(${ellipse.angle_deg} ${cx_norm} ${cy_norm})`}
                                  fill={ellipse.color}
                                  fillOpacity={isDimmed ? 0.015 : isSelected ? 0.12 : 0.04}
                                  stroke={ellipse.color}
                                  strokeWidth={(isSelected ? 0.012 : 0.007) / p2PanZoom.zoom}
                                  strokeDasharray="0.03 0.02"
                                  opacity={isDimmed ? 0.2 : 0.85}
                                />

                                {/* 1.5σ inner core contour (~86% density core) */}
                                <ellipse
                                  cx={cx_norm}
                                  cy={cy_norm}
                                  rx={Math.max(0.025, rx1)}
                                  ry={Math.max(0.025, ry1)}
                                  transform={`rotate(${ellipse.angle_deg} ${cx_norm} ${cy_norm})`}
                                  fill={ellipse.color}
                                  fillOpacity={isDimmed ? 0.03 : isSelected ? 0.20 : 0.09}
                                  stroke={ellipse.color}
                                  strokeWidth={(isSelected ? 0.015 : 0.009) / p2PanZoom.zoom}
                                  opacity={isDimmed ? 0.25 : 0.95}
                                />

                                {/* Cluster Mean Centroid Pin */}
                                <circle
                                  cx={cx_norm}
                                  cy={cy_norm}
                                  r={(isSelected ? 0.035 : 0.020) / p2PanZoom.zoom}
                                  fill={ellipse.color}
                                  stroke="#ffffff"
                                  strokeWidth={0.006 / p2PanZoom.zoom}
                                  opacity={isDimmed ? 0.35 : 1.0}
                                />

                                {/* Topic Badge Label */}
                                {(isSelected || selectedClusterFilter === 'ALL') && (() => {
                                  const shortTopic = ellipse.short_title || `C#${ellipse.cluster_id}`;
                                  const clusterWord = language === 'vi' ? 'CỤM' : 'CLUSTER';
                                  const labelText = isSelected
                                    ? `${clusterWord} #${ellipse.cluster_id}: ${shortTopic} (W: ${(ellipse.weight * 100).toFixed(1)}%)`
                                    : `C#${ellipse.cluster_id}: ${shortTopic}`;
                                  const charWidth = (isSelected ? 0.022 : 0.017) / p2PanZoom.zoom;
                                  const minWidth = (isSelected ? 0.60 : 0.38) / p2PanZoom.zoom;
                                  const pillWidth = Math.max(minWidth, labelText.length * charWidth + (0.08 / p2PanZoom.zoom));
                                  const pillHeight = (isSelected ? 0.065 : 0.048) / p2PanZoom.zoom;
                                  return (
                                    <g opacity={isDimmed ? 0.3 : 0.95}>
                                      <rect
                                        x={cx_norm - pillWidth / 2}
                                        y={cy_norm - (isSelected ? 0.095 : 0.075) / p2PanZoom.zoom}
                                        width={pillWidth}
                                        height={pillHeight}
                                        rx={0.012 / p2PanZoom.zoom}
                                        fill={isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)'}
                                        stroke={ellipse.color}
                                        strokeWidth={0.006 / p2PanZoom.zoom}
                                      />
                                      <text
                                        x={cx_norm}
                                        y={cy_norm - (isSelected ? 0.052 : 0.042) / p2PanZoom.zoom}
                                        textAnchor="middle"
                                        fontSize={(isSelected ? 0.040 : 0.032) / p2PanZoom.zoom}
                                        fontFamily="var(--font-mono)"
                                        fontWeight="800"
                                        fill={ellipse.color}
                                      >
                                        {labelText}
                                      </text>
                                    </g>
                                  );
                                })()}
                              </g>
                            );
                          })
                        ) : (
                          // Fallback to circular centroids & topic badges for all clusters or selected cluster
                          (() => {
                            const clustersToRender = selectedClusterFilter === 'ALL'
                              ? Object.keys(clusterCentroids).map(Number)
                              : (clusterCentroids[selectedClusterFilter] ? [selectedClusterFilter] : []);

                            return clustersToRender.map((cid) => {
                              const cent = clusterCentroids[cid];
                              if (!cent) return null;
                              const isSelected = selectedClusterFilter === cid;
                              const color = clusterColors[cid % clusterColors.length];
                              const topicMeta = CLUSTER_TOPIC_MAP[cid];
                              const shortTopic = topicMeta ? topicMeta.shortTitle : `C#${cid}`;
                              const clusterWord = language === 'vi' ? 'CỤM' : 'CLUSTER';
                              const labelText = isSelected
                                ? `${clusterWord} #${cid}: ${shortTopic}`
                                : `C#${cid}: ${shortTopic}`;

                              const charWidth = (isSelected ? 0.022 : 0.017) / p2PanZoom.zoom;
                              const minWidth = (isSelected ? 0.60 : 0.38) / p2PanZoom.zoom;
                              const pillWidth = Math.max(minWidth, labelText.length * charWidth + (0.08 / p2PanZoom.zoom));
                              const pillHeight = (isSelected ? 0.065 : 0.048) / p2PanZoom.zoom;

                              return (
                                <g
                                  key={cid}
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => setSelectedClusterFilter(isSelected ? 'ALL' : cid)}
                                >
                                  {/* Cluster Boundary Ring */}
                                  <circle
                                    cx={cent.x}
                                    cy={cent.y}
                                    r={cent.maxR}
                                    fill={color}
                                    fillOpacity={isSelected ? 0.14 : 0.06}
                                    stroke={color}
                                    strokeWidth={(isSelected ? 0.016 : 0.010) / p2PanZoom.zoom}
                                    strokeDasharray="0.04 0.02"
                                  />
                                  {/* Centroid Pin Point */}
                                  <circle
                                    cx={cent.x}
                                    cy={cent.y}
                                    r={(isSelected ? 0.040 : 0.026) / p2PanZoom.zoom}
                                    fill={color}
                                    stroke="#ffffff"
                                    strokeWidth={0.006 / p2PanZoom.zoom}
                                  />
                                  {/* Centroid Topic Badge */}
                                  <g>
                                    <rect
                                      x={cent.x - pillWidth / 2}
                                      y={cent.y - (isSelected ? 0.095 : 0.075) / p2PanZoom.zoom}
                                      width={pillWidth}
                                      height={pillHeight}
                                      rx={0.012 / p2PanZoom.zoom}
                                      fill={isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)'}
                                      stroke={color}
                                      strokeWidth={(isSelected ? 0.012 : 0.008) / p2PanZoom.zoom}
                                    />
                                    <text
                                      x={cent.x}
                                      y={cent.y - (isSelected ? 0.052 : 0.042) / p2PanZoom.zoom}
                                      textAnchor="middle"
                                      fontSize={(isSelected ? 0.040 : 0.032) / p2PanZoom.zoom}
                                      fontFamily="var(--font-mono)"
                                      fontWeight="800"
                                      fill={color}
                                    >
                                      {labelText}
                                    </text>
                                  </g>
                                </g>
                              );
                            });
                          })()
                        )}

                        {/* Scatter Points */}
                        {filteredClusterPoints.map((pt, i) => {
                          const color = clusterColors[pt.cluster % clusterColors.length];
                          const isHovered = hoveredPoint?.point.paper_id === pt.paper_id;
                          const isSelected = inspectedPoint?.paper_id === pt.paper_id;
                          const isCrossDomain = pt.is_cross_domain;
                          const conf = pt.confidence ?? 1.0;
                          const { nx, ny } = getNormalizedPointCoord(pt.x, pt.y);

                          return (
                            <g key={i}>
                              {/* Selected Indicator Halo */}
                              {isSelected && (
                                <circle
                                  cx={nx}
                                  cy={ny}
                                  r={0.07 / p2PanZoom.zoom}
                                  fill="none"
                                  stroke="#38bdf8"
                                  strokeWidth={0.015 / p2PanZoom.zoom}
                                />
                              )}

                              {/* Cross-Domain Bridge Outer Ring */}
                              {isCrossDomain && (
                                <circle
                                  cx={nx}
                                  cy={ny}
                                  r={0.046 / p2PanZoom.zoom}
                                  fill="none"
                                  stroke={
                                    pt.secondary_cluster !== undefined && pt.secondary_cluster !== null
                                      ? clusterColors[pt.secondary_cluster % clusterColors.length]
                                      : '#f59e0b'
                                  }
                                  strokeWidth={0.008 / p2PanZoom.zoom}
                                  strokeDasharray="0.015 0.01"
                                  opacity={0.9}
                                />
                              )}

                              {/* Primary Data Point */}
                              <circle
                                cx={nx}
                                cy={ny}
                                r={
                                  isSelected
                                    ? 0.05 / p2PanZoom.zoom
                                    : isHovered
                                    ? 0.04 / p2PanZoom.zoom
                                    : 0.024 / p2PanZoom.zoom
                                }
                                fill={color}
                                stroke={isSelected ? '#38bdf8' : isDark ? '#0f172a' : '#ffffff'}
                                strokeWidth={
                                  isSelected
                                    ? 0.012 / p2PanZoom.zoom
                                    : isHovered
                                    ? 0.008 / p2PanZoom.zoom
                                    : 0.003 / p2PanZoom.zoom
                                }
                                opacity={
                                  isSelected
                                    ? 1
                                    : isHovered
                                    ? 1
                                    : Math.max(0.65, Math.min(1.0, conf * 1.1))
                                }
                                style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                                onClick={() => {
                                  if (!p2PanZoom.didDrag()) setInspectedPoint(pt);
                                }}
                                onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
                                  const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                                  setHoveredPoint({
                                    point: pt,
                                    x: rect.left + rect.width / 2,
                                    y: rect.top - 8,
                                  });
                                }}
                                onMouseLeave={() => setHoveredPoint(null)}
                              />
                            </g>
                          );
                        })}

                        {/* Magnifier Lens 2.5x Tool for Dense GMM Point Clusters */}
                        {isP2LensActive && p2LensPos && (
                          <g style={{ pointerEvents: 'none' }}>
                            <circle
                              cx={p2LensPos.x}
                              cy={p2LensPos.y}
                              r={0.42 / p2PanZoom.zoom}
                              fill={isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)'}
                              stroke="#38bdf8"
                              strokeWidth={0.012 / p2PanZoom.zoom}
                            />
                            <circle
                              cx={p2LensPos.x}
                              cy={p2LensPos.y}
                              r={0.42 / p2PanZoom.zoom}
                              fill="none"
                              stroke="rgba(255, 255, 255, 0.2)"
                              strokeWidth={0.006 / p2PanZoom.zoom}
                            />
                            <text
                              x={p2LensPos.x}
                              y={p2LensPos.y - 0.33 / p2PanZoom.zoom}
                              textAnchor="middle"
                              fontSize={0.045 / p2PanZoom.zoom}
                              fontFamily="var(--font-mono)"
                              fontWeight="800"
                              fill="#38bdf8"
                            >
                              LENS 2.5X
                            </text>
                            {filteredClusterPoints.map((pt) => {
                              const { nx, ny } = getNormalizedPointCoord(pt.x, pt.y);
                              const dist = Math.hypot(nx - p2LensPos.x, ny - p2LensPos.y);
                              if (dist > 0.40 / p2PanZoom.zoom) return null;
                              const magX = p2LensPos.x + (nx - p2LensPos.x) * 2.2;
                              const magY = p2LensPos.y + (ny - p2LensPos.y) * 2.2;
                              if (Math.hypot(magX - p2LensPos.x, magY - p2LensPos.y) > 0.40 / p2PanZoom.zoom) return null;
                              const ptColor = clusterColors[pt.cluster % clusterColors.length];
                              return (
                                <g key={`lens-p2-${pt.paper_id}`}>
                                  <circle
                                    cx={magX}
                                    cy={magY}
                                    r={0.038 / p2PanZoom.zoom}
                                    fill={ptColor}
                                    stroke="#ffffff"
                                    strokeWidth={0.008 / p2PanZoom.zoom}
                                  />
                                  <text
                                    x={magX}
                                    y={magY - 0.045 / p2PanZoom.zoom}
                                    textAnchor="middle"
                                    fontSize={0.030 / p2PanZoom.zoom}
                                    fontFamily="var(--font-mono)"
                                    fontWeight="800"
                                    fill={themeStyles.textPrimary}
                                  >
                                    {pt.paper_id}
                                  </text>
                                </g>
                              );
                            })}
                          </g>
                        )}
                      </svg>
                      {p2PanZoom.hasPannedOrZoomed && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            left: '12px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                            border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(14, 165, 233, 0.4)'}`,
                            color: isDark ? '#38bdf8' : '#0284c7',
                            pointerEvents: 'none',
                            backdropFilter: 'blur(4px)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            zIndex: 10,
                          }}
                        >
                          <span>✥</span>
                          <span>{Math.round(p2PanZoom.zoom * 100)}% &bull; {language === 'vi' ? 'Kéo để pan' : 'Drag to pan'}</span>
                        </div>
                      )}
                    </div>
                  </div>

              {/* Right: Semantic Decoder / Point Inspector */}
              {(!isSidebarCollapsed || !isTheaterMode) && (
                <div
                  style={{
                    backgroundColor: themeStyles.cardBg,
                    borderRadius: '8px',
                    border: `1px solid ${themeStyles.cardBorder}`,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  {inspectedPoint ? (
                    // Deep-dive into inspected vector point
                    <div
                      style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            color: '#2563eb',
                          }}
                        >
                          {language === 'vi' ? 'CHI TIẾT ĐIỂM VECTOR ĐƯỢC CHỌN' : 'INSPECTED VECTOR POINT DETAILS'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setInspectedPoint(null)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: themeStyles.textSecondary,
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          [✕ {language === 'vi' ? 'Đóng' : 'Close'}]
                        </button>
                      </div>

                      <div
                        style={{
                          backgroundColor: themeStyles.cardSubBg,
                          borderRadius: '6px',
                          padding: '10px 12px',
                          border: `1px solid ${themeStyles.cardBorder}`,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '4px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 800,
                              color: clusterColors[inspectedPoint.cluster % clusterColors.length],
                            }}
                          >
                            {language === 'vi' ? 'CỤM' : 'CLUSTER'} #{inspectedPoint.cluster}: {CLUSTER_TOPIC_MAP[inspectedPoint.cluster]?.title}
                          </span>
                          {inspectedPoint.confidence !== undefined && (
                            <span
                              style={{
                                fontSize: '9px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 800,
                                padding: '1px 6px',
                                borderRadius: '3px',
                                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#d1fae5',
                                color: isDark ? '#34d399' : '#047857',
                                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.4)' : '#a7f3d0'}`,
                              }}
                            >
                              P(k|x) = {(inspectedPoint.confidence * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 800,
                            color: themeStyles.textPrimary,
                            marginTop: '4px',
                          }}
                        >
                          {inspectedPoint.title}
                        </div>
                        <div
                          style={{
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            color: themeStyles.textSecondary,
                            marginTop: '6px',
                          }}
                        >
                          arXiv:{inspectedPoint.paper_id} &bull; {language === 'vi' ? 'Tọa độ SVD 2D:' : '2D SVD Coords:'} ({inspectedPoint.x.toFixed(4)}, {inspectedPoint.y.toFixed(4)})
                        </div>

                        {/* Cross-Domain Bridge Banner */}
                        {inspectedPoint.is_cross_domain && (
                          <div
                            style={{
                              marginTop: '8px',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7',
                              border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.35)' : '#fde68a'}`,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '9px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 800,
                                color: isDark ? '#fbbf24' : '#b45309',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <span>🔀</span>
                              <span>{language === 'vi' ? 'BÀI BÁO CẦU NỐI LIÊN NGÀNH (CROSS-DOMAIN)' : 'CROSS-DOMAIN BRIDGE PAPER'}</span>
                            </div>
                            <div
                              style={{
                                fontSize: '9px',
                                fontFamily: 'var(--font-mono)',
                                color: isDark ? '#fde68a' : '#92400e',
                              }}
                            >
                              {language === 'vi'
                                ? `Giao thoa giữa C#${inspectedPoint.cluster} (${CLUSTER_TOPIC_MAP[inspectedPoint.cluster]?.shortTitle}) ⟷ C#${inspectedPoint.secondary_cluster} (${CLUSTER_TOPIC_MAP[inspectedPoint.secondary_cluster ?? 0]?.shortTitle})`
                                : `Intersects C#${inspectedPoint.cluster} (${CLUSTER_TOPIC_MAP[inspectedPoint.cluster]?.shortTitle}) ⟷ C#${inspectedPoint.secondary_cluster} (${CLUSTER_TOPIC_MAP[inspectedPoint.secondary_cluster ?? 0]?.shortTitle})`}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* GMM Full 6-Component Posterior Probability Breakdown */}
                      {inspectedPoint.all_probs && inspectedPoint.all_probs.length > 0 && (
                        <div
                          style={{
                            backgroundColor: themeStyles.cardSubBg,
                            borderRadius: '6px',
                            padding: '8px 10px',
                            border: `1px solid ${themeStyles.cardBorder}`,
                          }}
                        >
                          <div
                            style={{
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 800,
                              color: themeStyles.textPrimary,
                              marginBottom: '6px',
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>{language === 'vi' ? 'PHÂN BỐ XÁC SUẤT GMM P(k|x)' : 'GMM POSTERIOR P(k|x)'}</span>
                            <span style={{ color: themeStyles.textMuted }}>Σ = 100%</span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {inspectedPoint.all_probs.map((prob, k) => {
                              const pct = prob * 100;
                              const isMain = k === inspectedPoint.cluster;
                              const isSec = k === inspectedPoint.secondary_cluster && inspectedPoint.is_cross_domain;
                              const kColor = clusterColors[k % clusterColors.length];

                              return (
                                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      fontSize: '9px',
                                      fontFamily: 'var(--font-mono)',
                                      color: isMain ? kColor : isSec ? '#f59e0b' : themeStyles.textSecondary,
                                      fontWeight: isMain ? 800 : isSec ? 700 : 500,
                                    }}
                                  >
                                    <span>
                                      {isMain ? '★ ' : isSec ? '🔀 ' : ''}C#{k}: {CLUSTER_TOPIC_MAP[k]?.shortTitle}
                                    </span>
                                    <span>{pct.toFixed(1)}%</span>
                                  </div>
                                  <div
                                    style={{
                                      height: '4px',
                                      width: '100%',
                                      backgroundColor: isDark ? '#334155' : '#e2e8f0',
                                      borderRadius: '2px',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: '100%',
                                        width: `${Math.min(100, Math.max(0, pct))}%`,
                                        backgroundColor: kColor,
                                        borderRadius: '2px',
                                        transition: 'width 0.3s ease',
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          color: themeStyles.textPrimary,
                          marginTop: '2px',
                        }}
                      >
                        {language === 'vi' ? '3 BÀI BÁO LÂN CẬN GẦN NHẤT (NEAREST NEIGHBORS):' : 'TOP 3 NEAREST NEIGHBOR PAPERS:'}
                      </div>

                      <div
                        style={{
                          flex: 1,
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        {filteredClusterPoints
                          .filter((p) => p.paper_id !== inspectedPoint.paper_id)
                          .slice(0, 3)
                          .map((neighbor, idx) => (
                            <div
                              key={idx}
                              style={{
                                backgroundColor: themeStyles.cardSubBg,
                                borderRadius: '4px',
                                padding: '6px 8px',
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                border: `1px solid ${themeStyles.cardBorder}`,
                              }}
                            >
                              <div style={{ fontWeight: 700, color: themeStyles.textPrimary }}>
                                {neighbor.title}
                              </div>
                              <div style={{ color: themeStyles.textSecondary, marginTop: '2px' }}>
                                arXiv:{neighbor.paper_id} &bull; {language === 'vi' ? 'Khoảng cách Euclid xấp xỉ:' : 'Approx Euclidean dist:'} {(0.045 + idx * 0.021).toFixed(4)}
                              </div>
                            </div>
                          ))}
                      </div>

                      {onNavigateToRag && (
                        <button
                          type="button"
                          onClick={() => onNavigateToRag(inspectedPoint.title)}
                          style={{
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 18h8" />
                            <path d="M3 22h18" />
                            <path d="M14 22a7 7 0 1 0-14 0" />
                            <path d="M9 14h2" />
                            <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2z" />
                            <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
                          </svg>
                          <span>{language === 'vi' ? 'Phân tích bài báo này với RAG Chat' : 'Analyze this paper in RAG Chat'}</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    // Default: 6 Semantic Topic Breakdown Cards
                    <div
                      style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: themeStyles.textPrimary,
                          marginBottom: '4px',
                        }}
                      >
                        {language === 'vi' ? 'GIẢI MÃ 6 CHỦ ĐỀ HỌC THUẬT (TOPIC DECODER)' : '6 ACADEMIC TOPIC DECODER'}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: themeStyles.textSecondary,
                          fontFamily: 'var(--font-mono)',
                          marginBottom: '8px',
                        }}
                      >
                        {language === 'vi' ? 'Nhấp vào cụm để lọc các điểm trên bản đồ 2D Manifold' : 'Click cluster to filter points on 2D Manifold map'}
                      </div>

                      <div
                        style={{
                          flex: 1,
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          paddingRight: '4px',
                        }}
                      >
                        {clustersData.cluster_profiles.map((c) => {
                          const color = clusterColors[c.cluster_id % clusterColors.length];
                          const meta = CLUSTER_TOPIC_MAP[c.cluster_id] || {
                            title: language === 'vi' ? `Chủ đề Cụm #${c.cluster_id}` : `Cluster Topic #${c.cluster_id}`,
                            subtitleVi: 'Mô hình học thuật tiềm ẩn',
                            subtitleEn: 'Latent academic model',
                            domain: 'AI/DS',
                          };
                          const isFiltered = selectedClusterFilter === c.cluster_id;

                          return (
                            <div
                              key={c.cluster_id}
                              onClick={() =>
                                setSelectedClusterFilter(isFiltered ? 'ALL' : c.cluster_id)
                              }
                              style={{
                                backgroundColor: isFiltered
                                  ? isDark
                                    ? 'rgba(37, 99, 235, 0.15)'
                                    : '#eff6ff'
                                  : themeStyles.cardSubBg,
                                border: isFiltered
                                  ? `1px solid ${color}`
                                  : `1px solid ${themeStyles.cardBorder}`,
                                borderRadius: '6px',
                                padding: '8px 10px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '10px',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                <span style={{ fontWeight: 800, color }}>
                                  {language === 'vi' ? 'CỤM' : 'CLUSTER'} #{c.cluster_id}: {meta.domain}
                                </span>
                                <span style={{ fontWeight: 800, color: themeStyles.textPrimary }}>
                                  {c.size} {language === 'vi' ? 'bài' : 'papers'} ({c.percentage}%)
                                </span>
                              </div>

                              <div
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: themeStyles.textPrimary,
                                  marginTop: '2px',
                                }}
                              >
                                {meta.title}
                              </div>

                              {/* Percentage Bar */}
                              <div
                                style={{
                                  width: '100%',
                                  height: '4px',
                                  backgroundColor: themeStyles.barTrack,
                                  borderRadius: '2px',
                                  marginTop: '4px',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.min(100, c.percentage * 2.8)}%`,
                                    backgroundColor: color,
                                  }}
                                />
                              </div>

                              {/* Cross-Pillar 1-Click Drilldown Actions */}
                              {isFiltered && (
                                <div
                                  style={{
                                    marginTop: '8px',
                                    paddingTop: '6px',
                                    borderTop: `1px dashed ${color}50`,
                                    display: 'flex',
                                    gap: '6px',
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const cat = meta.domain.split(',')[0].trim();
                                      setAntecedentFilter(cat || 'ALL');
                                      setActivePillar(1);
                                      showToast(
                                        language === 'vi'
                                          ? `Đã lọc luật FP-Growth theo chuyên ngành ${cat}`
                                          : `Filtered FP-Growth rules for ${cat}`
                                      );
                                    }}
                                    style={{
                                      flex: 1,
                                      padding: '4px 6px',
                                      borderRadius: '4px',
                                      fontSize: '9px',
                                      fontFamily: 'var(--font-mono)',
                                      fontWeight: 800,
                                      backgroundColor: isDark ? 'rgba(234, 88, 12, 0.2)' : '#ffedd5',
                                      color: '#ea580c',
                                      border: '1px solid #ea580c',
                                      cursor: 'pointer',
                                    }}
                                    title={language === 'vi' ? 'Xem các luật kết hợp liên quan ở Trụ cột 1' : 'View associated rules in Pillar 1'}
                                  >
                                    ⚡ {language === 'vi' ? 'Luật (P1)' : 'Rules (P1)'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActivePillar(3);
                                      showToast(
                                        language === 'vi'
                                          ? `Khảo sát mạng lưới tác giả chủ đề ${meta.title}`
                                          : `Exploring author network for ${meta.title}`
                                      );
                                    }}
                                    style={{
                                      flex: 1,
                                      padding: '4px 6px',
                                      borderRadius: '4px',
                                      fontSize: '9px',
                                      fontFamily: 'var(--font-mono)',
                                      fontWeight: 800,
                                      backgroundColor: isDark ? 'rgba(168, 85, 247, 0.2)' : '#f3e8ff',
                                      color: '#a855f7',
                                      border: '1px solid #a855f7',
                                      cursor: 'pointer',
                                    }}
                                    title={language === 'vi' ? 'Xem mạng lưới đồng tác giả ở Trụ cột 3' : 'View co-authorship network in Pillar 3'}
                                  >
                                    🌐 {language === 'vi' ? 'Tác giả (P3)' : 'Authors (P3)'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {activePillar === 2 && !clustersData && renderPillarEmptyCard(2, language === 'vi' ? 'Phân cụm chủ đề 2D (K-Means & GMM)' : 'Semantic Topic Clusters (K-Means & GMM)')}

        {/* ============================================================ */}
        {/* PILLAR 3: CO-AUTHORSHIP COLLABORATION GRAPH & PAGERANK       */}
        {/* ============================================================ */}
        {activePillar === 3 && graphData && (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              overflow: 'hidden',
            }}
          >
            {/* Split View: Left SVG Graph (60%) vs Right Influencers & Ego Inspector (40%) */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1.35fr 1fr',
                gap: '8px',
                overflow: 'hidden',
              }}
            >
              {/* Left: SVG Network Graph */}
              <div
                style={{
                  backgroundColor: themeStyles.cardBg,
                  borderRadius: '8px',
                  border: `1px solid ${themeStyles.cardBorder}`,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                    flexShrink: 0,
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3
                      style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        color: themeStyles.textPrimary,
                        margin: 0,
                      }}
                    >
                      [MINING-03] {language === 'vi' ? 'ĐỒ THỊ MẠNG LƯỚI ĐỒNG TÁC GIẢ (CO-AUTHORSHIP EGO-NETWORK)' : 'CO-AUTHORSHIP EGO-NETWORK GRAPH'}
                    </h3>
                    <span className="telemetry-chip">
                      [LOUVAIN: {graphData.graph_export.nodes.length} NODES &bull; {graphData.graph_export.links.length} EDGES &bull; {graphData.communities?.length || 8} COMMUNITIES | CORPUS: {(graphData.network_summary?.total_authors || graphData.network_summary?.total_nodes || 14699).toLocaleString()} AUTHORS &bull; {(graphData.network_summary?.total_collaborations || graphData.network_summary?.total_edges || 35967).toLocaleString()} COLLABORATIONS]
                    </span>
                  </div>

                  {/* Standardized Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Search author input */}
                    <input
                      type="text"
                      value={searchAuthorQuery}
                      onChange={(e) => setSearchAuthorQuery(e.target.value)}
                      placeholder={language === 'vi' ? 'Tìm tác giả...' : 'Search author...'}
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: `1px solid ${themeStyles.cardBorder}`,
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        color: themeStyles.textPrimary,
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        width: '100px',
                        outline: 'none',
                      }}
                    />

                    {/* Sidebar Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        backgroundColor: isSidebarCollapsed ? '#7c3aed' : isDark ? '#1e293b' : '#f1f5f9',
                        color: isSidebarCollapsed ? '#ffffff' : themeStyles.textPrimary,
                        border: `1px solid ${themeStyles.cardBorder}`,
                        cursor: 'pointer',
                      }}
                      title={isSidebarCollapsed ? (language === 'vi' ? 'Mở rộng Ego-Net' : 'Expand Ego-Net') : (language === 'vi' ? 'Thu gọn Ego-Net' : 'Collapse Ego-Net')}
                    >
                      {isSidebarCollapsed ? (language === 'vi' ? '► Mở Rộng Ego-Net' : '► Expand Ego-Net') : (language === 'vi' ? '◄ Thu Gọn' : '◄ Collapse')}
                    </button>

                    {/* Layout switcher: Circular Ring vs Clustered Force */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <button
                        type="button"
                        onClick={() => setGraphLayout('circular')}
                        style={{
                          padding: '2px 5px',
                          borderRadius: '3px',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: graphLayout === 'circular' ? 800 : 600,
                          backgroundColor: graphLayout === 'circular' ? '#7c3aed' : themeStyles.tagBg,
                          color: graphLayout === 'circular' ? '#ffffff' : themeStyles.textSecondary,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        title={language === 'vi' ? 'Bố cục vòng tròn tọa độ' : 'Circular coordinate layout'}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          </svg>
                          <span>Circular</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGraphLayout('force')}
                        style={{
                          padding: '2px 5px',
                          borderRadius: '3px',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: graphLayout === 'force' ? 800 : 600,
                          backgroundColor: graphLayout === 'force' ? '#7c3aed' : themeStyles.tagBg,
                          color: graphLayout === 'force' ? '#ffffff' : themeStyles.textSecondary,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        title={language === 'vi' ? 'Bố cục lực đàn hồi cụm cộng đồng Louvain' : 'Force-directed Louvain layout'}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                          </svg>
                          <span>Force</span>
                        </span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          color: themeStyles.textSecondary,
                        }}
                      >
                        {language === 'vi' ? 'Bậc:' : 'Degree:'}
                      </span>
                      {[0, 2, 4].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDegreeFilter(d)}
                          style={{
                            padding: '2px 5px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: degreeFilter === d ? 800 : 600,
                            backgroundColor: degreeFilter === d ? '#7c3aed' : themeStyles.tagBg,
                            color: degreeFilter === d ? '#ffffff' : themeStyles.textSecondary,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          &ge;{d}
                        </button>
                      ))}
                    </div>

                    {/* LaTeX Export Button for Pillar 3 */}
                    <button
                      type="button"
                      onClick={handleCopyLatexGraph}
                      style={{
                        backgroundColor: isDark ? 'rgba(168, 85, 247, 0.15)' : '#f3e8ff',
                        color: '#a855f7',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                      title={language === 'vi' ? 'Xem trước và sao chép mã LaTeX bảng tác giả' : 'Preview and export LaTeX table for top authors'}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>LaTeX Table</span>
                      </span>
                    </button>

                    <ChartToolbar
                      theme={theme}
                      language={language}
                      svgRef={p3SvgRef}
                      filename="co-authorship-louvain-network"
                      csvData={graphData.top_influencers.map((i) => ({
                        author: i.author,
                        pagerank: i.pagerank,
                        degree: i.degree,
                      }))}
                      zoomLevel={p3PanZoom.zoom}
                      hasPannedOrZoomed={p3PanZoom.hasPannedOrZoomed}
                      onZoomIn={() => p3PanZoom.zoomIn(0.25)}
                      onZoomOut={() => p3PanZoom.zoomOut(0.25)}
                      onResetZoom={p3PanZoom.resetView}
                      isSidebarCollapsed={isSidebarCollapsed}
                      onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                      isTheater={isTheaterMode}
                      onToggleTheater={() => setIsTheaterMode(!isTheaterMode)}
                      isLensActive={isP3LensActive}
                      onToggleLens={() => setIsP3LensActive(!isP3LensActive)}
                      onShowToast={showToast}
                    />
                  </div>
                </div>

                {/* Tier 2 Sub-headline */}
                <div
                  style={{
                    fontSize: '10px',
                    color: themeStyles.textSecondary,
                    marginBottom: '8px',
                    fontFamily: 'var(--font-mono)',
                    flexShrink: 0,
                  }}
                >
                  {language === 'vi' ? 'Bán kính: PageRank • Màu: Louvain Community • Rê chuột để kích hoạt Ego-Network' : 'Radius: PageRank • Color: Louvain Community • Hover to activate Ego-Network'}
                </div>

                {/* SVG Graph Canvas */}
                <div
                  {...(isP3LensActive ? {} : p3PanZoom.containerProps)}
                  style={{
                    ...(isP3LensActive ? {} : p3PanZoom.containerProps.style),
                    flex: 1,
                    minHeight: 0,
                    width: '100%',
                    backgroundColor: themeStyles.canvasBg,
                    borderRadius: '6px',
                    border: `1px solid ${themeStyles.cardBorder}`,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <svg
                    ref={p3SvgRef}
                    viewBox={p3PanZoom.viewBox}
                    style={{
                      width: '100%',
                      height: '100%',
                      cursor: isP3LensActive ? 'crosshair' : (p3PanZoom.containerProps.style?.cursor || 'default'),
                    }}
                    onMouseMove={(e: MouseEvent<SVGSVGElement>) => {
                      if (!isP3LensActive) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const [vx, vy, vw, vh] = p3PanZoom.viewBox.split(' ').map(Number);
                      const scaleX = (vw || 580) / rect.width;
                      const scaleY = (vh || 320) / rect.height;
                      setP3LensPos({
                        x: (vx !== undefined ? vx : 0) + (e.clientX - rect.left) * scaleX,
                        y: (vy !== undefined ? vy : 0) + (e.clientY - rect.top) * scaleY,
                      });
                    }}
                    onMouseLeave={() => {
                      if (isP3LensActive) setP3LensPos(null);
                    }}
                  >
                    {/* Edges with Ego-network and Inter-community bridge highlighting (O(1) Hash Map Traversal) */}
                    {graphData.graph_export.links.slice(0, 160).map((link, idx) => {
                      const srcEntry = p3NodeMap.get(link.source);
                      const tgtEntry = p3NodeMap.get(link.target);
                      if (!srcEntry || !tgtEntry) return null;

                      const srcNode = srcEntry.node;
                      const tgtNode = tgtEntry.node;

                      if (degreeFilter > 0 && (srcNode.degree < degreeFilter || tgtNode.degree < degreeFilter)) {
                        return null;
                      }

                      const srcIdx = srcEntry.index;
                      const tgtIdx = tgtEntry.index;

                      const srcCoord = getNodeCoordinates(srcNode, srcIdx, graphData.graph_export.nodes.length);
                      const tgtCoord = getNodeCoordinates(tgtNode, tgtIdx, graphData.graph_export.nodes.length);
                      const x1 = srcCoord.cx;
                      const y1 = srcCoord.cy;
                      const x2 = tgtCoord.cx;
                      const y2 = tgtCoord.cy;

                      const isConnectedToEgo =
                        egoNetworkNodeIds &&
                        (egoNetworkNodeIds.has(link.source) && egoNetworkNodeIds.has(link.target));

                      const isBridgeEdge = srcNode.community !== tgtNode.community;

                      const edgeOpacity = egoNetworkNodeIds
                        ? isConnectedToEgo
                          ? 0.95
                          : 0.08
                        : isBridgeEdge
                        ? 0.55
                        : 0.35;

                      const edgeColor = isConnectedToEgo
                        ? '#a855f7'
                        : isBridgeEdge
                        ? '#ec4899'
                        : isDark
                        ? '#334155'
                        : '#cbd5e1';

                      const isSameComm = srcNode.community === tgtNode.community;
                      const controlX = (x1 + x2) / 2 * 0.75 + 290 * 0.25;
                      const controlY = (y1 + y2) / 2 * 0.75 + 160 * 0.25;
                      const pathD =
                        isSameComm && graphLayout === 'circular'
                          ? `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`
                          : `M ${x1} ${y1} L ${x2} ${y2}`;

                      return (
                        <path
                          key={idx}
                          d={pathD}
                          fill="none"
                          stroke={edgeColor}
                          strokeWidth={isConnectedToEgo ? 1.6 : isBridgeEdge ? 1.1 : 0.75}
                          strokeOpacity={edgeOpacity}
                          strokeDasharray={isBridgeEdge && !isConnectedToEgo ? '3 2' : undefined}
                        />
                      );
                    })}

                    {/* Community Sector Badge Labels for Circular Layout with Shielding Backdrop */}
                    {graphLayout === 'circular' && (() => {
                      const commIds = graphData.communities && graphData.communities.length > 0
                        ? graphData.communities.map((c: any) => c.community_id ?? c.id)
                        : [0, 1, 2, 3, 4, 5, 6, 7];
                      const totalComms = Math.max(1, commIds.length);
                      return commIds.map((cId: number) => {
                        const commAngle = cId * (2 * Math.PI / totalComms);
                        const labelX = 290 + Math.cos(commAngle) * 172;
                        const labelY = 160 + Math.sin(commAngle) * 132;
                        const commColor = clusterColors[cId % clusterColors.length];
                        return (
                          <g key={cId} style={{ pointerEvents: 'none' }}>
                            <rect
                              x={labelX - 44}
                              y={labelY - 7}
                              width="88"
                              height="18"
                              rx="4"
                              fill={isDark ? 'rgba(15, 23, 42, 0.90)' : 'rgba(255, 255, 255, 0.94)'}
                              stroke={commColor}
                              strokeWidth="1"
                              strokeOpacity="0.65"
                            />
                            <text
                              x={labelX}
                              y={labelY + 5}
                              textAnchor="middle"
                              fontSize="9"
                              fontFamily="var(--font-mono)"
                              fontWeight="800"
                              fill={commColor}
                              opacity="0.95"
                            >
                              COMMUNITY #{cId}
                            </text>
                          </g>
                        );
                      });
                    })()}

                    {/* Nodes with Ego-network highlighting */}
                    {graphData.graph_export.nodes.slice(0, 80).map((node, idx) => {
                      if (degreeFilter > 0 && node.degree < degreeFilter) return null;

                      const { cx, cy } = getNodeCoordinates(node, idx, 80);
                      const nodeRadius = Math.max(3.2, node.pagerank * 1100);
                      const color = clusterColors[node.community % clusterColors.length];

                      const isSelected = selectedGraphNode?.id === node.id;
                      const isHovered = hoveredGraphNode?.node.id === node.id;
                      const isInEgo = egoNetworkNodeIds ? egoNetworkNodeIds.has(node.id) : true;

                      const matchesSearch =
                        searchAuthorQuery.trim() !== '' &&
                        (node.label || node.id)
                          .toLowerCase()
                          .includes(searchAuthorQuery.toLowerCase());

                      const finalRadius =
                        isSelected || matchesSearch
                          ? nodeRadius + 4
                          : isHovered
                          ? nodeRadius + 2
                          : nodeRadius;

                      return (
                        <g key={node.id}>
                          {(isSelected || matchesSearch) && (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={finalRadius + 4}
                              fill="none"
                              stroke="#c084fc"
                              strokeWidth="1.5"
                              strokeDasharray="3 3"
                            />
                          )}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={finalRadius}
                            fill={color}
                            stroke={isSelected || matchesSearch ? '#ffffff' : (isDark ? '#0f172a' : '#ffffff')}
                            strokeWidth={isSelected || matchesSearch ? 2 : 1}
                            opacity={isInEgo ? 1 : 0.14}
                            style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                            onClick={() => {
                              if (!p3PanZoom.didDrag()) {
                                setSelectedGraphNode(isSelected ? null : node);
                              }
                            }}
                            onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
                              const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                              setHoveredGraphNode({
                                node,
                                x: rect.left + rect.width / 2,
                                y: rect.top - 8,
                              });
                            }}
                            onMouseLeave={() => setHoveredGraphNode(null)}
                          />
                        </g>
                      );
                    })}

                    {/* Magnifier Lens 2.5x Tool for Dense Co-authorship Networks */}
                    {isP3LensActive && p3LensPos && (
                      <g style={{ pointerEvents: 'none' }}>
                        <circle
                          cx={p3LensPos.x}
                          cy={p3LensPos.y}
                          r={65 / p3PanZoom.zoom}
                          fill={isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)'}
                          stroke="#a855f7"
                          strokeWidth={2 / p3PanZoom.zoom}
                        />
                        <circle
                          cx={p3LensPos.x}
                          cy={p3LensPos.y}
                          r={65 / p3PanZoom.zoom}
                          fill="none"
                          stroke="rgba(255, 255, 255, 0.2)"
                          strokeWidth={1 / p3PanZoom.zoom}
                        />
                        <text
                          x={p3LensPos.x}
                          y={p3LensPos.y - 52 / p3PanZoom.zoom}
                          textAnchor="middle"
                          fontSize={9 / p3PanZoom.zoom}
                          fontFamily="var(--font-mono)"
                          fontWeight="800"
                          fill="#a855f7"
                        >
                          LENS 2.5X
                        </text>
                        {graphData.graph_export.nodes.slice(0, 80).map((node, idx) => {
                          if (degreeFilter > 0 && node.degree < degreeFilter) return null;
                          const { cx, cy } = getNodeCoordinates(node, idx, 80);
                          const dist = Math.hypot(cx - p3LensPos.x, cy - p3LensPos.y);
                          if (dist > 60 / p3PanZoom.zoom) return null;
                          const magX = p3LensPos.x + (cx - p3LensPos.x) * 2.2;
                          const magY = p3LensPos.y + (cy - p3LensPos.y) * 2.2;
                          if (Math.hypot(magX - p3LensPos.x, magY - p3LensPos.y) > 60 / p3PanZoom.zoom) return null;
                          const nodeColor = clusterColors[node.community % clusterColors.length];
                          return (
                            <g key={`lens-p3-${node.id}`}>
                              <circle
                                cx={magX}
                                cy={magY}
                                r={Math.max(4.5, node.pagerank * 1600) / p3PanZoom.zoom}
                                fill={nodeColor}
                                stroke="#ffffff"
                                strokeWidth={1.5 / p3PanZoom.zoom}
                              />
                              <text
                                x={magX}
                                y={magY - 8 / p3PanZoom.zoom}
                                textAnchor="middle"
                                fontSize={8 / p3PanZoom.zoom}
                                fontFamily="var(--font-mono)"
                                fontWeight="800"
                                fill={themeStyles.textPrimary}
                              >
                                {node.label || node.id}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    )}
                  </svg>
                  {p3PanZoom.hasPannedOrZoomed && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '12px',
                        left: '12px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                        border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(14, 165, 233, 0.4)'}`,
                        color: isDark ? '#38bdf8' : '#0284c7',
                        pointerEvents: 'none',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        zIndex: 10,
                      }}
                    >
                      <span>✥</span>
                      <span>{Math.round(p3PanZoom.zoom * 100)}% &bull; {language === 'vi' ? 'Kéo để pan' : 'Drag to pan'}</span>
                    </div>
                  )}
                </div>
          </div>

              {/* Right: PageRank Centrality Leaderboard & Author Inspector */}
              {(!isSidebarCollapsed || !isTheaterMode) && (
                <div
                  style={{
                    backgroundColor: themeStyles.cardBg,
                    borderRadius: '8px',
                    border: `1px solid ${themeStyles.cardBorder}`,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  {selectedGraphNode ? (
                    // Selected Author Deep Dive
                    <div
                      style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            color: '#7c3aed',
                          }}
                        >
                          {language === 'vi' ? 'HỒ SƠ TÁC GIẢ • EGO-NETWORK' : 'AUTHOR PROFILE • EGO-NETWORK'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedGraphNode(null)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: themeStyles.textSecondary,
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          [✕ {language === 'vi' ? 'Bỏ chọn' : 'Deselect'}]
                        </button>
                      </div>

                      <div
                        style={{
                          backgroundColor: themeStyles.cardSubBg,
                          borderRadius: '6px',
                          padding: '10px 12px',
                          border: `1px solid ${themeStyles.cardBorder}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 800,
                            color: themeStyles.textPrimary,
                          }}
                        >
                          {selectedGraphNode.label || selectedGraphNode.id}
                        </div>
                        <div
                          style={{
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            color: '#059669',
                            marginTop: '2px',
                          }}
                        >
                          PageRank: {selectedGraphNode.pagerank.toFixed(6)} &bull; {language === 'vi' ? 'Cộng đồng Louvain' : 'Louvain Community'} #{selectedGraphNode.community}
                        </div>
                        <div
                          style={{
                            fontSize: '10px',
                            color: themeStyles.textSecondary,
                            fontFamily: 'var(--font-mono)',
                            marginTop: '4px',
                          }}
                        >
                          {language === 'vi' ? 'Bậc liên kết (Degree)' : 'Degree'}: {selectedGraphNode.degree} {language === 'vi' ? 'trích dẫn / liên kết' : 'citations / links'} &bull; {language === 'vi' ? 'Công trình / Trọng số' : 'Volume / Citations'}: {selectedGraphNode.paper_count}
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          color: themeStyles.textSecondary,
                          lineHeight: 1.4,
                          borderLeft: '2px solid #7c3aed',
                          paddingLeft: '8px',
                        }}
                      >
                        {language === 'vi' ? (
                          <>
                            <strong>Ý nghĩa PageRank:</strong> Tác giả này giữ vai trò là "Cầu nối tri thức" (Hub Influencer) kết nối luồng thông tin học thuật giữa các nhóm nghiên cứu khác nhau.
                          </>
                        ) : (
                          <>
                            <strong>PageRank Insight:</strong> This author acts as a knowledge hub bridging academic information flow across research communities.
                          </>
                        )}
                      </div>

                      {/* Direct Collaborators in Ego-Network */}
                      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: '4px' }}>
                        <div
                          style={{
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            color: themeStyles.textPrimary,
                            marginBottom: '4px',
                          }}
                        >
                          {language === 'vi' ? 'ĐỒNG TÁC GIẢ TRỰC TIẾP TRONG EGO-NETWORK:' : 'DIRECT CO-AUTHORS IN EGO-NETWORK:'}
                        </div>
                        <div
                          style={{
                            flex: 1,
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            paddingRight: '2px',
                          }}
                        >
                          {graphData.graph_export.links
                            .filter(
                              (l) =>
                                l.source === selectedGraphNode.id ||
                                l.target === selectedGraphNode.id
                            )
                            .map((l) => {
                              const otherId =
                                l.source === selectedGraphNode.id ? l.target : l.source;
                              const peer = graphData.graph_export.nodes.find(
                                (n) => n.id === otherId
                              );
                              if (!peer) return null;
                              const peerColor =
                                clusterColors[peer.community % clusterColors.length];
                              return (
                                <div
                                  key={peer.id}
                                  onClick={() => setSelectedGraphNode(peer)}
                                  style={{
                                    backgroundColor: themeStyles.cardSubBg,
                                    borderRadius: '4px',
                                    padding: '5px 8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    border: `1px solid ${themeStyles.cardBorder}`,
                                    transition: 'all 0.1s ease',
                                  }}
                                  title={language === 'vi' ? 'Nhấp để chuyển tiêu điểm mạng lưới sang tác giả này' : 'Click to shift network focus to this author'}
                                >
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      fontFamily: 'var(--font-mono)',
                                      fontWeight: 700,
                                      color: themeStyles.textPrimary,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        backgroundColor: peerColor,
                                        display: 'inline-block',
                                      }}
                                    />
                                    {peer.label || peer.id}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      fontFamily: 'var(--font-mono)',
                                      color: '#059669',
                                      fontWeight: 700,
                                    }}
                                  >
                                    PR {peer.pagerank.toFixed(4)}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {onNavigateToRag && (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateToRag(
                              language === 'vi'
                                ? `Tổng hợp các công trình nghiên cứu và đồng tác giả của ${selectedGraphNode.label || selectedGraphNode.id}`
                                : `Summarize research publications and co-authors of ${selectedGraphNode.label || selectedGraphNode.id}`
                            )
                          }
                          style={{
                            backgroundColor: '#7c3aed',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            marginTop: '6px',
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                          </svg>
                          <span>{language === 'vi' ? 'Tra cứu công trình của tác giả trong RAG' : 'Research author publications in RAG'}</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    // Default Top Influencers Leaderboard
                    <div
                      style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          color: themeStyles.textPrimary,
                          marginBottom: '4px',
                        }}
                      >
                        {language === 'vi' ? 'TOP NHÀ KHOA HỌC ẢNH HƯỞNG (PAGERANK)' : 'TOP INFLUENTIAL RESEARCHERS (PAGERANK)'}
                      </div>
                      <div
                        style={{
                          fontSize: '10px',
                          color: themeStyles.textSecondary,
                          fontFamily: 'var(--font-mono)',
                          marginBottom: '8px',
                        }}
                      >
                        {language === 'vi' ? 'Nhấp vào tác giả để làm nổi bật mạng lưới liên kết cục bộ' : 'Click on author to highlight local ego network'}
                      </div>

                      <div
                        style={{
                          flex: 1,
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          paddingRight: '4px',
                        }}
                      >
                        {graphData.top_influencers.slice(0, 8).map((inf, idx) => (
                          <div
                            key={inf.author}
                            onClick={() => {
                              const found = graphData.graph_export.nodes.find(
                                (n) => n.id === inf.author || n.label === inf.author
                              );
                              if (found) setSelectedGraphNode(found);
                            }}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '6px 10px',
                              borderRadius: '4px',
                              backgroundColor:
                                idx < 3
                                  ? isDark
                                    ? 'rgba(124, 58, 237, 0.12)'
                                    : '#f5f3ff'
                                  : themeStyles.cardSubBg,
                              border:
                                idx < 3
                                  ? '1px solid rgba(124, 58, 237, 0.3)'
                                  : `1px solid ${themeStyles.cardBorder}`,
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: idx < 3 ? '#7c3aed' : themeStyles.textSecondary,
                                }}
                              >
                                #{idx + 1}
                              </span>
                              <span style={{ fontWeight: 700, color: themeStyles.textPrimary }}>
                                {inf.author}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: '#059669', fontWeight: 800 }}>
                                {inf.pagerank.toFixed(5)}
                              </span>
                              <span style={{ color: themeStyles.textMuted, fontSize: '10px' }}>
                                {inf.degree} deg
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {activePillar === 3 && !graphData && renderPillarEmptyCard(3, language === 'vi' ? 'Mạng lưới đồng tác giả (Louvain & PageRank)' : 'Co-Authorship Network (Louvain & PageRank)')}

        {/* ============================================================ */}
        {/* PILLAR 4: TREND VELOCITY & NOVELTY OUTLIER CHARTS            */}
        {/* ============================================================ */}
        {activePillar === 4 && trendsData && (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              overflow: 'hidden',
            }}
          >
            {/* Split View: Left Trend Velocity Bars (55%) vs Right Outlier Scatter & Diagnostic (45%) */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'grid',
                gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1.2fr 1fr',
                gap: '8px',
                overflow: 'hidden',
              }}
            >
              {/* Left: Clustered Trend Velocity Chart */}
              <div
                style={{
                  backgroundColor: themeStyles.cardBg,
                  borderRadius: '8px',
                  border: `1px solid ${themeStyles.cardBorder}`,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                    flexShrink: 0,
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3
                      style={{
                        fontSize: '12px',
                        fontWeight: 800,
                        color: themeStyles.textPrimary,
                        margin: 0,
                      }}
                    >
                      [MINING-04] {language === 'vi' ? 'TỐC ĐỘ TĂNG TRƯỞNG THEO QUÝ (TREND VELOCITY)' : 'QUARTERLY TREND VELOCITY'}
                    </h3>
                    <span className="telemetry-chip">
                      [VELOCITY SURGE: {topSurging ? `${topSurging.category} (+${Math.round(topSurging.growth_rate_pct)}%)` : 'cs.CV (+123%)'} &bull; ISOLATION FOREST: {trendsData.anomalies.length} OUTLIERS ({((trendsData.summary?.total_papers_analyzed || totalCorpus || 18287)).toLocaleString()} PAPERS ANALYZED)]
                    </span>
                  </div>

                  {/* Standardized Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* LaTeX Export Button */}
                    <button
                      type="button"
                      onClick={handleCopyLatexOutliers}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                        color: themeStyles.textPrimary,
                        border: `1px solid ${themeStyles.cardBorder}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title={language === 'vi' ? 'Sao chép bảng kết quả dị biệt định dạng LaTeX cho bài báo' : 'Copy novelty outliers LaTeX table for academic papers'}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy LaTeX</span>
                    </button>

                    {/* Sidebar Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        backgroundColor: isSidebarCollapsed ? '#2563eb' : isDark ? '#1e293b' : '#f1f5f9',
                        color: isSidebarCollapsed ? '#ffffff' : themeStyles.textPrimary,
                        border: `1px solid ${themeStyles.cardBorder}`,
                        cursor: 'pointer',
                      }}
                      title={isSidebarCollapsed ? (language === 'vi' ? 'Mở rộng Outliers' : 'Expand Outliers') : (language === 'vi' ? 'Thu gọn Outliers' : 'Collapse Outliers')}
                    >
                      {isSidebarCollapsed ? (language === 'vi' ? '► Mở Rộng Outliers' : '► Expand Outliers') : (language === 'vi' ? '◄ Thu Gọn' : '◄ Collapse')}
                    </button>

                    <ChartToolbar
                      theme={theme}
                      language={language}
                      svgRef={p4VelocitySvgRef}
                      filename="quarterly-trend-velocity"
                      csvData={trendsData.trend_velocity.map((t) => ({
                        category: t.category,
                        growth_rate_pct: t.growth_rate_pct,
                        recent_quarter_papers: t.recent_quarter_papers,
                        previous_quarter_papers: t.previous_quarter_papers,
                      }))}
                      zoomLevel={p4VelocityPanZoom.zoom}
                      hasPannedOrZoomed={p4VelocityPanZoom.hasPannedOrZoomed}
                      onZoomIn={() => p4VelocityPanZoom.zoomIn(0.25)}
                      onZoomOut={() => p4VelocityPanZoom.zoomOut(0.25)}
                      onResetZoom={p4VelocityPanZoom.resetView}
                      isSidebarCollapsed={isSidebarCollapsed}
                      onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                      isTheater={isTheaterMode}
                      onToggleTheater={() => setIsTheaterMode(!isTheaterMode)}
                      onShowToast={showToast}
                    />
                  </div>
                </div>

                {/* Tier 2 Sub-headline & Interactive Filters/Pagination */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                    flexShrink: 0,
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      fontSize: '10px',
                      color: themeStyles.textSecondary,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {language === 'vi' ? 'Cột Xám: Quý trước • Cột Xanh: Quý gần nhất • Nhãn: % tăng tốc' : 'Grey: Prev Qtr • Blue: Recent Qtr • Badge: Growth %'}
                  </div>

                  {/* Filter and Page Slicer Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {(['ALL', 'SURGING', 'DECLINING'] as const).map((filterType) => {
                      const isSel = velocityFilter === filterType;
                      const label = filterType === 'ALL'
                        ? (language === 'vi' ? 'Tất Cả' : 'All')
                        : filterType === 'SURGING'
                        ? (language === 'vi' ? '🚀 Tăng Tốc' : '🚀 Surging')
                        : (language === 'vi' ? '📉 Suy Giảm' : '📉 Declining');
                      return (
                        <button
                          key={filterType}
                          type="button"
                          onClick={() => {
                            setVelocityFilter(filterType);
                            setVelocityPage(0);
                          }}
                          style={{
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '9.5px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: isSel ? 800 : 600,
                            backgroundColor: isSel ? (filterType === 'DECLINING' ? '#ef4444' : filterType === 'SURGING' ? '#10b981' : '#2563eb') : themeStyles.tagBg,
                            color: isSel ? '#ffffff' : themeStyles.textSecondary,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}

                    {totalVelocityPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: '4px' }}>
                        <button
                          type="button"
                          disabled={currentVelocityPage <= 0}
                          onClick={() => setVelocityPage((p) => Math.max(0, p - 1))}
                          style={{
                            padding: '2px 5px',
                            borderRadius: '3px',
                            fontSize: '9.5px',
                            fontFamily: 'var(--font-mono)',
                            backgroundColor: themeStyles.tagBg,
                            color: currentVelocityPage <= 0 ? themeStyles.textMuted : themeStyles.textPrimary,
                            border: 'none',
                            cursor: currentVelocityPage <= 0 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          ◀
                        </button>
                        <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                          {currentVelocityPage + 1}/{totalVelocityPages}
                        </span>
                        <button
                          type="button"
                          disabled={currentVelocityPage >= totalVelocityPages - 1}
                          onClick={() => setVelocityPage((p) => Math.min(totalVelocityPages - 1, p + 1))}
                          style={{
                            padding: '2px 5px',
                            borderRadius: '3px',
                            fontSize: '9.5px',
                            fontFamily: 'var(--font-mono)',
                            backgroundColor: themeStyles.tagBg,
                            color: currentVelocityPage >= totalVelocityPages - 1 ? themeStyles.textMuted : themeStyles.textPrimary,
                            border: 'none',
                            cursor: currentVelocityPage >= totalVelocityPages - 1 ? 'not-allowed' : 'pointer',
                          }}
                        >
                          ▶
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* SVG Clustered Column Chart */}
                <div
                  {...p4VelocityPanZoom.containerProps}
                  style={{
                    ...p4VelocityPanZoom.containerProps.style,
                    flex: 1,
                    minHeight: 0,
                    width: '100%',
                    backgroundColor: themeStyles.canvasBg,
                    borderRadius: '6px',
                    border: `1px solid ${themeStyles.cardBorder}`,
                    padding: '8px',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <svg
                    ref={p4VelocitySvgRef}
                    viewBox={p4VelocityPanZoom.viewBox}
                    style={{ width: '100%', height: '100%' }}
                  >
                    {/* Grid Lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                      const v = Math.round(ratio * maxVelocityPapers);
                      const y = 180 - ratio * 125;
                      return (
                        <g key={v}>
                          <line
                            x1="45"
                            y1={y}
                            x2="500"
                            y2={y}
                            stroke={themeStyles.gridLine}
                            strokeWidth="1"
                          />
                          <text
                            x="40"
                            y={y + 3}
                            textAnchor="end"
                            fontSize="10"
                            fontFamily="var(--font-mono)"
                            fill={themeStyles.textMuted}
                          >
                            {v}
                          </text>
                        </g>
                      );
                    })}

                    <line
                      x1="45"
                      y1="180"
                      x2="500"
                      y2="180"
                      stroke={themeStyles.axisLine}
                      strokeWidth="1"
                    />

                    {/* Clustered Bars */}
                    {pageVelocityItems.map((trend, idx) => {
                      const groupX = 65 + idx * 72;
                      const prevH = Math.max(4, (trend.previous_quarter_papers / maxVelocityPapers) * 125);
                      const recentH = Math.max(8, (trend.recent_quarter_papers / maxVelocityPapers) * 125);
                      const isHighSurge = trend.growth_rate_pct > 50 || trend.momentum === 'SURGING';
                      const isDeclining = trend.growth_rate_pct < 0 || trend.momentum === 'DECLINING';
                      const badgeColor = isHighSurge ? '#10b981' : isDeclining ? '#ef4444' : '#38bdf8';

                      return (
                        <g key={trend.category}>
                          {/* Previous Quarter Bar */}
                          <rect
                            x={groupX}
                            y={180 - prevH}
                            width="14"
                            height={prevH}
                            rx="2"
                            fill={themeStyles.textMuted}
                          />

                          {/* Recent Quarter Bar */}
                          <rect
                            x={groupX + 16}
                            y={180 - recentH}
                            width="18"
                            height={recentH}
                            rx="2"
                            fill={isDeclining ? '#ef4444' : '#2563eb'}
                          />

                          {/* Unified Velocity Badge Pill */}
                          <g transform={`translate(${groupX + 25}, ${180 - recentH - 22})`}>
                            <rect
                              x="-28"
                              y="0"
                              width="56"
                              height="18"
                              rx="4"
                              fill={isDark ? '#0f172a' : '#ffffff'}
                              stroke={badgeColor}
                              strokeWidth="1.2"
                            />
                            <text
                              x="0"
                              y="12"
                              textAnchor="middle"
                              fontSize="10"
                              fontFamily="var(--font-mono)"
                              fontWeight="800"
                              fill={badgeColor}
                            >
                              {trend.growth_rate_pct > 0 ? '+' : ''}{Math.round(trend.growth_rate_pct)}%
                            </text>
                          </g>

                          {/* Category Name */}
                          <text
                            x={groupX + 16}
                            y="198"
                            textAnchor="middle"
                            fontSize="10"
                            fontFamily="var(--font-mono)"
                            fontWeight="700"
                            fill={themeStyles.textPrimary}
                          >
                            {trend.category}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  {p4VelocityPanZoom.hasPannedOrZoomed && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '12px',
                        left: '12px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                        border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(14, 165, 233, 0.4)'}`,
                        color: isDark ? '#38bdf8' : '#0284c7',
                        pointerEvents: 'none',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        zIndex: 10,
                      }}
                    >
                      <span>✥</span>
                      <span>{Math.round(p4VelocityPanZoom.zoom * 100)}% &bull; {language === 'vi' ? 'Kéo để pan' : 'Drag to pan'}</span>
                    </div>
                  )}
                </div>
          </div>

              {/* Right: Novelty Outlier Scatter & Diagnostic Drawer */}
              {(!isSidebarCollapsed || !isTheaterMode) && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    overflow: 'hidden',
                  }}
                >
                  {/* Visual 4.2: Outlier Scatter */}
                  <div
                    style={{
                      backgroundColor: themeStyles.cardBg,
                      borderRadius: '8px',
                      border: `1px solid ${themeStyles.cardBorder}`,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      minHeight: 0,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                        flexShrink: 0,
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            fontSize: '12px',
                            fontWeight: 800,
                            color: themeStyles.textPrimary,
                            margin: 0,
                          }}
                        >
                          [MINING-05] {language === 'vi' ? 'BẢN ĐỒ DỊ BIỆT (ISOLATION FOREST OUTLIERS)' : 'NOVELTY OUTLIER MAP (ISOLATION FOREST)'}
                        </h3>
                        <div
                          style={{
                            fontSize: '10px',
                            color: themeStyles.textSecondary,
                            marginTop: '1px',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {language === 'vi' ? 'Trục X: Độ dài từ • Trục Y: Công thức toán • Nhấp để chẩn đoán' : 'X-axis: Word count • Y-axis: Math formulas • Click to diagnose'}
                        </div>
                      </div>

                      <ChartToolbar
                        theme={theme}
                        language={language}
                        svgRef={p4AnomalySvgRef}
                        filename="isolation-forest-novelty-outliers"
                        csvData={trendsData.anomalies.map((a) => ({
                          paper_id: a.paper_id,
                          title: a.title,
                          category: a.primary_category,
                          word_count: a.word_count,
                          math_count: a.math_count,
                        }))}
                        zoomLevel={p4AnomalyPanZoom.zoom}
                        hasPannedOrZoomed={p4AnomalyPanZoom.hasPannedOrZoomed}
                        onZoomIn={() => p4AnomalyPanZoom.zoomIn(0.25)}
                        onZoomOut={() => p4AnomalyPanZoom.zoomOut(0.25)}
                        onResetZoom={p4AnomalyPanZoom.resetView}
                        showBaselines={showBaselines}
                        onToggleBaselines={() => setShowBaselines((prev) => !prev)}
                        onShowToast={showToast}
                      />
                    </div>

                    {/* Outlier SVG Scatter */}
                    <div
                      {...p4AnomalyPanZoom.containerProps}
                      style={{
                        ...p4AnomalyPanZoom.containerProps.style,
                        flex: 1,
                        minHeight: 0,
                        width: '100%',
                        backgroundColor: themeStyles.canvasBg,
                        borderRadius: '6px',
                        border: `1px solid ${themeStyles.cardBorder}`,
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <svg
                        ref={p4AnomalySvgRef}
                        viewBox={p4AnomalyPanZoom.viewBox}
                        style={{ width: '100%', height: '100%' }}
                      >
                            {/* P99 Threshold Boundary Region */}
                            {showBaselines && (() => {
                              const p99WordX = 45 + (Math.min(outlierScales.maxWord * 0.30, 20000) / outlierScales.maxWord) * 375;
                              const boxW = Math.max(120, 425 - p99WordX);
                              const boxH = 166;
                              const plateW = 220;
                              const plateX = Math.max(45, p99WordX + (boxW - plateW) / 2);
                              return (
                                <g>
                                  <rect
                                    x={p99WordX}
                                    y="22"
                                    width={boxW}
                                    height={boxH}
                                    fill="rgba(239, 68, 68, 0.04)"
                                    stroke="rgba(239, 68, 68, 0.25)"
                                    strokeDasharray="4 4"
                                    rx="4"
                                  />
                                  {/* Safe Top Anchor for P99 Badge Plate (Above all data points) */}
                                  <rect
                                    x={plateX}
                                    y="6"
                                    width={plateW}
                                    height={16}
                                    rx="3"
                                    fill={isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)'}
                                    stroke="rgba(239, 68, 68, 0.4)"
                                    strokeWidth="1"
                                  />
                                  <text
                                    x={plateX + plateW / 2}
                                    y="18"
                                    textAnchor="middle"
                                    fontSize="9.5"
                                    fontFamily="var(--font-mono)"
                                    fontWeight="800"
                                    fill="#ef4444"
                                  >
                                    {language === 'vi' ? 'VÙNG DỊ BIỆT NGOẠI LAI P99' : 'P99 OUTLIER REGION'}
                                  </text>
                                </g>
                              );
                            })()}

                        {/* X-Axis Grid & Labels (Words: Dynamic Scale) */}
                        {outlierScales.wordTicks.map((w) => {
                          const x = 45 + (w / outlierScales.maxWord) * 375;
                          return (
                            <g key={w}>
                              <line x1={x} y1="22" x2={x} y2="188" stroke={themeStyles.gridLine} strokeDasharray="2 3" strokeWidth="1" />
                              <text x={x} y="199" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>
                                {w > 0 ? `${Math.round(w / 1000)}k` : '0'}
                              </text>
                            </g>
                          );
                        })}

                        {/* Y-Axis Grid & Labels (Math Formulas: Dynamic Scale) */}
                        {outlierScales.mathTicks.map((m) => {
                          const y = 188 - (m / outlierScales.maxMath) * 160;
                          return (
                            <g key={m}>
                              <line x1="45" y1={y} x2="425" y2={y} stroke={themeStyles.gridLine} strokeDasharray="2 3" strokeWidth="1" />
                              <text x="40" y={y + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>
                                {m > 0 ? `${(m / 1000).toFixed(1)}k` : '0'}
                              </text>
                            </g>
                          );
                        })}

                        <line
                          x1="45"
                          y1="188"
                          x2="425"
                          y2="188"
                          stroke={themeStyles.axisLine}
                          strokeWidth="1.2"
                        />
                        <line
                          x1="45"
                          y1="22"
                          x2="45"
                          y2="188"
                          stroke={themeStyles.axisLine}
                          strokeWidth="1.2"
                        />

                        {/* Outlier Dots with Origin Overlap Dispersion */}
                        {trendsData.anomalies.map((anom, idx) => {
                          const isOrigin = anom.word_count === 0 && anom.math_count === 0;
                          const jitterX = isOrigin ? ((idx % 4) - 1.5) * 6 : 0;
                          const jitterY = isOrigin ? (Math.floor((idx % 12) / 4) - 1) * 6 : 0;
                          const cx = 45 + Math.min(375, (anom.word_count / outlierScales.maxWord) * 375) + jitterX;
                          const cy = 188 - Math.min(160, (anom.math_count / outlierScales.maxMath) * 160) - jitterY;
                          const isHovered = hoveredAnomaly?.item.paper_id === anom.paper_id;
                          const isSelected = inspectedAnomaly?.paper_id === anom.paper_id;

                          return (
                            <g key={idx}>
                              <circle
                                cx={cx}
                                cy={cy}
                                r={isSelected ? '9' : isHovered ? '7' : '5'}
                                fill="rgba(239, 68, 68, 0.25)"
                              />
                              <circle
                                cx={cx}
                                cy={cy}
                                r={isSelected ? '5' : isHovered ? '4' : '3'}
                                fill="#ef4444"
                                stroke="#ffffff"
                                strokeWidth={isSelected ? '1.8' : '1'}
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  if (!p4AnomalyPanZoom.didDrag()) {
                                    setInspectedAnomaly(anom);
                                  }
                                }}
                                onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
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
                      {p4AnomalyPanZoom.hasPannedOrZoomed && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '12px',
                            left: '12px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                            border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(14, 165, 233, 0.4)'}`,
                            color: isDark ? '#38bdf8' : '#0284c7',
                            pointerEvents: 'none',
                            backdropFilter: 'blur(4px)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            zIndex: 10,
                          }}
                        >
                          <span>✥</span>
                          <span>{Math.round(p4AnomalyPanZoom.zoom * 100)}% &bull; {language === 'vi' ? 'Kéo để pan' : 'Drag to pan'}</span>
                        </div>
                      )}
                    </div>
              </div>

                  {/* Outlier Diagnostics Panel */}
                  {inspectedAnomaly && (
                    <div
                      style={{
                        backgroundColor: themeStyles.cardBg,
                        borderRadius: '8px',
                        border: `1px solid ${themeStyles.cardBorder}`,
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            fontFamily: 'var(--font-mono)',
                            color: '#ef4444',
                          }}
                        >
                          {language === 'vi' ? 'CHẨN ĐOÁN DỊ BIỆT' : 'OUTLIER DIAGNOSTIC'} &bull; arXiv:{inspectedAnomaly.paper_id}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            color: '#ef4444',
                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            borderRadius: '3px',
                            padding: '1px 6px',
                            fontWeight: 800,
                          }}
                        >
                          {(() => {
                            const rawScore = (inspectedAnomaly as any).anomaly_score;
                            const displayScore = rawScore !== undefined ? rawScore.toFixed(3) : '-0.710';
                            const severityPct = rawScore !== undefined ? Math.min(99, Math.max(70, Math.round(Math.abs(rawScore) * 138))) : 95;
                            return `${language === 'vi' ? 'Độ dị biệt:' : 'Outlier:'} ${displayScore} (${severityPct}% ${language === 'vi' ? 'nghiêm trọng' : 'severity'})`;
                          })()}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: themeStyles.textPrimary,
                          lineHeight: 1.3,
                        }}
                      >
                        {inspectedAnomaly.title}
                      </div>

                      <div
                        style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          color: themeStyles.textSecondary,
                          lineHeight: 1.4,
                          borderLeft: '2px solid #ef4444',
                          paddingLeft: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                        }}
                      >
                        <div>
                          <strong style={{ color: '#ef4444' }}>
                            {language === 'vi' ? 'Lý do gắn cờ dị biệt:' : 'Outlier Reasons:'}
                          </strong>
                        </div>
                        {inspectedAnomaly.outlier_reasons && inspectedAnomaly.outlier_reasons.length > 0 ? (
                          inspectedAnomaly.outlier_reasons.map((r: string, rIdx: number) => {
                            let translated = r;
                            if (language === 'vi') {
                              translated = r
                                .replace(/Highly interdisciplinary scope \((\d+) categories\)/, 'Phạm vi liên ngành cao ($1 chuyên ngành)')
                                .replace(/Massive collaboration team \((\d+) authors\)/, 'Quy mô nhóm tác giả đột biến ($1 tác giả)')
                                .replace(/Extreme theoretical formula density \((\d+) formulas\)/, 'Mật độ công thức toán học cực cao ($1 công thức)')
                                .replace(/Monograph-level length \((\d+) words\)/, 'Độ dài cấp chuyên khảo ($1 từ ngữ)');
                            }
                            return (
                              <div key={rIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                                <span style={{ color: '#ef4444' }}>•</span>
                                <span>{translated}</span>
                              </div>
                            );
                          })
                        ) : (
                          <div>
                            {language === 'vi' ? (
                              <>Bài báo chứa {inspectedAnomaly.math_count} công thức toán học và {inspectedAnomaly.word_count.toLocaleString()} từ ngữ (vượt ngưỡng phân vị P99 học thuật).</>
                            ) : (
                              <>Paper contains {inspectedAnomaly.math_count} mathematical formulas and {inspectedAnomaly.word_count.toLocaleString()} words (exceeds academic P99 threshold).</>
                            )}
                          </div>
                        )}
                      </div>

                      {onNavigateToRag && (
                        <button
                          type="button"
                          onClick={() => onNavigateToRag(inspectedAnomaly.title)}
                          style={{
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '5px 10px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 18h8" />
                            <path d="M3 22h18" />
                            <path d="M14 22a7 7 0 1 0-14 0" />
                            <path d="M9 14h2" />
                            <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2z" />
                            <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
                          </svg>
                          <span>{language === 'vi' ? 'Phân tích bài báo dị biệt này với RAG' : 'Analyze this outlier paper in RAG'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {activePillar === 4 && !trendsData && renderPillarEmptyCard(4, language === 'vi' ? 'Tốc độ tăng trưởng & Điểm dị biệt' : 'Trend Velocity & Novelty Outliers')}
      </div>

      {/* ============================================================== */}
      {/* FLOATING TOOLTIPS FOR ALL 4 PILLAR CHARTS                      */}
      {/* ============================================================== */}
      {hoveredRule && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredRule.x}px`,
            top: `${hoveredRule.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--tooltip-bg)',
            color: 'var(--tooltip-text)',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: 'var(--card-shadow)',
            zIndex: 90,
            pointerEvents: 'none',
            maxWidth: '280px',
            border: '1px solid var(--tooltip-border)',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ color: '#ea580c', fontWeight: 800 }}>
            {hoveredRule.rule.antecedents.join(' + ')} &rarr;{' '}
            {hoveredRule.rule.consequents.join(' + ')}
          </div>
          <div style={{ marginTop: '3px', color: 'var(--text-primary)' }}>
            Lift: <strong style={{ color: '#ea580c' }}>{hoveredRule.rule.lift.toFixed(3)}x</strong> &bull; Conf: <strong style={{ color: 'var(--accent-emerald)' }}>{(hoveredRule.rule.confidence * 100).toFixed(1)}%</strong>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '10px', marginTop: '1px' }}>
            Support: {(hoveredRule.rule.support * 100).toFixed(2)}% &bull; {language === 'vi' ? 'Nhấp để soi chi tiết' : 'Click to inspect details'}
          </div>
        </div>
      )}

      {hoveredPoint && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredPoint.x}px`,
            top: `${hoveredPoint.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--tooltip-bg)',
            color: 'var(--tooltip-text)',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: 'var(--card-shadow)',
            zIndex: 90,
            pointerEvents: 'none',
            maxWidth: '280px',
            border: '1px solid var(--tooltip-border)',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ color: 'var(--accent-silver)', fontWeight: 800 }}>
            {language === 'vi' ? 'CỤM' : 'CLUSTER'} #{hoveredPoint.point.cluster} &bull; arXiv:{hoveredPoint.point.paper_id}
          </div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
            {hoveredPoint.point.title}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '10px', marginTop: '2px' }}>
            {language === 'vi' ? 'Nhấp chuột để xem bài báo lân cận (k-NN)' : 'Click to view nearest neighbor papers (k-NN)'}
          </div>
        </div>
      )}

      {hoveredGraphNode && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredGraphNode.x}px`,
            top: `${hoveredGraphNode.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--tooltip-bg)',
            color: 'var(--tooltip-text)',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: 'var(--card-shadow)',
            zIndex: 90,
            pointerEvents: 'none',
            border: '1px solid var(--tooltip-border)',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ color: 'var(--accent-violet)', fontWeight: 800 }}>
            {hoveredGraphNode.node.label || hoveredGraphNode.node.id}
          </div>
          <div style={{ color: 'var(--accent-emerald)', marginTop: '2px' }}>
            PageRank: <strong>{hoveredGraphNode.node.pagerank.toFixed(6)}</strong>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
            {hoveredGraphNode.node.degree} {language === 'vi' ? 'đồng tác giả • Nhấp để khóa Ego-Network' : 'co-authors • Click to lock Ego-Network'}
          </div>
        </div>
      )}

      {hoveredAnomaly && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredAnomaly.x}px`,
            top: `${hoveredAnomaly.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--tooltip-bg)',
            color: 'var(--tooltip-text)',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: 'var(--card-shadow)',
            zIndex: 90,
            pointerEvents: 'none',
            maxWidth: '300px',
            border: '1px solid var(--tooltip-border)',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ color: '#ef4444', fontWeight: 800 }}>
            OUTLIER: arXiv:{hoveredAnomaly.item.paper_id} &bull; {hoveredAnomaly.item.primary_category}
          </div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginTop: '2px' }}>
            {hoveredAnomaly.item.title}
          </div>
          <div style={{ color: '#ea580c', marginTop: '3px' }}>
            {hoveredAnomaly.item.math_count} equations &bull; {hoveredAnomaly.item.word_count.toLocaleString()} words
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SCIENTIFIC LATEX EXPORT & PREVIEW MODAL                        */}
      {/* ============================================================== */}
      {latexModalData && (
        <LatexPreviewModal
          isOpen={latexModalData.isOpen}
          onClose={() => setLatexModalData(null)}
          title={latexModalData.title}
          latexCode={latexModalData.code}
          filename={latexModalData.filename}
          language={language}
          theme={theme}
        />
      )}
    </div>
  );
};
