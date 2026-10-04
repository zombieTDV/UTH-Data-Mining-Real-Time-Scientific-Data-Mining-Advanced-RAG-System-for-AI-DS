import { useState, type FC } from 'react';

export interface WorkflowNodeData {
  id: string;
  stepCode: string;
  title: string;
  subtitle: string;
  badgeType: 'purple-layers' | 'magenta-bolt' | 'amber-bolt' | 'red-fork' | 'green-bolt' | 'blue-bolt' | 'indigo-cube';
  badgeColor: string;
  category: string;
  metric: string;
  details: string[];
  targetTab?: 'eda' | 'pillars' | 'rag' | 'logs';
}

export interface InteractiveWorkflowCanvasProps {
  onSelectNode?: (nodeId: string, targetTab?: string) => void;
  onNavigateTab?: (tab: 'schematic' | 'eda' | 'pillars' | 'rag' | 'logs') => void;
  onTriggerPipeline?: () => void;
  isPipelineRunning?: boolean;
}

export const WORKFLOW_NODES: Record<string, WorkflowNodeData> = {
  'start-flow': {
    id: 'start-flow',
    stepCode: '01',
    title: 'Start Flow',
    subtitle: 'arXiv OAI-PMH Harvester & ar5iv HTML5 Crawler',
    badgeType: 'purple-layers',
    badgeColor: '#8b5cf6',
    category: 'INGESTION ENGINE',
    metric: '10,000 Academic Papers (cs.AI, cs.LG, cs.CV, cs.CL, stat.ML)',
    details: [
      'OAI-PMH XML protocol crawler with 6.0s rate-limiting delays',
      'HTML5 full-text body streaming with math preservation',
      'Immutable ingestion hash generation (SHA-256)'
    ],
    targetTab: 'logs'
  },
  'bronze-instance': {
    id: 'bronze-instance',
    stepCode: '02',
    title: 'Instance: Bronze Lakehouse',
    subtitle: 'Cloudflare R2 Bucket // raw-html-papers & oai-batches',
    badgeType: 'magenta-bolt',
    badgeColor: '#ec4899',
    category: 'OBJECT STORAGE LAKE',
    metric: '2.841 GB Raw Storage (9,022 HTML5 + 12 Batches)',
    details: [
      'Zero egress fee cloud lakehouse on Cloudflare R2 (S3-compatible API)',
      'Deterministic keying: raw/html/year=2026/paper_id.html',
      'Automatic sync verification with md5 and sha256 checksums'
    ],
    targetTab: 'logs'
  },
  'review-duckdb': {
    id: 'review-duckdb',
    stepCode: '03',
    title: 'Review Case: DuckDB & LaTeX Normalizer',
    subtitle: 'In-Process Vectorized OLAP & Mathematical Equation Parser',
    badgeType: 'amber-bolt',
    badgeColor: '#f59e0b',
    category: 'ETL & SIMD OLAP',
    metric: '2,224,198 LaTeX Formulas Extracted Across Canonical Sections',
    details: [
      'Canonical section taxonomy: Abstract, Intro, Methods, Results, Discussion',
      'SIMD vectorized Apache Arrow zero-copy memory transfers',
      'DuckDB SQL aggregations executed sub-second on local SSD'
    ],
    targetTab: 'eda'
  },
  'silver-parquet': {
    id: 'silver-parquet',
    stepCode: '04',
    title: 'Step Submitted: Silver Parquet & Real-Time EDA',
    subtitle: 'DuckDB 10k Papers Analysis // Category & Author OLAP',
    badgeType: 'green-bolt',
    badgeColor: '#10b981',
    category: 'CURATED COLUMNAR STORE',
    metric: '231.73 MB Parquet Partition (year=2026)',
    details: [
      'Real-time query engine over 10,000 papers and 35k co-authors',
      'Category distribution: cs.CV (3,410), cs.LG (2,890), cs.AI (1,740)',
      'Author productivity rankings: Yang Liu (38), Hao Chen (32), Wei Wang (31)',
      'LaTeX formula quantiles: p50 = 124, p90 = 412, max = 3,892 formulas/paper'
    ],
    targetTab: 'eda'
  },
  'gold-lancedb': {
    id: 'gold-lancedb',
    stepCode: '05',
    title: 'Approved Status: Gold LanceDB & 4 Mining Pillars',
    subtitle: '143,523 Vectors // Rules, Clusters, Louvain Graph, Novelty',
    badgeType: 'blue-bolt',
    badgeColor: '#3b82f6',
    category: 'VECTOR STORE & MINING ENGINE',
    metric: '143,523 Embeddings (768-dim Nomic AI) + 4 Mining Pillars',
    details: [
      'Pillar 1: FP-Growth Association Mining (22 rules, max lift: 2.14)',
      'Pillar 2: K-Means & DBSCAN Semantic Clustering (6 clusters, silhouette: 0.0216)',
      'Pillar 3: Co-authorship Louvain Network (35,117 authors, PageRank hub detection)',
      'Pillar 4: Isolation Forest Novelty Outlier Detection (30 frontier papers)'
    ],
    targetTab: 'pillars'
  },
  'grounded-rag': {
    id: 'grounded-rag',
    stepCode: '06',
    title: 'Grounded RAG & Academic Synthesis',
    subtitle: 'Dense LanceDB Context // Anti-Hallucination Verified Citations',
    badgeType: 'indigo-cube',
    badgeColor: '#6366f1',
    category: 'INFERENCE & QA ENGINE',
    metric: 'Sub-50ms Retrieval Latency // Exact Paper & Section Attributions',
    details: [
      'Hybrid Cosine ANN retrieval over 143k chunks',
      'Academic citation enforcement gate with similarity threshold',
      'Pre-computed 2D projection and section grounding'
    ],
    targetTab: 'rag'
  }
};

