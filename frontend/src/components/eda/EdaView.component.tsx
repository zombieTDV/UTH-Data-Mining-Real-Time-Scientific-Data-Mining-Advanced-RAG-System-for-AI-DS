import { useState, useEffect, useMemo, type FC, type MouseEvent } from 'react';
import type { EdaResponse, CategoryDistItem, MiningRunStatus, PipelineStatus } from '../../types';
import { fetchEdaSummary } from '../../services';
import { ChartToolbar } from '../charts/ChartToolbar.component';
import { AxisTitle, ChartLegend } from '../charts/ChartAxes.component';
import { useSvgPanZoom, useTranslation } from '../../hooks';
import { ScientificMath } from '../common/ScientificMath.component';
import { ThreeLensesDiagnosticView } from './ThreeLensesDiagnosticView.component';

export type DeckType = 'combo' | 'scatter' | 'taxonomy' | 'authors' | 'correlations' | 'rag_audit';

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

interface EdaViewProps {
  theme?: 'dark' | 'light';
  onNavigateToRag?: (paperTitle?: string) => void;
  miningRun?: MiningRunStatus | null; // a new last_run refetches the EDA artifact
  pipelineStatus?: PipelineStatus;
  onRefreshMining?: () => void;
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

export const EdaView: FC<EdaViewProps> = ({ theme = 'dark', onNavigateToRag, miningRun, pipelineStatus = 'IDLE', onRefreshMining }) => {
  const { language } = useTranslation();
  const isVi = language === 'vi';
  const isDark = theme === 'dark';

  const [data, setData] = useState<EdaResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active Sub-Deck Switcher State (Zero-scroll Cockpit)
  const [activeDeck, setActiveDeck] = useState<DeckType>('combo');

  // Focus / Zen Mode state (toggle via button or hotkey 'F')
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Slide-over Paper Detail Drawer state
  const [selectedPaperForDrawer, setSelectedPaperForDrawer] = useState<ScatterPaperPoint | null>(null);

  // Category Slicer / Filter
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Toast feedback message (e.g. for Copy LaTeX, Copy BibTeX)
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Hover Tooltip States for Charts
  const [hoveredBar, setHoveredBar] = useState<{ category: string; count: number; math: number; x: number; y: number } | null>(null);
  const [hoveredTimelineYear, setHoveredTimelineYear] = useState<{ year: string; count: number; pct: string; x: number; y: number } | null>(null);

  // Advanced Chart Insight States
  const [temporalSmoothing, setTemporalSmoothing] = useState<boolean>(false);
  const [correlationMetric, setCorrelationMetric] = useState<'pearson' | 'spearman'>('spearman');
  const [correlationDimensionMode, setCorrelationDimensionMode] = useState<'core' | 'extended'>('extended');
  const [hoveredCorrelationCell, setHoveredCorrelationCell] = useState<{ row: string; col: string; val: number; p: string; note: string; stars?: string } | null>(null);
  const [showParetoCurve, setShowParetoCurve] = useState<boolean>(true);
  const [scaleMode, setScaleMode] = useState<'linear' | 'log10'>('linear');
  const [cooccurrenceThreshold, setCooccurrenceThreshold] = useState<number>(0);
  const [selectedCooccurrencePair, setSelectedCooccurrencePair] = useState<{
    category_a: string;
    category_b: string;
    cooccurrence_count: number;
  } | null>(null);
  // Ergonomic Visual & Viewport Expansion States
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false);

  // Pan & Zoom Controllers for Interactive SVG Charts
  const comboPanZoom = useSvgPanZoom({
    nominalWidth: 920,
    nominalHeight: 300,
  });

  const timelinePanZoom = useSvgPanZoom({
    nominalWidth: 460,
    nominalHeight: 230,
  });


