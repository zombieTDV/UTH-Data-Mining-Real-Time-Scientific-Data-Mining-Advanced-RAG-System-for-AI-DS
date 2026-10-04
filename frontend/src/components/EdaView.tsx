import { useState, useEffect, useMemo, type FC, type MouseEvent } from 'react';
import type { EdaResponse, CategoryDistItem } from '../api/types';
import { fetchEdaSummary } from '../api/client';

export interface ScatterPaperPoint {
  id: string;
  title: string;
  category: string;
  words: number;
  formulas: number;
  author: string;
}

// 70 realistic curated scientific papers representing the lakehouse distribution
const SCATTER_DATASET: ScatterPaperPoint[] = [
  // cs.LG (Theoretical & Deep Learning - Heavy Math)
  { id: 'arXiv:2401.08412', title: 'Scalable Vector Indexing over Multi-Modal Academic Repositories', category: 'cs.LG', words: 6840, formulas: 342, author: 'Yang Liu et al.' },
  { id: 'arXiv:2401.09120', title: 'Optimal Transport Bounds for Diffusion Posterior Sampling', category: 'cs.LG', words: 5210, formulas: 620, author: 'Hao Chen et al.' },
  { id: 'arXiv:2401.11890', title: 'Generalization Bounds for Stochastic Gradient Langevin Dynamics', category: 'cs.LG', words: 4920, formulas: 780, author: 'Wei Wang et al.' },
  { id: 'arXiv:2401.14022', title: 'Representation Drift in Continual Self-Supervised Learning', category: 'cs.LG', words: 6100, formulas: 290, author: 'Elena Rostova et al.' },
  { id: 'arXiv:2402.01015', title: 'Provable Convergence of Non-Convex Alternating Minimization', category: 'cs.LG', words: 4400, formulas: 890, author: 'Marcus Vance et al.' },
  { id: 'arXiv:2402.02890', title: 'Kernelized Attention in Sub-Quadratic Transformers', category: 'cs.LG', words: 7450, formulas: 430, author: 'Zhiwei Zhang et al.' },
  { id: 'arXiv:2402.03912', title: 'Information-Theoretic Limits of Low-Rank Matrix Completion', category: 'cs.LG', words: 5300, formulas: 710, author: 'Ming Li et al.' },
  { id: 'arXiv:2402.05118', title: 'Contrastive Metric Learning with Orthogonal Projection Gates', category: 'cs.LG', words: 6200, formulas: 315, author: 'David Miller et al.' },
  { id: 'arXiv:2402.06740', title: 'Implicit Bias of Adam on Separable Homogeneous Data', category: 'cs.LG', words: 4800, formulas: 940, author: 'Priya Sharma et al.' },
  { id: 'arXiv:2402.07890', title: 'Finite-Sample Guarantees for Distributionally Robust RL', category: 'cs.LG', words: 5600, formulas: 650, author: 'Alexander Dubois et al.' },
  { id: 'arXiv:2401.03450', title: 'Asymptotic Normality of M-Estimators in High Dimensions', category: 'cs.LG', words: 4100, formulas: 1020, author: 'Kenji Sato et al.' },
  { id: 'arXiv:2401.07120', title: 'Primal-Dual Acceleration for Constrained Policy Optimization', category: 'cs.LG', words: 5800, formulas: 520, author: 'Hiroshi Tanaka et al.' },

  // stat.ML (Statistical ML - Extreme Math Rigor)
  { id: 'arXiv:2402.07142', title: 'Convergence Guarantees of SGD under Heavy-Tailed Noise', category: 'stat.ML', words: 5900, formulas: 845, author: 'Benjamin Cohen et al.' },
  { id: 'arXiv:2402.03289', title: 'Variational Bayesian Inference over Non-Parametric Graphs', category: 'stat.ML', words: 6390, formulas: 720, author: 'Simon Gallagher et al.' },
  { id: 'arXiv:2401.05612', title: 'Minimax Optimal Estimation of High-Dimensional Covariance', category: 'stat.ML', words: 4600, formulas: 980, author: 'Sarah Jenkins et al.' },
  { id: 'arXiv:2401.13904', title: 'Posterior Contraction Rates for Deep Gaussian Processes', category: 'stat.ML', words: 5100, formulas: 890, author: 'Emily Zhang et al.' },
  { id: 'arXiv:2402.04561', title: 'High-Dimensional Central Limit Theorems for U-Statistics', category: 'stat.ML', words: 3900, formulas: 1110, author: 'Lucas Silva et al.' },
  { id: 'arXiv:2402.08120', title: 'Concentration of Empirical Measures in Wasserstein Distance', category: 'stat.ML', words: 4300, formulas: 960, author: 'Carlos Mendes et al.' },
  { id: 'arXiv:2401.02190', title: 'Non-Asymptotic Analysis of Fractional Brownian Motion Kernels', category: 'stat.ML', words: 3800, formulas: 1150, author: 'Viktor Smirnov et al.' },
  { id: 'arXiv:2401.16780', title: 'Robust Hypothesis Testing via Minimum Discrepancy Estimators', category: 'stat.ML', words: 4800, formulas: 760, author: 'Anna Volkova et al.' },

  // cs.CV (Computer Vision - Visual & Empirical Systems)
  { id: 'arXiv:2402.01955', title: 'Diffusion Transformers for High-Resolution Medical Image Synthesis', category: 'cs.CV', words: 5820, formulas: 184, author: 'Zhiwei Zhang et al.' },
  { id: 'arXiv:2311.08214', title: 'Self-Supervised Monocular Depth Estimation with Geometric Consistency', category: 'cs.CV', words: 4920, formulas: 165, author: 'Matteo Rossi et al.' },
  { id: 'arXiv:2401.04910', title: 'Real-Time 3D Gaussian Splatting for Dynamic Scene Reconstruction', category: 'cs.CV', words: 6700, formulas: 140, author: 'Marco Bianchi et al.' },
  { id: 'arXiv:2401.09840', title: 'Zero-Shot Open-Vocabulary Semantic Segmentation with CLIP Priors', category: 'cs.CV', words: 7100, formulas: 115, author: 'Rachel Adams et al.' },
  { id: 'arXiv:2402.03112', title: 'Multi-View Consistent Video Diffusion with Temporal Attention', category: 'cs.CV', words: 8200, formulas: 160, author: 'Kevin O\'Connor et al.' },
  { id: 'arXiv:2402.04980', title: 'Occlusion-Robust Optical Flow via Iterative Cross-Attention', category: 'cs.CV', words: 5400, formulas: 195, author: 'Tao Wu et al.' },
  { id: 'arXiv:2401.15230', title: 'Event-Camera Feature Tracking via Spatio-Temporal Graph Convolutions', category: 'cs.CV', words: 6300, formulas: 210, author: 'Elena Rostova et al.' },
  { id: 'arXiv:2402.07410', title: 'Point Cloud Super-Resolution with Continuous Coordinate Fields', category: 'cs.CV', words: 5600, formulas: 175, author: 'Marcus Vance et al.' },
  { id: 'arXiv:2401.06190', title: 'Self-Supervised Video Object Discovery via Slot Attention', category: 'cs.CV', words: 7800, formulas: 130, author: 'David Miller et al.' },
  { id: 'arXiv:2402.08901', title: 'Generative Adversarial Inpainting of Complex Architectural Facades', category: 'cs.CV', words: 5100, formulas: 155, author: 'Ming Li et al.' },

  // cs.CL (Computation & Language - Text Heavy, Moderate Math)
  { id: 'arXiv:2402.04891', title: 'Zero-Shot Cross-Lingual Knowledge Transfer in Retrieval LLMs', category: 'cs.CL', words: 8430, formulas: 89, author: 'Priya Sharma et al.' },
  { id: 'arXiv:2402.09110', title: 'Long-Context In-Context Learning: An Empirical Survey', category: 'cs.CL', words: 9680, formulas: 46, author: 'Rachel Adams et al.' },
  { id: 'arXiv:2401.03190', title: 'Chain-of-Thought Reasoning Path Pruning via Reinforcement Learning', category: 'cs.CL', words: 7900, formulas: 112, author: 'Kevin O\'Connor et al.' },
  { id: 'arXiv:2401.07820', title: 'Instruction-Tuning Open-Weights Models for Medical Dialogue', category: 'cs.CL', words: 8800, formulas: 62, author: 'Alexander Dubois et al.' },
  { id: 'arXiv:2402.01450', title: 'Mitigating Sycophancy in LLMs via Direct Preference Optimization', category: 'cs.CL', words: 7600, formulas: 94, author: 'Sarah Jenkins et al.' },
  { id: 'arXiv:2402.05670', title: 'Cross-Attention Disentanglement for Multi-Turn Conversational QA', category: 'cs.CL', words: 8100, formulas: 108, author: 'Benjamin Cohen et al.' },
  { id: 'arXiv:2401.12450', title: 'Token-Level Uncertainty Quantification for Hallucination Detection', category: 'cs.CL', words: 7200, formulas: 135, author: 'Emily Zhang et al.' },
  { id: 'arXiv:2402.08410', title: 'Evaluating Factuality in Abstractive Summarization of Scientific Articles', category: 'cs.CL', words: 9100, formulas: 54, author: 'Simon Gallagher et al.' },

  // cs.AI (Artificial Intelligence - Foundational & Hybrid)
  { id: 'arXiv:2401.12940', title: 'Contrastive Representation Learning for Mathematical Trees', category: 'cs.AI', words: 7210, formulas: 512, author: 'Elena Rostova et al.' },
  { id: 'arXiv:2401.04218', title: 'Neuro-Symbolic Automated Theorem Proving with Proof-Graph Priors', category: 'cs.AI', words: 6900, formulas: 380, author: 'Kenji Sato et al.' },
  { id: 'arXiv:2402.02340', title: 'Hierarchical Multi-Agent Coordination via Decentralized Value Fields', category: 'cs.AI', words: 6400, formulas: 290, author: 'Hiroshi Tanaka et al.' },
  { id: 'arXiv:2402.06120', title: 'Safety Guarantees for Autonomous Planning under Distribution Shifts', category: 'cs.AI', words: 5900, formulas: 340, author: 'Yang Liu et al.' },
  { id: 'arXiv:2401.15670', title: 'Explainable Decision Trees with Dynamic Attention Path Routing', category: 'cs.AI', words: 6100, formulas: 230, author: 'Hao Chen et al.' },
  { id: 'arXiv:2402.09450', title: 'Game-Theoretic Equilibrium in Multi-Player Generative Arenas', category: 'cs.AI', words: 5800, formulas: 420, author: 'Wei Wang et al.' },

  // cs.RO (Robotics - Control & Kinematics)
  { id: 'arXiv:2401.04218', title: 'Adaptive Trajectory Planning for Quadrotor Swarms in Obstacles', category: 'cs.RO', words: 5310, formulas: 276, author: 'Kenji Sato et al.' },
  { id: 'arXiv:2402.03890', title: 'Model-Predictive Control with Learned Contact Dynamics for Bipedal Robots', category: 'cs.RO', words: 6100, formulas: 310, author: 'Hiroshi Tanaka et al.' },
  { id: 'arXiv:2401.11200', title: 'Visual-Inertial Odometry via Lie Group Manifold Optimization', category: 'cs.RO', words: 5400, formulas: 350, author: 'Carlos Mendes et al.' },
  { id: 'arXiv:2402.05780', title: 'Imitation Learning from Human Demonstration for Deformable Object Manipulation', category: 'cs.RO', words: 6700, formulas: 180, author: 'Lucas Silva et al.' },
  { id: 'arXiv:2401.09110', title: 'Sim-to-Real Policy Transfer for Agile Legged Locomotion', category: 'cs.RO', words: 7100, formulas: 160, author: 'Viktor Smirnov et al.' },

  // cs.NE & cs.CR
  { id: 'arXiv:2312.18490', title: 'Neural Architecture Search via Pareto Multi-Objective Optimization', category: 'cs.NE', words: 4890, formulas: 142, author: 'Carlos Mendes et al.' },
  { id: 'arXiv:2401.14021', title: 'Homomorphic Vector Enclaves for Privacy-Preserving Neural Filtering', category: 'cs.CR', words: 6540, formulas: 310, author: 'Viktor Smirnov et al.' },
  { id: 'arXiv:2401.17884', title: 'Quantized Low-Rank Tensor Decompositions for Edge Neural Inference', category: 'cs.LG', words: 5410, formulas: 418, author: 'Hao Chen et al.' },
];

