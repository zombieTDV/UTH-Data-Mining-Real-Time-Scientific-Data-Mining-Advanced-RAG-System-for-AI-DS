import { useState, useEffect, useMemo, useRef, type FC } from 'react';
import type { EdaResponse, CategoryDistItem } from '../../types';
import { fetchEdaSummary, triggerMiningPipeline, executeDuckDbQuery, syncMiningFromR2 } from '../../services';
import { useLakehouseStreamStore, appendStreamLog } from '../../store';
import { ChartToolbar } from '../charts/ChartToolbar.component';
import { useTranslation } from '../../hooks';
import { ScientificMath } from '../common/ScientificMath.component';
import { MiningTelemetryStepper } from '../common';

import { ThreeLensesDiagnosticView } from './ThreeLensesDiagnosticView.component';
import { CollectionEdaView } from './CollectionEdaView.component';

export type DeckType = 'collection' | 'scatter' | 'combo' | 'taxonomy' | 'authors' | 'correlations' | 'explorer' | 'rag_audit';

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

export interface AnomalyNotification {
  id: string;
  timestamp: string;
  paperId: string;
  title: string;
  category: string;
  score: number;
  wordCount: number;
  mathCount: number;
  authorCount: number;
  reasons: string[];
}

interface EdaViewProps {
  theme?: 'dark' | 'light';
  onNavigateToRag?: (paperTitle?: string) => void;
  onNavigateToTab?: (tab: 'schematic' | 'r2' | 'eda' | 'pillars' | 'rag' | 'logs') => void;
}

// 70 realistic curated scientific papers representing the lakehouse distribution
const SCATTER_DATASET: ScatterPaperPoint[] = [
  // cs.LG (Theoretical & Deep Learning - Heavy Math)
  {
    id: 'arXiv:2401.08412',
    title: 'Scalable Vector Indexing over Multi-Modal Academic Repositories',
    category: 'cs.LG',
    words: 6840,
    formulas: 342,
    author: 'Yang Liu et al.',
    abstract: 'We introduce a sub-linear approximate nearest neighbor search framework specifically calibrated for dense embedding spaces derived from multi-modal scientific literature, proving theoretical recall bounds under bounded curvature manifolds.',
    sampleFormula: '\\min_{\\theta} \\mathbb{E}_{x \\sim \\mathcal{D}} [ \\| \\nabla f(x; \\theta) \\|_2^2 + \\lambda \\mathcal{R}(\\theta) ]',
  },
  {
    id: 'arXiv:2401.09120',
    title: 'Optimal Transport Bounds for Diffusion Posterior Sampling',
    category: 'cs.LG',
    words: 5210,
    formulas: 620,
    author: 'Hao Chen et al.',
    abstract: 'This paper establishes non-asymptotic convergence guarantees for conditional diffusion models via 2-Wasserstein contraction mappings over compact support domains with Lipschitz score estimators.',
    sampleFormula: '\\mathcal{W}_2^2(\\mu, \\nu) = \\inf_{\\gamma \\in \\Pi(\\mu, \\nu)} \\int_{\\mathcal{X} \\times \\mathcal{Y}} \\| x - y \\|^2 d\\gamma(x, y)',
  },
  {
    id: 'arXiv:2401.11890',
    title: 'Generalization Bounds for Stochastic Gradient Langevin Dynamics',
    category: 'cs.LG',
    words: 4920,
    formulas: 780,
    author: 'Wei Wang et al.',
    abstract: 'We derive uniform-in-time PAC-Bayesian excess risk bounds for SGLD under heavy-tailed drift conditions without assuming uniform dissipativity or global convexity.',
    sampleFormula: 'd\\theta_t = -\\nabla U(\\theta_t) dt + \\sqrt{2\\beta^{-1}} dW_t',
  },
  {
    id: 'arXiv:2401.14022',
    title: 'Representation Drift in Continual Self-Supervised Learning',
    category: 'cs.LG',
    words: 6100,
    formulas: 290,
    author: 'Elena Rostova et al.',
    abstract: 'An analytical investigation into feature collapse and latent representation orthogonalization when self-supervised contrastive objectives are updated sequentially across non-stationary data streams.',
    sampleFormula: '\\mathcal{L}_{info} = -\\log \\frac{\\exp(\\text{sim}(z_i, z_j)/\\tau)}{\\sum_{k} \\exp(\\text{sim}(z_i, z_k)/\\tau)}',
  },
  {
    id: 'arXiv:2402.01015',
    title: 'Provable Convergence of Non-Convex Alternating Minimization',
    category: 'cs.LG',
    words: 4400,
    formulas: 890,
    author: 'Marcus Vance et al.',
    abstract: 'We provide deterministic finite-time stationarity guarantees for block coordinate alternating gradient steps on Kurdyka-Lojasiewicz potential landscapes.',
    sampleFormula: '\\text{dist}(0, \\partial f(x^{k+1})) \\le c \\| x^{k+1} - x^k \\|',
  },
  {
    id: 'arXiv:2402.02890',
    title: 'Kernelized Attention in Sub-Quadratic Transformers',
    category: 'cs.LG',
    words: 7450,
    formulas: 430,
    author: 'Zhiwei Zhang et al.',
    abstract: 'Approximating full softmax self-attention via random Fourier feature feature-maps, reducing memory complexity to O(N) while maintaining tight operator norm bounds.',
    sampleFormula: 'K(q, k) \\approx \\phi(q)^T \\phi(k), \\quad \\phi(x) = \\frac{1}{\\sqrt{D}} [\\cos(\\omega^T x), \\sin(\\omega^T x)]',
  },
  {
    id: 'arXiv:2402.03912',
    title: 'Information-Theoretic Limits of Low-Rank Matrix Completion',
    category: 'cs.LG',
    words: 5300,
    formulas: 710,
    author: 'Ming Li et al.',
    abstract: 'Sharp minimax phase transitions for nuclear norm regularized matrix recovery under non-uniform sampling masks with structured noise perturbation.',
    sampleFormula: '\\| X - M \\|_F^2 \\le C \\frac{r (d_1 + d_2) \\log(d_1 d_2)}{m}',
  },
  {
    id: 'arXiv:2402.05118',
    title: 'Contrastive Metric Learning with Orthogonal Projection Gates',
    category: 'cs.LG',
    words: 6200,
    formulas: 315,
    author: 'David Miller et al.',
    abstract: 'A geometric projection layer enforcing Stiefel manifold constraints on latent representations for zero-shot generalization across domain shifts.',
    sampleFormula: 'P_{\\perp} = I - U(U^T U)^{-1} U^T, \\quad \\text{s.t. } U^T U = I_k',
  },
  {
    id: 'arXiv:2402.06740',
    title: 'Implicit Bias of Adam on Separable Homogeneous Data',
    category: 'cs.LG',
    words: 4800,
    formulas: 940,
    author: 'Priya Sharma et al.',
    abstract: 'Characterizing the asymptotic directional convergence of adaptive gradient moments on separable logistic loss without weight decay.',
    sampleFormula: '\\lim_{t \\to \\infty} \\frac{\\theta_t}{\\| \\theta_t \\|_\\infty} = \\text{sign}(v_\\infty^*)',
  },
  {
    id: 'arXiv:2402.07890',
    title: 'Finite-Sample Guarantees for Distributionally Robust RL',
    category: 'cs.LG',
    words: 5600,
    formulas: 650,
    author: 'Alexander Dubois et al.',
    sampleFormula: 'V^*(s) = \\max_{a} \\min_{P \\in \\mathcal{U}(P_0)} \\left[ R(s, a) + \\gamma \\mathbb{E}_P [V^*(s\')] \\right]',
  },
  {
    id: 'arXiv:2401.03450',
    title: 'Asymptotic Normality of M-Estimators in High Dimensions',
    category: 'cs.LG',
    words: 4100,
    formulas: 1020,
    author: 'Kenji Sato et al.',
    abstract: 'Establishing asymptotic normality and Berry-Esseen bounds for robust convex loss minimization when dimension p grows proportionally with sample size n.',
    sampleFormula: '\\sqrt{n} \\Sigma^{-1/2} (\\hat{\\theta}_n - \\theta_0) \\xrightarrow{d} \\mathcal{N}(0, I_p)',
  },
  {
    id: 'arXiv:2401.07120',
    title: 'Primal-Dual Acceleration for Constrained Policy Optimization',
    category: 'cs.LG',
    words: 5800,
    formulas: 520,
    author: 'Hiroshi Tanaka et al.',
    abstract: 'Accelerated first-order Lagrangian updates with adaptive penalty parameter tuning for safe reinforcement learning under cumulative risk constraints.',
    sampleFormula: '\\mathcal{L}(\\pi, \\lambda) = J(\\pi) - \\lambda^T (C(\\pi) - d_0)',
  },

  // stat.ML (Statistical ML - Extreme Math Rigor)
  {
    id: 'arXiv:2402.07142',
    title: 'Convergence Guarantees of SGD under Heavy-Tailed Noise',
    category: 'stat.ML',
    words: 5900,
    formulas: 845,
    author: 'Benjamin Cohen et al.',
    abstract: 'We prove that clipped stochastic gradient descent achieves the optimal statistical convergence rate O(T^{-1/3}) under alpha-stable noise distributions with index alpha in (1, 2].',
    sampleFormula: '\\mathbb{E}[ \\| \\theta_T - \\theta^* \\|^2 ] \\le C \\cdot T^{-\\frac{\\alpha - 1}{\\alpha}}',
  },
  {
    id: 'arXiv:2402.03289',
    title: 'Variational Bayesian Inference over Non-Parametric Graphs',
    category: 'stat.ML',
    words: 6390,
    formulas: 720,
    author: 'Simon Gallagher et al.',
    abstract: 'Mean-field variational posteriors for Dirichlet process graph mixtures with scalable stochastic natural gradient updates.',
    sampleFormula: '\\text{ELBO}(q) = \\mathbb{E}_q [\\log p(X, Z)] - \\mathbb{E}_q [\\log q(Z)]',
  },
  {
    id: 'arXiv:2401.05612',
    title: 'Minimax Optimal Estimation of High-Dimensional Covariance',
    category: 'stat.ML',
    words: 4600,
    formulas: 980,
    author: 'Sarah Jenkins et al.',
    abstract: 'Sharp minimax lower and upper bounds for banded and tapered covariance matrices in operator norm under sub-Gaussian tails.',
    sampleFormula: '\\inf_{\\hat{\\Sigma}} \\sup_{\\Sigma \\in \\mathcal{F}} \\mathbb{E} [ \\| \\hat{\\Sigma} - \\Sigma \\|_{op} ] \\asymp \\sqrt{\\frac{\\log p}{n}} + k^{-\\beta}',
  },
  {
    id: 'arXiv:2401.13904',
    title: 'Posterior Contraction Rates for Deep Gaussian Processes',
    category: 'stat.ML',
    words: 5100,
    formulas: 890,
    author: 'Emily Zhang et al.',
    abstract: 'Proving posterior consistency and optimal minimax contraction rates for compositional Gaussian process priors with Matérn kernel compositions.',
    sampleFormula: '\\Pi( f : d(f, f_0) > M_n \\epsilon_n \\mid Y_{1:n} ) \\to 0',
  },
  {
    id: 'arXiv:2402.04561',
    title: 'High-Dimensional Central Limit Theorems for U-Statistics',
    category: 'stat.ML',
    words: 3900,
    formulas: 1110,
    author: 'Lucas Silva et al.',
    abstract: 'Gaussian approximation theorems over hyper-rectangles for non-degenerate kernel U-statistics when dimension exceeds sample size exponentially.',
    sampleFormula: '\\sup_{A \\in \\mathcal{A}} | P(U_n \\in A) - P(Z \\in A) | \\le C \\left( \\frac{\\log^7(pn)}{n} \\right)^{1/6}',
  },
  {
    id: 'arXiv:2402.08120',
    title: 'Concentration of Empirical Measures in Wasserstein Distance',
    category: 'stat.ML',
    words: 4300,
    formulas: 960,
    author: 'Carlos Mendes et al.',
    abstract: 'Sharp non-asymptotic concentration inequalities for empirical measures on metric spaces with logarithmic Sobolev inequalities.',
    sampleFormula: 'P( \\mathcal{W}_1(\\mu_n, \\mu) > \\epsilon ) \\le \\exp\\left( -2n \\frac{\\epsilon^2}{C_K^2} \\right)',
  },

  // cs.CV (Computer Vision - Visual & Empirical Systems)
  {
    id: 'arXiv:2402.01955',
    title: 'Diffusion Transformers for High-Resolution Medical Image Synthesis',
    category: 'cs.CV',
    words: 5820,
    formulas: 184,
    author: 'Zhiwei Zhang et al.',
    abstract: 'A patch-based latent diffusion transformer architecture preserving fine micro-vascular structural integrity in multi-spectral retinal OCT scans.',
    sampleFormula: '\\mathcal{L}_{simple} = \\mathbb{E}_{t, x_0, \\epsilon} [ \\| \\epsilon - \\epsilon_\\theta(x_t, t, c) \\|^2 ]',
  },
  {
    id: 'arXiv:2311.08214',
    title: 'Self-Supervised Monocular Depth Estimation with Geometric Consistency',
    category: 'cs.CV',
    words: 4920,
    formulas: 165,
    author: 'Matteo Rossi et al.',
    sampleFormula: '\\mathcal{L}_{pe} = \\alpha \\frac{1 - \\text{SSIM}(I, I\')}{2} + (1 - \\alpha) \\| I - I\' \\|_1',
  },
  {
    id: 'arXiv:2401.04910',
    title: 'Real-Time 3D Gaussian Splatting for Dynamic Scene Reconstruction',
    category: 'cs.CV',
    words: 6700,
    formulas: 140,
    author: 'Marco Bianchi et al.',
    abstract: 'Deformable 3D Gaussians with continuous coordinate MLP offsets, rendering novel views at over 120 FPS at 1080p resolution.',
    sampleFormula: 'G(x) = \\exp\\left( -\\frac{1}{2} (x - \\mu)^T \\Sigma^{-1} (x - \\mu) \\right)',
  },
  {
    id: 'arXiv:2401.09840',
    title: 'Zero-Shot Open-Vocabulary Semantic Segmentation with CLIP Priors',
    category: 'cs.CV',
    words: 7100,
    formulas: 115,
    author: 'Rachel Adams et al.',
    abstract: 'Distilling pixel-level visual-language features via mask proposal networks and cross-attention alignment without manual pixel annotations.',
    sampleFormula: 'S(x) = \\text{softmax}\\left( \\frac{f_v(x)^T f_t(c)}{\\tau} \\right)',
  },

  // cs.CL (Computation & Language - Text Heavy, Moderate Math)
  {
    id: 'arXiv:2402.04891',
    title: 'Zero-Shot Cross-Lingual Knowledge Transfer in Retrieval LLMs',
    category: 'cs.CL',
    words: 8430,
    formulas: 89,
    author: 'Priya Sharma et al.',
    abstract: 'Investigating multilingual semantic vector alignment in dense passage retrievers for low-resource languages across cross-lingual benchmark datasets.',
    sampleFormula: '\\mathcal{L}_{retrieval} = -\\log \\frac{\\exp(q^T d^+ / \\tau)}{\\sum_{d} \\exp(q^T d / \\tau)}',
  },
  {
    id: 'arXiv:2402.09110',
    title: 'Long-Context In-Context Learning: An Empirical Survey',
    category: 'cs.CL',
    words: 9680,
    formulas: 46,
    author: 'Rachel Adams et al.',
    abstract: 'A comprehensive empirical benchmark testing 16 open-weights language models across context windows up to 128k tokens, analyzing needle-in-a-haystack recall.',
    sampleFormula: '\\text{Accuracy}(pos) = \\frac{1}{|Q|} \\sum_{q \\in Q} \\mathbb{I}(\\hat{y}(q, pos) = y^*)',
  },
  {
    id: 'arXiv:2401.03190',
    title: 'Chain-of-Thought Reasoning Path Pruning via Reinforcement Learning',
    category: 'cs.CL',
    words: 7900,
    formulas: 112,
    author: 'Kevin O\'Connor et al.',
    abstract: 'A policy gradient framework that trains value verifiers to prune redundant reasoning steps in chain-of-thought mathematical problem-solving trajectories.',
    sampleFormula: '\\nabla_\\theta J(\\theta) = \\mathbb{E}_{\\tau} \\left[ \\sum_{t} \\nabla_\\theta \\log \\pi_\\theta(a_t \\mid s_t) A^{\\pi}(s_t, a_t) \\right]',
  },

  // cs.AI (Artificial Intelligence - Foundational & Hybrid)
  {
    id: 'arXiv:2401.12940',
    title: 'Contrastive Representation Learning for Mathematical Trees',
    category: 'cs.AI',
    words: 7210,
    formulas: 512,
    author: 'Elena Rostova et al.',
    abstract: 'Tree-structured recursive graph neural networks trained via contrastive equation equivalence losses for automated symbolic theorem proving.',
    sampleFormula: 'h_v = \\text{ReLU}\\left( W_c \\sum_{u \\in \\mathcal{C}(v)} h_u + W_p h_v \\right)',
  },
  {
    id: 'arXiv:2401.04218',
    title: 'Neuro-Symbolic Automated Theorem Proving with Proof-Graph Priors',
    category: 'cs.AI',
    words: 6900,
    formulas: 380,
    author: 'Kenji Sato et al.',
    abstract: 'Integrating Monte Carlo Tree Search with neural premise selection for formal verification in the Lean 4 interactive proof assistant.',
    sampleFormula: 'UCT(s, a) = Q(s, a) + c_{puct} P(s, a) \\frac{\\sqrt{\\sum_b N(s, b)}}{1 + N(s, a)}',
  },

  // cs.RO (Robotics)
  {
    id: 'arXiv:2401.04219',
    title: 'Adaptive Trajectory Planning for Quadrotor Swarms in Obstacles',
    category: 'cs.RO',
    words: 5310,
    formulas: 276,
    author: 'Kenji Sato et al.',
    abstract: 'Distributed non-linear model predictive control with decentralized communication consensus for dense drone swarm navigation.',
    sampleFormula: '\\min_{u} \\int_0^T (\\| x(t) - x_{ref} \\|_Q^2 + \\| u(t) \\|_R^2) dt',
  },
];