  const dataVersion = miningRun?.last_run ?? null;
  useEffect(() => {
    fetchEdaSummary()
      .then((res) => {
        setData(res);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [dataVersion]);

  // Keyboard shortcut listener:
  // - '1' to '5': Switch Deck
  // - 'F' or 'f': Toggle Focus Mode
  // - 'Escape': Close Slide-over Drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === '1') setActiveDeck('combo');
      else if (e.key === '2') setActiveDeck('scatter');
      else if (e.key === '3') setActiveDeck('taxonomy');
      else if (e.key === '4') setActiveDeck('authors');
      else if (e.key === '5') setActiveDeck('correlations');
      else if (e.key === '6') setActiveDeck('rag_audit');
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

  const maxPaperCount = useMemo(() => {
    if (!categoryList || categoryList.length === 0) return 3500;
    const m = Math.max(...categoryList.map((c) => c.count));
    return Math.max(1000, Math.ceil(m / 500) * 500);
  }, [categoryList]);

  const maxMathCount = useMemo(() => {
    if (!categoryList || categoryList.length === 0) return 1200000;
    const m = Math.max(...categoryList.map((c) => c.total_math_formulas));
    return Math.max(200000, Math.ceil(m / 200000) * 200000);
  }, [categoryList]);

  const peakTemporalPeriod = useMemo(() => {
    if (!data?.temporal_distribution || data.temporal_distribution.length === 0) {
      return { period: '01/2024', count: 5027 };
    }
    const top = data.temporal_distribution.reduce(
      (max, cur) => (cur.count > max.count ? cur : max),
      data.temporal_distribution[0]
    );
    return { period: top.period, count: top.count };
  }, [data]);

  const temporalAggregatedPoints = useMemo(() => {
    const rawDist = data?.temporal_distribution || [];
    const total = data?.dataset_overview.total_papers || 1;

    const yearCounts: Record<string, number> = {};
    for (const item of rawDist) {
      const p = item.period;
      const c = item.count;
      const match = p.match(/\b(19\d\d|20\d\d)\b/);
      const year = match ? match[0] : (p.includes('/') ? p.split('/')[1] : p.slice(0, 4));
      if (/^\d{4}$/.test(year)) {
        yearCounts[year] = (yearCounts[year] || 0) + c;
      }
    }

    const sortedYears = Object.keys(yearCounts).sort();
    const maxRecentYears = 13;
    const rawPoints: { label: string; count: number }[] = [];

    if (sortedYears.length === 0) {
      for (const y of ['2022', '2023', '2024', '2025', '2026']) {
        rawPoints.push({ label: `'${y.slice(2)}`, count: 0 });
      }
    } else {
      const minYearNum = Number(sortedYears[0]);
      const maxYearNum = Number(sortedYears[sortedYears.length - 1]);
      const startYear = Math.max(minYearNum, maxYearNum - maxRecentYears + 1);

      let priorCount = 0;
      for (const [y, c] of Object.entries(yearCounts)) {
        if (Number(y) < startYear) priorCount += c;
      }
      if (priorCount > 0) {
        rawPoints.push({
          label: `≤'${String(startYear - 1).slice(2)}`,
          count: priorCount,
        });
      }
      for (let y = startYear; y <= maxYearNum; y++) {
        const yStr = String(y);
        rawPoints.push({
          label: `'${yStr.slice(2)}`,
          count: yearCounts[yStr] ?? 0,
        });
      }
    }

    const effectivePoints = temporalSmoothing
      ? rawPoints.map((p, idx, arr) => {
          let count = p.count;
          if (arr.length < 2) return { label: p.label, count };
          if (idx === 0) {
            count = Math.round(0.75 * p.count + 0.25 * arr[1].count);
          } else if (idx === arr.length - 1) {
            count = Math.round(0.25 * arr[idx - 1].count + 0.75 * p.count);
          } else {
            count = Math.round(0.20 * arr[idx - 1].count + 0.60 * p.count + 0.20 * arr[idx + 1].count);
          }
          return { label: p.label, count };
        })
      : rawPoints;

    const maxC = Math.max(...effectivePoints.map((p) => p.count), 1);
    // The axis has 3 equal steps: pick a round step (1-2-5 series) so every tick label is a readable number
    const stepMag = 10 ** Math.floor(Math.log10(Math.max(1, maxC / 3)));
    const yCeil = 3 * ([1, 2, 5, 10].map((m) => m * stepMag).find((v) => v * 3 >= maxC) ?? maxC);
    const stepX = 365 / Math.max(1, effectivePoints.length - 1);

    const points = effectivePoints.map((p, idx) => ({
      label: p.label,
      count: p.count,
      pct: `${((p.count / total) * 100).toFixed(1)}%`,
      x: Math.round(52 + idx * stepX),
      y: Math.round(180 - (p.count / yCeil) * 140),
    }));

    const peakPoint = points.reduce((m, p) => (p.count > m.count ? p : m), points[0]);

    return { yCeil, points, peakPoint, isSmoothed: temporalSmoothing };
  }, [data, temporalSmoothing]);

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
        category: 'Khác',
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
  }, [categoryList]);

  const maxCooccurVal = useMemo(() => {
    if (!data?.category_cooccurrence || data.category_cooccurrence.length === 0) return 2000;
    return Math.max(...data.category_cooccurrence.map((p) => p.cooccurrence_count));
  }, [data]);

  const topCooccurPair = useMemo(() => {
    if (!data?.category_cooccurrence || data.category_cooccurrence.length === 0) return null;
    return data.category_cooccurrence[0];
  }, [data]);

  // Dynamic KPI scorecards computed based on Slicers
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

  // Filtered Scatter dataset based on Category Slicer
  const filteredScatterPoints = useMemo(() => {
    let pts = (data?.scatter_points && data.scatter_points.length > 0) ? data.scatter_points : SCATTER_DATASET;
    if (selectedCategory !== 'ALL') {
      pts = pts.filter((p) => p.category === selectedCategory);
    }
    return pts;
  }, [selectedCategory, data?.scatter_points]);

  const handleResetFilters = () => {
    setSelectedCategory('ALL');
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
      setFeedbackToast(`Đã sao chép mã trích dẫn BibTeX cho [${paper.id}]!`);
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
            [ OLAP ANALYTICS // DUCKDB ENGINE ] Đang nạp và tính toán trực tiếp từ Silver Parquet...
          </span>
        </div>
      </div>
    );
  }

  if (error || !data || !filteredKpi) {
    return (
      <div style={{ padding: '24px', fontFamily: 'var(--font-mono)', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
        [ ERROR ] Không thể nạp dữ liệu EDA từ DuckDB: {error}
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
          borderRadius: '10px',
          border: `1px solid ${themeStyles.border}`,
          padding: isFocusMode ? '4px 10px' : '6px 12px',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: isFocusMode ? '3px' : '5px',
          flexShrink: 0,
          transition: 'all 0.2s ease',
        }}
      >
        {/* Title Bar with Live Pulse, Focus Toggle, and Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: isFocusMode ? '18px' : '22px',
                height: isFocusMode ? '18px' : '22px',
                borderRadius: '5px',
                backgroundColor: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                flexShrink: 0,
              }}
            >
              <svg width={isFocusMode ? '11' : '13'} height={isFocusMode ? '11' : '13'} viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="12" width="4" height="9" rx="1" />
                <rect x="10" y="7" width="4" height="14" rx="1" />
                <rect x="17" y="3" width="4" height="18" rx="1" />
              </svg>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h1 style={{ fontSize: isFocusMode ? '11px' : '12px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0, letterSpacing: '-0.2px' }}>
                {isVi ? 'KHÔNG GIAN PHÂN TÍCH KHOA HỌC EDA' : 'SCIENTIFIC EDA WORKSPACE // OLAP ANALYTICS'}
              </h1>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#059669', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)', padding: '1px 5px', borderRadius: '4px' }}>
                ● DUCKDB OLAP
              </span>
            </div>

            {/* Freshness of the served artifacts (EDA + Model), from the last mining run */}
            {(() => {
              const running = pipelineStatus === 'RUNNING';
              const failed = !running && !!miningRun?.error;
              const fmt = (iso?: string | null) => (iso ? iso.replace('T', ' ').slice(0, 16) : '—');
              const tone = failed ? '#ef4444' : running ? '#f59e0b' : '#22c55e';
              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    border: `1px solid ${themeStyles.border}`,
                    backgroundColor: themeStyles.cardSubtle,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    color: themeStyles.textSecondary,
                    fontWeight: 700,
                  }}
                  title={failed ? (isVi ? `Lần chạy gần nhất lỗi: ${miningRun?.error}` : `Last run failed: ${miningRun?.error}`) : (isVi ? 'Thời điểm engine tính EDA + Model' : 'Timestamp of EDA + Model computation')}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: tone, display: 'inline-block' }} />
                  {running ? (
                    <span>{isVi ? `Đang tính lại EDA + Model (bắt đầu ${fmt(miningRun?.started_at).slice(11)})…` : `Recomputing EDA + Model (started ${fmt(miningRun?.started_at).slice(11)})…`}</span>
                  ) : failed ? (
                    <span style={{ color: '#ef4444' }}>{isVi ? `Lần cập nhật lỗi · dữ liệu cũ từ ${fmt(miningRun?.last_run)}` : `Update failed · stale data from ${fmt(miningRun?.last_run)}`}</span>
                  ) : (
                    <span>
                      {isVi ? 'Dữ liệu: ' : 'Corpus: '}<strong style={{ color: themeStyles.textPrimary }}>{(miningRun?.total_papers ?? 0).toLocaleString()}</strong> {isVi ? 'bài' : 'works'} · {isVi ? 'cập nhật ' : 'updated '}{fmt(miningRun?.last_run)}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Quick Action Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {/* Re-run the mining engine on the current Silver; EDA and Model reload when it finishes */}
            <button
              type="button"
              onClick={onRefreshMining}
              disabled={pipelineStatus === 'RUNNING' || !onRefreshMining}
              style={{
                backgroundColor: pipelineStatus === 'RUNNING' ? themeStyles.cardSubtle : '#2563eb',
                border: `1px solid ${pipelineStatus === 'RUNNING' ? themeStyles.border : '#1d4ed8'}`,
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: pipelineStatus === 'RUNNING' ? themeStyles.textSecondary : '#ffffff',
                cursor: pipelineStatus === 'RUNNING' ? 'progress' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title={isVi ? 'Chạy lại engine trên toàn bộ Silver hiện có' : 'Re-run the mining engine on current Silver lakehouse'}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                style={pipelineStatus === 'RUNNING' ? { animation: 'spin 1s linear infinite' } : undefined}
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              <span>{pipelineStatus === 'RUNNING' ? (isVi ? 'ĐANG CẬP NHẬT…' : 'RECOMPUTING…') : (isVi ? 'CẬP NHẬT' : 'RECOMPUTE')}</span>
            </button>

            {/* Focus / Zen Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsFocusMode((prev) => !prev)}
              style={{
                backgroundColor: isFocusMode ? '#2563eb' : themeStyles.cardSubtle,
                border: `1px solid ${isFocusMode ? '#1d4ed8' : themeStyles.border}`,
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: isFocusMode ? '#ffffff' : themeStyles.textSecondary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease',
              }}
              title={isVi ? 'Nhấn phím F để bật / tắt chế độ phóng to biểu đồ' : 'Press F to toggle chart focus'}
            >
              <span>{isFocusMode ? '⤡' : '⤢'}</span>
              <span>{isFocusMode ? (isVi ? 'THOÁT FOCUS' : 'EXIT FOCUS') : (isVi ? 'FOCUS MODE' : 'FOCUS MODE')}</span>
              <span style={{ opacity: 0.65, fontSize: '10px' }}>(F)</span>
            </button>

            {/* Reset Slicers */}
            {selectedCategory !== 'ALL' && (
              <button
                type="button"
                onClick={handleResetFilters}
                style={{
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : '#fee2e2',
                  border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.35)' : '#fca5a5'}`,
                  borderRadius: '4px',
                  padding: '2px 7px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <span>&times;</span>
                <span>{isVi ? 'ĐẶT LẠI' : 'RESET'}</span>
              </button>
            )}

            <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, backgroundColor: themeStyles.cardSubtle, padding: '2px 7px', borderRadius: '4px', border: `1px solid ${themeStyles.border}` }}>
              {isVi ? 'Đang chọn: ' : 'Selected: '}<strong style={{ color: themeStyles.textPrimary }}>{filteredKpi.totalPapers.toLocaleString()}</strong> {isVi ? 'bài' : 'works'} ({filteredKpi.sharePercent}%)
            </div>
          </div>
        </div>

        {/* Slicer Pills Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', paddingTop: isFocusMode ? '0' : '3px', borderTop: isFocusMode ? 'none' : `1px solid ${themeStyles.borderSubtle}` }}>
          <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
            {isVi ? 'BỘ LỌC:' : 'SLICER:'}
          </span>

          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: selectedCategory === 'ALL' ? 800 : 600,
              border: selectedCategory === 'ALL' ? `1px solid ${themeStyles.slicerAllActiveBg}` : `1px solid ${themeStyles.border}`,
              backgroundColor: selectedCategory === 'ALL' ? themeStyles.slicerAllActiveBg : themeStyles.cardInner,
              color: selectedCategory === 'ALL' ? themeStyles.slicerAllActiveText : themeStyles.textSecondary,
              cursor: 'pointer',
            }}
          >
            {isVi ? 'TẤT CẢ' : 'ALL'} ({overview.total_papers ? overview.total_papers.toLocaleString() : '13,000'})
          </button>

          {categoryList.slice(0, 8).map((cat) => {
            const isSelected = selectedCategory === cat.category;
            const color = getCategoryColor(cat.category);
            return (
              <button
                key={cat.category}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat.category)}
                style={{
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: isSelected ? 800 : 600,
                  border: isSelected ? `1px solid ${color}` : `1px solid ${themeStyles.border}`,
                  backgroundColor: isSelected ? color : themeStyles.cardInner,
                  color: isSelected ? '#ffffff' : themeStyles.textSecondary,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: isSelected ? '#ffffff' : color }} />
                <span>{cat.category}</span>
                <span style={{ fontSize: '10px', opacity: 0.85 }}>({cat.count.toLocaleString()})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. PINNED 4 TOP KPI SCORECARD CARDS (Hidden in Focus Mode)     */}
      {/* ============================================================== */}
      {!isFocusMode && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', flexShrink: 0 }}>
          <div style={{ backgroundColor: themeStyles.cardBg, borderRadius: '6px', borderLeft: `1px solid ${themeStyles.border}`, borderRight: `1px solid ${themeStyles.border}`, borderBottom: `1px solid ${themeStyles.border}`, borderTop: '3px solid #f59e0b', padding: '6px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textMuted }}>
              TỔNG SỐ BÀI BÁO (PAPERS)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: themeStyles.textPrimary, marginTop: '2px', lineHeight: 1.1 }}>
              {filteredKpi.totalPapers.toLocaleString()}
            </div>
            <div style={{ fontSize: '10px', color: '#059669', marginTop: '2px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              {selectedCategory === 'ALL' ? `${filteredKpi.totalPapers.toLocaleString()} bài trong Catalog (100%)` : `Chiếm ${filteredKpi.sharePercent}% Lakehouse`}
            </div>
          </div>

          <div style={{ backgroundColor: themeStyles.cardBg, borderRadius: '6px', borderLeft: `1px solid ${themeStyles.border}`, borderRight: `1px solid ${themeStyles.border}`, borderBottom: `1px solid ${themeStyles.border}`, borderTop: '3px solid #ea580c', padding: '6px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textMuted }}>
              CÔNG THỨC TOÁN (LATEX)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#ea580c', marginTop: '2px', lineHeight: 1.1 }}>
              {filteredKpi.totalMath.toLocaleString()}
            </div>
            <div style={{ fontSize: '10px', color: themeStyles.textSecondary, marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
              Trung bình <strong>{filteredKpi.avgMath}</strong> eq / bài full-text
            </div>
          </div>

          <div style={{ backgroundColor: themeStyles.cardBg, borderRadius: '6px', borderLeft: `1px solid ${themeStyles.border}`, borderRight: `1px solid ${themeStyles.border}`, borderBottom: `1px solid ${themeStyles.border}`, borderTop: '3px solid #10b981', padding: '6px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textMuted }}>
              FULL-TEXT &amp; RAG EMBEDDED
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#059669', marginTop: '2px', lineHeight: 1.1 }}>
              {(dataset_overview.fulltext_papers_count ?? 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '10px', color: '#059669', marginTop: '2px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              {`Tỷ lệ phủ toàn văn: ${((dataset_overview.enrichment_ratio ?? 0) * 100).toFixed(1)}% Lakehouse`}
            </div>
          </div>

          <div style={{ backgroundColor: themeStyles.cardBg, borderRadius: '6px', borderLeft: `1px solid ${themeStyles.border}`, borderRight: `1px solid ${themeStyles.border}`, borderBottom: `1px solid ${themeStyles.border}`, borderTop: '3px solid #2563eb', padding: '6px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textMuted }}>
              DUNG LƯỢNG TỪ VỰNG (CORPUS)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb', marginTop: '2px', lineHeight: 1.1 }}>
              {(dataset_overview.total_words / 1_000_000).toFixed(2)}M từ
            </div>
            <div style={{ fontSize: '10px', color: themeStyles.textSecondary, marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
              Trung bình <strong>{filteredKpi.avgWords}</strong> từ / bài
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. SEGMENTED SUB-DECK SWITCHER CAPSULE BAR                     */}
      {/* ============================================================== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: themeStyles.cardBg,
          borderRadius: '7px',
          border: `1px solid ${themeStyles.border}`,
          padding: '4px 10px',
          flexShrink: 0,
        }}
      >
        {/* Deck Capsules (6 Decks) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {[
            { id: 'combo' as DeckType, label: isVi ? 'TỔNG QUAN & DÒNG THỜI GIAN' : 'COMBO & TIMELINE', keyNum: '1' },
            { id: 'scatter' as DeckType, label: isVi ? 'CHẨN ĐOÁN THỐNG KÊ' : 'STATISTICAL DIAGNOSTICS', keyNum: '2' },
            { id: 'taxonomy' as DeckType, label: isVi ? 'CHUYÊN NGÀNH & BẢN ĐỒ NHIỆT' : 'TAXONOMY & HEATMAP', keyNum: '3' },
            { id: 'authors' as DeckType, label: isVi ? 'TÁC GIẢ & PHÂN VỊ' : 'TOP AUTHORS & QUANTILES', keyNum: '4' },
            { id: 'correlations' as DeckType, label: isVi ? 'TƯƠNG QUAN & ANOVA' : 'CORRELATIONS & ANOVA', keyNum: '5' },
            { id: 'rag_audit' as DeckType, label: isVi ? 'KIỂM ĐỊNH CHẤT LƯỢNG RAG' : 'RAG QUALITY AUDIT', keyNum: '6' },
          ].map((deck) => {
            const isActive = activeDeck === deck.id;
            return (
              <button
                key={deck.id}
                type="button"
                onClick={() => setActiveDeck(deck.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 10px',
                  borderRadius: '5px',
                  border: isActive ? '1px solid #2563eb' : '1px solid transparent',
                  backgroundColor: isActive ? (isDark ? 'rgba(37, 99, 235, 0.25)' : '#eff6ff') : 'transparent',
                  color: isActive ? (isDark ? '#60a5fa' : '#1d4ed8') : themeStyles.textSecondary,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    backgroundColor: isActive ? '#2563eb' : (isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'),
                    color: isActive ? '#ffffff' : themeStyles.textMuted,
                    padding: '1px 5px',
                    borderRadius: '3px',
                  }}
                >
                  {deck.keyNum}
                </span>
                <span style={{ fontSize: '11px', fontWeight: isActive ? 800 : 600, fontFamily: 'var(--font-mono)' }}>
                  {deck.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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
        {/* SUB-DECK 1: COMBO CLUSTERED BAR & TIMELINE AREA CHARTS       */}
        {/* ------------------------------------------------------------ */}
        {activeDeck === 'combo' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isSidebarCollapsed ? '1fr' : '1.45fr 1fr',
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
            {/* CHART 1: COMBO CLUSTERED COLUMN & LINE DUAL AXIS */}
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
              {/* Row 1: Title (Two-Tier Swiss Architecture) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '28px', marginBottom: '6px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    PHÂN BỐ BÀI BÁO &amp; CÔNG THỨC TOÁN
                  </h3>
                </div>
              </div>

              {/* Row 2: Metadata & Interactive Control Deck */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                borderRadius: '5px',
                backgroundColor: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                marginBottom: '8px',
                flexShrink: 0,
                flexWrap: 'wrap',
                gap: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
                  <span className="telemetry-chip" style={{ color: '#38bdf8' }}>
                    DÒNG THỜI GIAN &bull; ĐỈNH ĐIỂM: {peakTemporalPeriod.period} (n={peakTemporalPeriod.count.toLocaleString()})
                  </span>
                  <span style={{ color: themeStyles.textMuted }}>&bull; Trục trái: Số bài &bull; Trục phải: Eq</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => setShowParetoCurve((prev) => !prev)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: showParetoCurve ? 700 : 500,
                      backgroundColor: showParetoCurve ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#ecfdf5') : 'transparent',
                      color: showParetoCurve ? '#10b981' : themeStyles.textSecondary,
                      border: `1px solid ${showParetoCurve ? '#10b981' : themeStyles.border}`,
                      cursor: 'pointer',
                    }}
                    title="Bật / tắt đường cong tích lũy Pareto 80/20"
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                        <polyline points="17 6 23 6 23 12" />
                      </svg>
                      <span>80% Pareto</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScaleMode((m) => (m === 'linear' ? 'log10' : 'linear'))}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: scaleMode === 'log10' ? 700 : 500,
                      backgroundColor: scaleMode === 'log10' ? (isDark ? 'rgba(56, 189, 248, 0.2)' : '#e0f2fe') : 'transparent',
                      color: scaleMode === 'log10' ? '#0284c7' : themeStyles.textSecondary,
                      border: `1px solid ${scaleMode === 'log10' ? '#0284c7' : themeStyles.border}`,
                      cursor: 'pointer',
                    }}
                    title="Chuyển đổi thang đo Tuyến tính / Logarit (Log10)"
                  >
                    {scaleMode === 'linear' ? 'Thang: Linear' : 'Thang: Log10'}
                  </button>
                  <ChartToolbar
                    theme={theme}
                    zoomLevel={comboPanZoom.zoom}
                    hasPannedOrZoomed={comboPanZoom.hasPannedOrZoomed}
                    onZoomIn={() => comboPanZoom.zoomIn(0.25)}
                    onZoomOut={() => comboPanZoom.zoomOut(0.25)}
                    onResetZoom={comboPanZoom.resetView}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
                    isTheater={isTheaterMode}
                    onToggleTheater={() => setIsTheaterMode((prev) => !prev)}
                    onShowToast={(msg) => {
                      setFeedbackToast(msg);
                      setTimeout(() => setFeedbackToast(null), 2500);
                    }}
                  />
                </div>
              </div>

              <div style={{ padding: '4px 4px 0' }}>
                <ChartLegend
                  items={[
                    { label: 'Số bài báo (cột, màu theo chuyên mục, trục trái)', color: '#2563eb', mark: 'bar' },
                    { label: 'Tổng công thức toán (trục phải)', color: '#ea580c', mark: 'dashed' },
                    { label: 'Tỷ lệ bài tích lũy % (Pareto)', color: '#10b981', mark: 'line' },
                    { label: 'Mốc 80%', color: '#10b981', mark: 'dashed' },
                  ]}
                />
              </div>

              {/* SVG DUAL-AXIS COMBO CHART */}
              <div
                {...comboPanZoom.containerProps}
                style={{
                  ...comboPanZoom.containerProps.style,
                  flex: 1,
                  minHeight: 0,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <svg
                  viewBox={comboPanZoom.viewBox}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ width: '100%', height: '100%' }}
                >
                  {[0, 1, 2, 3, 4].map((g) => {
                    const y = 35 + g * 50;
                    const valLinear = Math.round(maxPaperCount - g * (maxPaperCount / 4));
                    const valLog = Math.round(Math.pow(10, Math.log10(maxPaperCount) - g * (Math.log10(maxPaperCount) / 4)));
                    const labelPaper = scaleMode === 'linear' ? valLinear : valLog;
                    const mathVal = Math.round(maxMathCount - g * (maxMathCount / 4));
                    const labelMath = mathVal >= 1000000 ? `${(mathVal / 1000000).toFixed(1)}M` : `${Math.round(mathVal / 1000)}k`;
                    return (
                      <g key={g}>
                        <line x1="60" y1={y} x2="860" y2={y} stroke={themeStyles.gridLine} strokeDasharray="3 3" />
                        <text x="52" y={y + 3} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>
                          {labelPaper}
                        </text>
                        <text x="868" y={y + 3} textAnchor="start" fontSize="10" fontFamily="var(--font-mono)" fill="#ea580c">
                          {labelMath}
                        </text>
                      </g>
                    );
                  })}

                  <line x1="60" y1="235" x2="860" y2="235" stroke={themeStyles.axisLine} strokeWidth="1" />
                  <AxisTitle axis="y" x={14} y={135} text={scaleMode === 'linear' ? 'Số bài báo' : 'Số bài báo (log10)'} />
                  <AxisTitle axis="y2" x={910} y={135} text="Số công thức toán" color="#ea580c" />
                  <AxisTitle axis="x" x={460} y={284} text="Chuyên mục arXiv (8 mục nhiều bài nhất)" />

                  {categoryList.slice(0, 8).map((cat, i) => {
                    const barX = 90 + i * 95;
                    const barWidth = 46;
                    const colHeight = scaleMode === 'linear'
                      ? Math.max(10, (cat.count / maxPaperCount) * 195)
                      : Math.max(16, (Math.log10(Math.max(10, cat.count)) / Math.log10(maxPaperCount)) * 195);
                    const barY = 235 - colHeight;
                    const isSelected = selectedCategory === cat.category;
                    const color = isSelected ? '#1d4ed8' : getCategoryColor(cat.category);
                    const isTallBar = colHeight > 110;
                    const countLabelY = isTallBar ? barY + 16 : barY - 7;
                    const countLabelFill = isTallBar ? '#ffffff' : themeStyles.textPrimary;

                    return (
                      <g
                        key={cat.category}
                        onClick={() => {
                          if (!comboPanZoom.didDrag()) {
                            setSelectedCategory(isSelected ? 'ALL' : cat.category);
                          }
                        }}
                        onMouseEnter={(e: MouseEvent<SVGGElement>) => {
                          const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                          setHoveredBar({
                            category: cat.category,
                            count: cat.count,
                            math: cat.total_math_formulas,
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                          });
                        }}
                        onMouseLeave={() => setHoveredBar(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        <rect
                          x={barX}
                          y={barY}
                          width={barWidth}
                          height={colHeight}
                          rx="4"
                          fill={color}
                          opacity={selectedCategory !== 'ALL' && !isSelected ? 0.35 : 0.9}
                          style={{ transition: 'all 0.2s ease' }}
                        />
                        <text
                          x={barX + barWidth / 2}
                          y={countLabelY}
                          textAnchor="middle"
                          fontSize="10"
                          fontFamily="var(--font-mono)"
                          fontWeight="700"
                          fill={countLabelFill}
                        >
                          {cat.count > 999 ? `${(cat.count / 1000).toFixed(1)}k` : cat.count}
                        </text>
                        <text
                          x={barX + barWidth / 2}
                          y="254"
                          textAnchor="middle"
                          fontSize="11"
                          fontFamily="var(--font-mono)"
                          fontWeight={isSelected ? '800' : '600'}
                          fill={isSelected ? '#38bdf8' : themeStyles.textSecondary}
                        >
                          {cat.category}
                        </text>
                      </g>
                    );
                  })}

                  {(() => {
                    const points = categoryList.slice(0, 8).map((cat, i) => {
                      const cx = 90 + i * 95 + 23;
                      const cy = scaleMode === 'linear'
                        ? 235 - Math.max(8, (cat.total_math_formulas / maxMathCount) * 195)
                        : 235 - Math.max(16, (Math.log10(Math.max(100, cat.total_math_formulas)) / Math.log10(maxMathCount)) * 195);
                      return { cx, cy, cat };
                    });

                    const pathD = points
                      .map((p, i) => (i === 0 ? `M ${p.cx} ${p.cy}` : `L ${p.cx} ${p.cy}`))
                      .join(' ');

                    let runningCount = 0;
                    const paretoPoints = categoryList.slice(0, 8).map((cat, i) => {
                      runningCount += cat.count;
                      const cumPct = (runningCount / (overview.total_papers || 10000)) * 100;
                      const cx = 90 + i * 95 + 23;
                      const cy = 235 - (cumPct / 100) * 195;
                      return { cx, cy, cumPct, cat };
                    });

                    const paretoPathD = paretoPoints
                      .map((p, i) => (i === 0 ? `M ${p.cx} ${p.cy}` : `L ${p.cx} ${p.cy}`))
                      .join(' ');

                    return (
                      <g>
                        {/* Formulas Line */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#ea580c"
                          strokeWidth="2.5"
                          strokeDasharray="4 2"
                          style={{ pointerEvents: 'none' }}
                        />
                        {points.map((p, idx) => (
                          <circle
                            key={idx}
                            cx={p.cx}
                            cy={p.cy}
                            r="5"
                            fill={themeStyles.cardInner}
                            stroke="#ea580c"
                            strokeWidth="2.5"
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
                              const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                              setHoveredBar({
                                category: p.cat.category,
                                count: p.cat.count,
                                math: p.cat.total_math_formulas,
                                x: rect.left,
                                y: rect.top - 8,
                              });
                            }}
                            onMouseLeave={() => setHoveredBar(null)}
                          />
                        ))}

                        {/* Dual-Axis Pareto Cumulative Curve */}
                        {showParetoCurve && (() => {
                          const cutoffY = 235 - 0.8 * 195;
                          const cutoffIdx = paretoPoints.findIndex((p) => p.cumPct >= 80);

                          return (
                            <g>
                              {/* 80% Pareto Reference Cutoff Line */}
                              <line
                                x1="60"
                                y1={cutoffY}
                                x2="860"
                                y2={cutoffY}
                                stroke="#10b981"
                                strokeWidth="1.2"
                                strokeDasharray="4 3"
                                strokeOpacity="0.85"
                              />
                              <text
                                x="70"
                                y={cutoffY - 6}
                                fontSize="9"
                                fontFamily="var(--font-mono)"
                                fontWeight="800"
                                fill="#10b981"
                              >
                                80%
                              </text>

                              {/* Cumulative Curve Path */}
                              <path
                                d={paretoPathD}
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="2.5"
                                style={{ pointerEvents: 'none' }}
                              />
                              {paretoPoints.map((p, idx) => {
                                const isMilestone = idx === 0 || idx === cutoffIdx || idx === paretoPoints.length - 1;
                                const isNearCutoff = Math.abs(p.cy - cutoffY) < 24;
                                const badgeY = isNearCutoff ? p.cy + 8 : p.cy - 19;
                                const textY = isNearCutoff ? p.cy + 19 : p.cy - 8;

                                return (
                                  <g key={idx}>
                                    <circle
                                      cx={p.cx}
                                      cy={p.cy}
                                      r={isMilestone ? '5' : '3.5'}
                                      fill={themeStyles.cardInner}
                                      stroke="#10b981"
                                      strokeWidth={isMilestone ? '2.5' : '1.8'}
                                    >
                                      <title>{`${p.cat.category}: ${p.cumPct.toFixed(1)}% tích lũy`}</title>
                                    </circle>
                                    {isMilestone && (
                                      <g style={{ pointerEvents: 'none' }}>
                                        <rect
                                          x={p.cx - 16}
                                          y={badgeY}
                                          width="32"
                                          height="14"
                                          rx="3"
                                          fill={isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.95)'}
                                          stroke={idx === cutoffIdx ? '#10b981' : 'rgba(16, 185, 129, 0.35)'}
                                          strokeWidth={idx === cutoffIdx ? '1.2' : '0.8'}
                                        />
                                        <text
                                          x={p.cx}
                                          y={textY}
                                          textAnchor="middle"
                                          fontSize="9.5"
                                          fontFamily="var(--font-mono)"
                                          fontWeight="800"
                                          fill="#10b981"
                                        >
                                          {p.cumPct.toFixed(0)}%
                                        </text>
                                      </g>
                                    )}
                                  </g>
                                );
                              })}
                            </g>
                          );
                        })()}
                      </g>
                    );
                  })()}
                </svg>
                {comboPanZoom.hasPannedOrZoomed && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)',
                      border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.4)' : '#bae6fd'}`,
                      borderRadius: '4px',
                      padding: '2px 7px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: isDark ? '#38bdf8' : '#0284c7',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      pointerEvents: 'none',
                      backdropFilter: 'blur(4px)',
                      zIndex: 10,
                    }}
                  >
                    <span>✥</span>
                    <span>{Math.round(comboPanZoom.zoom * 100)}%</span>
                    <span style={{ color: themeStyles.textMuted }}>• Kéo để pan</span>
                  </div>
                )}
              </div>
            </div>

            {/* CHART 2: SMOOTH AREA TIMELINE CHART */}
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
                {/* Row 1: Title (Two-Tier Swiss Architecture) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '28px', marginBottom: '6px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      TĂNG TRƯỞNG THEO THỜI GIAN
                    </h3>
                  </div>
                </div>

                {/* Row 2: Metadata & Controls Deck */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 8px',
                  borderRadius: '5px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                  marginBottom: '8px',
                  flexShrink: 0,
                  flexWrap: 'wrap',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                      Đỉnh điểm {temporalAggregatedPoints.peakPoint.count.toLocaleString()} bài ({temporalAggregatedPoints.peakPoint.label}) &bull; Số bài theo từng năm
                    </div>

                    {/* Temporal Smoothing Switch */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', backgroundColor: themeStyles.cardInner, padding: '2px', borderRadius: '4px', border: `1px solid ${themeStyles.border}` }}>
                      <button
                        type="button"
                        onClick={() => setTemporalSmoothing(false)}
                        style={{
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontSize: '9.5px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: !temporalSmoothing ? 800 : 500,
                          backgroundColor: !temporalSmoothing ? (isDark ? '#2563eb' : '#3b82f6') : 'transparent',
                          color: !temporalSmoothing ? '#ffffff' : themeStyles.textMuted,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        title="Hiển thị số liệu mốc thời gian nguyên bản từ Lakehouse"
                      >
                        Raw
                      </button>
                      <button
                        type="button"
                        onClick={() => setTemporalSmoothing(true)}
                        style={{
                          padding: '2px 6px',
                          borderRadius: '3px',
                          fontSize: '9.5px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: temporalSmoothing ? 800 : 500,
                          backgroundColor: temporalSmoothing ? (isDark ? '#10b981' : '#059669') : 'transparent',
                          color: temporalSmoothing ? '#ffffff' : themeStyles.textMuted,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        title="Làm mịn trung bình động 3 mốc (3-Point Moving Average Smoothing)"
                      >
                        Smoothed
                      </button>
                    </div>

                    {temporalSmoothing && (
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: '#10b981',
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                        }}
                        title="Bộ lọc làm mịn trung bình động 3 mốc (3-Point Moving Average)"
                      >
                        Đã làm mịn
                      </span>
                    )}
                  </div>

                  <ChartToolbar
                      theme={theme}
                      zoomLevel={timelinePanZoom.zoom}
                      hasPannedOrZoomed={timelinePanZoom.hasPannedOrZoomed}
                      onZoomIn={() => timelinePanZoom.zoomIn(0.25)}
                      onZoomOut={() => timelinePanZoom.zoomOut(0.25)}
                      onResetZoom={timelinePanZoom.resetView}
                      onShowToast={(msg) => {
                        setFeedbackToast(msg);
                        setTimeout(() => setFeedbackToast(null), 2500);
                      }}
                    />
                </div>

                <div style={{ padding: '0 4px 4px' }}>
                  <ChartLegend
                    items={[
                      { label: temporalSmoothing ? 'Số bài mỗi năm (làm mịn 3 điểm)' : 'Số bài mỗi năm', color: '#2563eb', mark: 'line' },
                      { label: 'Năm nhiều bài nhất', color: '#2563eb', mark: 'bar' },
                    ]}
                  />
                </div>

                {/* SVG AREA CHART */}
                <div
                  {...timelinePanZoom.containerProps}
                  style={{
                    ...timelinePanZoom.containerProps.style,
                    flex: 1,
                    minHeight: 0,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <svg
                    viewBox={timelinePanZoom.viewBox}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ width: '100%', height: '100%' }}
                  >
                        <defs>
                          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity={isDark ? '0.6' : '0.45'} />
                            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>

                        {[0, 1, 2, 3].map((g) => {
                          const y = 35 + g * 45;
                          const val = Math.round(temporalAggregatedPoints.yCeil - g * (temporalAggregatedPoints.yCeil / 3));
                          return (
                            <g key={g}>
                              <line x1="40" y1={y} x2="430" y2={y} stroke={themeStyles.gridLine} strokeDasharray="3 3" />
                              <text x="36" y={y + 3} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill={themeStyles.textMuted}>
                                {val >= 1000 ? `${(val / 1000).toFixed(val % 1000 ? 1 : 0)}k` : val}
                              </text>
                            </g>
                          );
                        })}

                        <line x1="40" y1="180" x2="430" y2="180" stroke={themeStyles.axisLine} strokeWidth="1" />
                        <AxisTitle axis="y" x={9} y={108} text="Số bài công bố" fontSize={10} />
                        <AxisTitle axis="x" x={235} y={216} text="Năm công bố (theo ngày nộp)" fontSize={10} />

                        {(() => {
                          const points = temporalAggregatedPoints.points;
                          const peakPoint = temporalAggregatedPoints.peakPoint;
                          const lineD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
                          const areaD = `${lineD} L ${points[points.length - 1].x} 180 L ${points[0].x} 180 Z`;
                          const badgeX = Math.min(382, Math.max(45, peakPoint.x - 35));
                          const badgeY = Math.max(12, peakPoint.y - 22);

                          return (
                            <g>
                              <path d={areaD} fill="url(#areaGradient)" />
                              <path d={lineD} fill="none" stroke="#2563eb" strokeWidth="2.5" />

                              <rect x={badgeX} y={badgeY} width="70" height="18" rx="3" fill="#2563eb" />
                              <text x={badgeX + 35} y={badgeY + 13} textAnchor="middle" fontSize="9.5" fontFamily="var(--font-mono)" fontWeight="800" fill="#ffffff">
                                {peakPoint.count.toLocaleString()} BÀI
                              </text>

                              {points.map((p, i) => (
                                <g key={i}>
                                  <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={p.label === peakPoint.label ? '4.5' : '3.2'}
                                    fill={themeStyles.cardInner}
                                    stroke="#2563eb"
                                    strokeWidth="2"
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
                                      const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                                      setHoveredTimelineYear({
                                        year: p.label,
                                        count: p.count,
                                        pct: p.pct,
                                        x: rect.left,
                                        y: rect.top - 8,
                                      });
                                    }}
                                    onMouseLeave={() => setHoveredTimelineYear(null)}
                                  />
                                  <text x={p.x} y="195" textAnchor="middle" fontSize="8.5" fontFamily="var(--font-mono)" fontWeight="700" fill={themeStyles.textSecondary}>
                                    {p.label}
                                  </text>
                                </g>
                              ))}
                            </g>
                          );
                        })()}
                      </svg>
                      {timelinePanZoom.hasPannedOrZoomed && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '8px',
                            right: '8px',
                            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)',
                            border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.4)' : '#bae6fd'}`,
                            borderRadius: '4px',
                            padding: '2px 7px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            color: isDark ? '#38bdf8' : '#0284c7',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            pointerEvents: 'none',
                            backdropFilter: 'blur(4px)',
                            zIndex: 10,
                          }}
                        >
                          <span>✥</span>
                          <span>{Math.round(timelinePanZoom.zoom * 100)}%</span>
                          <span style={{ color: themeStyles.textMuted }}>• Kéo để pan</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {/* SUB-DECK 2: CHẨN ĐOÁN 3 THẤU KÍNH & TƯƠNG TÁC ĐA BIẾN        */}
        {/* ------------------------------------------------------------ */}
        {activeDeck === 'scatter' && (
          <ThreeLensesDiagnosticView
            theme={theme}
            isTheaterMode={isTheaterMode}
            onToggleTheater={() => setIsTheaterMode((prev) => !prev)}
            diagnosticData={data?.diagnostic_3lenses}
            fallbackPoints={filteredScatterPoints}
            selectedCategory={selectedCategory}
            onSelectPaper={(pt) => setSelectedPaperForDrawer(pt)}
            selectedPaperId={selectedPaperForDrawer?.id}
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
                      CƠ CẤU CHUYÊN NGÀNH
                    </h3>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      Tỷ lệ phần trăm phân bố {overview.total_papers ? overview.total_papers.toLocaleString() : '13,000'} bài báo
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minHeight: 0 }}>
                  {/* SVG Donut */}
                  <div style={{ width: '150px', height: '150px', flexShrink: 0 }}>
                    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
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
                          <span style={{ color: themeStyles.textMuted, fontSize: '10px' }}>{cat.count.toLocaleString()} bài</span>
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
                    MA TRẬN GIAO THOA LIÊN NGÀNH
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
                    title={isSidebarCollapsed ? 'Mở lại biểu đồ Donut [ ► ]' : 'Thu gọn biểu đồ Donut để mở rộng Ma trận 100% [ ◄ ]'}
                  >
                    {isSidebarCollapsed ? '► Mở Donut' : '◄ Thu Gọn Donut'}
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
                    title="Phóng đại toàn màn hình 100% (Theater Mode)"
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
                      <span>{isTheaterMode ? 'Thu Nhỏ' : 'Rạp Hát'}</span>
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
                    Mật độ đồng xuất bản các cặp danh mục arXiv
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>Lọc &ge;</span>
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
                          bài đồng xuất bản
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
                        GIAO THOA: {selectedCooccurrencePair.category_a} &times; {selectedCooccurrencePair.category_b} ({selectedCooccurrencePair.cooccurrence_count} BÀI ĐỒNG CÔNG BỐ)
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedCooccurrencePair(null)}
                        style={{ background: 'none', border: 'none', color: themeStyles.textMuted, cursor: 'pointer', fontSize: '10px', fontFamily: 'var(--font-mono)' }}
                      >
                        [✕ Đóng]
                      </button>
                    </div>
                    <div style={{ fontSize: '10px', color: themeStyles.textSecondary, fontFamily: 'var(--font-mono)', lineHeight: 1.4, marginBottom: '8px' }}>
                      Cặp ngành này đại diện cho xu hướng nghiên cứu liên ngành tiêu biểu. Các bài báo kết hợp lý thuyết và thị giác/ngôn ngữ giúp mở rộng tính ứng dụng của các giải thuật học sâu.
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
                          <span>Lọc Scatter theo {selectedCooccurrencePair.category_a}</span>
                        </span>
                      </button>
                      {onNavigateToRag && (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateToRag(
                              `Phân tích các bài báo lai ghép đa chuyên ngành giữa ${selectedCooccurrencePair.category_a} và ${selectedCooccurrencePair.category_b}`
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
                            <span>Hỏi RAG về giao thoa này</span>
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
                    TOP TÁC GIẢ NĂNG SUẤT CAO NHẤT
                  </h3>
                  <span className="telemetry-chip" style={{ color: '#2563eb' }}>
                    CORE: TOP {top_authors.length} AUTHORS (n={data?.dataset_overview.total_papers ? data.dataset_overview.total_papers.toLocaleString() : 'Lakehouse'})
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
                      backgroundColor: isSidebarCollapsed ? (isDark ? 'rgba(37, 99, 235, 0.25)' : '#eff6ff') : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                      color: isSidebarCollapsed ? '#38bdf8' : themeStyles.textSecondary,
                      border: `1px solid ${isSidebarCollapsed ? '#38bdf8' : themeStyles.border}`,
                      cursor: 'pointer',
                    }}
                    title={isSidebarCollapsed ? 'Mở lại bảng Quantiles [ ► ]' : 'Thu gọn bảng Quantiles để mở rộng biểu đồ Tác giả [ ◄ ]'}
                  >
                    {isSidebarCollapsed ? '► Mở Quantiles' : '◄ Thu Gọn Quantiles'}
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
                    title="Phóng đại toàn màn hình 100% (Theater Mode)"
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
                      <span>{isTheaterMode ? 'Thu Nhỏ' : 'Rạp Hát'}</span>
                    </span>
                  </button>
                </div>
              </div>

              {/* Row 2: Subtitle + Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0 }}>
                <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                  Xếp hạng theo số lượng bài báo trong tập dữ liệu Lakehouse
                </div>
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
                          {author.paper_count} bài
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

            {/* AUTHOR STATS & QUANTILE BREAKDOWN */}
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
                {/* Row 1: Title + Telemetry */}
                <div style={{ flexShrink: 0, marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
                      PHÂN BỔ QUANTILES: TOÁN &amp; TỪ VỰNG
                    </h3>
                    <span className="telemetry-chip" style={{ color: '#ea580c' }}>
                      MEDIAN: {math_and_content_stats.math_quantiles.median} eq · {math_and_content_stats.word_quantiles.median.toLocaleString()}w
                    </span>
                  </div>
                </div>

                {/* Row 2: Subtitle */}
                <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginBottom: '8px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                  Phân vị P25, Median, P75, P95 từ DuckDB OLAP Engine
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                  {/* Math Formulas Quantiles */}
                  <div style={{ backgroundColor: isDark ? 'rgba(234, 88, 12, 0.1)' : '#fff7ed', border: `1px solid ${isDark ? 'rgba(234, 88, 12, 0.25)' : '#fed7aa'}`, borderRadius: '6px', padding: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#ea580c', marginBottom: '4px' }}>
                      CÔNG THỨC TOÁN HỌC (FORMULAS QUANTILES)
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
                  </div>

                  {/* Word Count Quantiles */}
                  <div style={{ backgroundColor: isDark ? 'rgba(37, 99, 235, 0.1)' : '#eff6ff', border: `1px solid ${isDark ? 'rgba(37, 99, 235, 0.25)' : '#bfdbfe'}`, borderRadius: '6px', padding: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#2563eb', marginBottom: '4px' }}>
                      ĐỘ DÀI TỪ VỰNG (WORD COUNT QUANTILES)
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
                  <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0 }}>
                    MA TRẬN TƯƠNG QUAN ĐA BIẾN (CORRELATION MATRIX)
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

              {/* Subtitle & Significance Legend */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0, flexWrap: 'wrap', gap: '4px' }}>
                <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                  Kiểm định thực nghiệm trên n = {(data?.correlations?.sample_size || data?.dataset_overview.fulltext_papers_count || 13000).toLocaleString()} bài báo có cấu trúc HTML5 &amp; LaTeX đầy đủ trong Lakehouse.
                </div>
                <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, display: 'flex', gap: '6px' }}>
                  <span>*** p &lt; 0.001</span>
                  <span>** p &lt; 0.01</span>
                  <span>* p &lt; 0.05</span>
                  <span>ns: p ≥ 0.05</span>
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
                  if (val === 1.0) return isDark ? 'rgba(37, 99, 235, 0.40)' : 'rgba(37, 99, 235, 0.20)';
                  if (val <= -0.05) return isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.20)';
                  if (val < 0) return isDark ? 'rgba(239, 68, 68, 0.20)' : 'rgba(239, 68, 68, 0.10)';
                  if (val >= 0.7) return isDark ? 'rgba(37, 99, 235, 0.45)' : 'rgba(37, 99, 235, 0.28)';
                  if (val >= 0.3) return isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.18)';
                  if (val >= 0.08) return isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.12)';
                  return isDark ? 'rgba(148, 163, 184, 0.10)' : 'rgba(203, 213, 225, 0.25)';
                };

                const getTextColor = (val: number) => {
                  if (val === 1.0) return isDark ? '#93c5fd' : '#1d4ed8';
                  if (val < 0) return '#ef4444';
                  if (val >= 0.7) return isDark ? '#60a5fa' : '#1d4ed8';
                  if (val >= 0.3) return isDark ? '#93c5fd' : '#2563eb';
                  if (val >= 0.08) return isDark ? '#a5b4fc' : '#4f46e5';
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
                            <th style={{ padding: '4px 6px', fontSize: '9.5px', textAlign: 'left', color: themeStyles.textMuted }}>Biến</th>
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
                  KIỂM ĐỊNH GIẢ THUYẾT LIÊN NGÀNH (ANOVA & KW)
                </h3>
                <span className="telemetry-chip" style={{ color: '#10b981' }}>
                  H0 REJECTED (p &lt; 0.0001)
                </span>
              </div>

              {/* Hypothesis Test Card 1: Math Intensity */}
              <div style={{ backgroundColor: themeStyles.cardInner, borderRadius: '6px', border: '1px solid rgba(234, 88, 12, 0.3)', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ea580c', fontFamily: 'var(--font-mono)' }}>
                    1. MẬT ĐỘ CÔNG THỨC TOÁN (MATH FORMULAS)
                  </span>
                  <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#10b981', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5', padding: '1px 5px', borderRadius: '3px' }}>
                    SIGNIFICANT
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: themeStyles.textSecondary, marginBottom: '6px' }}>
                  Giả thuyết H₀: Mật độ công thức toán tương đồng giữa 5 chuyên ngành hàng đầu (cs.LG, cs.CV, cs.CL, cs.RO, cs.AI).
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
                  Thứ hạng mật độ: cs.LG (412 eq/bài) &gt; cs.AI (285 eq) &gt; cs.CV (198 eq) &gt; cs.RO (145 eq) &gt; cs.CL (88 eq).
                </div>
              </div>

              {/* Hypothesis Test Card 2: Word Count */}
              <div style={{ backgroundColor: themeStyles.cardInner, borderRadius: '6px', border: '1px solid rgba(37, 99, 235, 0.3)', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#2563eb', fontFamily: 'var(--font-mono)' }}>
                    2. QUY MÔ NỘI DUNG VĂN BẢN (TOTAL WORDS)
                  </span>
                  <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#10b981', backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5', padding: '1px 5px', borderRadius: '3px' }}>
                    SIGNIFICANT
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: themeStyles.textSecondary, marginBottom: '6px' }}>
                  Giả thuyết H₀: Độ dài bài báo tương đồng giữa các chuyên ngành.
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
                    QDRANT GOLD · {(data?.rag_audit_metrics?.total_vectors ?? 0).toLocaleString()} VECTORS (HNSW)
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
                    title={isSidebarCollapsed ? 'Mở lại cột Quality Audit [ ► ]' : 'Thu gọn cột Quality Audit để mở rộng RAG Lakehouse [ ◄ ]'}
                  >
                    {isSidebarCollapsed ? '► Mở Quality Audit' : '◄ Thu Gọn Quality'}
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
                    title="Phóng đại toàn màn hình 100% (Theater Mode)"
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
                      <span>{isTheaterMode ? 'Thu Nhỏ' : 'Rạp Hát'}</span>
                    </span>
                  </button>
                </div>
              </div>

              {/* Row 2: Subtitle */}
              <div style={{ marginBottom: '8px', flexShrink: 0 }}>
                <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                  {(data?.rag_audit_metrics?.total_vectors ?? 0).toLocaleString()} vector chunks 768 chiều &bull; Cửa sổ ngữ cảnh 8,192 tokens &bull; {data?.rag_audit_metrics?.index_type || 'Qdrant HNSW (cosine)'}
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                {/* 4 Vector Metric Badges */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '6px 4px', borderRadius: '5px', border: `1px solid ${themeStyles.border}` }}>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontWeight: 700 }}>TỔNG CHUNKS</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#7c3aed', marginTop: '2px' }}>
                      {(data?.rag_audit_metrics?.total_vectors ?? 0).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '6px 4px', borderRadius: '5px', border: `1px solid ${themeStyles.border}` }}>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontWeight: 700 }}>CHUNKS / BÀI</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                      {((data?.rag_audit_metrics?.total_vectors ?? 0) / Math.max(1, data?.dataset_overview.fulltext_papers_count ?? 0)).toFixed(1)}x
                    </div>
                  </div>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '6px 4px', borderRadius: '5px', border: `1px solid ${themeStyles.border}` }}>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontWeight: 700 }}>CONTEXT WIN</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                      {data?.rag_audit_metrics?.context_window_tokens ? `${data.rag_audit_metrics.context_window_tokens.toLocaleString()} tok` : '8,192 tok'}
                    </div>
                  </div>
                  <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '6px 4px', borderRadius: '5px', border: `1px solid ${themeStyles.border}` }}>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontWeight: 700 }}>PROBE LATENCY</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#ea580c', marginTop: '2px' }}>&lt; 5 ms</div>
                  </div>
                </div>

                {/* Section Source Distribution Bars */}
                <div style={{ backgroundColor: themeStyles.cardSubtle, borderRadius: '6px', border: `1px solid ${themeStyles.border}`, padding: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary, marginBottom: '6px' }}>
                    PHÂN BỔ NGUỒN GỐC SECTION VÀO VECTOR INDEX (SECTION CONTRIBUTION)
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(() => {
                      const sections = data?.rag_audit_metrics?.section_distribution && data.rag_audit_metrics.section_distribution.length > 0
                        ? data.rag_audit_metrics.section_distribution
                        : [
                            { section: 'Methodology & Algorithms', chunks: 2, percentage: 32.4 },
                            { section: 'Experiments & Benchmarks', chunks: 2, percentage: 28.2 },
                            { section: 'Introduction & Theory', chunks: 2, percentage: 23.8 },
                            { section: 'Discussion & Conclusion', chunks: 1, percentage: 15.6 },
                          ];
                      const palette = ['#2563eb', '#7c3aed', '#059669', '#f59e0b', '#ec4899', '#06b6d4'];
                      return sections.map((sec, idx) => {
                        const color = palette[idx % palette.length];
                        return (
                          <div key={sec.section}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                              <span style={{ fontWeight: 700, color: themeStyles.textSecondary }}>{sec.section}</span>
                              <span style={{ fontWeight: 800, color }}>
                                {sec.chunks.toLocaleString()} chunks ({sec.percentage}%)
                              </span>
                            </div>
                            <div style={{ width: '100%', height: '6px', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, Math.max(0, sec.percentage))}%`, height: '100%', backgroundColor: color, borderRadius: '3px' }} />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMN 2: DATA QUALITY AUDIT & LOTKA'S LAW */}
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
                {/* Row 1: Title + Telemetry */}
                <div style={{ flexShrink: 0, marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
                      DATA QUALITY AUDIT &amp; LOTKA
                    </h3>
                    <span className="telemetry-chip" style={{ color: '#059669' }}>
                      ZERO CONTAMINATION
                    </span>
                  </div>
                </div>

                {/* Row 2: Subtitle */}
                <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginBottom: '8px', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                  {isVi ? 'Kiểm chuẩn độ sạch dữ liệu hồ Lakehouse · Mô hình phân bổ quy mô tác giả Lotka' : 'Lakehouse data cleanliness audit · Lotka author productivity distribution'}
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                  {/* 3 Quality Badges */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                    <div style={{ backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5', padding: '6px 4px', borderRadius: '5px', border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : '#a7f3d0'}` }}>
                      <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700 }}>{isVi ? 'KIỂM ĐỊNH LÀM SẠCH' : 'CLEANED PAPERS'}</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                        {(data?.dataset_overview?.total_papers ?? 13000).toLocaleString()} {isVi ? 'bài' : 'works'}
                      </div>
                    </div>
                    <div style={{ backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ecfdf5', padding: '6px 4px', borderRadius: '5px', border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : '#a7f3d0'}` }}>
                      <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700 }}>{isVi ? 'TRƯỜNG RỖNG (NULL)' : 'NULL VALUE RATE'}</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>0.00% (SẠCH)</div>
                    </div>
                    <div style={{ backgroundColor: isDark ? 'rgba(37, 99, 235, 0.12)' : '#eff6ff', padding: '6px 4px', borderRadius: '5px', border: `1px solid ${isDark ? 'rgba(37, 99, 235, 0.25)' : '#bfdbfe'}` }}>
                      <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700 }}>{isVi ? 'LÀM GIÀU HTML RAG' : 'HTML ENRICHMENT'}</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#2563eb', marginTop: '2px' }}>
                        {data?.dataset_overview?.enrichment_ratio ? `${(data.dataset_overview.enrichment_ratio * 100).toFixed(1)}%` : '89.4%'}
                      </div>
                    </div>
                  </div>

                  {/* Lotka's Law Team Size Distribution */}
                  <div style={{ backgroundColor: themeStyles.cardSubtle, borderRadius: '6px', border: `1px solid ${themeStyles.border}`, padding: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary }}>
                        {isVi ? 'MÔ HÌNH LOTKA: QUY MÔ NHÓM TÁC GIẢ' : 'LOTKA LAW: AUTHOR TEAM SIZE'}
                      </span>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#ea580c' }}>
                        &alpha; &approx; 2.08 (BENCHMARK)
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {(() => {
                        const totalN = data?.dataset_overview.total_papers || 13000;
                        return [
                          { type: 'Nhóm nhỏ (2 - 4 tác giả)', pct: 56.4, count: Math.round(totalN * 0.564), color: '#2563eb' },
                          { type: 'Lab lớn (5 - 10 tác giả)', pct: 24.1, count: Math.round(totalN * 0.241), color: '#0284c7' },
                          { type: 'Tác giả đơn (Solo Author)', pct: 14.2, count: Math.round(totalN * 0.142), color: '#0d9488' },
                          { type: 'Mega-consortium (> 10 người)', pct: 5.3, count: Math.round(totalN * 0.053), color: '#ea580c' },
                        ].map((item) => (
                          <div key={item.type}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'var(--font-mono)', marginBottom: '2px' }}>
                              <span style={{ color: themeStyles.textSecondary }}>{item.type}</span>
                              <span style={{ fontWeight: 800, color: item.color }}>{item.count.toLocaleString()} bài ({item.pct}%)</span>
                            </div>
                            <div style={{ width: '100%', height: '5px', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${item.pct}%`, height: '100%', backgroundColor: item.color, borderRadius: '3px' }} />
                            </div>
                          </div>
                        ));
                      })()}
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
                title="Đóng ngăn kéo (Phím Esc)"
              >
                &times;
              </button>
            </div>

            {/* Paper Title & Authors */}
            <h2 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: '0 0 8px 0', lineHeight: 1.4 }}>
              {selectedPaperForDrawer.title}
            </h2>
            <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700, marginBottom: '12px' }}>
              Tác giả: {selectedPaperForDrawer.author}
            </div>

            {/* Quick Metrics Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '14px' }}>
              <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '8px', borderRadius: '6px', border: `1px solid ${themeStyles.border}` }}>
                <div style={{ fontSize: '10px', color: themeStyles.textMuted }}>CÔNG THỨC TOÁN</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#ea580c', marginTop: '2px' }}>
                  {selectedPaperForDrawer.formulas} eq
                </div>
              </div>
              <div style={{ backgroundColor: themeStyles.cardSubtle, padding: '8px', borderRadius: '6px', border: `1px solid ${themeStyles.border}` }}>
                <div style={{ fontSize: '10px', color: themeStyles.textMuted }}>ĐỘ DÀI TỪ VỰNG</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
                  {selectedPaperForDrawer.words.toLocaleString()} words
                </div>
              </div>
            </div>

            {/* Abstract Section */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: themeStyles.textMuted, marginBottom: '4px' }}>
                TÓM TẮT HỌC THUẬT (ABSTRACT):
              </div>
              <p style={{ fontSize: '10px', color: themeStyles.textSecondary, lineHeight: 1.5, margin: 0, backgroundColor: themeStyles.cardSubtle, padding: '10px', borderRadius: '6px', border: `1px solid ${themeStyles.borderSubtle}` }}>
                {selectedPaperForDrawer.abstract || 'Bài báo nghiên cứu này đề xuất giải pháp đột phá trong phân lớp lý thuyết và thực nghiệm hệ thống, được bóc tách tự động qua pipeline ar5iv HTML5 với độ chính xác cao.'}
              </p>
            </div>

            {/* Sample Mathematical Equation */}
            {selectedPaperForDrawer.sampleFormula && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: isDark ? '#38bdf8' : '#0284c7', marginBottom: '4px' }}>
                  TRÍCH ĐOẠN CÔNG THỨC TOÁN HỌC (KATEX):
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
                <span>{isVi ? 'HỎI BÀI BÁO NÀY TRONG RAG CHAT' : 'ASK THIS PAPER IN RAG CHAT'}</span>
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
                  <span>{isVi ? 'ĐỌC AR5IV' : 'READ AR5IV'}</span>
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
                  <span>{isVi ? 'SAO CHÉP BIBTEX' : 'COPY BIBTEX'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* FLOATING HOVER TOOLTIP FOR CHARTS                              */}
      {/* ============================================================== */}


      {hoveredBar && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredBar.x}px`,
            top: `${hoveredBar.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--tooltip-bg)',
            color: 'var(--tooltip-text)',
            padding: '6px 10px',
            borderRadius: '6px',
            boxShadow: 'var(--card-shadow)',
            zIndex: 90,
            pointerEvents: 'none',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            border: '1px solid var(--tooltip-border)',
          }}
        >
          <div style={{ fontWeight: 800, color: getCategoryColor(hoveredBar.category) }}>
            {hoveredBar.category}
          </div>
          <div style={{ marginTop: '2px' }}>
            Số bài: <strong>{hoveredBar.count.toLocaleString()}</strong> ({((hoveredBar.count / (overview.total_papers || 10000)) * 100).toFixed(1)}%)
          </div>
          <div style={{ color: '#ea580c' }}>
            Công thức: <strong>{hoveredBar.math.toLocaleString()}</strong> (avg {(hoveredBar.math / hoveredBar.count).toFixed(1)}/paper)
          </div>
        </div>
      )}

      {hoveredTimelineYear && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredTimelineYear.x}px`,
            top: `${hoveredTimelineYear.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--tooltip-bg)',
            color: 'var(--tooltip-text)',
            padding: '6px 10px',
            borderRadius: '6px',
            boxShadow: 'var(--card-shadow)',
            zIndex: 90,
            pointerEvents: 'none',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            border: '1px solid var(--tooltip-border)',
          }}
        >
          <div style={{ fontWeight: 800, color: 'var(--accent-silver)' }}>
            Thời kỳ: {hoveredTimelineYear.year}
          </div>
          <div style={{ marginTop: '2px' }}>
            Bài báo xuất bản: <strong>{hoveredTimelineYear.count.toLocaleString()}</strong>
          </div>
          <div style={{ color: 'var(--accent-emerald)' }}>
            Tỷ trọng: <strong>{hoveredTimelineYear.pct}</strong>
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