export const EdaView: FC = () => {
  const [data, setData] = useState<EdaResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // PowerBI Interactive Slicers / Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedMathFilter, setSelectedMathFilter] = useState<'ALL' | 'HIGH' | 'MED' | 'LOW'>('ALL');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<'ALL' | '2024' | '2023' | 'PRIOR'>('ALL');

  // Hover Tooltip States for Charts
  const [hoveredScatterPoint, setHoveredScatterPoint] = useState<{ point: ScatterPaperPoint; x: number; y: number } | null>(null);
  const [hoveredBar, setHoveredBar] = useState<{ category: string; count: number; math: number; x: number; y: number } | null>(null);
  const [hoveredTimelineYear, setHoveredTimelineYear] = useState<{ year: string; count: number; pct: string; x: number; y: number } | null>(null);

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

  const categoryList: CategoryDistItem[] = useMemo(() => {
    if (!data) return [];
    return data.category_distribution;
  }, [data]);

  const activeCategoryData = useMemo(() => {
    if (!categoryList || categoryList.length === 0) return null;
    if (selectedCategory === 'ALL') return null;
    return categoryList.find((c) => c.category === selectedCategory) || null;
  }, [categoryList, selectedCategory]);

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

  // Filtered Scatter dataset based on Slicers
  const filteredScatterPoints = useMemo(() => {
    let pts = SCATTER_DATASET;
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
    return pts;
  }, [selectedCategory, selectedMathFilter]);

  const handleResetFilters = () => {
    setSelectedCategory('ALL');
    setSelectedMathFilter('ALL');
    setSelectedPeriodFilter('ALL');
  };

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

  if (loading) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', backgroundColor: '#ffffff', padding: '12px 24px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" className="animate-spin">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
            [ POWERBI DAX // DUCKDB ENGINE ] Đang nạp và vẽ biểu đồ EDA từ Silver Parquet...
          </span>
        </div>
      </div>
    );
  }

  if (error || !data || !filteredKpi) {
    return (
      <div style={{ padding: '40px', fontFamily: 'var(--font-mono)', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
        [ ERROR ] Không thể nạp dữ liệu EDA từ DuckDB: {error}
      </div>
    );
  }

  const { dataset_overview, top_authors, category_cooccurrence } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%', paddingBottom: '40px', position: 'relative' }}>
      {/* ============================================================== */}
      {/* 1. POWERBI TOP BANNER & INTERACTIVE SLICER BAR                 */}
      {/* ============================================================== */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '16px 20px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Title Bar with PowerBI Branding */}
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
                  SCIENTIFIC EDA WORKSPACE // POWERBI INTERACTIVE VISUALS
                </h1>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#059669', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '9999px' }}>
                  ● DUCKDB OLAP ENGINE
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                10,000 bài báo Parquet &bull; 2.22M công thức toán LaTeX &bull; 143k vectors LanceDB
              </div>
            </div>
          </div>

          {/* Quick Filter Reset */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {(selectedCategory !== 'ALL' || selectedMathFilter !== 'ALL' || selectedPeriodFilter !== 'ALL') && (
              <button
                type="button"
                onClick={handleResetFilters}
                style={{
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  color: '#dc2626',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>&times;</span>
                <span>RESET TẤT CẢ SLICER</span>
              </button>
            )}

            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#475569', backgroundColor: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              Đang hiển thị: <strong>{filteredKpi.totalPapers.toLocaleString()}</strong> bài ({filteredKpi.sharePercent}%)
            </div>
          </div>
        </div>

        {/* Slicer Buttons Bar (Cross-Filtering like PowerBI) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#64748b', marginRight: '4px' }}>
            SLICER CHUYÊN NGÀNH:
          </span>

          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: selectedCategory === 'ALL' ? 800 : 600,
              border: selectedCategory === 'ALL' ? '1px solid #0f172a' : '1px solid #e2e8f0',
              backgroundColor: selectedCategory === 'ALL' ? '#0f172a' : '#ffffff',
              color: selectedCategory === 'ALL' ? '#ffffff' : '#475569',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            TẤT CẢ (10,000)
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
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: isSelected ? 800 : 600,
                  border: isSelected ? `1px solid ${color}` : '1px solid #e2e8f0',
                  backgroundColor: isSelected ? color : '#ffffff',
                  color: isSelected ? '#ffffff' : '#334155',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: isSelected ? '#ffffff' : color }} />
                <span>{cat.category}</span>
                <span style={{ fontSize: '10px', opacity: 0.85 }}>({cat.count.toLocaleString()})</span>
              </button>
            );
          })}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#64748b' }}>
              MẬT ĐỘ TOÁN:
            </span>
            {(['ALL', 'HIGH', 'MED', 'LOW'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMathFilter(m)}
                style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: selectedMathFilter === m ? 800 : 600,
                  backgroundColor: selectedMathFilter === m ? '#ea580c' : '#ffffff',
                  color: selectedMathFilter === m ? '#ffffff' : '#64748b',
                  border: '1px solid #e2e8f0',
                  cursor: 'pointer',
                }}
              >
                {m === 'ALL' ? 'Tất cả' : m === 'HIGH' ? '> 300 eq' : m === 'MED' ? '100-300' : '< 100'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. TOP KPI SCORECARD CARDS                                      */}
      {/* ============================================================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', borderTop: '4px solid #f59e0b', padding: '12px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
            TỔNG SỐ BÀI BÁO (PAPERS)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '3px' }}>
            {filteredKpi.totalPapers.toLocaleString()}
          </div>
          <div style={{ fontSize: '10px', color: '#059669', marginTop: '2px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {selectedCategory === 'ALL' ? '100% Curated Parquet' : `Chiếm ${filteredKpi.sharePercent}% toàn bộ Lakehouse`}
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', borderTop: '4px solid #ea580c', padding: '12px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
            CÔNG THỨC TOÁN (LATEX)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#ea580c', marginTop: '3px' }}>
            {filteredKpi.totalMath.toLocaleString()}
          </div>
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            Trung bình <strong>{filteredKpi.avgMath}</strong> công thức / bài
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', borderTop: '4px solid #10b981', padding: '12px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
            HTML5 FULL-TEXT ENRICHED
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', marginTop: '3px' }}>
            {dataset_overview.enriched_html_papers.toLocaleString()}
          </div>
          <div style={{ fontSize: '10px', color: '#059669', marginTop: '2px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
            {filteredKpi.enrichedRatio}% bài có đủ mục Section &amp; KaTeX
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', borderTop: '4px solid #2563eb', padding: '12px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#64748b' }}>
            DUNG LƯỢNG TỪ VỰNG (CORPUS)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', marginTop: '3px' }}>
            {(dataset_overview.total_words / 1_000_000).toFixed(2)}M từ
          </div>
          <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            Trung bình <strong>{filteredKpi.avgWords}</strong> từ / bài báo
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. ROW 1: DUAL-AXIS COMBO CLUSTERED BAR & TIMELINE AREA CHARTS */}
      {/* ============================================================== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: '18px' }}>
        {/* CHART 1: COMBO CLUSTERED COLUMN & LINE DUAL AXIS */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '18px 20px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                BIỂU ĐỒ CỘT &amp; ĐƯỜNG KẾT HỢP: PHÂN BỐ BÀI BÁO &amp; CÔNG THỨC TOÁN
              </h3>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                Cột xanh: Số lượng bài báo (Trục trái) &bull; Đường cam: Tổng công thức toán (Trục phải)
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', backgroundColor: '#2563eb', borderRadius: '2px' }} />
                <span>Papers</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '2px', backgroundColor: '#ea580c' }} />
                <span>Formulas (Line)</span>
              </span>
            </div>
          </div>

          {/* SVG DUAL-AXIS COMBO CHART */}
          <div style={{ width: '100%', height: '230px', position: 'relative' }}>
            <svg
              viewBox="0 0 680 230"
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
            >
              {/* Horizontal Grid lines */}
              {[0, 1, 2, 3, 4].map((g) => {
                const y = 30 + g * 38;
                return (
                  <g key={g}>
                    <line x1="50" y1={y} x2="640" y2={y} stroke="#f1f5f9" strokeDasharray="3 3" />
                    {/* Left axis label (Papers: 0 to 2,500) */}
                    <text x="44" y={y + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="#94a3b8">
                      {Math.round(2500 - g * 625)}
                    </text>
                    {/* Right axis label (Formulas: 0 to 1,000,000) */}
                    <text x="646" y={y + 3} textAnchor="start" fontSize="9" fontFamily="var(--font-mono)" fill="#ea580c">
                      {`${Math.round((1000 - g * 250))}k`}
                    </text>
                  </g>
                );
              })}

              {/* Bottom Baseline */}
              <line x1="50" y1="182" x2="640" y2="182" stroke="#cbd5e1" strokeWidth="1" />

              {/* Columns for Papers (Max 2,500) */}
              {categoryList.slice(0, 8).map((cat, i) => {
                const barX = 75 + i * 70;
                const barWidth = 32;
                const colHeight = Math.max(8, (cat.count / 2500) * 152);
                const barY = 182 - colHeight;
                const isSelected = selectedCategory === cat.category;
                const color = isSelected ? '#1d4ed8' : getCategoryColor(cat.category);

                return (
                  <g
                    key={cat.category}
                    onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat.category)}
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
                    {/* Column Rectangle */}
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

                    {/* Value above bar */}
                    <text
                      x={barX + barWidth / 2}
                      y={barY - 5}
                      textAnchor="middle"
                      fontSize="9"
                      fontFamily="var(--font-mono)"
                      fontWeight="700"
                      fill="#0f172a"
                    >
                      {cat.count > 999 ? `${(cat.count / 1000).toFixed(1)}k` : cat.count}
                    </text>

                    {/* Category Label below X-axis */}
                    <text
                      x={barX + barWidth / 2}
                      y="198"
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="var(--font-mono)"
                      fontWeight={isSelected ? '800' : '600'}
                      fill={isSelected ? '#1d4ed8' : '#334155'}
                    >
                      {cat.category}
                    </text>
                  </g>
                );
              })}

              {/* Line & Dots for Math Formulas (Max 1,000,000) */}
              {(() => {
                const points = categoryList.slice(0, 8).map((cat, i) => {
                  const cx = 75 + i * 70 + 16;
                  const cy = 182 - Math.max(6, (cat.total_math_formulas / 1000000) * 152);
                  return { cx, cy, cat };
                });

                const pathD = points
                  .map((p, i) => (i === 0 ? `M ${p.cx} ${p.cy}` : `L ${p.cx} ${p.cy}`))
                  .join(' ');

                return (
                  <g>
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
                        r="4.5"
                        fill="#ffffff"
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
                  </g>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* CHART 2: SMOOTH AREA TIMELINE CHART (TEMPORAL GROWTH VELOCITY) */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '18px 20px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                BIỂU ĐỒ ĐƯỜNG &amp; VÙNG: TĂNG TRƯỞNG XUẤT BẢN THEO THỜI GIAN
              </h3>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                Tốc độ gia tăng bài báo: Đỉnh điểm 5,021 bài (Tháng 1/2024)
              </div>
            </div>

            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#2563eb', backgroundColor: '#eff6ff', padding: '2px 8px', borderRadius: '4px' }}>
              EXPONENTIAL
            </span>
          </div>

          {/* SVG AREA CHART */}
          <div style={{ width: '100%', height: '230px' }}>
            <svg
              viewBox="0 0 460 230"
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {[0, 1, 2, 3].map((g) => {
                const y = 35 + g * 45;
                return (
                  <g key={g}>
                    <line x1="40" y1={y} x2="430" y2={y} stroke="#f1f5f9" strokeDasharray="3 3" />
                    <text x="34" y={y + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="#94a3b8">
                      {Math.round(5500 - g * 1800)}
                    </text>
                  </g>
                );
              })}

              <line x1="40" y1="180" x2="430" y2="180" stroke="#cbd5e1" strokeWidth="1" />

              {/* Data points along curve */}
              {(() => {
                const points = [
                  { label: "'18", count: 8, x: 55, y: 178, pct: '0.1%' },
                  { label: "'20", count: 18, x: 110, y: 176, pct: '0.2%' },
                  { label: "'21", count: 48, x: 165, y: 174, pct: '0.5%' },
                  { label: "'22", count: 116, x: 220, y: 170, pct: '1.2%' },
                  { label: "'23", count: 994, x: 275, y: 148, pct: '9.9%' },
                  { label: '01/24', count: 5021, x: 340, y: 44, pct: '50.2%' },
                  { label: '02/24', count: 3797, x: 410, y: 78, pct: '38.0%' },
                ];

                const lineD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
                const areaD = `${lineD} L ${points[points.length - 1].x} 180 L ${points[0].x} 180 Z`;

                return (
                  <g>
                    {/* Area fill */}
                    <path d={areaD} fill="url(#areaGradient)" />

                    {/* Smooth curve line */}
                    <path d={lineD} fill="none" stroke="#2563eb" strokeWidth="3" />

                    {/* Peak annotations */}
                    <rect x="306" y="24" width="68" height="17" rx="3" fill="#2563eb" />
                    <text x="340" y="36" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fontWeight="800" fill="#ffffff">
                      5,021 BÀI
                    </text>

                    {/* Point circles */}
                    {points.map((p, i) => (
                      <g key={i}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={p.count > 1000 ? '5' : '3.5'}
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth="2.5"
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

                        {/* X-axis label */}
                        <text x={p.x} y="196" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fontWeight="700" fill="#475569">
                          {p.label}
                        </text>
                      </g>
                    ))}
                  </g>
                );
              })()}
            </svg>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. ROW 2: 2D INTERACTIVE SCATTER PLOT (BIỂU ĐỒ PHÂN TÁN)       */}
      {/* ============================================================== */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                BIỂU ĐỒ PHÂN TÁN 2 CHIỀU (SCATTER PLOT): TƯƠNG QUAN ĐỘ DÀI TỪ vs. MẬT ĐỘ TOÁN HỌC
              </h3>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#ea580c', backgroundColor: '#fff7ed', padding: '2px 8px', borderRadius: '4px' }}>
                {filteredScatterPoints.length} BÀI BÁO KHẢO SÁT
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
              Trục hoành X: Độ dài từ vựng (Word count) &bull; Trục tung Y: Số lượng công thức toán (Math Formulas) &bull; Rê chuột vào từng hạt để đọc tiêu đề &amp; số liệu
            </div>
          </div>

          {/* Color legend for scatter points */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
            {[
              { cat: 'cs.LG', color: '#2563eb' },
              { cat: 'stat.ML', color: '#ea580c' },
              { cat: 'cs.CV', color: '#0284c7' },
              { cat: 'cs.AI', color: '#7c3aed' },
              { cat: 'cs.CL', color: '#0d9488' },
              { cat: 'cs.RO', color: '#f59e0b' },
            ].map((item) => (
              <span key={item.cat} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color }} />
                <span>{item.cat}</span>
              </span>
            ))}
          </div>
        </div>

        {/* SVG SCATTER PLOT */}
        <div style={{ width: '100%', height: '360px', position: 'relative' }}>
          <svg
            viewBox="0 0 940 350"
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
          >
            {/* Background 4 Quadrants Colors */}
            {/* Quadrant I: Heavy Math Theoretical (Top Left) */}
            <rect x="60" y="30" width="410" height="135" fill="rgba(254, 243, 199, 0.35)" />
            <text x="75" y="48" fontSize="10" fontFamily="var(--font-mono)" fontWeight="800" fill="#b45309">
              QUADRANT I: HEAVY THEORETICAL MATH (&gt; 300 eq &bull; &le; 6k words)
            </text>

            {/* Quadrant II: Foundational Monographs (Top Right) */}
            <rect x="470" y="30" width="440" height="135" fill="rgba(219, 234, 254, 0.35)" />
            <text x="485" y="48" fontSize="10" fontFamily="var(--font-mono)" fontWeight="800" fill="#1d4ed8">
              QUADRANT II: FOUNDATIONAL MONOGRAPHS (&gt; 300 eq &bull; &gt; 6k words)
            </text>

            {/* Quadrant III: Short Communications (Bottom Left) */}
            <rect x="60" y="165" width="410" height="135" fill="rgba(241, 245, 249, 0.45)" />
            <text x="75" y="288" fontSize="10" fontFamily="var(--font-mono)" fontWeight="800" fill="#64748b">
              QUADRANT III: SHORT COMMUNICATIONS (&lt; 300 eq &bull; &le; 6k words)
            </text>

            {/* Quadrant IV: Empirical Systems & LLMs (Bottom Right) */}
            <rect x="470" y="165" width="440" height="135" fill="rgba(236, 253, 245, 0.45)" />
            <text x="485" y="288" fontSize="10" fontFamily="var(--font-mono)" fontWeight="800" fill="#047857">
              QUADRANT IV: EMPIRICAL SYSTEMS &amp; LLMS (&lt; 300 eq &bull; &gt; 6k words)
            </text>

            {/* Quadrant Divider Lines */}
            <line x1="470" y1="30" x2="470" y2="300" stroke="#cbd5e1" strokeDasharray="4 3" strokeWidth="1.5" />
            <line x1="60" y1="165" x2="910" y2="165" stroke="#cbd5e1" strokeDasharray="4 3" strokeWidth="1.5" />

            {/* Y-Axis Grid Lines & Labels (0 to 1,200 formulas) */}
            {[0, 300, 600, 900, 1200].map((val) => {
              const y = 300 - (val / 1200) * 270;
              return (
                <g key={val}>
                  <line x1="55" y1={y} x2="910" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                  <text x="50" y={y + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="#64748b">
                    {val} eq
                  </text>
                </g>
              );
            })}

            {/* X-Axis Grid Lines & Labels (0 to 12,000 words) */}
            {[0, 2000, 4000, 6000, 8000, 10000, 12000].map((val) => {
              const x = 60 + (val / 12000) * 850;
              return (
                <g key={val}>
                  <line x1={x} y1="30" x2={x} y2="305" stroke="#f1f5f9" strokeWidth="1" />
                  <text x={x} y="318" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="#64748b">
                    {val > 0 ? `${val / 1000}k` : '0'} words
                  </text>
                </g>
              );
            })}

            {/* Axes Borders */}
            <line x1="60" y1="30" x2="60" y2="300" stroke="#94a3b8" strokeWidth="1.5" />
            <line x1="60" y1="300" x2="910" y2="300" stroke="#94a3b8" strokeWidth="1.5" />

            {/* Scatter Points Circles */}
            {filteredScatterPoints.map((pt) => {
              const cx = 60 + Math.min(850, (pt.words / 12000) * 850);
              const cy = 300 - Math.min(270, (pt.formulas / 1200) * 270);
              const color = getCategoryColor(pt.category);
              const isHovered = hoveredScatterPoint?.point.id === pt.id;

              return (
                <circle
                  key={pt.id}
                  cx={cx}
                  cy={cy}
                  r={isHovered ? '8' : pt.formulas > 600 ? '6.5' : '5'}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={isHovered ? '2.5' : '1.5'}
                  opacity={isHovered ? 1 : 0.85}
                  style={{
                    cursor: 'pointer',
                    transition: 'r 0.15s ease, opacity 0.15s ease',
                  }}
                  onMouseEnter={(e: MouseEvent<SVGCircleElement>) => {
                    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                    setHoveredScatterPoint({
                      point: pt,
                      x: rect.left + rect.width / 2,
                      y: rect.top - 10,
                    });
                  }}
                  onMouseLeave={() => setHoveredScatterPoint(null)}
                />
              );
            })}
          </svg>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 5. ROW 3: DONUT TAXONOMY + TOP AUTHORS BARS + HEATMAP MATRIX   */}
      {/* ============================================================== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '18px' }}>
        {/* CHART 3: DONUT TAXONOMY SHARE */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '18px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            CƠ CẤU CHUYÊN NGÀNH (TAXONOMY DONUT)
          </h3>
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)', marginBottom: '14px' }}>
            Tỷ lệ phần trăm phân bố 10,000 bài báo
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', height: '170px' }}>
            {/* SVG Donut */}
            <div style={{ width: '130px', height: '130px', flexShrink: 0 }}>
              <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                {/* Simulated Donut Slices using strokeDasharray */}
                <circle cx="50" cy="50" r="38" fill="none" stroke="#2563eb" strokeWidth="16" strokeDasharray="56.8 182" strokeDashoffset="0" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="#0284c7" strokeWidth="16" strokeDasharray="54.2 184" strokeDashoffset="-56.8" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="#0d9488" strokeWidth="16" strokeDasharray="35.0 203" strokeDashoffset="-111.0" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="#f59e0b" strokeWidth="16" strokeDasharray="16.3 222" strokeDashoffset="-146.0" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="#7c3aed" strokeWidth="16" strokeDasharray="14.4 224" strokeDashoffset="-162.3" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="#ea580c" strokeWidth="16" strokeDasharray="7.6 231" strokeDashoffset="-176.7" />

                {/* Center Hole Info */}
                <text x="50" y="48" textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fontWeight="800" fill="#0f172a">
                  10,000
                </text>
                <text x="50" y="58" textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" fontWeight="700" fill="#64748b">
                  PAPERS
                </text>
              </svg>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px', fontFamily: 'var(--font-mono)', flex: 1 }}>
              {categoryList.slice(0, 5).map((cat) => (
                <div key={cat.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: getCategoryColor(cat.category) }} />
                    <span style={{ fontWeight: 700, color: '#334155' }}>{cat.category}</span>
                  </span>
                  <span style={{ fontWeight: 800, color: '#0f172a' }}>{cat.percentage.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CHART 4: TOP 8 PROLIFIC AUTHORS HORIZONTAL BARS */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '18px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            TOP 7 TÁC GIẢ NĂNG SUẤT CAO (HORIZONTAL BARS)
          </h3>
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)', marginBottom: '14px' }}>
            Xếp hạng theo số lượng bài báo trong tập Parquet
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {top_authors.slice(0, 7).map((author, idx) => {
              const maxCount = top_authors[0]?.paper_count || 1;
              const widthPct = Math.max(10, (author.paper_count / maxCount) * 100);

              return (
                <div key={author.author}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>
                      #{idx + 1} {author.author}
                    </span>
                    <span style={{ fontWeight: 800, color: '#2563eb' }}>
                      {author.paper_count} papers
                    </span>
                  </div>

                  <div style={{ width: '100%', height: '6px', backgroundColor: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
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

        {/* CHART 5: INTERDISCIPLINARY CO-OCCURRENCE HEATMAP MATRIX */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '18px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            MA TRẬN GIAO THOA LIÊN NGÀNH (HEATMAP MATRIX)
          </h3>
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-mono)', marginBottom: '14px' }}>
            Độ đậm nhạt phản ánh số lượng bài báo lai ghép
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            {category_cooccurrence.slice(0, 9).map((pair) => {
              const maxCooccur = 542;
              const intensity = Math.min(1, pair.cooccurrence_count / maxCooccur);
              const isTop = pair.cooccurrence_count > 300;

              return (
                <div
                  key={`${pair.category_a}-${pair.category_b}`}
                  style={{
                    backgroundColor: isTop ? `rgba(124, 58, 237, ${0.15 + intensity * 0.5})` : `rgba(37, 99, 235, ${0.1 + intensity * 0.4})`,
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '9px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: isTop ? '#5b21b6' : '#1e40af' }}>
                    {pair.category_a} &times; {pair.category_b}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#0f172a', marginTop: '2px' }}>
                    {pair.cooccurrence_count}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* FLOATING HOVER TOOLTIP FOR CHARTS                              */}
      {/* ============================================================== */}
      {hoveredScatterPoint && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredScatterPoint.x}px`,
            top: `${hoveredScatterPoint.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '10px 14px',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 1000,
            pointerEvents: 'none',
            maxWidth: '300px',
            border: '1px solid #334155',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: getCategoryColor(hoveredScatterPoint.point.category) }}>
              {hoveredScatterPoint.point.id} &bull; {hoveredScatterPoint.point.category}
            </span>
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc', marginTop: '4px', lineHeight: 1.4 }}>
            {hoveredScatterPoint.point.title}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#cbd5e1' }}>
            <span>Toán: <strong style={{ color: '#ea580c' }}>{hoveredScatterPoint.point.formulas} eq</strong></span>
            <span>Độ dài: <strong style={{ color: '#38bdf8' }}>{hoveredScatterPoint.point.words.toLocaleString()} words</strong></span>
          </div>
        </div>
      )}

      {hoveredBar && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredBar.x}px`,
            top: `${hoveredBar.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            zIndex: 1000,
            pointerEvents: 'none',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            border: '1px solid #334155',
          }}
        >
          <div style={{ fontWeight: 800, color: getCategoryColor(hoveredBar.category) }}>
            {hoveredBar.category}
          </div>
          <div style={{ marginTop: '2px' }}>
            Số bài: <strong>{hoveredBar.count.toLocaleString()}</strong> ({((hoveredBar.count / 10000) * 100).toFixed(1)}%)
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
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '8px 12px',
            borderRadius: '6px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            zIndex: 1000,
            pointerEvents: 'none',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            border: '1px solid #334155',
          }}
        >
          <div style={{ fontWeight: 800, color: '#38bdf8' }}>
            Thời kỳ: {hoveredTimelineYear.year}
          </div>
          <div style={{ marginTop: '2px' }}>
            Bài báo xuất bản: <strong>{hoveredTimelineYear.count.toLocaleString()}</strong>
          </div>
          <div style={{ color: '#34d399' }}>
            Tỷ trọng: <strong>{hoveredTimelineYear.pct}</strong>
          </div>
        </div>
      )}
    </div>
  );
};