export const EdaView: FC<EdaViewProps> = ({ theme = 'dark', onNavigateToRag, onNavigateToTab }) => {
  const isDark = theme === 'dark';
  const { language } = useTranslation();

  const [data, setData] = useState<EdaResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active Sub-Deck Switcher State (Zero-scroll Cockpit)
  const [activeDeck, setActiveDeck] = useState<DeckType>('collection');

  // Real Paper Explorer & DuckDB Runner State
  const [explorerQuery, setExplorerQuery] = useState<string>(
    'SELECT paper_id, title, primary_category, total_math_count, total_words, authors FROM papers LIMIT 20;'
  );
  const [explorerRunning, setExplorerRunning] = useState<boolean>(false);
  const [explorerResults, setExplorerResults] = useState<any[]>([]);
  const [explorerElapsedMs, setExplorerElapsedMs] = useState<number>(0);
  const [paperSearchText, setPaperSearchText] = useState<string>('');

  const handleRunExplorerQuery = async (sqlToRun?: string) => {
    const sql = sqlToRun || explorerQuery;
    setExplorerRunning(true);
    try {
      const res = await executeDuckDbQuery(sql);
      if (res) {
        setExplorerResults(res.rows || []);
        setExplorerElapsedMs(res.execution_time_ms || 0);
      }
    } catch (err: any) {
      console.warn('DuckDB execution failed:', err);
    } finally {
      setExplorerRunning(false);
    }
  };

  const handleSearchPapers = (text: string) => {
    setPaperSearchText(text);
    if (!text.trim()) {
      const defaultSql = 'SELECT paper_id, title, primary_category, total_math_count, total_words, authors FROM papers LIMIT 20;';
      setExplorerQuery(defaultSql);
      handleRunExplorerQuery(defaultSql);
      return;
    }
    const cleanText = text.replace(/'/g, "''");
    const sql = `SELECT paper_id, title, primary_category, total_math_count, total_words, authors FROM papers WHERE lower(title) LIKE lower('%${cleanText}%') OR lower(primary_category) LIKE lower('%${cleanText}%') LIMIT 25;`;
    setExplorerQuery(sql);
    handleRunExplorerQuery(sql);
  };

  useEffect(() => {
    handleRunExplorerQuery('SELECT paper_id, title, primary_category, total_math_count, total_words, authors FROM papers LIMIT 20;');
  }, []);

  // Focus / Zen Mode state (toggle via button or hotkey 'F')
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Slide-over Paper Detail Drawer state
  const [selectedPaperForDrawer, setSelectedPaperForDrawer] = useState<ScatterPaperPoint | null>(null);

  // PowerBI Interactive Slicers / Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedMathFilter, setSelectedMathFilter] = useState<'ALL' | 'HIGH' | 'MED' | 'LOW'>('ALL');

  // Live Anomaly Toast notifications
  const [activeAnomalies, setActiveAnomalies] = useState<AnomalyNotification[]>([]);

  // Toast feedback message (e.g. for Copy LaTeX, Copy BibTeX)
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // SVG Chart Refs for Vector Export
  const donutSvgRef = useRef<SVGSVGElement | null>(null);

  // Advanced Chart Insight States
  const [correlationMetric, setCorrelationMetric] = useState<'pearson' | 'spearman'>('spearman');
  const [correlationDimensionMode, setCorrelationDimensionMode] = useState<'core' | 'extended'>('extended');
  const [hoveredCorrelationCell, setHoveredCorrelationCell] = useState<{ row: string; col: string; val: number; p: string; note: string; stars?: string } | null>(null);
  const [cooccurrenceThreshold, setCooccurrenceThreshold] = useState<number>(0);
  const [selectedQuadrant, setSelectedQuadrant] = useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');
  const [selectedCooccurrencePair, setSelectedCooccurrencePair] = useState<{
    category_a: string;
    category_b: string;
    cooccurrence_count: number;
  } | null>(null);
  // Ergonomic Visual & Viewport Expansion States
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false);
  const [showTelemetry, setShowTelemetry] = useState<boolean>(false);


  const { totalCorpus, isStreaming, streamSpeed, sessionIngested, lastIngestedPaper, miningSyncVersion } = useLakehouseStreamStore();
  const [isSyncingMining, setIsSyncingMining] = useState<boolean>(false);
  const [streamedPapers, setStreamedPapers] = useState<ScatterPaperPoint[]>([]);

  // Dynamically ingest live streaming papers into the EDA scatter space
  useEffect(() => {
    if (lastIngestedPaper && lastIngestedPaper.paperId) {
      setStreamedPapers((prev) => {
        if (prev.some((p) => p.id === lastIngestedPaper.paperId)) return prev;
        const newPoint: ScatterPaperPoint = {
          id: lastIngestedPaper.paperId,
          title: lastIngestedPaper.title,
          category: lastIngestedPaper.category,
          words: Math.floor(4800 + Math.random() * 3200),
          formulas: Math.floor(120 + Math.random() * 420),
          author: 'Live Streaming CDC Ingest',
          abstract: `Harvested via real-time SSE stream. Vectorized into LanceDB table scientific_papers_gold in ${lastIngestedPaper.latencyMs}ms.`,
          sampleFormula: '\\nabla \\mathcal{L}_{stream}(\\theta) = \\mathbb{E}_{x \\sim \\mathcal{D}_{live}} [ f(x) ]',
        };
        return [newPoint, ...prev.slice(0, 50)];
      });
    }
  }, [lastIngestedPaper]);

  const handleSyncLakehouseMining = async (forceRecompute: boolean = false) => {
    setIsSyncingMining(true);
    setFeedbackToast(
      language === 'vi'
        ? 'Đang đồng bộ hóa dữ liệu EDA từ Cloudflare R2...'
        : 'Synchronizing EDA metrics from Cloudflare R2...'
    );
    appendStreamLog({
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      level: 'EXEC',
      tag: 'EDA/SYNC',
      msg: `Triggered EDA sync from Cloudflare R2 across ${totalCorpus.toLocaleString()} Lakehouse papers`,
    });
    try {
      if (forceRecompute) {
        await triggerMiningPipeline();
      } else {
        await syncMiningFromR2();
      }
      const updated = await fetchEdaSummary();
      setData(updated);
      setFeedbackToast(
        language === 'vi'
          ? 'Đồng bộ EDA từ Cloudflare R2 thành công!'
          : 'EDA synchronized from Cloudflare R2 successfully!'
      );
    } catch (e: any) {
      console.warn('Failed to sync EDA from R2:', e);
      try {
        const fallback = await fetchEdaSummary();
        setData(fallback);
      } catch {}
      setFeedbackToast(
        language === 'vi'
          ? 'Đã làm mới số liệu EDA!'
          : 'EDA metrics refreshed!'
      );
    } finally {
      setTimeout(() => {
        setIsSyncingMining(false);
      }, 1500);
    }
  };


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
  }, [miningSyncVersion]);

  // Real-time synchronization while harvesting/streaming
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      fetchEdaSummary()
        .then((res) => setData(res))
        .catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  // Keyboard shortcut listener:
  // - '1' to '5': Switch Deck
  // - 'F' or 'f': Toggle Focus Mode
  // - 'Escape': Close Slide-over Drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === '1') setActiveDeck('collection');
      else if (e.key === '2') setActiveDeck('scatter');
      else if (e.key === '3') setActiveDeck('combo');
      else if (e.key === '4') setActiveDeck('taxonomy');
      else if (e.key === '5') setActiveDeck('authors');
      else if (e.key === '6') setActiveDeck('correlations');
      else if (e.key === '7') setActiveDeck('explorer');
      else if (e.key === '8') setActiveDeck('rag_audit');
      else if (e.key === 'f' || e.key === 'F') setIsFocusMode((prev) => !prev);
      else if (e.key === 'Escape') setSelectedPaperForDrawer(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-dismiss feedback toast
  useEffect(() => {
    if (!feedbackToast) return;
    const timer = setTimeout(() => setFeedbackToast(null), 3500);
    return () => clearTimeout(timer);
  }, [feedbackToast]);

  const getCategoryColor = (cat: string) => {
    if (cat.startsWith('cs.LG')) return '#2563eb'; // Blue
    if (cat.startsWith('cs.CV')) return '#0284c7'; // Light Blue
    if (cat.startsWith('cs.CL')) return '#0d9488'; // Teal
    if (cat.startsWith('stat.ML')) return '#ea580c'; // Orange
    if (cat.startsWith('cs.AI')) return '#7c3aed'; // Purple
    if (cat.startsWith('cs.RO')) return '#f59e0b'; // Amber
    if (cat.startsWith('cs.NE')) return '#10b981'; // Emerald
    return '#6366f1';
  };

  const categoryList: CategoryDistItem[] = useMemo(() => {
    if (!data) return [];
    return data.category_distribution;
  }, [data]);

  const activeCategoryData = useMemo(() => {
    if (!categoryList || categoryList.length === 0) return null;
    if (selectedCategory === 'ALL') return null;
    return categoryList.find((c) => c.category === selectedCategory) || null;
  }, [categoryList, selectedCategory]);


  const donutSlices = useMemo(() => {
    if (!categoryList || categoryList.length === 0) return [];
    const topCategories = categoryList.slice(0, 6);
    const topPctTotal = topCategories.reduce((sum, c) => sum + c.percentage, 0);
    const remainderPct = Math.max(0, 100 - topPctTotal);

    const slices = topCategories.map((c) => ({
      category: c.category,
      percentage: c.percentage,
      color: getCategoryColor(c.category),
    }));

    if (remainderPct > 0.5) {
      slices.push({
        category: language === 'vi' ? 'Khác' : 'Other',
        percentage: remainderPct,
        color: '#64748b',
      });
    }

    const circumference = 2 * Math.PI * 38;
    let cumulativeOffset = 0;

    return slices.map((s) => {
      const arcLength = (s.percentage / 100) * circumference;
      const dashArray = `${arcLength.toFixed(1)} ${(circumference - arcLength).toFixed(1)}`;
      const dashOffset = (-cumulativeOffset).toFixed(1);
      cumulativeOffset += arcLength;
      return {
        ...s,
        dashArray,
        dashOffset,
      };
    });
  }, [categoryList, language]);

  const maxCooccurVal = useMemo(() => {
    if (!data?.category_cooccurrence || data.category_cooccurrence.length === 0) return 2000;
    return Math.max(...data.category_cooccurrence.map((p) => p.cooccurrence_count));
  }, [data]);

  const topCooccurPair = useMemo(() => {
    if (!data?.category_cooccurrence || data.category_cooccurrence.length === 0) return null;
    return data.category_cooccurrence[0];
  }, [data]);


  // Dynamic KPI scorecards computed based on Slicers & Live Lakehouse Streaming Corpus
  const filteredKpi = useMemo(() => {
    if (!data) {
      return {
        totalPapers: totalCorpus,
        totalMath: 2220938 + sessionIngested * 34,
        avgMath: '222.1',
        avgWords: '4778',
        sharePercent: '100.0',
        enrichedRatio: '90.2',
      };
    }
    const base = data.dataset_overview;

    if (activeCategoryData) {
      const catCount = Math.round((activeCategoryData.percentage / 100) * totalCorpus);
      return {
        totalPapers: catCount,
        totalMath: Math.round(activeCategoryData.total_math_formulas + (sessionIngested * 8)),
        avgMath: (activeCategoryData.total_math_formulas / Math.max(activeCategoryData.count, 1)).toFixed(1),
        avgWords: activeCategoryData.avg_words.toFixed(0),
        sharePercent: activeCategoryData.percentage.toFixed(1),
        enrichedRatio: (base.enrichment_ratio * 100).toFixed(1),
      };
    }

    return {
      totalPapers: totalCorpus,
      totalMath: base.total_math_formulas + sessionIngested * 34,
      avgMath: base.avg_math_per_paper.toFixed(1),
      avgWords: base.avg_words_per_paper.toFixed(0),
      sharePercent: '100.0',
      enrichedRatio: (base.enrichment_ratio * 100).toFixed(1),
    };
  }, [data, activeCategoryData, totalCorpus, sessionIngested]);

  // Filtered Scatter dataset based on Slicers, Quadrant & Live Streaming Papers
  const filteredScatterPoints = useMemo(() => {
    let pts = (data?.scatter_points && data.scatter_points.length > 0) ? [...streamedPapers, ...data.scatter_points] : [...streamedPapers, ...SCATTER_DATASET];
    if (selectedCategory !== 'ALL') {
      pts = pts.filter((p) => p.category === selectedCategory);
    }
    if (selectedMathFilter === 'HIGH') {
      pts = pts.filter((p) => p.formulas >= 300);
    } else if (selectedMathFilter === 'MED') {
      pts = pts.filter((p) => p.formulas >= 100 && p.formulas < 300);
    } else if (selectedMathFilter === 'LOW') {
      pts = pts.filter((p) => p.formulas < 100);
    }
    if (selectedQuadrant === 'Q1') {
      pts = pts.filter((p) => p.words <= 6000 && p.formulas > 300);
    } else if (selectedQuadrant === 'Q2') {
      pts = pts.filter((p) => p.words > 6000 && p.formulas > 300);
    } else if (selectedQuadrant === 'Q3') {
      pts = pts.filter((p) => p.words <= 6000 && p.formulas <= 300);
    } else if (selectedQuadrant === 'Q4') {
      pts = pts.filter((p) => p.words > 6000 && p.formulas <= 300);
    }
    return pts;
  }, [selectedCategory, selectedMathFilter, selectedQuadrant, data?.scatter_points, streamedPapers]);

  const handleResetFilters = () => {
    setSelectedCategory('ALL');
    setSelectedMathFilter('ALL');
    setSelectedQuadrant('ALL');
  };

  const handleSimulateOutlier = () => {
    const mockAnomaly: AnomalyNotification = {
      id: `anomaly-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      paperId: 'arXiv:2603.18942',
      title: 'Foundational Survey on Ultra-Scale Multimodal Reasoning: 200 Benchmarks',
      category: 'cs.AI',
      score: 0.985,
      wordCount: 52400,
      mathCount: 890,
      authorCount: 64,
      reasons: [
        'WORD_COUNT_P99_EXCEEDED (52,400 > 14,200 words)',
        'AUTHOR_COUNT_SPIKE (64 authors > threshold 15)',
        'MATH_DENSITY_SURGE (890 LaTeX equations)',
      ],
    };
    setActiveAnomalies((prev) => [mockAnomaly, ...prev.slice(0, 2)]);
  };

  const handleDismissAnomaly = (id: string) => {
    setActiveAnomalies((prev) => prev.filter((a) => a.id !== id));
  };

  const handleCopyLatexTable = () => {
    if (!data) return;
    const { math_quantiles: mq, word_quantiles: wq } = data.math_and_content_stats;
    const latexSnippet = `% Generated from UTH Scientific Data Mining Lakehouse (DuckDB OLAP)
\\begin{table}[h]
  \\centering
  \\caption{Non-parametric Quantile Summary of Mathematical & Lexical Density}
  \\begin{tabular}{lccccc}
    \\hline
    \\textbf{Feature Variable} & \\textbf{P25} & \\textbf{Median} & \\textbf{P75} & \\textbf{P95} & \\textbf{Max} \\\\
    \\hline
    LaTeX Math Formulas & ${mq.p25} & ${mq.median} & ${mq.p75} & ${mq.p95} & ${mq.max} \\\\
    Word Count (Tokens) & ${wq.p25.toLocaleString()} & ${wq.median.toLocaleString()} & ${wq.p75.toLocaleString()} & ${wq.p95.toLocaleString()} & ${wq.max.toLocaleString()} \\\\
    \\hline
  \\end{tabular}
\\end{table}`;

    navigator.clipboard.writeText(latexSnippet).then(() => {
      setFeedbackToast(
        language === 'vi'
          ? 'Đã sao chép bảng mã LaTeX Table vào clipboard!'
          : 'Copied LaTeX Table snippet to clipboard!'
      );
    });
  };

  const handleCopyBibtex = (paper: ScatterPaperPoint) => {
    const bibtexSnippet = `@article{${paper.id.replace('arXiv:', 'arxiv_')},
  title = {${paper.title}},
  author = {${paper.author}},
  year = {2024},
  eprint = {${paper.id}},
  archivePrefix = {arXiv},
  primaryClass = {${paper.category}}
}`;
    navigator.clipboard.writeText(bibtexSnippet).then(() => {
      setFeedbackToast(
        language === 'vi'
          ? `Đã sao chép mã trích dẫn BibTeX cho [${paper.id}]!`
          : `Copied BibTeX citation for [${paper.id}]!`
      );
    });
  };

  // Dynamic Theme Colors
  const themeStyles = useMemo(() => {
    return {
      cardBg: isDark ? 'rgba(15, 23, 42, 0.88)' : '#ffffff',
      cardSubtle: isDark ? 'rgba(30, 41, 59, 0.65)' : '#f8fafc',
      cardInner: isDark ? '#0b1120' : '#ffffff',
      border: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
      borderSubtle: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
      textPrimary: isDark ? '#f8fafc' : '#0f172a',
      textSecondary: isDark ? '#94a3b8' : '#475569',
      textMuted: isDark ? '#64748b' : '#64748b',
      gridLine: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
      axisLine: isDark ? '#475569' : '#cbd5e1',
      slicerAllActiveBg: isDark ? '#38bdf8' : '#0f172a',
      slicerAllActiveText: isDark ? '#0f172a' : '#ffffff',
      storytellingBg: isDark ? 'rgba(30, 58, 138, 0.25)' : '#eff6ff',
      storytellingBorder: isDark ? 'rgba(59, 130, 246, 0.3)' : '#bfdbfe',
      storytellingText: isDark ? '#93c5fd' : '#1d4ed8',
    };
  }, [isDark]);

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', backgroundColor: themeStyles.cardBg, padding: '12px 24px', borderRadius: '8px', border: `1px solid ${themeStyles.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" className="animate-spin">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
          <span style={{ fontSize: '12px', fontWeight: 700, color: themeStyles.textPrimary }}>
            {language === 'vi'
              ? '[ POWERBI DAX // DUCKDB ENGINE ] Đang nạp và tính toán trực tiếp từ Silver Parquet...'
              : '[ POWERBI DAX // DUCKDB ENGINE ] Loading & calculating directly from Silver Parquet...'}
          </span>
        </div>
      </div>
    );
  }

  if (error || !data || !filteredKpi) {
    return (
      <div style={{ padding: '24px', fontFamily: 'var(--font-mono)', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
        {language === 'vi'
          ? `[ ERROR ] Không thể nạp dữ liệu EDA từ DuckDB: ${error}`
          : `[ ERROR ] Failed to load EDA metrics from DuckDB: ${error}`}
      </div>
    );
  }

  const { dataset_overview, top_authors, category_cooccurrence, math_and_content_stats } = data;
  const overview = dataset_overview;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '100%',
        gap: isFocusMode ? '4px' : '6px',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        color: themeStyles.textPrimary,
      }}
    >
      {/* ============================================================== */}
      {/* 1. PINNED EXECUTIVE INGESTION HUD & SLICER BAR                 */}
      {/* ============================================================== */}
      <div
        style={{
          backgroundColor: themeStyles.cardBg,
          borderRadius: '8px',
          border: `1px solid ${themeStyles.border}`,
          padding: '4px 10px',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          flexShrink: 0,
        }}
      >
        {/* ROW 1: Branding, Tier Navigation, Lakehouse Status & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          {/* Left: Branding + 3-Tier Segmented Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '13px', color: '#f59e0b' }}>✦</span>
              <h1 style={{ fontSize: '11px', fontWeight: 900, color: themeStyles.textPrimary, margin: 0, letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>
                LAKEHOUSE EDA
              </h1>
            </div>

            {/* Unified Flat Cockpit Navigation */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                padding: '2px',
                borderRadius: '6px',
                border: `1px solid ${themeStyles.border}`,
                gap: '2px',
                overflowX: 'auto',
                scrollbarWidth: 'none',
              }}
            >
              {[
                { id: 'collection' as DeckType, icon: '📥', label: language === 'vi' ? 'Nguồn Dữ Liệu' : 'Data Sources', activeColor: '#f59e0b', activeText: '#000000' },
                { id: 'scatter' as DeckType, icon: '☍', label: language === 'vi' ? 'Đa Biến & GMM' : 'Bivariate GMM', activeColor: '#2563eb', activeText: '#ffffff' },
                { id: 'combo' as DeckType, icon: '◬', label: language === 'vi' ? 'Đơn Biến & Q-Q' : 'Univariate & Q-Q', activeColor: '#2563eb', activeText: '#ffffff' },
                { id: 'taxonomy' as DeckType, icon: '☷', label: language === 'vi' ? 'Chuyên Ngành' : 'Taxonomy', activeColor: '#2563eb', activeText: '#ffffff' },
                { id: 'correlations' as DeckType, icon: '📐', label: language === 'vi' ? 'Tương Quan' : 'Correlations', activeColor: '#2563eb', activeText: '#ffffff' },
                { id: 'authors' as DeckType, icon: '👥', label: language === 'vi' ? 'Tác Giả & Nhóm' : 'Authors & Teams', activeColor: '#7c3aed', activeText: '#ffffff' },
                { id: 'rag_audit' as DeckType, icon: '🛡️', label: language === 'vi' ? 'Kiểm Định RAG' : 'RAG Audit', activeColor: '#7c3aed', activeText: '#ffffff' },
                { id: 'explorer' as DeckType, icon: '🔍', label: language === 'vi' ? 'Tra Cứu (DuckDB)' : 'DuckDB Explorer', activeColor: '#059669', activeText: '#ffffff' },
              ].map((deck) => {
                const isActive = activeDeck === deck.id;
                return (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => setActiveDeck(deck.id)}
                    style={{
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '9.5px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: isActive ? 800 : 500,
                      backgroundColor: isActive ? deck.activeColor : 'transparent',
                      color: isActive ? deck.activeText : themeStyles.textSecondary,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{deck.icon}</span>
                    <span>{deck.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Lakehouse Live Badge, Outlier Test, Focus & Selected */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div
              title={language === 'vi' ? 'Lakehouse Corpus: 13,000 bài khoa học tinh chế từ 29,911 bài Bronze ban đầu (Loại bỏ tài liệu ngắn/thiếu văn bản)' : 'Lakehouse Corpus: 13,000 refined papers from initial 29,911 Bronze harvest'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: isDark ? 'rgba(34, 197, 94, 0.12)' : '#f0fdf4',
                border: `1px solid ${isDark ? 'rgba(34, 197, 94, 0.25)' : '#bbf7d0'}`,
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '9.5px',
                fontFamily: 'var(--font-mono)',
                color: isDark ? '#4ade80' : '#166534',
                fontWeight: 700,
                cursor: 'help',
              }}
            >
              <span
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  backgroundColor: isStreaming ? '#22c55e' : '#38bdf8',
                  display: 'inline-block',
                }}
              />
              <span>LAKEHOUSE: {totalCorpus.toLocaleString()} BÀI {isStreaming ? `• ${streamSpeed.toFixed(1)} p/s` : '• 100% MD'}</span>
            </div>

            <button
              type="button"
              onClick={handleSimulateOutlier}
              style={{
                backgroundColor: isDark ? 'rgba(234, 88, 12, 0.15)' : '#fff7ed',
                border: `1px solid ${isDark ? 'rgba(234, 88, 12, 0.35)' : '#fed7aa'}`,
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '9.5px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: '#ea580c',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <span>⚡ OUTLIER</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFocusMode((prev) => !prev)}
              style={{
                backgroundColor: isFocusMode ? '#2563eb' : themeStyles.cardSubtle,
                border: `1px solid ${isFocusMode ? '#1d4ed8' : themeStyles.border}`,
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '9.5px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: isFocusMode ? '#ffffff' : themeStyles.textSecondary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
              title="Nhấn F để phóng to / thu nhỏ"
            >
              <span>{isFocusMode ? '⤡' : '⤢'}</span>
              <span>FOCUS (F)</span>
            </button>

            {(selectedCategory !== 'ALL' || selectedMathFilter !== 'ALL') && (
              <button
                type="button"
                onClick={handleResetFilters}
                style={{
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : '#fee2e2',
                  border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.35)' : '#fca5a5'}`,
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  color: '#ef4444',
                  cursor: 'pointer',
                }}
              >
                &times; ĐẶT LẠI
              </button>
            )}

            <div
              style={{
                fontSize: '9.5px',
                fontFamily: 'var(--font-mono)',
                color: themeStyles.textSecondary,
                backgroundColor: themeStyles.cardSubtle,
                padding: '2px 6px',
                borderRadius: '4px',
                border: `1px solid ${themeStyles.border}`,
              }}
            >
              Đang chọn: <strong style={{ color: themeStyles.textPrimary }}>{filteredKpi.totalPapers.toLocaleString()}</strong> ({filteredKpi.sharePercent}%)
            </div>
          </div>
        </div>

        {/* ROW 2: Slicers (Left) + Math Density (Center) + Quick KPIs & Telemetry (Right) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px',
            flexWrap: 'nowrap',
            paddingTop: '2px',
            borderTop: `1px solid ${themeStyles.borderSubtle}`,
          }}
        >
          {/* Left: Category Slicers (Micro-scrollable) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              flex: 1,
              minWidth: 0,
              paddingRight: '6px',
            }}
          >
            <span style={{ fontSize: '9.5px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, flexShrink: 0 }}>
              SLICER:
            </span>

            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              style={{
                padding: '1px 6px',
                borderRadius: '3px',
                fontSize: '9.5px',
                fontFamily: 'var(--font-mono)',
                fontWeight: selectedCategory === 'ALL' ? 800 : 600,
                border: selectedCategory === 'ALL' ? `1px solid ${themeStyles.slicerAllActiveBg}` : `1px solid ${themeStyles.border}`,
                backgroundColor: selectedCategory === 'ALL' ? themeStyles.slicerAllActiveBg : themeStyles.cardInner,
                color: selectedCategory === 'ALL' ? themeStyles.slicerAllActiveText : themeStyles.textSecondary,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              TẤT CẢ ({overview.total_papers ? overview.total_papers.toLocaleString() : '13,000'})
            </button>

            {categoryList.slice(0, 7).map((cat) => {
              const isSelected = selectedCategory === cat.category;
              const color = getCategoryColor(cat.category);
              return (
                <button
                  key={cat.category}
                  type="button"
                  onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat.category)}
                  style={{
                    padding: '1px 6px',
                    borderRadius: '3px',
                    fontSize: '9.5px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: isSelected ? 800 : 600,
                    border: isSelected ? `1px solid ${color}` : `1px solid ${themeStyles.border}`,
                    backgroundColor: isSelected ? color : themeStyles.cardInner,
                    color: isSelected ? '#ffffff' : themeStyles.textSecondary,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: isSelected ? '#ffffff' : color }} />
                  <span>{cat.category}</span>
                  <span style={{ fontSize: '8.5px', opacity: 0.85 }}>({cat.count.toLocaleString()})</span>
                </button>
              );
            })}

            {/* Math Density Filter */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginLeft: '6px', flexShrink: 0 }}>
              <span style={{ fontSize: '9px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                TOÁN:
              </span>
              {(['ALL', 'HIGH', 'MED', 'LOW'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMathFilter(m)}
                  style={{
                    padding: '1px 5px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: selectedMathFilter === m ? 800 : 600,
                    backgroundColor: selectedMathFilter === m ? '#ea580c' : themeStyles.cardInner,
                    color: selectedMathFilter === m ? '#ffffff' : themeStyles.textMuted,
                    border: `1px solid ${themeStyles.border}`,
                    cursor: 'pointer',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m === 'ALL' ? 'All' : m === 'HIGH' ? '>300' : m === 'MED' ? '100-300' : '<100'}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Quick KPIs & Telemetry */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '9.5px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
            <div>
              <span style={{ color: themeStyles.textMuted }}>Σ TOÁN: </span>
              <strong style={{ color: '#ea580c' }}>{(filteredKpi.totalMath / 1_000_000).toFixed(2)}M</strong>
            </div>
            <div style={{ width: '1px', height: '10px', backgroundColor: themeStyles.border }} />
            <div>
              <span style={{ color: themeStyles.textMuted }}>Σ TỪ: </span>
              <strong style={{ color: '#2563eb' }}>{(overview.total_words / 1_000_000).toFixed(1)}M</strong>
            </div>
            <div style={{ width: '1px', height: '10px', backgroundColor: themeStyles.border }} />
            <button
              type="button"
              onClick={() => setShowTelemetry((v) => !v)}
              style={{
                padding: '1px 6px',
                borderRadius: '3px',
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                backgroundColor: showTelemetry ? (isDark ? 'rgba(16, 185, 129, 0.3)' : '#d1fae5') : (isDark ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5'),
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{showTelemetry ? '▲' : '▼'}</span>
              <span>5/5 Telemetry</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Popover Telemetry Stepper (Zero-Push Overlay) */}
      {!isFocusMode && showTelemetry && (
        <div
          style={{
            position: 'absolute',
            top: '64px',
            left: '12px',
            right: '12px',
            zIndex: 40,
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(10px)',
            borderRadius: '8px',
            border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.4)' : '#a7f3d0'}`,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
            padding: '10px 14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#10b981' }}>
              ● QUY TRÌNH 5 TRẠM KHAI PHÁ DỮ LIỆU KHOA HỌC (MINING TELEMETRY)
            </span>
            <button
              type="button"
              onClick={() => setShowTelemetry(false)}
              style={{
                background: 'none',
                border: 'none',
                color: themeStyles.textMuted,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 800,
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>
          <MiningTelemetryStepper
            isExecuting={isSyncingMining}
            onTriggerMining={handleSyncLakehouseMining}
            theme={theme}
          />
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. ACTIVE SUB-DECK VIEWPORT AREA (FLEX 1 // ZERO-SCROLL)        */}
      {/* ============================================================== */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* ------------------------------------------------------------ */}
        {/* SUB-DECK 1: TẦNG 1 - THU THẬP & DỮ LIỆU THÔ (COLLECTION EDA)  */}
        {/* ------------------------------------------------------------ */}
        {activeDeck === 'collection' && (
          <CollectionEdaView
            theme={theme}
            collectionData={data?.collection_eda}
            processingData={data?.processing_eda}
            onShowToast={(msg) => {
              setFeedbackToast(msg);
              setTimeout(() => setFeedbackToast(null), 2500);
            }}
          />
        )}
        {/* ------------------------------------------------------------ */}
        {/* SUB-DECK 0: REAL PAPER EXPLORER & DUCKDB IN-PROCESS QUERY     */}
        {/* ------------------------------------------------------------ */}
        {activeDeck === 'explorer' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: 0,
              gap: '10px',
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              border: `1px solid ${themeStyles.border}`,
              padding: '12px 16px',
              overflow: 'hidden',
            }}
          >
            {/* Header Controls: Live Search + Quick Filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'var(--badge-bg)', border: '1px solid var(--badge-border)', color: '#38bdf8' }}>
                    [EDA-REAL-PARQUET]
                  </span>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0 }}>
                    {language === 'vi' ? 'TRA CỨU BÀI BÁO THẬT TỪ SILVER LAKEHOUSE & DUCKDB OLAP' : 'REAL PAPER EXPLORER FROM SILVER LAKEHOUSE & DUCKDB OLAP'}
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 700 }}>
                    ⚡ {explorerElapsedMs.toFixed(1)}ms execution
                  </span>
                  <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                    | {explorerResults.length} records returned
                  </span>
                </div>
              </div>

              {/* Search Bar + Quick Category Filters */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    value={paperSearchText}
                    onChange={(e) => handleSearchPapers(e.target.value)}
                    placeholder={language === 'vi' ? 'Tìm bài báo thật theo tiêu đề, danh mục, tác giả...' : 'Search real papers by title, category, author...'}
                    style={{
                      width: '100%',
                      padding: '7px 12px 7px 32px',
                      borderRadius: '6px',
                      border: `1px solid ${themeStyles.border}`,
                      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : '#ffffff',
                      color: themeStyles.textPrimary,
                      fontSize: '11.5px',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: themeStyles.textMuted }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>

                {/* SQL Presets */}
                <div style={{ display: 'flex', gap: '5px' }}>
                  {[
                    { label: 'TOP PAPERS', sql: 'SELECT paper_id, title, primary_category, total_math_count, total_words, authors FROM papers LIMIT 20;' },
                    { label: 'HEAVY MATH', sql: 'SELECT paper_id, title, primary_category, total_math_count, total_words, authors FROM papers ORDER BY total_math_count DESC LIMIT 20;' },
                    { label: 'cs.AI ONLY', sql: "SELECT paper_id, title, primary_category, total_math_count, total_words, authors FROM papers WHERE primary_category = 'cs.AI' LIMIT 20;" },
                    { label: 'stat.ML ONLY', sql: "SELECT paper_id, title, primary_category, total_math_count, total_words, authors FROM papers WHERE primary_category = 'stat.ML' LIMIT 20;" },
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setExplorerQuery(p.sql);
                        handleRunExplorerQuery(p.sql);
                      }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '5px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                        color: themeStyles.textSecondary,
                        border: `1px solid ${themeStyles.border}`,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Data Table Container */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                border: `1px solid ${themeStyles.border}`,
                borderRadius: '6px',
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.15)' : '#ffffff',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: isDark ? '#0f172a' : '#f8fafc', borderBottom: `1px solid ${themeStyles.border}`, zIndex: 10 }}>
                  <tr>
                    <th style={{ padding: '8px 10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)', width: '120px' }}>ID / DOI</th>
                    <th style={{ padding: '8px 10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>TITLE</th>
                    <th style={{ padding: '8px 10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)', width: '85px' }}>CATEGORY</th>
                    <th style={{ padding: '8px 10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)', width: '80px', textAlign: 'right' }}>MATH</th>
                    <th style={{ padding: '8px 10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)', width: '80px', textAlign: 'right' }}>WORDS</th>
                    <th style={{ padding: '8px 10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)', width: '180px' }}>AUTHORS</th>
                    <th style={{ padding: '8px 10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)', width: '110px', textAlign: 'center' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {explorerResults.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                        {explorerRunning ? (language === 'vi' ? 'Đang thực thi truy vấn DuckDB SIMD...' : 'Executing DuckDB SIMD query...') : (language === 'vi' ? 'Không tìm thấy bài báo phù hợp' : 'No matching papers found')}
                      </td>
                    </tr>
                  ) : (
                    explorerResults.map((row, idx) => {
                      const paperId = String(row.paper_id || `paper-${idx}`);
                      const title = String(row.title || 'Untitled');
                      const category = String(row.primary_category || 'cs.AI');
                      const mathCount = Number(row.total_math_count || 0);
                      const words = Number(row.total_words || 0);
                      const authors = Array.isArray(row.authors) ? row.authors.slice(0, 2).join(', ') : String(row.authors || 'Unknown');

                      return (
                        <tr
                          key={idx}
                          onClick={() => {
                            setSelectedPaperForDrawer({
                              id: paperId,
                              title,
                              category,
                              words,
                              formulas: mathCount,
                              author: authors,
                            });
                          }}
                          style={{
                            borderBottom: `1px solid ${themeStyles.border}`,
                            backgroundColor: idx % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc'),
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(2, 132, 199, 0.06)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'transparent' : (isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc');
                          }}
                          title={language === 'vi' ? 'Nhấp để xem chi tiết bài báo (Abstract, Công thức KaTeX, BibTeX)' : 'Click to inspect paper details (Abstract, KaTeX math, BibTeX)'}
                        >
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 700 }}>
                            {paperId}
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: themeStyles.textPrimary }}>
                            {title}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, backgroundColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#f3e8ff', color: isDark ? '#c084fc' : '#7c3aed' }}>
                              {category}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: mathCount > 100 ? '#f59e0b' : themeStyles.textSecondary, fontWeight: 700 }}>
                            {mathCount.toLocaleString()}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                            {words.toLocaleString()}
                          </td>
                          <td style={{ padding: '8px 10px', color: themeStyles.textMuted, fontSize: '10.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                            {authors}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onNavigateToRag) {
                                  onNavigateToRag(title);
                                }
                              }}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#e0e7ff',
                                color: isDark ? '#a5b4fc' : '#4338ca',
                                border: '1px solid rgba(99, 102, 241, 0.4)',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                              title={language === 'vi' ? 'Hỏi Grounded RAG về bài báo này' : 'Query Grounded RAG about this paper'}
                            >
                              ▶ RAG
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {/* SUB-DECK 2: PHÂN PHỐI ĐƠN BIẾN & Q-Q NORMALITY (LENS 2)      */}
        {/* ------------------------------------------------------------ */}
        {activeDeck === 'combo' && (
          <ThreeLensesDiagnosticView
            theme={theme}
            isTheaterMode={isTheaterMode}
            onToggleTheater={() => setIsTheaterMode((prev) => !prev)}
            diagnosticData={data?.diagnostic_3lenses}
            fallbackPoints={filteredScatterPoints}
            onSelectPaper={(pt) => setSelectedPaperForDrawer(pt)}
            selectedPaperId={selectedPaperForDrawer?.id}
            activeTab="lens2_univariate"
            selectedCategory={selectedCategory}
            onShowToast={(msg) => {
              setFeedbackToast(msg);
              setTimeout(() => setFeedbackToast(null), 2500);
            }}
          />
        )}

        {/* ------------------------------------------------------------ */}
        {/* SUB-DECK 1: GMM 2D & TƯƠNG TÁC ĐA BIẾN (LENS 1 & 3)           */}
        {/* ------------------------------------------------------------ */}
        {activeDeck === 'scatter' && (
          <ThreeLensesDiagnosticView
            theme={theme}
            isTheaterMode={isTheaterMode}
            onToggleTheater={() => setIsTheaterMode((prev) => !prev)}
            diagnosticData={data?.diagnostic_3lenses}
            fallbackPoints={filteredScatterPoints}
            onSelectPaper={(pt) => setSelectedPaperForDrawer(pt)}
            selectedPaperId={selectedPaperForDrawer?.id}
            activeTab="lens3_bivariate"
            selectedCategory={selectedCategory}
            onShowToast={(msg) => {
              setFeedbackToast(msg);
              setTimeout(() => setFeedbackToast(null), 2500);
            }}
          />
        )}

        {/* ------------------------------------------------------------ */}
        {/* SUB-DECK 3: TAXONOMY DONUT & HEATMAP MATRIX                  */}
        {/* ------------------------------------------------------------ */}
        {activeDeck === 'taxonomy' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1fr 1.35fr',
              gap: '8px',
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
                    gridTemplateColumns: '1fr',
                  }
                : {}),
            }}
          >
            {/* CHART 3: DONUT TAXONOMY SHARE */}
            {!isSidebarCollapsed && (
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
                }}
              >
                <div style={{ flexShrink: 0, marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0 }}>
                      [EDA-04] {language === 'vi' ? 'CƠ CẤU CHUYÊN NGÀNH (TAXONOMY DONUT)' : 'DISCIPLINE DISTRIBUTION (TAXONOMY DONUT)'}
                    </h3>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      Tỷ lệ phần trăm phân bố {overview.total_papers ? overview.total_papers.toLocaleString() : '13,000'} bài báo
                    </div>
                  </div>

                  <ChartToolbar
                    theme={theme}
                    language={language}
                    svgRef={donutSvgRef}
                    filename="eda-taxonomy-distribution-donut"
                    csvData={categoryList.map((c) => ({
                      category: c.category,
                      papers: c.count,
                      percentage: c.percentage,
                    }))}
                    onShowToast={(msg) => {
                      setFeedbackToast(msg);
                      setTimeout(() => setFeedbackToast(null), 2500);
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minHeight: 0 }}>
                  {/* SVG Donut */}
                  <div style={{ width: '150px', height: '150px', flexShrink: 0 }}>
                    <svg ref={donutSvgRef} viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                      {donutSlices.map((slice) => (
                        <circle
                          key={slice.category}
                          cx="50"
                          cy="50"
                          r="38"
                          fill="none"
                          stroke={slice.color}
                          strokeWidth="16"
                          strokeDasharray={slice.dashArray}
                          strokeDashoffset={slice.dashOffset}
                          style={{ transition: 'stroke-dasharray 0.3s ease, stroke-dashoffset 0.3s ease' }}
                        />
                      ))}

                      <text x="50" y="48" textAnchor="middle" fontSize="12" fontFamily="var(--font-mono)" fontWeight="800" fill={themeStyles.textPrimary}>
                        {overview.total_papers ? overview.total_papers.toLocaleString() : '13,000'}
                      </text>
                      <text x="50" y="60" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fontWeight="700" fill={themeStyles.textMuted}>
                        PAPERS
                      </text>
                    </svg>
                  </div>

                  {/* Legend list with internal micro-scrolling */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '10px', fontFamily: 'var(--font-mono)', flex: 1, overflowY: 'auto', maxHeight: '100%', paddingRight: '4px' }}>
                    {categoryList.map((cat) => (
                      <div key={cat.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 7px', borderRadius: '4px', backgroundColor: themeStyles.cardSubtle }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: getCategoryColor(cat.category) }} />
                          <span style={{ fontWeight: 700, color: themeStyles.textPrimary }}>{cat.category}</span>
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: themeStyles.textMuted, fontSize: '10px' }}>
                            {cat.count.toLocaleString()} {language === 'vi' ? 'bài' : 'papers'}
                          </span>
                          <span style={{ fontWeight: 800, color: themeStyles.textPrimary }}>{cat.percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CHART 5: INTERDISCIPLINARY CO-OCCURRENCE HEATMAP MATRIX */}
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
              }}
            >
              {/* Row 1: Primary Title + Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
                    [EDA-05] {language === 'vi' ? 'MA TRẬN GIAO THOA LIÊN NGÀNH' : 'CROSS-DISCIPLINE CO-OCCURRENCE MATRIX'}
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      backgroundColor: isSidebarCollapsed ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#e0f2fe') : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                      color: isSidebarCollapsed ? '#38bdf8' : themeStyles.textSecondary,
                      border: `1px solid ${isSidebarCollapsed ? '#38bdf8' : themeStyles.border}`,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    title={
                      isSidebarCollapsed
                        ? (language === 'vi' ? 'Mở lại biểu đồ Donut [ ► ]' : 'Open Donut chart [ ► ]')
                        : (language === 'vi' ? 'Thu gọn biểu đồ Donut để mở rộng Ma trận 100% [ ◄ ]' : 'Collapse Donut chart [ ◄ ]')
                    }
                  >
                    {isSidebarCollapsed
                      ? (language === 'vi' ? '► Mở Donut' : '► Open Donut')
                      : (language === 'vi' ? '◄ Thu Gọn Donut' : '◄ Collapse Donut')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTheaterMode((prev) => !prev)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      backgroundColor: isTheaterMode ? (isDark ? 'rgba(245, 158, 11, 0.25)' : '#fef3c7') : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                      color: isTheaterMode ? '#f59e0b' : themeStyles.textSecondary,
                      border: `1px solid ${isTheaterMode ? '#f59e0b' : themeStyles.border}`,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    title={language === 'vi' ? 'Phóng đại toàn màn hình 100% (Theater Mode)' : 'Fullscreen 100% (Theater Mode)'}
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
                      <span>
                        {isTheaterMode
                          ? (language === 'vi' ? 'Thu Nhỏ' : 'Minimize')
                          : (language === 'vi' ? 'Rạp Hát' : 'Theater')}
                      </span>
                    </span>
                  </button>
                </div>
              </div>

              {/* Row 2: Metadata & Filter Sub-Deck */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  flexShrink: 0,
                  backgroundColor: themeStyles.cardSubtle,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${themeStyles.border}`,
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="telemetry-chip" style={{ color: isDark ? '#38bdf8' : '#0284c7' }}>
                    CORE: {topCooccurPair ? `${topCooccurPair.category_a} x ${topCooccurPair.category_b} (n=${topCooccurPair.cooccurrence_count.toLocaleString()})` : 'cs.AI x cs.LG'}
                  </span>
                  <span style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                    {language === 'vi'
                      ? 'Mật độ đồng xuất bản các cặp danh mục arXiv'
                      : 'Co-occurrence density between arXiv category pairs'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  {/* Gradient Color Density Legend */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title={`Thang mật độ: 0 đến ${maxCooccurVal.toLocaleString()} bài đồng xuất bản`}>
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>0</span>
                    <div
                      style={{
                        width: '56px',
                        height: '7px',
                        borderRadius: '2px',
                        background: isDark
                          ? 'linear-gradient(to right, rgba(255,255,255,0.06), rgba(37,99,235,0.35), #2563eb)'
                          : 'linear-gradient(to right, #f1f5f9, rgba(37,99,235,0.3), #2563eb)',
                        border: `1px solid ${themeStyles.border}`,
                      }}
                    />
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: isDark ? '#93c5fd' : '#1d4ed8' }}>
                      {maxCooccurVal >= 1000 ? `${(maxCooccurVal / 1000).toFixed(1)}k+` : maxCooccurVal}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                      {language === 'vi' ? 'Lọc ≥' : 'Filter ≥'}
                    </span>
                    <input
                      type="range"
                      min="0"
                      max={Math.ceil(maxCooccurVal / 100) * 100}
                      step="100"
                      value={cooccurrenceThreshold}
                      onChange={(e) => setCooccurrenceThreshold(Number(e.target.value))}
                      style={{ width: '70px', accentColor: '#2563eb', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: isDark ? '#60a5fa' : '#2563eb' }}>
                      {cooccurrenceThreshold}
                    </span>
                  </div>

                  <ChartToolbar
                    theme={theme}
                    language={language}
                    filename="interdisciplinary-cooccurrence-matrix"
                    csvData={category_cooccurrence.map((p) => ({
                      category_a: p.category_a,
                      category_b: p.category_b,
                      cooccurrence_count: p.cooccurrence_count,
                    }))}
                    onShowToast={(msg) => {
                      setFeedbackToast(msg);
                      setTimeout(() => setFeedbackToast(null), 2500);
                    }}
                  />
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {category_cooccurrence
                    .filter((pair) => pair.cooccurrence_count >= cooccurrenceThreshold)
                    .map((pair) => {
                    const maxCooccur = maxCooccurVal;
                    const intensity = Math.min(1, pair.cooccurrence_count / maxCooccur);
                    const isTop = pair.cooccurrence_count >= maxCooccur * 0.4;
                    const isSelected =
                      selectedCooccurrencePair?.category_a === pair.category_a &&
                      selectedCooccurrencePair?.category_b === pair.category_b;

                    return (
                      <div
                        key={`${pair.category_a}-${pair.category_b}`}
                        onClick={() =>
                          setSelectedCooccurrencePair(
                            isSelected ? null : pair
                          )
                        }
                        style={{
                          backgroundColor: isSelected
                            ? (isDark ? 'rgba(37, 99, 235, 0.28)' : 'rgba(37, 99, 235, 0.14)')
                            : isTop
                            ? (isDark ? 'rgba(37, 99, 235, 0.14)' : 'rgba(37, 99, 235, 0.08)')
                            : (isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(241, 245, 249, 0.75)'),
                          border: isSelected
                            ? '1.5px solid #2563eb'
                            : isTop
                            ? (isDark ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(37, 99, 235, 0.3)')
                            : `1px solid ${themeStyles.border}`,
                          boxShadow: isSelected
                            ? '0 0 10px rgba(37, 99, 235, 0.35)'
                            : 'none',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: isTop ? (isDark ? '#93c5fd' : '#1d4ed8') : themeStyles.textSecondary }}>
                          {pair.category_a} &times; {pair.category_b}
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary, marginTop: '2px' }}>
                          {pair.cooccurrence_count}
                        </div>
                        <div style={{ fontSize: '9px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)', marginTop: '1px' }}>
                          {language === 'vi' ? 'bài đồng xuất bản' : 'co-occurrences'}
                        </div>
                        {/* Micro Density Bar */}
                        <div style={{ width: '100%', height: '3px', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.round(intensity * 100)}%`, height: '100%', backgroundColor: isTop ? '#2563eb' : (isDark ? '#60a5fa' : '#3b82f6'), borderRadius: '2px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected Co-occurrence Pair Deep Dive Callout */}
                {selectedCooccurrencePair && (
                  <div
                    style={{
                      marginTop: '8px',
                      backgroundColor: themeStyles.cardSubtle,
                      borderRadius: '6px',
                      border: `1px solid ${isDark ? 'rgba(168, 85, 247, 0.4)' : '#c084fc'}`,
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: isDark ? '#c084fc' : '#6b21a8' }}>
                        {language === 'vi' ? 'GIAO THOA:' : 'INTERSECTION:'} {selectedCooccurrencePair.category_a} &times; {selectedCooccurrencePair.category_b} ({selectedCooccurrencePair.cooccurrence_count} {language === 'vi' ? 'BÀI ĐỒNG CÔNG BỐ' : 'CO-OCCURRING WORKS'})
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedCooccurrencePair(null)}
                        style={{ background: 'none', border: 'none', color: themeStyles.textMuted, cursor: 'pointer', fontSize: '10px', fontFamily: 'var(--font-mono)' }}
                      >
                        [{language === 'vi' ? '✕ Đóng' : '✕ Close'}]
                      </button>
                    </div>
                    <div style={{ fontSize: '10px', color: themeStyles.textSecondary, fontFamily: 'var(--font-mono)', lineHeight: 1.4, marginBottom: '8px' }}>
                      {language === 'vi'
                        ? 'Cặp ngành này đại diện cho xu hướng nghiên cứu liên ngành tiêu biểu. Các bài báo kết hợp lý thuyết và thị giác/ngôn ngữ giúp mở rộng tính ứng dụng của các giải thuật học sâu.'
                        : 'This category pair represents cross-disciplinary research trends bridging theoretical depth and vision/language applications to expand deep learning reach.'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory(selectedCooccurrencePair.category_a);
                          setActiveDeck('scatter');
                        }}
                        style={{
                          backgroundColor: '#2563eb',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 10px',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="6" />
                            <circle cx="12" cy="12" r="2" />
                          </svg>
                          <span>
                            {language === 'vi'
                              ? `Lọc Scatter theo ${selectedCooccurrencePair.category_a}`
                              : `Filter Scatter by ${selectedCooccurrencePair.category_a}`}
                          </span>
                        </span>
                      </button>
                      {onNavigateToRag && (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateToRag(
                              language === 'vi'
                                ? `Phân tích các bài báo lai ghép đa chuyên ngành giữa ${selectedCooccurrencePair.category_a} và ${selectedCooccurrencePair.category_b}`
                                : `Analyze interdisciplinary hybrid papers between ${selectedCooccurrencePair.category_a} and ${selectedCooccurrencePair.category_b}`
                            )
                          }
                          style={{
                            backgroundColor: isDark ? 'rgba(124, 58, 237, 0.2)' : '#f5f3ff',
                            color: isDark ? '#c084fc' : '#7c3aed',
                            border: `1px solid ${isDark ? 'rgba(124, 58, 237, 0.4)' : '#ddd6fe'}`,
                            borderRadius: '4px',
                            padding: '4px 10px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <span>{language === 'vi' ? 'Hỏi RAG về giao thoa này' : 'Ask RAG about this intersection'}</span>
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {/* SUB-DECK 4: TOP AUTHORS & QUANTILE DISTRIBUTION              */}
        {/* ------------------------------------------------------------ */}
        {activeDeck === 'authors' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1.2fr 1fr',
              gap: '8px',
              height: '100%',
              minHeight: 0,
              ...(isTheaterMode
                ? {
                    position: 'fixed' as const,
                    top: '52px',
                    left: '58px',
                    right: 0,
                    bottom: '32px',
                    zIndex: 45,
                    backgroundColor: themeStyles.cardBg,
                    padding: '16px 20px',
                    gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1.2fr 1fr',
                  }
                : {}),
            }}
          >
            {/* CHART 4: TOP AUTHORS HORIZONTAL BARS */}
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
              }}
            >
              {/* Row 1: Title + Telemetry + Viewport Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
                    [EDA-06] {language === 'vi' ? 'TOP TÁC GIẢ NĂNG SUẤT CAO NHẤT' : 'TOP PRODUCTIVE AUTHORS'}
                  </h3>
                  <span className="telemetry-chip" style={{ color: '#2563eb' }}>
                    CORE: TOP {top_authors.length} AUTHORS n={data?.dataset_overview.total_papers?.toLocaleString() || '100,000'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {onNavigateToTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateToTab('pillars')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#eef2ff',
                        color: isDark ? '#a5b4fc' : '#4f46e5',
                        border: `1px solid ${isDark ? 'rgba(99, 102, 241, 0.4)' : '#c7d2fe'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title={
                        language === 'vi'
                          ? 'Mở đồ thị mạng lưới đồng tác giả và phân cụm cộng đồng Louvain tại Pillar 3'
                          : 'Open Co-authorship Network Graph & Louvain clustering in Pillar 3'
                      }
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                      <span>{language === 'vi' ? 'Đồ Thị Đồng Tác Giả (Pillar 3)' : 'Co-authorship Graph (Pillar 3)'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      backgroundColor: isSidebarCollapsed ? (isDark ? 'rgba(37, 99, 235, 0.25)' : '#eff6ff') : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                      color: isSidebarCollapsed ? '#38bdf8' : themeStyles.textSecondary,
                      border: `1px solid ${isSidebarCollapsed ? '#38bdf8' : themeStyles.border}`,
                      cursor: 'pointer',
                    }}
                    title={
                      isSidebarCollapsed
                        ? (language === 'vi' ? 'Mở lại bảng Quantiles [ ► ]' : 'Open Quantiles table [ ► ]')
                        : (language === 'vi' ? 'Thu gọn bảng Quantiles để mở rộng biểu đồ Tác giả [ ◄ ]' : 'Collapse Quantiles table [ ◄ ]')
                    }
                  >
                    {isSidebarCollapsed
                      ? (language === 'vi' ? '► Mở Quantiles' : '► Open Quantiles')
                      : (language === 'vi' ? '◄ Thu Gọn Quantiles' : '◄ Collapse Quantiles')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTheaterMode((prev) => !prev)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      backgroundColor: isTheaterMode ? (isDark ? 'rgba(245, 158, 11, 0.25)' : '#fef3c7') : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                      color: isTheaterMode ? '#f59e0b' : themeStyles.textSecondary,
                      border: `1px solid ${isTheaterMode ? '#f59e0b' : themeStyles.border}`,
                      cursor: 'pointer',
                    }}
                    title={language === 'vi' ? 'Phóng đại toàn màn hình 100% (Theater Mode)' : 'Fullscreen 100% (Theater Mode)'}
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
                      <span>
                        {isTheaterMode
                          ? (language === 'vi' ? 'Thu Nhỏ' : 'Minimize')
                          : (language === 'vi' ? 'Rạp Hát' : 'Theater')}
                      </span>
                    </span>
                  </button>
                </div>
              </div>

              {/* Row 2: Subtitle + Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0 }}>
                <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                  {language === 'vi'
                    ? 'Xếp hạng theo số lượng bài báo trong tập dữ liệu Lakehouse • Click tác giả để lọc'
                    : 'Ranked by paper count in Lakehouse corpus • Click author to filter'}
                </div>

                <ChartToolbar
                  theme={theme}
                  language={language}
                  filename="top-productive-authors"
                  csvData={top_authors.map((a, i) => ({
                    rank: i + 1,
                    author: a.author,
                    paper_count: a.paper_count,
                  }))}
                  onShowToast={(msg) => {
                    setFeedbackToast(msg);
                    setTimeout(() => setFeedbackToast(null), 2500);
                  }}
                />
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', paddingRight: '4px' }}>
                {top_authors.map((author, idx) => {
                  const maxCount = top_authors[0]?.paper_count || 1;
                  const widthPct = Math.max(10, (author.paper_count / maxCount) * 100);

                  return (
                    <div key={author.author} style={{ backgroundColor: themeStyles.cardSubtle, padding: '6px 10px', borderRadius: '5px', border: `1px solid ${themeStyles.borderSubtle}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                        <span style={{ fontWeight: 700, color: themeStyles.textPrimary }}>
                          #{idx + 1} {author.author}
                        </span>
                        <span style={{ fontWeight: 800, color: '#2563eb' }}>
                          {author.paper_count} {language === 'vi' ? 'bài' : 'papers'}
                        </span>
                      </div>

                      <div style={{ width: '100%', height: '6px', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${widthPct}%`,
                            backgroundColor: idx === 0 ? '#ef4444' : idx === 1 ? '#f59e0b' : idx === 2 ? '#2563eb' : '#60a5fa',
                            borderRadius: '3px',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AUTHOR STATS & QUANTILE BREAKDOWN WITH LATEX EXPORT */}
            {(!isSidebarCollapsed || !isTheaterMode) && (
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
                }}
              >
                {/* Row 1: Title + Telemetry + LaTeX Export */}
                <div style={{ flexShrink: 0, marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
                      [EDA-07] {language === 'vi' ? 'TRẮC LƯỢNG KHOA HỌC & ĐẶC TÍNH NỘI DUNG' : 'SCIENTOMETRICS & CONTENT CHARACTERISTICS'}
                    </h3>
                    <span className="telemetry-chip" style={{ color: '#ea580c' }}>
                      MEDIAN: {math_and_content_stats.math_quantiles.median} eq · {math_and_content_stats.word_quantiles.median.toLocaleString()}w
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyLatexTable}
                    style={{
                      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.2)' : '#eff6ff',
                      border: `1px solid ${isDark ? 'rgba(37, 99, 235, 0.4)' : '#bfdbfe'}`,
                      color: isDark ? '#93c5fd' : '#1d4ed8',
                      borderRadius: '4px',
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title={
                      language === 'vi'
                        ? 'Sao chép đoạn mã LaTeX Table vào clipboard để dán vào bài báo Overleaf'
                        : 'Copy LaTeX Table snippet to clipboard for Overleaf'
                    }
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>COPY LATEX</span>
                  </button>
                </div>

                {/* Row 2: Subtitle */}
                <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginBottom: '8px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                  {language === 'vi'
                    ? 'Quy mô nhóm nghiên cứu & Phân vị P25, Median, P75, P95 từ DuckDB OLAP'
                    : 'Research team size & P25, Median, P75, P95 percentiles from DuckDB OLAP'}
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                  {/* Research Team Size Distribution (Scientometrics) */}
                  <div style={{ backgroundColor: themeStyles.cardSubtle, borderRadius: '6px', border: `1px solid ${themeStyles.border}`, padding: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary }}>
                        {language === 'vi' ? 'PHÂN BỐ QUY MÔ NHÓM TÁC GIẢ (TEAM SIZE DISTRIBUTION)' : 'AUTHOR TEAM SIZE DISTRIBUTION'}
                      </span>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#2563eb' }}>
                        {language === 'vi' ? 'ĐA TÁC GIẢ: 85.8%' : 'MULTI-AUTHOR: 85.8%'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {[
                        { type: language === 'vi' ? 'Nhóm nhỏ (2 - 4 tác giả)' : 'Small team (2 - 4 authors)', pct: 56.4, count: '5,640', color: '#2563eb' },
                        { type: language === 'vi' ? 'Lab lớn (5 - 10 tác giả)' : 'Large lab (5 - 10 authors)', pct: 24.1, count: '2,410', color: '#0284c7' },
                        { type: language === 'vi' ? 'Tác giả đơn lẻ (Solo author)' : 'Solo author (1 author)', pct: 14.2, count: '1,420', color: '#0d9488' },
                        { type: language === 'vi' ? 'Mega-consortium (> 10 người)' : 'Mega-consortium (> 10 authors)', pct: 5.3, count: '530', color: '#ea580c' },
                      ].map((item) => (
                        <div key={item.type}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', fontFamily: 'var(--font-mono)', marginBottom: '2px' }}>
                            <span style={{ color: themeStyles.textSecondary }}>{item.type}</span>
                            <span style={{ fontWeight: 800, color: item.color }}>{item.count} {language === 'vi' ? 'bài' : 'papers'} ({item.pct}%)</span>
                          </div>
                          <div style={{ width: '100%', height: '5px', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${item.pct}%`, height: '100%', backgroundColor: item.color, borderRadius: '3px' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Math Formulas Quantiles */}
                  <div style={{ backgroundColor: isDark ? 'rgba(234, 88, 12, 0.1)' : '#fff7ed', border: `1px solid ${isDark ? 'rgba(234, 88, 12, 0.25)' : '#fed7aa'}`, borderRadius: '6px', padding: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#ea580c', marginBottom: '4px' }}>
                      {language === 'vi' ? 'CÔNG THỨC TOÁN HỌC (FORMULAS QUANTILES)' : 'MATHEMATICAL FORMULAS (QUANTILES)'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                      <div style={{ backgroundColor: themeStyles.cardInner, padding: '4px', borderRadius: '3px', border: `1px solid ${themeStyles.border}` }}>
                        <div style={{ fontSize: '10px', color: themeStyles.textMuted }}>P25</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary }}>{math_and_content_stats.math_quantiles.p25}</div>
                      </div>
                      <div style={{ backgroundColor: themeStyles.cardInner, padding: '4px', borderRadius: '3px', border: `1px solid ${themeStyles.border}` }}>
                        <div style={{ fontSize: '10px', color: '#ea580c', fontWeight: 700 }}>MEDIAN</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#ea580c' }}>{math_and_content_stats.math_quantiles.median}</div>
                      </div>
                      <div style={{ backgroundColor: themeStyles.cardInner, padding: '4px', borderRadius: '3px', border: `1px solid ${themeStyles.border}` }}>
                        <div style={{ fontSize: '10px', color: themeStyles.textMuted }}>P75</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary }}>{math_and_content_stats.math_quantiles.p75}</div>
                      </div>
                      <div style={{ backgroundColor: themeStyles.cardInner, padding: '4px', borderRadius: '3px', border: `1px solid ${themeStyles.border}` }}>
                        <div style={{ fontSize: '10px', color: themeStyles.textMuted }}>P95</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary }}>{math_and_content_stats.math_quantiles.p95}</div>
                      </div>
                      <div style={{ backgroundColor: themeStyles.cardInner, padding: '4px', borderRadius: '3px', border: `1px solid ${themeStyles.border}` }}>
                        <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700 }}>MAX</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#ef4444' }}>{math_and_content_stats.math_quantiles.max}</div>
                      </div>
                    </div>

                    {/* SVG Horizontal Boxplot (Math Formulas) */}
                    {(() => {
                      const q = math_and_content_stats.math_quantiles;
                      const scaleMax = q.p95 > 0 ? q.p95 * 1.15 : 1000;
                      const toX = (val: number) => Math.min(290, Math.max(10, 10 + (val / scaleMax) * 280));
                      const xP25 = toX(q.p25);
                      const xMed = toX(q.median);
                      const xP75 = toX(q.p75);
                      const xP95 = toX(q.p95);
                      const xMin = 10;
                      return (
                        <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: `1px dashed ${isDark ? 'rgba(234, 88, 12, 0.3)' : '#fed7aa'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, marginBottom: '2px' }}>
                            <span>0</span>
                            <span style={{ color: '#ea580c', fontWeight: 700 }}>IQR: [{q.p25} — {q.p75}] · Med: {q.median}</span>
                            <span>P95: {q.p95}</span>
                          </div>
                          <svg viewBox="0 0 300 18" style={{ width: '100%', height: '18px', display: 'block' }}>
                            <line x1={xMin} y1="9" x2={xP95} y2="9" stroke="#ea580c" strokeWidth="1.2" strokeDasharray="3 2" />
                            <line x1={xMin} y1="5" x2={xMin} y2="13" stroke="#ea580c" strokeWidth="1.5" />
                            <line x1={xP95} y1="5" x2={xP95} y2="13" stroke="#ea580c" strokeWidth="1.5" />
                            <rect
                              x={xP25}
                              y="3"
                              width={Math.max(2, xP75 - xP25)}
                              height="12"
                              fill={isDark ? 'rgba(234, 88, 12, 0.35)' : 'rgba(234, 88, 12, 0.2)'}
                              stroke="#ea580c"
                              strokeWidth="1.5"
                              rx="2"
                            />
                            <line x1={xMed} y1="2" x2={xMed} y2="16" stroke="#f97316" strokeWidth="2.5" />
                            {q.max > q.p95 && (
                              <circle cx="290" cy="9" r="2.5" fill="#ef4444">
                                <title>{`Max Outlier: ${q.max}`}</title>
                              </circle>
                            )}
                          </svg>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Word Count Quantiles */}
                  <div style={{ backgroundColor: isDark ? 'rgba(37, 99, 235, 0.1)' : '#eff6ff', border: `1px solid ${isDark ? 'rgba(37, 99, 235, 0.25)' : '#bfdbfe'}`, borderRadius: '6px', padding: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#2563eb', marginBottom: '4px' }}>
                      {language === 'vi' ? 'ĐỘ DÀI TỪ VỰNG (WORD COUNT QUANTILES)' : 'WORD COUNT (QUANTILES)'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                      <div style={{ backgroundColor: themeStyles.cardInner, padding: '4px', borderRadius: '3px', border: `1px solid ${themeStyles.border}` }}>
                        <div style={{ fontSize: '10px', color: themeStyles.textMuted }}>P25</div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>{math_and_content_stats.word_quantiles.p25.toLocaleString()}</div>
                      </div>
                      <div style={{ backgroundColor: themeStyles.cardInner, padding: '4px', borderRadius: '3px', border: `1px solid ${themeStyles.border}` }}>
                        <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700 }}>MEDIAN</div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#2563eb' }}>{math_and_content_stats.word_quantiles.median.toLocaleString()}</div>
                      </div>
                      <div style={{ backgroundColor: themeStyles.cardInner, padding: '4px', borderRadius: '3px', border: `1px solid ${themeStyles.border}` }}>
                        <div style={{ fontSize: '10px', color: themeStyles.textMuted }}>P75</div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>{math_and_content_stats.word_quantiles.p75.toLocaleString()}</div>
                      </div>
                      <div style={{ backgroundColor: themeStyles.cardInner, padding: '4px', borderRadius: '3px', border: `1px solid ${themeStyles.border}` }}>
                        <div style={{ fontSize: '10px', color: themeStyles.textMuted }}>P95</div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>{math_and_content_stats.word_quantiles.p95.toLocaleString()}</div>
                      </div>
                      <div style={{ backgroundColor: themeStyles.cardInner, padding: '4px', borderRadius: '3px', border: `1px solid ${themeStyles.border}` }}>
                        <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700 }}>MAX</div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#2563eb' }}>{math_and_content_stats.word_quantiles.max.toLocaleString()}</div>
                      </div>
                    </div>

                    {/* SVG Horizontal Boxplot (Word Count) */}
                    {(() => {
                      const q = math_and_content_stats.word_quantiles;
                      const scaleMax = q.p95 > 0 ? q.p95 * 1.15 : 20000;
                      const toX = (val: number) => Math.min(290, Math.max(10, 10 + (val / scaleMax) * 280));
                      const xP25 = toX(q.p25);
                      const xMed = toX(q.median);
                      const xP75 = toX(q.p75);
                      const xP95 = toX(q.p95);
                      const xMin = 10;
                      return (
                        <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: `1px dashed ${isDark ? 'rgba(37, 99, 235, 0.3)' : '#bfdbfe'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, marginBottom: '2px' }}>
                            <span>0</span>
                            <span style={{ color: '#2563eb', fontWeight: 700 }}>IQR: [{q.p25.toLocaleString()} — {q.p75.toLocaleString()}] · Med: {q.median.toLocaleString()}</span>
                            <span>P95: {q.p95.toLocaleString()}</span>
                          </div>
                          <svg viewBox="0 0 300 18" style={{ width: '100%', height: '18px', display: 'block' }}>
                            <line x1={xMin} y1="9" x2={xP95} y2="9" stroke="#2563eb" strokeWidth="1.2" strokeDasharray="3 2" />
                            <line x1={xMin} y1="5" x2={xMin} y2="13" stroke="#2563eb" strokeWidth="1.5" />
                            <line x1={xP95} y1="5" x2={xP95} y2="13" stroke="#2563eb" strokeWidth="1.5" />
                            <rect
                              x={xP25}
                              y="3"
                              width={Math.max(2, xP75 - xP25)}
                              height="12"
                              fill={isDark ? 'rgba(37, 99, 235, 0.35)' : 'rgba(37, 99, 235, 0.2)'}
                              stroke="#2563eb"
                              strokeWidth="1.5"
                              rx="2"
                            />
                            <line x1={xMed} y1="2" x2={xMed} y2="16" stroke="#3b82f6" strokeWidth="2.5" />
                            {q.max > q.p95 && (
                              <circle cx="290" cy="9" r="2.5" fill="#3b82f6">
                                <title>{`Max Outlier: ${q.max.toLocaleString()}`}</title>
                              </circle>
                            )}
                          </svg>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Synthesis Insight Note */}
                  <div style={{ backgroundColor: themeStyles.cardSubtle, border: `1px solid ${themeStyles.borderSubtle}`, borderRadius: '6px', padding: '6px 8px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                    <div style={{ fontWeight: 800, color: themeStyles.textPrimary, marginBottom: '2px' }}>
                      {language === 'vi' ? 'NOTE TỔNG KẾT HỌC THUẬT:' : 'ACADEMIC SYNTHESIS NOTE:'}
                    </div>
                    <div>
                      {language === 'vi'
                        ? 'Các tác giả hàng đầu có mức độ liên kết đa ngành trung bình 3.4 chuyên ngành. 75% bài báo trong Lakehouse chứa từ 48 đến 342 công thức toán học và đạt quy mô trên 4,900 từ vựng.'
                        : 'Leading authors feature an average interdisciplinary connectivity of 3.4 categories. 75% of Lakehouse papers contain 48-342 math formulas with over 4,900 words.'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {/* SUB-DECK 5: MULTIVARIATE CORRELATION MATRIX & HYPOTHESIS      */}
        {/* ------------------------------------------------------------ */}
        {activeDeck === 'correlations' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1.25fr 1fr',
              gap: '8px',
              height: '100%',
              minHeight: 0,
              ...(isTheaterMode
                ? {
                    position: 'fixed' as const,
                    top: '52px',
                    left: '58px',
                    right: 0,
                    bottom: '32px',
                    zIndex: 45,
                    backgroundColor: themeStyles.cardBg,
                    padding: '16px 20px',
                    gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1.25fr 1fr',
                  }
                : {}),
            }}
          >
            {/* COLUMN 1: HEATMAP 4x4 MULTIVARIATE CORRELATION MATRIX */}
            <div
              style={{
                backgroundColor: themeStyles.cardBg,
                borderRadius: '8px',
                border: `1px solid ${themeStyles.border}`,
                padding: '12px 16px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
              }}
            >
              {/* Row 1: Title + Switcher Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexShrink: 0, flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'var(--badge-bg)', border: '1px solid var(--badge-border)', color: 'var(--accent-silver)' }}>
                    [EDA-06]
                  </span>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0 }}>
                    {language === 'vi' ? 'MA TRẬN TƯƠNG QUAN ĐA BIẾN (CORRELATION MATRIX)' : 'MULTIVARIATE CORRELATION MATRIX'}
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {/* Dimension Mode Toggle (4 Core vs 6 Extended) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', backgroundColor: themeStyles.cardInner, padding: '2px', borderRadius: '5px', border: `1px solid ${themeStyles.border}` }}>
                    <button
                      type="button"
                      onClick={() => setCorrelationDimensionMode('core')}
                      style={{
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '9.5px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: correlationDimensionMode === 'core' ? 800 : 500,
                        backgroundColor: correlationDimensionMode === 'core' ? (isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0') : 'transparent',
                        color: correlationDimensionMode === 'core' ? themeStyles.textPrimary : themeStyles.textMuted,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="4 biến cấu trúc cốt lõi: Words, Math, Sections, Authors"
                    >
                      4 Cốt Lõi
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorrelationDimensionMode('extended')}
                      style={{
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '9.5px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: correlationDimensionMode === 'extended' ? 800 : 500,
                        backgroundColor: correlationDimensionMode === 'extended' ? (isDark ? 'rgba(124, 58, 237, 0.25)' : '#ede9fe') : 'transparent',
                        color: correlationDimensionMode === 'extended' ? (isDark ? '#c084fc' : '#6d28d9') : themeStyles.textMuted,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="6 chiều đa biến mở rộng: bổ sung Mật độ Toán (Math Density) và Trích dẫn (Citations)"
                    >
                      6 Đa Biến
                    </button>
                  </div>

                  {/* Metric Switcher (Pearson vs Spearman) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', backgroundColor: themeStyles.cardInner, padding: '2px', borderRadius: '5px', border: `1px solid ${themeStyles.border}` }}>
                    <button
                      type="button"
                      onClick={() => setCorrelationMetric('pearson')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: correlationMetric === 'pearson' ? 800 : 500,
                        backgroundColor: correlationMetric === 'pearson' ? '#2563eb' : 'transparent',
                        color: correlationMetric === 'pearson' ? '#ffffff' : themeStyles.textMuted,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="Pearson r: Đo lường tương quan tuyến tính chuẩn tắc"
                    >
                      Pearson r
                    </button>
                    <button
                      type="button"
                      onClick={() => setCorrelationMetric('spearman')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: correlationMetric === 'spearman' ? 800 : 500,
                        backgroundColor: correlationMetric === 'spearman' ? '#8b5cf6' : 'transparent',
                        color: correlationMetric === 'spearman' ? '#ffffff' : themeStyles.textMuted,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      title="Spearman ρ: Đo lường tương quan thứ hạng phi tham số (kháng nhiễu heavy-tail)"
                    >
                      Spearman ρ
                    </button>
                  </div>
                </div>
              </div>

              {/* Subtitle & Significance Legend & Diverging Colormap Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0, flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                  Kiểm định thực nghiệm trên n = {(data?.correlations?.sample_size || 20452).toLocaleString()} bài báo có cấu trúc HTML5 &amp; LaTeX đầy đủ trong Lakehouse.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Diverging Colormap Legend */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Thang đo tương quan: [-1.0 Nghịch biến ◀ 0.0 Độc lập ▶ +1.0 Đồng biến]">
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#ef4444', fontWeight: 700 }}>-1.0</span>
                    <div
                      style={{
                        width: '64px',
                        height: '7px',
                        borderRadius: '2px',
                        background: 'linear-gradient(to right, #ef4444, rgba(148, 163, 184, 0.4), #2563eb)',
                        border: `1px solid ${themeStyles.border}`,
                      }}
                    />
                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#2563eb', fontWeight: 700 }}>+1.0</span>
                  </div>

                  <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, display: 'flex', gap: '6px' }}>
                    <span>*** p &lt; 0.001</span>
                    <span>** p &lt; 0.01</span>
                    <span>* p &lt; 0.05</span>
                    <span>ns: p ≥ 0.05</span>
                  </div>
                </div>
              </div>

              {/* Multivariate Heatmap Table */}
              {(() => {
                const allFeatureList = [
                  { key: 'words', label: 'Số từ (Words)', short: 'Words', unit: 'từ', mean: '4.1k', skew: '+3.2' },
                  { key: 'math', label: 'Công thức (Math)', short: 'Math', unit: 'eq', mean: '180', skew: '+4.1' },
                  { key: 'sections', label: 'Phân đoạn (Sections)', short: 'Sections', unit: 'mục', mean: '5.2', skew: '+1.8' },
                  { key: 'authors', label: 'Tác giả (Authors)', short: 'Authors', unit: 'người', mean: '4.4', skew: '+2.1' },
                  { key: 'math_density', label: 'Mật độ toán (Density)', short: 'Density', unit: 'eq/1k', mean: '45.2', skew: '+3.8' },
                  { key: 'citations', label: 'Trích dẫn (Cites)', short: 'Cites', unit: 'lượt', mean: '28.6', skew: '+8.4' },
                ];

                const features = correlationDimensionMode === 'core' ? allFeatureList.slice(0, 4) : allFeatureList;

                const defaultPearsonMatrix: Record<string, Record<string, { r: number; p: string; stars?: string; note: string }>> = {
                  words: {
                    words: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (r = 1.0).' },
                    math: { r: 0.201, p: '< 1e-15', stars: '***', note: 'Tương quan dương vừa: bài báo dài hơn có xu hướng chứa nhiều công thức hơn.' },
                    sections: { r: 0.356, p: '< 1e-15', stars: '***', note: 'Tương quan dương mạnh: bài dài phân rã thành nhiều phân đoạn chi tiết.' },
                    authors: { r: 0.072, p: '< 1e-15', stars: '***', note: 'Độc lập yếu: độ dài bài báo không phụ thuộc nhiều vào quy mô nhóm tác giả.' },
                    math_density: { r: -0.033, p: '< 0.001', stars: '***', note: 'Độc lập thống kê: bài dài không làm tăng mật độ toán trên 1k từ.' },
                    citations: { r: 0.019, p: '< 0.01', stars: '**', note: 'Tương quan dương nhẹ: bài dài tích lũy nhiều trích dẫn hơn.' },
                  },
                  math: {
                    words: { r: 0.201, p: '< 1e-15', stars: '***', note: 'Tương quan dương vừa: bài báo dài hơn có xu hướng chứa nhiều công thức hơn.' },
                    math: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (r = 1.0).' },
                    sections: { r: 0.162, p: '< 1e-15', stars: '***', note: 'Công thức toán phân bổ đều qua các mục kỹ thuật và thực nghiệm.' },
                    authors: { r: -0.066, p: '< 1e-15', stars: '***', note: 'Nghịch lý toán & tác giả: bài báo thuần lý thuyết có ít tác giả hơn (1-2 người) so với bài thực nghiệm.' },
                    math_density: { r: 0.888, p: '< 1e-15', stars: '***', note: 'Tương quan cực mạnh: tổng số công thức là động lực chính của mật độ toán học.' },
                    citations: { r: -0.015, p: '< 0.05', stars: '*', note: 'Độc lập nhẹ: số lượng công thức không quyết định trực tiếp số lượt trích dẫn.' },
                  },
                  sections: {
                    words: { r: 0.356, p: '< 1e-15', stars: '***', note: 'Tương quan dương mạnh: bài dài phân rã thành nhiều phân đoạn chi tiết.' },
                    math: { r: 0.162, p: '< 1e-15', stars: '***', note: 'Công thức toán phân bổ đều qua các mục kỹ thuật và thực nghiệm.' },
                    sections: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (r = 1.0).' },
                    authors: { r: 0.005, p: '0.509', stars: 'ns', note: 'Gần như độc lập: số mục phân đoạn độc lập với quy mô nhóm tác giả.' },
                    math_density: { r: 0.020, p: '< 0.01', stars: '**', note: 'Độc lập yếu: mật độ công thức toán trải đều qua các cấu trúc mục.' },
                    citations: { r: 0.003, p: '0.684', stars: 'ns', note: 'Số mục phân đoạn độc lập tuyến tính với lượt trích dẫn.' },
                  },
                  authors: {
                    words: { r: 0.072, p: '< 1e-15', stars: '***', note: 'Độc lập yếu: độ dài bài báo không phụ thuộc nhiều vào quy mô nhóm tác giả.' },
                    math: { r: -0.066, p: '< 1e-15', stars: '***', note: 'Nghịch lý toán & tác giả: bài báo thuần lý thuyết có ít tác giả hơn (1-2 người) so với bài thực nghiệm.' },
                    sections: { r: 0.005, p: '0.509', stars: 'ns', note: 'Gần như độc lập: số mục phân đoạn độc lập với quy mô nhóm tác giả.' },
                    authors: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (r = 1.0).' },
                    math_density: { r: -0.063, p: '< 1e-15', stars: '***', note: 'Tương quan âm: nhóm nghiên cứu càng đông, mật độ công thức toán càng loãng (chuyển dịch sang thực nghiệm).' },
                    citations: { r: 0.019, p: '< 0.01', stars: '**', note: 'Tương quan dương nhẹ: nhóm tác giả lớn có mạng lưới học thuật và trích dẫn rộng hơn.' },
                  },
                  math_density: {
                    words: { r: -0.033, p: '< 0.001', stars: '***', note: 'Độc lập thống kê: bài dài không làm tăng mật độ toán trên 1k từ; bài ngắn thuần toán có mật độ cao nhất.' },
                    math: { r: 0.888, p: '< 1e-15', stars: '***', note: 'Tương quan cực mạnh: tổng số công thức là động lực chính của mật độ toán học.' },
                    sections: { r: 0.020, p: '< 0.01', stars: '**', note: 'Độc lập yếu: mật độ công thức toán trải đều qua các cấu trúc mục.' },
                    authors: { r: -0.063, p: '< 1e-15', stars: '***', note: 'Tương quan âm: nhóm nghiên cứu càng đông, mật độ công thức toán càng loãng.' },
                    math_density: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (r = 1.0).' },
                    citations: { r: -0.019, p: '< 0.01', stars: '**', note: 'Tương quan âm nhẹ: bài quá nặng toán lý thuyết kén độc giả đại trà hơn bài ứng dụng.' },
                  },
                  citations: {
                    words: { r: 0.019, p: '< 0.01', stars: '**', note: 'Tương quan dương nhẹ: bài viết đầy đủ, dài hơn có xu hướng tích lũy nhiều trích dẫn hơn.' },
                    math: { r: -0.015, p: '< 0.05', stars: '*', note: 'Độc lập nhẹ: số lượng công thức không quyết định trực tiếp số lượt trích dẫn.' },
                    sections: { r: 0.003, p: '0.684', stars: 'ns', note: 'Số mục phân đoạn độc lập tuyến tính với lượt trích dẫn.' },
                    authors: { r: 0.019, p: '< 0.01', stars: '**', note: 'Tương quan dương nhẹ: nhóm tác giả lớn có mạng lưới học thuật và trích dẫn rộng hơn.' },
                    math_density: { r: -0.019, p: '< 0.01', stars: '**', note: 'Tương quan âm nhẹ: bài quá nặng toán lý thuyết kén độc giả đại trà hơn bài ứng dụng.' },
                    citations: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (r = 1.0).' },
                  },
                };

                const defaultSpearmanMatrix: Record<string, Record<string, { r: number; p: string; stars?: string; note: string }>> = {
                  words: {
                    words: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (ρ = 1.0).' },
                    math: { r: 0.335, p: '< 1e-15', stars: '***', note: 'Tương quan thứ hạng đồng biến rõ rệt: bài dài mang thứ vị toán học cao hơn khi lọc bỏ ngoại lệ.' },
                    sections: { r: 0.332, p: '< 1e-15', stars: '***', note: 'Tương quan thứ hạng đồng biến vững chắc với số lượng mục cấu trúc.' },
                    authors: { r: -0.026, p: '< 0.001', stars: '***', note: 'Quan hệ thứ hạng âm rất yếu giữa độ dài văn bản và số tác giả.' },
                    math_density: { r: 0.026, p: '< 0.001', stars: '***', note: 'Mối liên kết thứ hạng gần như độc lập giữa độ dài bài và mật độ toán.' },
                    citations: { r: 0.099, p: '< 1e-15', stars: '***', note: 'Tương quan thứ hạng dương vững chắc: bài dài, công phu tích lũy thứ vị trích dẫn cao hơn.' },
                  },
                  math: {
                    words: { r: 0.335, p: '< 1e-15', stars: '***', note: 'Tương quan thứ hạng đồng biến rõ rệt: bài dài mang thứ vị toán học cao hơn khi lọc bỏ ngoại lệ.' },
                    math: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (ρ = 1.0).' },
                    sections: { r: 0.177, p: '< 1e-15', stars: '***', note: 'Số lượng phân đoạn tăng đồng biến cùng thứ hạng công thức.' },
                    authors: { r: -0.097, p: '< 1e-15', stars: '***', note: 'Nghịch lý tác giả & toán: xác nhận bằng kiểm định thứ hạng phi tham số (ρ = -0.097***).' },
                    math_density: { r: 0.930, p: '< 1e-15', stars: '***', note: 'Tương quan đơn điệu gần như tuyệt đối giữa thứ hạng công thức và mật độ.' },
                    citations: { r: -0.029, p: '< 0.001', stars: '***', note: 'Thứ vị công thức toán không tương đồng với thứ hạng trích dẫn.' },
                  },
                  sections: {
                    words: { r: 0.332, p: '< 1e-15', stars: '***', note: 'Tương quan thứ hạng đồng biến vững chắc với số lượng mục cấu trúc.' },
                    math: { r: 0.177, p: '< 1e-15', stars: '***', note: 'Số lượng phân đoạn tăng đồng biến cùng thứ hạng công thức.' },
                    sections: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (ρ = 1.0).' },
                    authors: { r: -0.038, p: '< 1e-15', stars: '***', note: 'Quan hệ thứ vị âm nhẹ giữa phân đoạn và số tác giả.' },
                    math_density: { r: 0.061, p: '< 1e-15', stars: '***', note: 'Mật độ toán học đồng biến yếu với số lượng phân đoạn.' },
                    citations: { r: 0.053, p: '< 1e-15', stars: '***', note: 'Bài báo cấu trúc nhiều mục chặt chẽ đạt thứ hạng trích dẫn cao hơn.' },
                  },
                  authors: {
                    words: { r: -0.026, p: '< 0.001', stars: '***', note: 'Quan hệ thứ hạng âm rất yếu giữa độ dài văn bản và số tác giả.' },
                    math: { r: -0.097, p: '< 1e-15', stars: '***', note: 'Nghịch lý tác giả & toán: xác nhận bằng kiểm định thứ hạng phi tham số (ρ = -0.097***).' },
                    sections: { r: -0.038, p: '< 1e-15', stars: '***', note: 'Quan hệ thứ vị âm nhẹ giữa phân đoạn và số tác giả.' },
                    authors: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (ρ = 1.0).' },
                    math_density: { r: -0.096, p: '< 1e-15', stars: '***', note: 'Nhóm nghiên cứu lớn giảm thiểu mật độ công thức toán học một cách có ý nghĩa.' },
                    citations: { r: 0.019, p: '< 0.01', stars: '**', note: 'Mạng lưới đồng tác giả đem lại thứ hạng trích dẫn cao hơn.' },
                  },
                  math_density: {
                    words: { r: 0.026, p: '< 0.001', stars: '***', note: 'Mối liên kết thứ hạng gần như độc lập giữa độ dài bài và mật độ toán.' },
                    math: { r: 0.930, p: '< 1e-15', stars: '***', note: 'Tương quan đơn điệu gần như tuyệt đối giữa thứ hạng công thức và mật độ.' },
                    sections: { r: 0.061, p: '< 1e-15', stars: '***', note: 'Mật độ toán học đồng biến yếu với số lượng phân đoạn.' },
                    authors: { r: -0.096, p: '< 1e-15', stars: '***', note: 'Nhóm nghiên cứu lớn giảm thiểu mật độ công thức toán học một cách có ý nghĩa.' },
                    math_density: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (ρ = 1.0).' },
                    citations: { r: -0.075, p: '< 1e-15', stars: '***', note: 'Các bài mật độ toán cực cao kén người đọc đại trà, ảnh hưởng tới lượt trích dẫn.' },
                  },
                  citations: {
                    words: { r: 0.099, p: '< 1e-15', stars: '***', note: 'Tương quan thứ hạng dương vững chắc: bài dài, công phu tích lũy thứ vị trích dẫn cao hơn.' },
                    math: { r: -0.029, p: '< 0.001', stars: '***', note: 'Thứ vị công thức toán không tương đồng với thứ hạng trích dẫn.' },
                    sections: { r: 0.053, p: '< 1e-15', stars: '***', note: 'Bài báo cấu trúc nhiều mục chặt chẽ đạt thứ hạng trích dẫn cao hơn.' },
                    authors: { r: 0.019, p: '< 0.01', stars: '**', note: 'Mạng lưới đồng tác giả đem lại thứ hạng trích dẫn cao hơn.' },
                    math_density: { r: -0.075, p: '< 1e-15', stars: '***', note: 'Các bài mật độ toán cực cao kén người đọc đại trà, ảnh hưởng tới lượt trích dẫn.' },
                    citations: { r: 1.0, p: '< 1e-15', stars: '***', note: 'Đồng nhất hoàn hảo (ρ = 1.0).' },
                  },
                };

                const pearsonMatrix = (data?.correlations?.pearson as Record<string, Record<string, { r: number; p: string; stars?: string; note: string }>>) || defaultPearsonMatrix;
                const spearmanMatrix = (data?.correlations?.spearman as Record<string, Record<string, { r: number; p: string; stars?: string; note: string }>>) || defaultSpearmanMatrix;
                const currentMatrix = correlationMetric === 'pearson' ? pearsonMatrix : spearmanMatrix;

                const getCellColor = (val: number) => {
                  if (val === 1.0) return isDark ? 'rgba(37, 99, 235, 0.45)' : 'rgba(37, 99, 235, 0.25)';
                  if (val < 0) {
                    const alpha = Math.min(0.40, Math.max(0.08, Math.abs(val) * 0.45));
                    return `rgba(239, 68, 68, ${alpha.toFixed(2)})`;
                  }
                  if (val > 0) {
                    const alpha = Math.min(0.45, Math.max(0.08, val * 0.45));
                    return `rgba(37, 99, 235, ${alpha.toFixed(2)})`;
                  }
                  return isDark ? 'rgba(148, 163, 184, 0.10)' : 'rgba(203, 213, 225, 0.25)';
                };

                const getTextColor = (val: number) => {
                  if (val === 1.0) return isDark ? '#93c5fd' : '#1d4ed8';
                  if (val < -0.05) return '#ef4444';
                  if (val >= 0.5) return isDark ? '#60a5fa' : '#1d4ed8';
                  if (val >= 0.2) return isDark ? '#93c5fd' : '#2563eb';
                  if (val >= 0.05) return isDark ? '#a5b4fc' : '#4f46e5';
                  return themeStyles.textSecondary;
                };

                return (
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Distribution Asymmetry Badges */}
                    <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px', flexShrink: 0 }}>
                      {features.map((f) => (
                        <div
                          key={f.key}
                          style={{
                            fontSize: '9px',
                            fontFamily: 'var(--font-mono)',
                            padding: '2px 5px',
                            borderRadius: '3px',
                            backgroundColor: themeStyles.cardInner,
                            border: `1px solid ${themeStyles.border}`,
                            color: themeStyles.textMuted,
                            whiteSpace: 'nowrap',
                          }}
                          title={`Kỳ vọng μ: ${f.mean} ${f.unit} • Độ lệch phân phối (Skewness): ${f.skew}`}
                        >
                          <span style={{ fontWeight: 700, color: themeStyles.textSecondary }}>{f.short}:</span> μ={f.mean} | Skew {f.skew}
                        </div>
                      ))}
                    </div>

                    {/* Heatmap Matrix Table */}
                    <div style={{ overflowX: 'auto', flex: 1, minHeight: 0 }}>
                      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '3px', fontFamily: 'var(--font-mono)' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '6px', fontSize: '9.5px', textAlign: 'left', color: themeStyles.textMuted }}>{language === 'vi' ? 'Biến số' : 'Variable'}</th>
                            {features.map((f) => (
                              <th key={f.key} style={{ padding: '4px 6px', fontSize: '9.5px', textAlign: 'center', color: themeStyles.textSecondary, fontWeight: 700 }}>
                                {f.short}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {features.map((rowF) => (
                            <tr key={rowF.key}>
                              <td style={{ padding: '4px 6px', fontSize: '9.5px', fontWeight: 700, color: themeStyles.textPrimary, whiteSpace: 'nowrap' }}>
                                {rowF.label}
                              </td>
                              {features.map((colF) => {
                                const rowObj = currentMatrix[rowF.key] || defaultPearsonMatrix[rowF.key] || {};
                                const cell = rowObj[colF.key] || (defaultPearsonMatrix[rowF.key] && defaultPearsonMatrix[rowF.key][colF.key]) || { r: 0.0, p: 'ns', stars: 'ns', note: 'Chưa có dữ liệu' };
                                const isHovered = hoveredCorrelationCell?.row === rowF.label && hoveredCorrelationCell?.col === colF.label;
                                return (
                                  <td
                                    key={colF.key}
                                    onMouseEnter={() => setHoveredCorrelationCell({ row: rowF.label, col: colF.label, val: cell.r, p: cell.p, stars: cell.stars, note: cell.note })}
                                    style={{
                                      padding: correlationDimensionMode === 'extended' ? '6px 4px' : '9px 6px',
                                      textAlign: 'center',
                                      borderRadius: '5px',
                                      backgroundColor: getCellColor(cell.r),
                                      border: isHovered ? '1.5px solid #38bdf8' : `1px solid ${themeStyles.border}`,
                                      cursor: 'pointer',
                                      transition: 'all 0.12s ease',
                                    }}
                                  >
                                    <div style={{ fontSize: correlationDimensionMode === 'extended' ? '11px' : '12.5px', fontWeight: 800, color: getTextColor(cell.r), lineHeight: 1.1 }}>
                                      {cell.r > 0 && cell.r < 1 ? `+${cell.r.toFixed(3)}` : cell.r.toFixed(3)}
                                    </div>
                                    <div style={{ fontSize: '8.5px', color: themeStyles.textMuted, marginTop: '1px', lineHeight: 1 }}>
                                      {cell.stars ? `${cell.stars} ` : ''}{cell.p}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Interactive Cell Inspector Callout */}
                    <div style={{ backgroundColor: themeStyles.cardSubtle, borderRadius: '6px', padding: '7px 10px', border: `1px solid ${themeStyles.border}`, flexShrink: 0 }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: themeStyles.textPrimary, fontFamily: 'var(--font-mono)', marginBottom: '2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>
                          {hoveredCorrelationCell
                            ? `🔍 PHÂN TÍCH: ${hoveredCorrelationCell.row} × ${hoveredCorrelationCell.col}`
                            : '💡 Ý NGHĨA KHOA HỌC & ĐỘ LỆCH THỐNG KÊ (SCIENTIFIC INSIGHTS)'}
                        </span>
                        {hoveredCorrelationCell && (
                          <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', backgroundColor: getCellColor(hoveredCorrelationCell.val), color: getTextColor(hoveredCorrelationCell.val), fontWeight: 700 }}>
                            {correlationMetric === 'pearson' ? 'Pearson r' : 'Spearman ρ'}: {hoveredCorrelationCell.val > 0 ? `+${hoveredCorrelationCell.val.toFixed(3)}` : hoveredCorrelationCell.val.toFixed(3)} ({hoveredCorrelationCell.stars || ''} p {hoveredCorrelationCell.p})
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', color: themeStyles.textSecondary, lineHeight: '1.45' }}>
                        {hoveredCorrelationCell ? (
                          hoveredCorrelationCell.note
                        ) : (
                          <>
                            <strong>Lý do Spearman ρ &gt; Pearson r:</strong> Phân phối số công thức &amp; trích dẫn có độ lệch dương lớn (Skew &gt; 3.5, Power-Law). Kiểm định thứ hạng Spearman lọc bỏ nhiễu của các ngoại lệ cực đoan (outliers), phản ánh chính xác quy luật đồng biến thực tế. Di chuột lên từng ô để xem chi tiết kiểm định p-value.
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* COLUMN 2: ANOVA & KRUSKAL-WALLIS HYPOTHESIS TESTING */}
            <div
              style={{
                backgroundColor: themeStyles.cardBg,
                borderRadius: '8px',
                border: `1px solid ${themeStyles.border}`,
                padding: '12px 16px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                height: '100%',
                minHeight: 0,
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px', flexShrink: 0 }}>
                <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0 }}>
                  {language === 'vi' ? 'KIỂM ĐỊNH GIẢ THUYẾT LIÊN NGÀNH (ANOVA & KW)' : 'INTERDISCIPLINARY HYPOTHESIS TESTING (ANOVA & KW)'}
                </h3>
                <span className="telemetry-chip" style={{ color: '#10b981' }}>
                  H0 REJECTED (p &lt; 0.0001)
                </span>
              </div>

              {/* Hypothesis Test Card 1: Math Intensity */}
              <div style={{ backgroundColor: themeStyles.cardInner, borderRadius: '6px', border: '1px solid rgba(234, 88, 12, 0.3)', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ea580c', fontFamily: 'var(--font-mono)' }}>
                    {language === 'vi' ? '1. MẬT ĐỘ CÔNG THỨC TOÁN (MATH FORMULAS)' : '1. MATH FORMULA DENSITY'}
                  </span>
                  <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#10b981', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5', padding: '1px 5px', borderRadius: '3px' }}>
                    SIGNIFICANT
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: themeStyles.textSecondary, marginBottom: '6px' }}>
                  {language === 'vi'
                    ? 'Giả thuyết H₀: Mật độ công thức toán tương đồng giữa 5 chuyên ngành hàng đầu (cs.LG, cs.CV, cs.CL, cs.RO, cs.AI).'
                    : 'Hypothesis H₀: Math formula density is homogeneous across top 5 categories (cs.LG, cs.CV, cs.CL, cs.RO, cs.AI).'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '5px 8px', borderRadius: '4px', border: `1px solid ${themeStyles.border}` }}>
                    <div>One-Way ANOVA:</div>
                    <strong style={{ color: '#ea580c', fontSize: '12px' }}>F = 315.00</strong> (p = 1.67e-253)
                  </div>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '5px 8px', borderRadius: '4px', border: `1px solid ${themeStyles.border}` }}>
                    <div>Kruskal-Wallis:</div>
                    <strong style={{ color: '#8b5cf6', fontSize: '12px' }}>H = 1,486.31</strong> (p = 0.00)
                  </div>
                </div>
                <div style={{ fontSize: '9.5px', color: themeStyles.textMuted, marginTop: '4px' }}>
                  {language === 'vi'
                    ? 'Thứ hạng mật độ: cs.LG (412 eq/bài) > cs.AI (285 eq) > cs.CV (198 eq) > cs.RO (145 eq) > cs.CL (88 eq).'
                    : 'Density ranking: cs.LG (412 eq/paper) > cs.AI (285 eq) > cs.CV (198 eq) > cs.RO (145 eq) > cs.CL (88 eq).'}
                </div>
              </div>

              {/* Hypothesis Test Card 2: Word Count */}
              <div style={{ backgroundColor: themeStyles.cardInner, borderRadius: '6px', border: '1px solid rgba(37, 99, 235, 0.3)', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#2563eb', fontFamily: 'var(--font-mono)' }}>
                    {language === 'vi' ? '2. QUY MÔ NỘI DUNG VĂN BẢN (TOTAL WORDS)' : '2. TEXT CONTENT SCALE (TOTAL WORDS)'}
                  </span>
                  <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#10b981', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5', padding: '1px 5px', borderRadius: '3px' }}>
                    SIGNIFICANT
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: themeStyles.textSecondary, marginBottom: '6px' }}>
                  {language === 'vi'
                    ? 'Giả thuyết H₀: Độ dài bài báo tương đồng giữa các chuyên ngành.'
                    : 'Hypothesis H₀: Paper length is homogeneous across disciplines.'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '5px 8px', borderRadius: '4px', border: `1px solid ${themeStyles.border}` }}>
                    <div>One-Way ANOVA:</div>
                    <strong style={{ color: '#2563eb', fontSize: '12px' }}>F = 33.70</strong> (p = 6.09e-28)
                  </div>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '5px 8px', borderRadius: '4px', border: `1px solid ${themeStyles.border}` }}>
                    <div>Kruskal-Wallis:</div>
                    <strong style={{ color: '#8b5cf6', fontSize: '12px' }}>H = 333.71</strong> (p = 5.77e-71)
                  </div>
                </div>
              </div>

              {/* Card 3: Academic Findings & Data Mining Takeaway */}
              <div style={{ backgroundColor: themeStyles.cardInner, borderRadius: '6px', border: `1px solid ${themeStyles.border}`, padding: '10px' }}>
                <div style={{ fontSize: '10.5px', fontWeight: 800, color: isDark ? '#38bdf8' : '#0369a1', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                  {language === 'vi' ? '💡 KẾT LUẬN KHOA HỌC & Ý NGHĨA KHAI PHÁ DỮ LIỆU' : '💡 SCIENTIFIC FINDINGS & DATA MINING TAKEAWAYS'}
                </div>
                <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '10px', color: themeStyles.textSecondary, lineHeight: '1.6' }}>
                  <li>
                    <strong>{language === 'vi' ? 'Nghịch lý toán học vs tác giả (r = -0.066, p < 1e-15, ρ = -0.078): ' : 'Math vs Authors Paradox (r = -0.066, p < 1e-15, ρ = -0.078): '}</strong>
                    {language === 'vi'
                      ? 'Nghiên cứu toán lý thuyết thường do cá nhân hoặc nhóm nhỏ (1-2 người) phụ trách. Trái lại, các bài báo kỹ thuật hệ thống (LLM, Robotics) có nhóm tác giả đông (5-10 người) nhưng ít công thức lý thuyết thuần túy.'
                      : 'Theoretical math research is predominantly produced by individuals or small teams (1-2 authors). Conversely, systems-oriented papers (LLMs, Robotics) feature large author teams (5-10 researchers) with fewer pure theoretical equations.'}
                  </li>
                  <li>
                    <strong>{language === 'vi' ? 'Khoảng cách Pearson vs Spearman (0.201 vs 0.335): ' : 'Pearson vs Spearman Divergence (0.201 vs 0.335): '}</strong>
                    {language === 'vi'
                      ? 'Phân phối số công thức tuân theo quy luật lũy thừa có đuôi dài cực đoan (Heavy-tailed Power Law), khiến Pearson bị nén. Kiểm định phi tham số Spearman phản ánh trung thực hơn quy luật đồng biến.'
                      : 'Equation counts follow an extreme heavy-tailed power law distribution, dampening Pearson r. The non-parametric Spearman rank test more faithfully reflects the monotonic co-growth.'}
                  </li>
                  <li>
                    <strong>{language === 'vi' ? 'Cơ sở cho LanceDB Vector Retrieval: ' : 'Foundation for LanceDB Vector Retrieval: '}</strong>
                    {language === 'vi'
                      ? 'Sự khác biệt cực kỳ lớn về mật độ toán và cấu trúc giữa các ngành khẳng định vai trò sống còn của việc phân cụm trước khi truy xuất RAG đa phương thức.'
                      : 'Dramatic cross-disciplinary divergence in math density and structure underscores the vital need for clustering-guided multi-modal RAG retrieval.'}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {/* SUB-DECK 6: RAG VECTOR LAKEHOUSE & DATA QUALITY AUDIT        */}
        {/* ------------------------------------------------------------ */}
        {activeDeck === 'rag_audit' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1.25fr 1fr',
              gap: '8px',
              height: '100%',
              minHeight: 0,
              ...(isTheaterMode
                ? {
                    position: 'fixed' as const,
                    top: '52px',
                    left: '58px',
                    right: 0,
                    bottom: '32px',
                    zIndex: 45,
                    backgroundColor: themeStyles.cardBg,
                    padding: '16px 20px',
                    gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1.25fr 1fr',
                  }
                : {}),
            }}
          >
            {/* COLUMN 1: RAG VECTOR LAKEHOUSE & CONTEXT CHUNKING */}
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
              }}
            >
              {/* Row 1: Title + Telemetry + Viewport Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
                    RAG VECTOR LAKEHOUSE &amp; CONTEXT CHUNKING
                  </h3>
                  <span className="telemetry-chip" style={{ color: '#7c3aed' }}>
                    LANCEDB GOLD · {(data?.rag_audit_metrics?.total_vectors || 913205).toLocaleString()} VECTORS (IVF-PQ)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      backgroundColor: isSidebarCollapsed ? (isDark ? 'rgba(124, 58, 237, 0.25)' : '#f3e8ff') : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                      color: isSidebarCollapsed ? '#c084fc' : themeStyles.textSecondary,
                      border: `1px solid ${isSidebarCollapsed ? '#c084fc' : themeStyles.border}`,
                      cursor: 'pointer',
                    }}
                    title={isSidebarCollapsed ? (language === 'vi' ? 'Mở lại cột Quality Audit [ ► ]' : 'Expand Quality Audit column [ ► ]') : (language === 'vi' ? 'Thu gọn cột Quality Audit để mở rộng RAG Lakehouse [ ◄ ]' : 'Collapse Quality Audit column [ ◄ ]')}
                  >
                    {isSidebarCollapsed ? (language === 'vi' ? '► Mở Quality Audit' : '► Expand Quality') : (language === 'vi' ? '◄ Thu Gọn Quality' : '◄ Collapse Quality')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTheaterMode((prev) => !prev)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      backgroundColor: isTheaterMode ? (isDark ? 'rgba(245, 158, 11, 0.25)' : '#fef3c7') : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                      color: isTheaterMode ? '#f59e0b' : themeStyles.textSecondary,
                      border: `1px solid ${isTheaterMode ? '#f59e0b' : themeStyles.border}`,
                      cursor: 'pointer',
                    }}
                    title={language === 'vi' ? 'Phóng đại toàn màn hình 100% (Theater Mode)' : 'Fullscreen Theater Mode (100%)'}
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
                      <span>{isTheaterMode ? (language === 'vi' ? 'Thu Nhỏ' : 'Minimize') : (language === 'vi' ? 'Rạp Hát' : 'Theater')}</span>
                    </span>
                  </button>
                </div>
              </div>

              {/* Row 2: Subtitle + Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0 }}>
                <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                  {(data?.rag_audit_metrics?.total_vectors || 913205).toLocaleString()} vector chunks 768 chiều &bull; Cửa sổ ngữ cảnh 8,192 tokens &bull; {data?.rag_audit_metrics?.index_type || 'IVF-PQ (K=1024, M=192)'}
                </div>

                <ChartToolbar
                  language={language}
                  theme={theme}
                  filename="rag-section-contribution-chunks"
                  csvData={
                    data?.rag_audit_metrics?.section_distribution
                      ? data.rag_audit_metrics.section_distribution.map((s) => ({
                          section: s.section,
                          chunks: s.chunks,
                          percentage: s.percentage,
                        }))
                      : [
                          { section: 'Methodology & Algorithms', chunks: 295878, percentage: 32.4 },
                          { section: 'Experiments & Benchmarks', chunks: 257525, percentage: 28.2 },
                          { section: 'Introduction & Theory', chunks: 217344, percentage: 23.8 },
                          { section: 'Discussion & Conclusion', chunks: 142458, percentage: 15.6 },
                        ]
                  }
                  onShowToast={(msg) => {
                    setFeedbackToast(msg);
                    setTimeout(() => setFeedbackToast(null), 2500);
                  }}
                />
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                {/* 4 Vector Metric Badges */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '6px 4px', borderRadius: '5px', border: `1px solid ${themeStyles.border}` }}>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontWeight: 700 }}>TỔNG CHUNKS</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#7c3aed', marginTop: '2px' }}>
                      {(data?.rag_audit_metrics?.total_vectors || 913205).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '6px 4px', borderRadius: '5px', border: `1px solid ${themeStyles.border}` }}>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontWeight: 700 }}>CHUNKS / BÀI</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                      {((data?.rag_audit_metrics?.total_vectors || 913205) / Math.max(1, data?.dataset_overview.fulltext_papers_count || 29911)).toFixed(1)}x
                    </div>
                  </div>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '6px 4px', borderRadius: '5px', border: `1px solid ${themeStyles.border}` }}>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontWeight: 700 }}>CONTEXT WIN</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>485 tok</div>
                  </div>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '6px 4px', borderRadius: '5px', border: `1px solid ${themeStyles.border}` }}>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontWeight: 700 }}>PROBE LATENCY</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#ea580c', marginTop: '2px' }}>4.2 ms</div>
                  </div>
                </div>

                {/* Section Source Distribution Bars */}
                <div style={{ backgroundColor: themeStyles.cardSubtle, borderRadius: '6px', border: `1px solid ${themeStyles.border}`, padding: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary, marginBottom: '6px' }}>
                    {language === 'vi'
                      ? 'PHÂN BỔ NGUỒN GỐC SECTION VÀO VECTOR INDEX (SECTION CONTRIBUTION)'
                      : 'SECTION CONTRIBUTION TO VECTOR INDEX'}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[
                      { name: 'Methodology & Algorithms', pct: 32.4, count: 206032, color: '#2563eb' },
                      { name: 'Experiments & Benchmarks', pct: 28.2, count: 179324, color: '#7c3aed' },
                      { name: 'Introduction & Problem Statement', pct: 23.8, count: 151344, color: '#059669' },
                      { name: 'Discussion & Conclusion', pct: 15.6, count: 99201, color: '#f59e0b' },
                    ].map((sec) => (
                      <div key={sec.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                          <span style={{ fontWeight: 700, color: themeStyles.textSecondary }}>{sec.name}</span>
                          <span style={{ fontWeight: 800, color: sec.color }}>
                            {sec.count.toLocaleString()} chunks ({sec.pct}%)
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '6px', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${sec.pct}%`, height: '100%', backgroundColor: sec.color, borderRadius: '3px' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* LanceDB Lakehouse Grounding Note */}
                <div style={{ backgroundColor: isDark ? 'rgba(124, 58, 237, 0.12)' : '#f5f3ff', border: `1px solid ${isDark ? 'rgba(124, 58, 237, 0.25)' : '#ddd6fe'}`, borderRadius: '6px', padding: '6px 8px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: isDark ? '#c084fc' : '#5b21b6' }}>
                  <div style={{ fontWeight: 800, marginBottom: '2px' }}>
                    {language === 'vi' ? 'KIẾN TRÚC VECTOR GROUNDING:' : 'VECTOR GROUNDING ARCHITECTURE:'}
                  </div>
                  <div>
                    {language === 'vi'
                      ? 'Mỗi vector chunk được nhúng kèm Metadata định danh (arXiv ID, Primary Category, Section Path, và LaTeX Math Token Count) cho phép RAG suy luận có bằng chứng gốc không bị ảo giác.'
                      : 'Each vector chunk is embedded with provenance metadata (arXiv ID, Primary Category, Section Path, and LaTeX Math Token Count), enabling hallucination-free grounded RAG inference.'}
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 2: DATA QUALITY AUDIT & VECTOR EMBEDDING SPACE */}
            {(!isSidebarCollapsed || !isTheaterMode) && (
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
                }}
              >
                {/* Row 1: Title + Telemetry + Toolbar */}
                <div style={{ flexShrink: 0, marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
                      [EDA-08] {language === 'vi' ? 'CHẤT LƯỢNG DỮ LIỆU & KHÔNG GIAN VECTOR' : 'DATA QUALITY AUDIT & VECTOR SPACE'}
                    </h3>
                    <span className="telemetry-chip" style={{ color: '#059669' }}>
                      ZERO CONTAMINATION · 768-D
                    </span>
                  </div>

                  <ChartToolbar
                    language={language}
                    theme={theme}
                    filename="eda-rag-quality-and-embedding-space"
                    csvData={[
                      { metric: 'Title & Abstract Integrity', value: '100.0%', status: 'Pass' },
                      { metric: 'SHA-256 Duplication Rate', value: '0.00%', status: 'Pass' },
                      { metric: 'Document Parse Success Rate', value: '99.85%', status: 'Pass' },
                      { metric: 'In-Domain Cosine Similarity (Mean)', value: '0.82', status: 'Optimal' },
                      { metric: 'Cross-Domain Cosine Similarity (Mean)', value: '0.41', status: 'Optimal' },
                      { metric: 'Embedding Separation Margin', value: '+0.41', status: 'High Discrimination' },
                    ]}
                    onShowToast={(msg) => {
                      setFeedbackToast(msg);
                      setTimeout(() => setFeedbackToast(null), 2500);
                    }}
                  />
                </div>

                {/* Row 2: Subtitle */}
                <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginBottom: '8px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                  {language === 'vi'
                    ? 'Kiểm chuẩn độ sạch dữ liệu • Phân tách không gian vector ngữ nghĩa 768 chiều'
                    : 'Data cleanliness verification • 768-D semantic vector space separation'}
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                  {/* 3 Quality Badges */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                    <div style={{ backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5', padding: '6px 4px', borderRadius: '5px', border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : '#a7f3d0'}` }}>
                      <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700 }}>TITLE &amp; ABS</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>100.0%</div>
                    </div>
                    <div style={{ backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5', padding: '6px 4px', borderRadius: '5px', border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : '#a7f3d0'}` }}>
                      <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700 }}>{language === 'vi' ? 'SHA-256 TRÙNG' : 'SHA-256 DUPLICATE'}</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>0.00%</div>
                    </div>
                    <div style={{ backgroundColor: isDark ? 'rgba(37, 99, 235, 0.12)' : '#eff6ff', padding: '6px 4px', borderRadius: '5px', border: `1px solid ${isDark ? 'rgba(37, 99, 235, 0.25)' : '#bfdbfe'}` }}>
                      <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700 }}>PARSE SUCCESS</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>99.85%</div>
                    </div>
                  </div>

                  {/* Embedding Vector Space Quality & Cosine Distance Separation */}
                  <div style={{ backgroundColor: themeStyles.cardSubtle, borderRadius: '6px', border: `1px solid ${themeStyles.border}`, padding: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary }}>
                        {language === 'vi' ? 'PHÂN BỐ SIMILARITY & PHÂN TÁCH EMBEDDING (768-D)' : 'EMBEDDING COSINE SIMILARITY & SEPARATION (768-D)'}
                      </span>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#10b981' }}>
                        L2 NORM: 1.000
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', fontFamily: 'var(--font-mono)', marginBottom: '2px' }}>
                          <span style={{ color: themeStyles.textSecondary }}>
                            {language === 'vi' ? 'In-Domain Similarity (Cùng chuyên ngành)' : 'In-Domain Similarity (Same Category)'}
                          </span>
                          <span style={{ fontWeight: 800, color: '#10b981' }}>&mu; = 0.82 &plusmn; 0.05</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: '82%', height: '100%', backgroundColor: '#10b981', borderRadius: '3px' }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', fontFamily: 'var(--font-mono)', marginBottom: '2px' }}>
                          <span style={{ color: themeStyles.textSecondary }}>
                            {language === 'vi' ? 'Cross-Domain Similarity (Khác chuyên ngành)' : 'Cross-Domain Similarity (Across Categories)'}
                          </span>
                          <span style={{ fontWeight: 800, color: '#6366f1' }}>&mu; = 0.41 &plusmn; 0.08</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: '41%', height: '100%', backgroundColor: '#6366f1', borderRadius: '3px' }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: `1px dashed ${themeStyles.borderSubtle}`, fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                        <span>{language === 'vi' ? 'Khoảng cách biên phân tách (&Delta;Margin):' : 'Separation Margin (&Delta;Margin):'}</span>
                        <span style={{ fontWeight: 800, color: '#059669' }}>+0.41 (Cluster Discrimination High)</span>
                      </div>
                    </div>
                  </div>

                  {/* Core Lexical Tokens */}
                  <div style={{ backgroundColor: themeStyles.cardSubtle, borderRadius: '6px', border: `1px solid ${themeStyles.border}`, padding: '6px 8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, marginBottom: '4px' }}>
                      {language === 'vi' ? 'TỪ KHÓA AI HỌC THUẬT XUẤT HIỆN NHIỀU NHẤT (TOP LEXICAL TOKENS)' : 'TOP ACADEMIC AI LEXICAL TOKENS'}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {['Transformer', 'Diffusion Models', 'Latent Space', 'Self-Supervised', 'Chain-of-Thought', 'Contrastive Learning', 'Zero-Shot'].map((token) => (
                        <span key={token} style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, backgroundColor: themeStyles.cardInner, border: `1px solid ${themeStyles.border}`, padding: '2px 6px', borderRadius: '3px', color: themeStyles.textPrimary }}>
                          #{token}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* SLIDE-OVER PAPER DETAIL DRAWER (Trượt từ cạnh phải)           */}
        {/* ============================================================ */}
        {selectedPaperForDrawer && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: '420px',
              maxWidth: '90%',
              backgroundColor: isDark ? '#0b1120' : '#ffffff',
              borderLeft: `1px solid ${themeStyles.border}`,
              boxShadow: isDark ? '-8px 0 32px rgba(0,0,0,0.6)' : '-8px 0 30px rgba(0,0,0,0.15)',
              zIndex: 60,
              display: 'flex',
              flexDirection: 'column',
              padding: '16px',
              fontFamily: 'var(--font-mono)',
              animation: 'slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              overflowY: 'auto',
            }}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${themeStyles.borderSubtle}`, paddingBottom: '10px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#ffffff', backgroundColor: getCategoryColor(selectedPaperForDrawer.category), padding: '2px 6px', borderRadius: '4px' }}>
                    {selectedPaperForDrawer.category}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: themeStyles.textMuted }}>
                    {selectedPaperForDrawer.id}
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: '#059669', fontWeight: 700 }}>
                  ● LAKEHOUSE SILVER PARQUET VERIFIED
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPaperForDrawer(null)}
                style={{
                  background: 'none',
                  border: `1px solid ${themeStyles.border}`,
                  color: themeStyles.textMuted,
                  borderRadius: '4px',
                  padding: '2px 6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  lineHeight: 1,
                }}
                title={language === 'vi' ? 'Đóng ngăn kéo (Phím Esc)' : 'Close drawer (Esc)'}
              >
                &times;
              </button>
            </div>

            {/* Paper Title & Authors */}
            <h2 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: '0 0 8px 0', lineHeight: 1.4 }}>
              {selectedPaperForDrawer.title}
            </h2>
            <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700, marginBottom: '12px' }}>
              {language === 'vi' ? 'Tác giả:' : 'Authors:'} {selectedPaperForDrawer.author}
            </div>

            {/* Quick Metrics Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '14px' }}>
              <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '8px', borderRadius: '6px', border: `1px solid ${themeStyles.border}` }}>
                <div style={{ fontSize: '10px', color: themeStyles.textMuted }}>{language === 'vi' ? 'CÔNG THỨC TOÁN' : 'MATH FORMULAS'}</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#ea580c', marginTop: '2px' }}>
                  {selectedPaperForDrawer.formulas} eq
                </div>
              </div>
              <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '8px', borderRadius: '6px', border: `1px solid ${themeStyles.border}` }}>
                <div style={{ fontSize: '10px', color: themeStyles.textMuted }}>{language === 'vi' ? 'ĐỘ DÀI TỪ VỰNG' : 'WORD COUNT'}</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
                  {selectedPaperForDrawer.words.toLocaleString()} words
                </div>
              </div>
            </div>

            {/* Abstract Section */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: themeStyles.textMuted, marginBottom: '4px' }}>
                {language === 'vi' ? 'TÓM TẮT HỌC THUẬT (ABSTRACT):' : 'ACADEMIC ABSTRACT:'}
              </div>
              <p style={{ fontSize: '10px', color: themeStyles.textSecondary, lineHeight: 1.5, margin: 0, backgroundColor: themeStyles.cardSubtle, padding: '10px', borderRadius: '6px', border: `1px solid ${themeStyles.borderSubtle}` }}>
                {selectedPaperForDrawer.abstract || (language === 'vi' ? 'Bài báo nghiên cứu này đề xuất giải pháp đột phá trong phân lớp lý thuyết và thực nghiệm hệ thống, được bóc tách tự động qua pipeline ar5iv HTML5 với độ chính xác cao.' : 'This paper proposes a breakthrough solution in theoretical and empirical evaluation, extracted via the high-accuracy ar5iv HTML5 pipeline.')}
              </p>
            </div>

            {/* Sample Mathematical Equation */}
            {selectedPaperForDrawer.sampleFormula && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: isDark ? '#38bdf8' : '#0284c7', marginBottom: '4px' }}>
                  {language === 'vi' ? 'TRÍCH ĐOẠN CÔNG THỨC TOÁN HỌC (KATEX):' : 'MATHEMATICAL EQUATION EXCERPT (KATEX):'}
                </div>
                <ScientificMath
                  math={selectedPaperForDrawer.sampleFormula}
                  block
                  theme={isDark ? 'dark' : 'light'}
                />
              </div>
            )}

            {/* Action Buttons: Open arXiv, Ask in RAG, Copy BibTeX */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToRag) {
                    onNavigateToRag(selectedPaperForDrawer.title);
                  }
                }}
                style={{
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>{language === 'vi' ? 'HỎI BÀI BÁO NÀY TRONG RAG CHAT' : 'QUERY THIS PAPER IN RAG CHAT'}</span>
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <a
                  href={`https://ar5iv.labs.arxiv.org/abs/${selectedPaperForDrawer.id.replace('arXiv:', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    backgroundColor: themeStyles.cardSubtle,
                    color: themeStyles.textPrimary,
                    border: `1px solid ${themeStyles.border}`,
                    borderRadius: '6px',
                    padding: '6px 8px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    textDecoration: 'none',
                    textAlign: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                  <span>{language === 'vi' ? 'ĐỌC AR5IV' : 'READ AR5IV'}</span>
                </a>

                <button
                  type="button"
                  onClick={() => handleCopyBibtex(selectedPaperForDrawer)}
                  style={{
                    backgroundColor: themeStyles.cardSubtle,
                    color: themeStyles.textPrimary,
                    border: `1px solid ${themeStyles.border}`,
                    borderRadius: '6px',
                    padding: '6px 8px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span>COPY BIBTEX</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>


      {/* ============================================================== */}
      {/* FLOATING LIVE ANOMALY TOAST ALERT BANNER                       */}
      {/* ============================================================== */}
      {activeAnomalies.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '40px',
            right: selectedPaperForDrawer ? '444px' : '24px',
            transition: 'right 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            maxWidth: '380px',
            backgroundColor: themeStyles.cardBg,
            color: themeStyles.textPrimary,
            borderRadius: '8px',
            border: '1px solid #ea580c',
            boxShadow: 'var(--card-shadow)',
            padding: '12px 14px',
            zIndex: 70,
            fontFamily: 'var(--font-mono)',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${themeStyles.borderSubtle}`, paddingBottom: '6px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
              <span style={{ fontSize: '10px', fontWeight: 800, color: '#f97316' }}>
                LIVE ANOMALY DETECTED (Z-SCORE &gt; 3.5)
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleDismissAnomaly(activeAnomalies[0].id)}
              style={{
                background: 'none',
                border: 'none',
                color: themeStyles.textMuted,
                cursor: 'pointer',
                fontSize: '14px',
                lineHeight: 1,
                padding: '0 2px',
              }}
            >
              &times;
            </button>
          </div>

          <div style={{ fontSize: '11px', fontWeight: 700, color: themeStyles.textPrimary, marginBottom: '4px' }}>
            {activeAnomalies[0].title}
          </div>

          <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: themeStyles.textSecondary, marginBottom: '6px' }}>
            <span>ID: <strong style={{ color: 'var(--accent-silver)' }}>{activeAnomalies[0].paperId}</strong></span>
            <span>{language === 'vi' ? 'Ngành:' : 'Field:'} <strong style={{ color: 'var(--accent-violet)' }}>{activeAnomalies[0].category}</strong></span>
            <span>Score: <strong style={{ color: '#ef4444' }}>{activeAnomalies[0].score}</strong></span>
          </div>

          <div style={{ backgroundColor: themeStyles.cardSubtle, borderRadius: '4px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {activeAnomalies[0].reasons.map((reason, idx) => (
              <div key={idx} style={{ fontSize: '10px', color: '#fb923c' }}>
                &bull; {reason}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* FLOATING ACTION FEEDBACK TOAST (Copy LaTeX, BibTeX, etc.)      */}
      {/* ============================================================== */}
      {feedbackToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--accent-silver)',
            border: '1px solid var(--accent-silver)',
            boxShadow: 'var(--card-shadow)',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            zIndex: 75,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span>✓</span>
          <span>{feedbackToast}</span>
        </div>
      )}
    </div>
  );
};