export const InteractiveWorkflowCanvas: FC<InteractiveWorkflowCanvasProps> = ({
  onSelectNode,
  onNavigateTab,
  onTriggerPipeline,
  isPipelineRunning = false
}) => {
  const [activeMode, setActiveMode] = useState<'workflow' | 'form'>('workflow');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('silver-parquet');
  const [showLeftContextMenu, setShowLeftContextMenu] = useState<boolean>(true);
  const [showFloatingToolbox, setShowFloatingToolbox] = useState<boolean>(true);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);

  const selectedNode = WORKFLOW_NODES[selectedNodeId] || WORKFLOW_NODES['silver-parquet'];

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setInspectorOpen(true);
    if (onSelectNode) {
      onSelectNode(nodeId, WORKFLOW_NODES[nodeId]?.targetTab);
    }
  };

  const handleOpenTargetTab = (tab?: 'eda' | 'pillars' | 'rag' | 'logs') => {
    if (tab && onNavigateTab) {
      onNavigateTab(tab);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '820px',
        width: '100%',
        backgroundColor: '#f8fafc',
        backgroundImage: 'radial-gradient(#cbd5e1 1.25px, transparent 1.25px)',
        backgroundSize: '22px 22px',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* Top Canvas Controls Bar (Mode switch & canvas status) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 20
        }}
      >
        {/* Toggle Mode: Form / Workflow pill (Matches ui_ex.jpg top-left switch) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              backgroundColor: '#f1f5f9',
              borderRadius: '9999px',
              padding: '3px 4px',
              border: '1px solid #e2e8f0',
              fontSize: '13px',
              fontWeight: 500,
              color: '#475569'
            }}
          >
            <button
              type="button"
              onClick={() => setActiveMode('form')}
              style={{
                border: 'none',
                backgroundColor: activeMode === 'form' ? '#ffffff' : 'transparent',
                color: activeMode === 'form' ? '#0f172a' : '#64748b',
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: activeMode === 'form' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Form
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('workflow')}
              style={{
                border: 'none',
                backgroundColor: activeMode === 'workflow' ? '#2563eb' : 'transparent',
                color: activeMode === 'workflow' ? '#ffffff' : '#64748b',
                padding: '4px 14px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: activeMode === 'workflow' ? '0 1px 3px rgba(37,99,235,0.3)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Workflow
            </button>
          </div>

          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              color: '#64748b',
              backgroundColor: '#f8fafc',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0'
            }}
          >
            FLOW GRAPH // ACTIVE PIPELINE
          </div>
        </div>

        {/* Quick actions & Execution Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isPipelineRunning && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#ea580c',
                fontFamily: 'var(--font-mono)',
                backgroundColor: '#fff7ed',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #ffedd5'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
              RUNNING MASTER PIPELINE...
            </div>
          )}

          <button
            type="button"
            onClick={onTriggerPipeline}
            disabled={isPipelineRunning}
            style={{
              backgroundColor: '#ea580c',
              color: '#ffffff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isPipelineRunning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)',
              opacity: isPipelineRunning ? 0.7 : 1
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Run Master Pipeline
          </button>
        </div>
      </div>

      {/* Main Flow Canvas Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          padding: '40px 24px 80px',
          overflowY: 'auto',
          position: 'relative'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: '820px'
          }}
        >
          {/* ============================================================== */}
          {/* NODE 1: START FLOW (PURPLE BADGE) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleNodeClick('start-flow')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '10px 18px',
              border: selectedNodeId === 'start-flow' ? '2px solid #8b5cf6' : '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              position: 'relative',
              zIndex: 10
            }}
          >
            {/* Purple Icon Badge */}
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#6d28d9' }}>Start Flow</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>arXiv OAI-PMH & ar5iv HTML5 Harvester</span>
            </div>
          </div>

          {/* Vertical Connector Line 1 with (+) Circle */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              height: '48px',
              position: 'relative'
            }}
          >
            <div style={{ width: '2px', height: '100%', backgroundColor: '#cbd5e1' }} />
            <button
              type="button"
              title="Add Pipeline Step"
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                border: '1.5px solid #94a3b8',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              +
            </button>
          </div>

          {/* ============================================================== */}
          {/* NODE 2: INSTANCE / BRONZE LAKE (MAGENTA BADGE) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleNodeClick('bronze-instance')}
            style={{
              width: '100%',
              maxWidth: '380px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '12px 16px',
              border: selectedNodeId === 'bronze-instance' ? '2px solid #ec4899' : '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              position: 'relative',
              zIndex: 10
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* Magenta Lightning Badge */}
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#e11d48',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Instance</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Cloudflare R2 Bronze Lakehouse</div>
              </div>
            </div>

            {/* Right Action Icons: Gear & Trash */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNodeClick('bronze-instance');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#64748b'
                }}
                title="Settings"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  alert('Stage protected: Core lakehouse instance cannot be removed.');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#64748b'
                }}
                title="Delete"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Vertical Connector Line 2 with Dark Pill [ (+) Add a step ] */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              height: '56px',
              position: 'relative'
            }}
          >
            <div style={{ width: '2px', height: '100%', backgroundColor: '#cbd5e1' }} />
            <div
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                borderRadius: '9999px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.2)'
              }}
              onClick={onTriggerPipeline}
            >
              <span style={{ fontSize: '13px', lineHeight: 1 }}>+</span>
              <span>Add a step</span>
            </div>
          </div>

          {/* ============================================================== */}
          {/* NODE 3: REVIEW CASE (AMBER BADGE) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleNodeClick('review-duckdb')}
            style={{
              width: '100%',
              maxWidth: '380px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '12px 16px',
              border: selectedNodeId === 'review-duckdb' ? '2px solid #f59e0b' : '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              position: 'relative',
              zIndex: 10
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* Amber Lightning Badge */}
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Review Case</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>DuckDB & LaTeX Parser (2.22M formulas)</div>
              </div>
            </div>

            {/* Right Action Icons: Gear & Trash */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNodeClick('review-duckdb');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#64748b'
                }}
                title="Settings"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  alert('Stage protected: LaTeX Parser is a canonical stage.');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#64748b'
                }}
                title="Delete"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Connector down to Parallel Fork Node */}
          <div style={{ width: '2px', height: '32px', backgroundColor: '#cbd5e1' }} />

          {/* ============================================================== */}
          {/* NODE 4: PARALLEL FLOW SPLIT NODE (RED BADGE) */}
          {/* ============================================================== */}
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)',
              zIndex: 10
            }}
            title="Parallel Split Flow: Silver EDA and Gold Vector Mining"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="3" width="6" height="6" rx="1" />
              <rect x="15" y="15" width="6" height="6" rx="1" />
              <rect x="3" y="15" width="6" height="6" rx="1" />
              <path d="M6 9v3a3 3 0 0 0 3 3h6" />
              <path d="M6 12h0" />
            </svg>
          </div>

          {/* Parallel Flow Connector Fork Tree */}
          <div style={{ width: '100%', maxWidth: '640px', position: 'relative', marginTop: '0px' }}>
            {/* Center stem down from red split icon */}
            <div
              style={{
                width: '2px',
                height: '24px',
                backgroundColor: '#cbd5e1',
                margin: '0 auto'
              }}
            />

            {/* Horizontal Branch Bar */}
            <div
              style={{
                width: '100%',
                height: '2px',
                backgroundColor: '#cbd5e1',
                position: 'relative'
              }}
            />

            {/* Two parallel stems down to Path 1 and Path 2 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ width: '2px', height: '24px', backgroundColor: '#cbd5e1', marginLeft: '120px' }} />
              <div style={{ width: '2px', height: '24px', backgroundColor: '#cbd5e1', marginRight: '120px' }} />
            </div>
          </div>

          {/* ============================================================== */}
          {/* PARALLEL BRANCHES: PATH 1 (LEFT) & PATH 2 (RIGHT) */}
          {/* ============================================================== */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '32px',
              width: '100%',
              maxWidth: '760px',
              marginTop: '4px'
            }}
          >
            {/* ---------------- PATH 1 (LEFT BRANCH: GREEN BADGE) ---------------- */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {/* Path 1 Pill Tag */}
              <div
                style={{
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 12px',
                  borderRadius: '9999px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                }}
                onClick={() => setShowLeftContextMenu(!showLeftContextMenu)}
              >
                <span>Path 1</span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>•••</span>
              </div>

              {/* Node Card: Step Submitted (Silver Parquet) */}
              <div
                onClick={() => handleNodeClick('silver-parquet')}
                style={{
                  width: '100%',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  border: selectedNodeId === 'silver-parquet' ? '2px solid #10b981' : '1px solid #e2e8f0',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Green Lightning Badge */}
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        flexShrink: 0
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>

                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Step Submitted</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Silver Parquet // Real-Time EDA</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNodeClick('silver-parquet');
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowLeftContextMenu(!showLeftContextMenu);
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="1" />
                        <circle cx="19" cy="12" r="1" />
                        <circle cx="5" cy="12" r="1" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Floating Context Menu (Matching ui_ex.jpg popover exactly) */}
                {showLeftContextMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: '48px',
                      left: '32px',
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                      border: '1px solid #e2e8f0',
                      padding: '6px',
                      minWidth: '150px',
                      zIndex: 30,
                      animation: 'fadeIn 0.15s ease'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        handleOpenTargetTab('eda');
                        setShowLeftContextMenu(false);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#0f172a',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      Rename
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleOpenTargetTab('eda');
                        setShowLeftContextMenu(false);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#334155',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Duplicate
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText('data/silver/year=2026/papers.parquet');
                        alert('Copied Parquet lakehouse path to clipboard.');
                        setShowLeftContextMenu(false);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#334155',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      </svg>
                      Copy
                    </button>

                    <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }} />

                    <button
                      type="button"
                      onClick={() => {
                        alert('Silver Parquet dataset is canonical and locked.');
                        setShowLeftContextMenu(false);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#ef4444',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fef2f2')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Connector line down to orange anchor ring */}
              <div style={{ width: '2px', height: '48px', backgroundColor: '#cbd5e1' }} />

              {/* Orange Anchor Ring (Matching ui_ex.jpg) */}
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  border: '4px solid #ea580c',
                  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.3)',
                  cursor: 'pointer'
                }}
                title="Path 1 Anchor Endpoint"
              />
            </div>

            {/* ---------------- PATH 2 (RIGHT BRANCH: BLUE BADGE) ---------------- */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {/* Path 2 Pill Tag */}
              <div
                onClick={() => setShowFloatingToolbox(!showFloatingToolbox)}
                style={{
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 12px',
                  borderRadius: '9999px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                }}
              >
                <span>Path 2</span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>•••</span>
              </div>

              {/* Node Card: Approved Status (Gold LanceDB) */}
              <div
                onClick={() => handleNodeClick('gold-lancedb')}
                style={{
                  width: '100%',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  border: selectedNodeId === 'gold-lancedb' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Blue Lightning Badge */}
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        flexShrink: 0
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>

                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Approved Status</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Gold LanceDB // 4 Mining Pillars</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNodeClick('gold-lancedb');
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenTargetTab('pillars');
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Vertical connector with (+) circle */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  height: '48px',
                  position: 'relative'
                }}
              >
                <div style={{ width: '2px', height: '100%', backgroundColor: '#cbd5e1' }} />
                <button
                  type="button"
                  title="Add Action"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    border: '1.5px solid #94a3b8',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}
                >
                  +
                </button>
              </div>

              {/* Orange Anchor Ring (Matching ui_ex.jpg) */}
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  border: '4px solid #ea580c',
                  boxShadow: '0 2px 6px rgba(234, 88, 12, 0.3)',
                  cursor: 'pointer'
                }}
                title="Path 2 Anchor Endpoint"
              />

              {/* Floating Action Menu Popover (Bottom Right, matching ui_ex.jpg exactly) */}
              {showFloatingToolbox && (
                <div
                  style={{
                    position: 'absolute',
                    top: '80px',
                    right: '-40px',
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                    border: '1px solid #e2e8f0',
                    padding: '8px',
                    minWidth: '150px',
                    zIndex: 30
                  }}
                >
                  <button
                    type="button"
                    onClick={onTriggerPipeline}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#0f172a',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <polyline points="19 12 12 19 5 12" />
                    </svg>
                    Add Step
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenTargetTab('pillars')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#0f172a',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="6" height="6" rx="1" />
                      <rect x="15" y="15" width="6" height="6" rx="1" />
                      <path d="M6 9v3a3 3 0 0 0 3 3h6" />
                    </svg>
                    Parallel Flow
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenTargetTab('rag')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#0f172a',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    Go To RAG
                  </button>

                  <button
                    type="button"
                    onClick={() => handleNodeClick('grounded-rag')}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#0f172a',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                    Merge Flow
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Merge Flow Stem into Grounded RAG synthesis */}
          <div style={{ width: '100%', maxWidth: '640px', marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ width: '2px', height: '24px', backgroundColor: '#cbd5e1', marginLeft: '120px' }} />
              <div style={{ width: '2px', height: '24px', backgroundColor: '#cbd5e1', marginRight: '120px' }} />
            </div>
            <div style={{ width: '100%', height: '2px', backgroundColor: '#cbd5e1' }} />
            <div style={{ width: '2px', height: '24px', backgroundColor: '#cbd5e1', margin: '0 auto' }} />
          </div>

          {/* ============================================================== */}
          {/* FINAL NODE: GROUNDED RAG SYNTHESIS ENGINE */}
          {/* ============================================================== */}
          <div
            onClick={() => handleNodeClick('grounded-rag')}
            style={{
              width: '100%',
              maxWidth: '420px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '12px 18px',
              border: selectedNodeId === 'grounded-rag' ? '2px solid #6366f1' : '1px solid #e2e8f0',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.08)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              marginTop: '4px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  backgroundColor: '#6366f1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Grounded RAG Console</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Strict Academic Anti-Hallucination QA with Citations</div>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenTargetTab('rag');
              }}
              style={{
                backgroundColor: '#ede9fe',
                color: '#6d28d9',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Open QA
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SLIDE-OVER NODE INSPECTOR DRAWER */}
      {/* ============================================================== */}
      {inspectorOpen && selectedNode && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '380px',
            height: '100%',
            backgroundColor: '#ffffff',
            borderLeft: '1px solid #e2e8f0',
            boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 40,
            animation: 'slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#0f172a',
                  color: '#ffffff'
                }}
              >
                STAGE {selectedNode.stepCode}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                {selectedNode.category}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '18px',
                color: '#64748b',
                cursor: 'pointer',
                padding: '4px 8px'
              }}
            >
              &times;
            </button>
          </div>

          {/* Drawer Content */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                {selectedNode.title}
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                {selectedNode.subtitle}
              </p>
            </div>

            {/* Key Metric Card */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                TELEMETRY & THROUGHPUT
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                {selectedNode.metric}
              </div>
            </div>

            {/* Specifications list */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                ARCHITECTURE SPECIFICATIONS
              </div>
              <ul style={{ paddingLeft: '16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedNode.details.map((detail, idx) => (
                  <li key={idx} style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>
                    {detail}
                  </li>
                ))}
              </ul>
            </div>

            {/* Direct Action Link */}
            {selectedNode.targetTab && (
              <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => {
                    handleOpenTargetTab(selectedNode.targetTab);
                    setInspectorOpen(false);
                  }}
                  style={{
                    width: '100%',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <span>Launch Deep Inspector View</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
