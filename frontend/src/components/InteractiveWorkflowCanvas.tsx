import { useState, useEffect, useRef, type FC, type MouseEvent } from 'react';

export type PipelineStageKey =
  | 'idle'
  | 'harvest'
  | 'bronze'
  | 'duckdb'
  | 'parallel'
  | 'completed';

export interface ToolDetail {
  id: string;
  name: string;
  category: string;
  role: string;
  engineVersion: string;
  badgeColor: string;
  status: 'ONLINE' | 'ACTIVE' | 'SYNCED' | 'STANDBY';
  telemetrySummary: {
    primaryMetric: string;
    secondaryMetric: string;
    latency: string;
    throughput: string;
  };
  features: string[];
  samplePreviewTitle: string;
  sampleCodeOrSchema: string;
}

export const TOOL_DETAILS_MAP: Record<string, ToolDetail> = {
  'start-flow': {
    id: 'start-flow',
    name: 'arXiv Harvester & ar5iv HTML5',
    category: 'Source Data Ingestion Engine',
    role: 'Harvests academic metadata and full-text HTML5 papers',
    engineVersion: 'arXiv OAI-PMH XML v2.0 + HTTPX Async',
    badgeColor: '#7c3aed',
    status: 'SYNCED',
    telemetrySummary: {
      primaryMetric: '10,000 Papers Harvested',
      secondaryMetric: 'cs.AI, cs.LG, cs.CV, cs.CL, stat.ML',
      latency: '6.0s Rate-Limit Delay',
      throughput: '100% Validated DOI / arXiv ID',
    },
    features: [
      'Asynchronous HTTPX client with rate limiter complying with arXiv policy',
      'Full-text HTML5 crawler extracting abstract, introduction, methods, results',
      'Dual-stream ingestion capturing both OAI XML metadata and ar5iv HTML5',
      'SHA-256 cryptographic content verification on each harvested document',
    ],
    samplePreviewTitle: 'OAI-PMH Ingestion Protocol Spec',
    sampleCodeOrSchema: `POST https://export.arxiv.org/oai2
verb=ListRecords&metadataPrefix=arXivRaw&set=cs
Payload: {
  "id": "2602.10001",
  "categories": ["cs.AI", "cs.LG"],
  "title": "Scalable Vector Indexing over Multi-Modal Academic Repositories",
  "authors": ["Yang Liu", "Hao Chen", "Wei Wang"],
  "format": "text/html5; charset=utf-8",
  "sha256": "8f3b...e109"
}`,
  },
  'bronze-instance': {
    id: 'bronze-instance',
    name: 'Cloudflare R2 Object Storage',
    category: 'Bronze Immutable Data Lake',
    role: 'Zero-egress raw storage for HTML5 and batch records',
    engineVersion: 'Cloudflare R2 (S3-Compatible API)',
    badgeColor: '#e11d48',
    status: 'ONLINE',
    telemetrySummary: {
      primaryMetric: '2.841 GB Raw Storage',
      secondaryMetric: '9,022 HTML5 + 12 Batches',
      latency: '< 45ms S3 HeadObject',
      throughput: 'Zero Egress Fees (Cloudflare Global Edge)',
    },
    features: [
      'Global low-latency S3-compatible cloud object store with 0 egress costs',
      'Strict partitioning scheme: raw/html/year=2026/{paper_id}.html',
      'Stores 9,022 raw HTML5 files and 12 bulk OAI JSON batch checkpoints',
      'Dual automated MD5 and SHA-256 integrity verification on upload',
    ],
    samplePreviewTitle: 'Cloudflare R2 Bucket Key Hierarchy',
    sampleCodeOrSchema: `s3://uth-scientific-lakehouse/
├── bronze/
│   ├── raw_html/year=2026/
│   │   ├── 2602.01234.html (320 KB)
│   │   └── ... (9,022 objects · 2.82 GB)
│   └── oai_batches/
│       └── batch_0001.json ... batch_0012.json (20.8 MB)
└── gold/
    └── mining/ (FP-growth rules, Louvain graph, K-Means clusters)`,
  },
  'review-duckdb': {
    id: 'review-duckdb',
    name: 'DuckDB & LaTeX Parser',
    category: 'In-Process Vectorized OLAP Engine',
    role: 'High-speed SIMD transformation and math formula extraction',
    engineVersion: 'DuckDB v1.1.3 + Vectorized Execution Engine',
    badgeColor: '#f59e0b',
    status: 'ACTIVE',
    telemetrySummary: {
      primaryMetric: '2,224,198 LaTeX Formulas',
      secondaryMetric: '8,989 Full-Section Enriched Papers',
      latency: '0.042s Execution Benchmark',
      throughput: 'Zero-Copy Apache Arrow Columnar Memory',
    },
    features: [
      'Vectorized SIMD query execution running directly in-process on host SSD',
      'Regex & BeautifulSoup4 parser extracting math equations in pure LaTeX syntax',
      'Canonical academic section taxonomy (Abstract, Intro, Methods, Results, Discussion)',
      'Sub-second SQL aggregations computing formula densities and author co-occurrences',
    ],
    samplePreviewTitle: 'Live DuckDB OLAP Query Example',
    sampleCodeOrSchema: `SELECT 
    category,
    count(*) AS paper_count,
    sum(latex_formula_count) AS total_formulas,
    round(avg(latex_formula_count), 1) AS avg_formulas_per_paper,
    quantile_cont(latex_formula_count, 0.90) AS p90_formula_density
FROM read_parquet('data/silver/year=2026/papers.parquet')
GROUP BY category
ORDER BY paper_count DESC;

-- Result: cs.CV (3,410 papers · 912k formulas · p90=412)`,
  },
  'silver-parquet': {
    id: 'silver-parquet',
    name: 'Apache Parquet Columnar Lakehouse',
    category: 'Silver Curated Columnar Store',
    role: 'Canonical structured storage for real-time exploratory data mining',
    engineVersion: 'Apache Parquet (Snappy Compressed) via PyArrow',
    badgeColor: '#10b981',
    status: 'SYNCED',
    telemetrySummary: {
      primaryMetric: '231.73 MB Parquet Size',
      secondaryMetric: '10,000 Curated Rows (year=2026)',
      latency: '10x Storage Compression Ratio',
      throughput: 'Column Projection & Predicate Pushdown',
    },
    features: [
      'Snappy-compressed columnar partition format: data/silver/year=2026/papers.parquet',
      'Dictionary-encoded categories and authors for minimal memory footprint',
      'Nested schema containing structured canonical section dictionaries',
      'Zero-copy memory sharing with DuckDB, LanceDB, and pandas',
    ],
    samplePreviewTitle: 'Parquet Schema Architecture',
    sampleCodeOrSchema: `Schema:
├── id: string (arXiv canonical ID)
├── title: string (Full paper title)
├── authors: list<string> (Cleaned author tokens)
├── abstract: string (Cleaned abstract text)
├── categories: list<string> (Multi-label categories)
├── sections: struct<abstract, intro, methods, results, discussion>
├── latex_formulas: list<string> (Raw LaTeX equations)
├── latex_formula_count: int64 (Equation volume)
└── metadata: map<string, string> (Ingest timestamp, DOI, license)`,
  },
  'gold-lancedb': {
    id: 'gold-lancedb',
    name: 'LanceDB & 4 Mining Pillars',
    category: 'Gold Vector Lakehouse & Mining Core',
    role: 'Dense contextual embeddings and machine learning mining pillars',
    engineVersion: 'LanceDB v0.17 + Nomic Embed Text v1.5 (MPS Apple Silicon)',
    badgeColor: '#2563eb',
    status: 'ONLINE',
    telemetrySummary: {
      primaryMetric: '143,523 Vectors Indexed',
      secondaryMetric: '768 Dimensions · 2.456 GB Index',
      latency: '< 18ms Cosine ANN Lookup',
      throughput: '4 Mining Pillars Fully Computed',
    },
    features: [
      'Multi-modal vector lakehouse based on Lance columnar format for disk-based ANN',
      'Pillar 1: FP-Growth Association Mining (22 frequent itemsets, max lift: 2.14)',
      'Pillar 2: K-Means & DBSCAN Semantic Clustering (6 clusters, silhouette: 0.0216)',
      'Pillar 3: Louvain Co-authorship Graph (35,117 authors, PageRank centrality)',
      'Pillar 4: Isolation Forest Outlier Detection (30 frontier novelty papers)',
    ],
    samplePreviewTitle: 'LanceDB Vector Search & Mining Code',
    sampleCodeOrSchema: `import lancedb

db = lancedb.connect("data/gold/lancedb")
tbl = db.open_table("scientific_papers_gold")

# Hardware-accelerated Cosine ANN retrieval over 143k chunks
results = tbl.search(query_embedding) \\
             .metric("cosine") \\
             .where("category = 'cs.AI'") \\
             .limit(5) \\
             .to_pandas()

# LanceDB executes IVF-PQ zero-copy lookups in 16.8ms`,
  },
  'grounded-rag': {
    id: 'grounded-rag',
    name: 'Qwen 2.5 & Grounded RAG Engine',
    category: 'Scientific Synthesis & Inference',
    role: 'Strict anti-hallucination academic question-answering with citations',
    engineVersion: 'Qwen2.5-7B-Instruct (GGUF) + llama.cpp Metal Acceleration',
    badgeColor: '#6366f1',
    status: 'ACTIVE',
    telemetrySummary: {
      primaryMetric: 'Verified Citations Gate',
      secondaryMetric: 'Apple Silicon GPU Metal Offload',
      latency: 'Sub-50ms Context ANN Fetch',
      throughput: 'Exact DOI & Section Attributions',
    },
    features: [
      'Strict grounding gate refusing to answer if cosine similarity is below threshold',
      'Direct mathematical formula rendering in KaTeX / LaTeX inside responses',
      'Every synthesized claim is annotated with [Paper ID, Section Title] brackets',
      'Zero hallucination prompt system instruction protecting academic accuracy',
    ],
    samplePreviewTitle: 'Academic Anti-Hallucination Prompt Gate',
    sampleCodeOrSchema: `[SYSTEM INSTRUCTION: STRICT ACADEMIC GROUNDING]
You are a peer-reviewed research assistant.
Ground every assertion strictly in provided LanceDB chunks.
- If information is not in context, reply: "Context does not provide evidence."
- Always cite source papers using format: [arXiv:ID, Section Name]
- Render all equations in pristine LaTeX syntax: $...$ or $$...$$

[RETRIEVED CONTEXT: 5 CHUNKS FROM 143,523 VECTORS]
(Chunk 1: arXiv:2602.0412 · Introduction · Similarity: 0.884)...`,
  },
};

export interface InteractiveWorkflowCanvasProps {
  onNavigateTab?: (tab: 'schematic' | 'eda' | 'pillars' | 'rag' | 'logs') => void;
  onTriggerPipeline?: () => void;
  isPipelineRunning?: boolean;
}

export const InteractiveWorkflowCanvas: FC<InteractiveWorkflowCanvasProps> = ({
  onTriggerPipeline,
  isPipelineRunning = false,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('duckdb');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  // Pan and Zoom Canvas State
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Native Wheel Event Listener for smooth zoom centered on mouse
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      setZoom((prev) => {
        const next = Math.min(Math.max(prev * zoomFactor, 0.4), 2.4);
        return parseFloat(next.toFixed(2));
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, aside, pre, code, input')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Simulation state for realistic data streaming animation
  const [simulationStage, setSimulationStage] = useState<PipelineStageKey>('idle');
  const [papersHarvested, setPapersHarvested] = useState<number>(10000);
  const [formulasExtracted, setFormulasExtracted] = useState<number>(2224198);
  const [vectorsIndexed, setVectorsIndexed] = useState<number>(143523);
  const [activeMessage, setActiveMessage] = useState<string>(
    'Lakehouse Standby: 10,000 papers, 2.22M formulas, 143k LanceDB vectors synced.'
  );

  // Progressive simulation when "Run Pipeline" is triggered
  useEffect(() => {
    if (!isPipelineRunning) {
      if (simulationStage !== 'idle' && simulationStage !== 'completed') {
        setSimulationStage('completed');
      }
      return;
    }

    setSimulationStage('harvest');
    setActiveMessage('Phase 1: Ingesting academic papers and HTML5 bodies via arXiv OAI-PMH...');
    setPapersHarvested(1420);

    const t1 = setTimeout(() => {
      setSimulationStage('bronze');
      setActiveMessage('Phase 2: Streaming raw batches into Cloudflare R2 Bronze Lakehouse...');
      setPapersHarvested(6150);
    }, 1200);

    const t2 = setTimeout(() => {
      setSimulationStage('duckdb');
      setActiveMessage('Phase 3: SIMD DuckDB parsing & extracting 2.22M LaTeX formulas...');
      setPapersHarvested(10000);
      setFormulasExtracted(920000);
    }, 2500);

    const t3 = setTimeout(() => {
      setSimulationStage('parallel');
      setActiveMessage('Phase 4: Parallel execution: Curated Parquet EDA & Gold LanceDB 4 Mining Pillars...');
      setFormulasExtracted(2224198);
      setVectorsIndexed(68000);
    }, 4000);

    const t4 = setTimeout(() => {
      setSimulationStage('completed');
      setActiveMessage('Phase 5: Pipeline synced. LanceDB vector indices & Grounded RAG ready.');
      setVectorsIndexed(143523);
    }, 6000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [isPipelineRunning]);

  const isStageActive = (stage: string) => {
    if (simulationStage === 'completed') return false;
    if (simulationStage === stage) return true;
    if (simulationStage === 'parallel' && (stage === 'silver' || stage === 'gold')) return true;
    return false;
  };

  const handleOpenInspector = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setDrawerOpen(true);
  };

  const selectedTool = TOOL_DETAILS_MAP[selectedNodeId] || TOOL_DETAILS_MAP['review-duckdb'];

  return (
    <div
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minHeight: 'calc(100vh - 130px)',
        justifyContent: 'center',
        alignItems: 'center',
        userSelect: 'none',
        position: 'relative',
        cursor: isDragging ? 'grabbing' : 'grab',
        overflow: 'hidden',
      }}
    >
      {/* Minimal Floating Canvas Telemetry HUD */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px)',
          borderRadius: '9999px',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          padding: '6px 16px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
          marginBottom: '40px',
          zIndex: 10,
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isPipelineRunning ? '#ea580c' : '#10b981',
            boxShadow: isPipelineRunning ? '0 0 8px #ea580c' : 'none',
            animation: isPipelineRunning ? 'stageGlowOrange 1.5s infinite' : 'none',
          }}
        />
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
          {activeMessage}
        </span>
        {onTriggerPipeline && (
          <button
            type="button"
            onClick={onTriggerPipeline}
            disabled={isPipelineRunning}
            style={{
              backgroundColor: isPipelineRunning ? '#fff7ed' : '#f1f5f9',
              color: isPipelineRunning ? '#ea580c' : '#0f172a',
              border: '1px solid #e2e8f0',
              borderRadius: '9999px',
              padding: '2px 10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              cursor: isPipelineRunning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {isPipelineRunning ? 'RUNNING...' : 'TRIGGER'}
          </button>
        )}
      </div>

      {/* ============================================================== */}
      {/* HORIZONTAL DATA MINING PIPELINE (Centered in Viewport & Zoomable) */}
      {/* ============================================================== */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          paddingBottom: '20px',
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex',
            alignItems: 'center',
            minWidth: '1280px',
            padding: '10px',
          }}
        >
          {/* ============================================================== */}
          {/* STAGE 1: arXiv Harvester (Purple) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleOpenInspector('start-flow')}
            style={{
              width: '210px',
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              padding: '14px 16px',
              border: isStageActive('harvest')
                ? '2px solid #8b5cf6'
                : selectedNodeId === 'start-flow' && drawerOpen
                ? '2px solid #7c3aed'
                : '1px solid #e2e8f0',
              boxShadow: isStageActive('harvest')
                ? '0 0 20px rgba(139, 92, 246, 0.35)'
                : '0 4px 16px rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '9px',
                    backgroundColor: '#7c3aed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    boxShadow: '0 2px 6px rgba(124, 58, 237, 0.3)',
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#6d28d9' }}>arXiv Harvester</div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>OAI-PMH & HTML5</div>
                </div>
              </div>

              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '1px 5px', borderRadius: '4px' }}>
                v2.0
              </span>
            </div>

            <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                {papersHarvested.toLocaleString()} Papers
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                cs.AI, cs.LG, cs.CV, stat.ML
              </div>
            </div>

            <button
              type="button"
              style={{
                width: '100%',
                marginTop: '10px',
                padding: '4px 0',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                backgroundColor: '#f8fafc',
                color: '#475569',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              INSPECT TOOL
            </button>
          </div>

          {/* Horizontal Connector 1 */}
          <div style={{ width: '42px', height: '2px', backgroundColor: '#cbd5e1', position: 'relative', flexShrink: 0 }}>
            {isStageActive('harvest') && (
              <div
                style={{
                  position: 'absolute',
                  top: '-3px',
                  left: '0',
                  width: '16px',
                  height: '8px',
                  borderRadius: '4px',
                  backgroundColor: '#7c3aed',
                  boxShadow: '0 0 8px #7c3aed',
                  animation: 'pulseFlowHorizontal 0.8s infinite',
                }}
              />
            )}
          </div>

          {/* ============================================================== */}
          {/* STAGE 2: Cloudflare R2 Bronze Lake (Magenta/Pink) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleOpenInspector('bronze-instance')}
            style={{
              width: '210px',
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              padding: '14px 16px',
              border: isStageActive('bronze')
                ? '2px solid #e11d48'
                : selectedNodeId === 'bronze-instance' && drawerOpen
                ? '2px solid #e11d48'
                : '1px solid #e2e8f0',
              boxShadow: isStageActive('bronze')
                ? '0 0 20px rgba(225, 29, 72, 0.35)'
                : '0 4px 16px rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '9px',
                    backgroundColor: '#e11d48',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    boxShadow: '0 2px 6px rgba(225, 29, 72, 0.3)',
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M18.8 11.2C18.4 8.3 15.9 6 13 6c-2.4 0-4.5 1.5-5.4 3.7C5.3 10 3.5 12 3.5 14.5c0 2.8 2.2 5 5 5h10c2.5 0 4.5-2 4.5-4.5 0-2.1-1.5-3.8-3.5-4.3z" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#e11d48' }}>Cloudflare R2</div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>Bronze Lake</div>
                </div>
              </div>

              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#e11d48', backgroundColor: '#fff1f2', padding: '1px 5px', borderRadius: '4px' }}>
                S3 API
              </span>
            </div>

            <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                2.841 GB Stored
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                9,022 HTML5 + 12 Batches
              </div>
            </div>

            <button
              type="button"
              style={{
                width: '100%',
                marginTop: '10px',
                padding: '4px 0',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                backgroundColor: '#f8fafc',
                color: '#475569',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              INSPECT TOOL
            </button>
          </div>

          {/* Horizontal Connector 2 */}
          <div style={{ width: '42px', height: '2px', backgroundColor: '#cbd5e1', position: 'relative', flexShrink: 0 }}>
            {isStageActive('bronze') && (
              <div
                style={{
                  position: 'absolute',
                  top: '-3px',
                  left: '0',
                  width: '16px',
                  height: '8px',
                  borderRadius: '4px',
                  backgroundColor: '#e11d48',
                  boxShadow: '0 0 8px #e11d48',
                  animation: 'pulseFlowHorizontal 0.8s infinite',
                }}
              />
            )}
          </div>

          {/* ============================================================== */}
          {/* STAGE 3: DuckDB & LaTeX Normalizer (Amber) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleOpenInspector('review-duckdb')}
            style={{
              width: '220px',
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              padding: '14px 16px',
              border: isStageActive('duckdb')
                ? '2px solid #f59e0b'
                : selectedNodeId === 'review-duckdb' && drawerOpen
                ? '2px solid #f59e0b'
                : '1px solid #e2e8f0',
              boxShadow: isStageActive('duckdb')
                ? '0 0 20px rgba(245, 158, 11, 0.35)'
                : '0 4px 16px rgba(0, 0, 0, 0.05)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '9px',
                    backgroundColor: '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)',
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="4" stroke="#ffffff" strokeWidth="2"/>
                    <circle cx="9" cy="9" r="2.5" fill="#ffffff"/>
                    <path d="M14 9c0 2-2 3.5-5 3.5M9 16c4 0 7-1.5 7-4.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#d97706' }}>DuckDB</div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>In-Process OLAP</div>
                </div>
              </div>

              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#d97706', backgroundColor: '#fef3c7', padding: '1px 5px', borderRadius: '4px' }}>
                SIMD
              </span>
            </div>

            <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                {formulasExtracted.toLocaleString()} Formulas
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                Zero-Copy Apache Arrow
              </div>
            </div>

            <button
              type="button"
              style={{
                width: '100%',
                marginTop: '10px',
                padding: '4px 0',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                backgroundColor: '#f8fafc',
                color: '#475569',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              INSPECT TOOL
            </button>
          </div>

          {/* Horizontal Connector 3 into Red Split Node */}
          <div style={{ width: '36px', height: '2px', backgroundColor: '#cbd5e1', position: 'relative', flexShrink: 0 }}>
            {isStageActive('duckdb') && (
              <div
                style={{
                  position: 'absolute',
                  top: '-3px',
                  left: '0',
                  width: '16px',
                  height: '8px',
                  borderRadius: '4px',
                  backgroundColor: '#f59e0b',
                  boxShadow: '0 0 8px #f59e0b',
                  animation: 'pulseFlowHorizontal 0.8s infinite',
                }}
              />
            )}
          </div>

          {/* ============================================================== */}
          {/* PARALLEL SPLIT NODE & PARALLEL BRANCHES (PARQUET & LANCEDB) */}
          {/* ============================================================== */}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {/* Red Fork Icon Badge */}
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.35)',
                zIndex: 10,
                flexShrink: 0,
              }}
              title="Parallel Fork: Columnar Storage & Vector Embeddings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="6" height="6" rx="1" />
                <rect x="15" y="15" width="6" height="6" rx="1" />
                <rect x="3" y="15" width="6" height="6" rx="1" />
                <path d="M6 9v3a3 3 0 0 0 3 3h6" />
              </svg>
            </div>

            {/* Split Horizontal-to-Vertical Wiring */}
            <div style={{ width: '28px', height: '144px', position: 'relative', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: '72px', left: '0', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
              <div style={{ position: 'absolute', top: '18px', left: '14px', width: '2px', height: '108px', backgroundColor: '#cbd5e1' }} />
              <div style={{ position: 'absolute', top: '18px', left: '14px', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
              <div style={{ position: 'absolute', bottom: '18px', left: '14px', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
            </div>

            {/* Parallel Cards: Apache Parquet (Top) & LanceDB (Bottom) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', flexShrink: 0 }}>
              {/* PATH 1 (TOP): Apache Parquet (Green) */}
              <div
                onClick={() => handleOpenInspector('silver-parquet')}
                style={{
                  width: '260px',
                  backgroundColor: '#ffffff',
                  borderRadius: '14px',
                  padding: '12px 16px',
                  border: isStageActive('parallel')
                    ? '2px solid #10b981'
                    : selectedNodeId === 'silver-parquet' && drawerOpen
                    ? '2px solid #10b981'
                    : '1px solid #e2e8f0',
                  boxShadow: isStageActive('parallel')
                    ? '0 0 20px rgba(16, 185, 129, 0.35)'
                    : '0 4px 16px rgba(0, 0, 0, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        backgroundColor: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="4" width="8" height="7" rx="1.5" stroke="#ffffff" strokeWidth="1.8"/>
                        <rect x="13" y="4" width="8" height="7" rx="1.5" stroke="#ffffff" strokeWidth="1.8"/>
                        <rect x="3" y="13" width="8" height="7" rx="1.5" stroke="#ffffff" strokeWidth="1.8"/>
                        <rect x="13" y="13" width="8" height="7" rx="1.5" stroke="#ffffff" strokeWidth="1.8"/>
                      </svg>
                    </div>

                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#047857' }}>Apache Parquet</div>
                      <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>Silver Columnar</div>
                    </div>
                  </div>

                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#059669', backgroundColor: '#ecfdf5', padding: '1px 5px', borderRadius: '4px' }}>
                    Snappy
                  </span>
                </div>

                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: '#64748b' }}>Partition: 2026</span>
                  <span style={{ fontWeight: 800, color: '#0f172a' }}>231.73 MB Parquet</span>
                </div>
              </div>

              {/* PATH 2 (BOTTOM): LanceDB & 4 Pillars (Blue) */}
              <div
                onClick={() => handleOpenInspector('gold-lancedb')}
                style={{
                  width: '260px',
                  backgroundColor: '#ffffff',
                  borderRadius: '14px',
                  padding: '12px 16px',
                  border: isStageActive('parallel')
                    ? '2px solid #2563eb'
                    : selectedNodeId === 'gold-lancedb' && drawerOpen
                    ? '2px solid #2563eb'
                    : '1px solid #e2e8f0',
                  boxShadow: isStageActive('parallel')
                    ? '0 0 20px rgba(37, 99, 235, 0.35)'
                    : '0 4px 16px rgba(0, 0, 0, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        backgroundColor: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <polygon points="12 2 21 7 21 17 12 22 3 17 3 7" stroke="#ffffff" strokeWidth="1.8" strokeLinejoin="round"/>
                        <polyline points="3 7 12 12 21 7" stroke="#ffffff" strokeWidth="1.5"/>
                      </svg>
                    </div>

                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#1d4ed8' }}>LanceDB Vectors</div>
                      <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>Gold Vector Store</div>
                    </div>
                  </div>

                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#2563eb', backgroundColor: '#eff6ff', padding: '1px 5px', borderRadius: '4px' }}>
                    Nomic AI
                  </span>
                </div>

                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: '#64748b' }}>768-dim Vectors</span>
                  <span style={{ fontWeight: 800, color: '#0f172a' }}>{vectorsIndexed.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Merge Horizontal-to-Vertical Wiring */}
            <div style={{ width: '28px', height: '144px', position: 'relative', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: '18px', left: '0', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
              <div style={{ position: 'absolute', bottom: '18px', left: '0', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
              <div style={{ position: 'absolute', top: '18px', left: '14px', width: '2px', height: '108px', backgroundColor: '#cbd5e1' }} />
              <div style={{ position: 'absolute', top: '72px', left: '14px', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
            </div>

            {/* Orange Convergence Anchor Ring */}
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                border: '4px solid #ea580c',
                boxShadow: '0 2px 6px rgba(234, 88, 12, 0.3)',
                flexShrink: 0,
                zIndex: 10,
              }}
              title="Parallel Convergence Anchor"
            />

            {/* Final Horizontal Connector into Grounded RAG */}
            <div style={{ width: '36px', height: '2px', backgroundColor: '#cbd5e1', position: 'relative', flexShrink: 0 }}>
              {simulationStage === 'completed' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    left: '0',
                    width: '16px',
                    height: '8px',
                    borderRadius: '4px',
                    backgroundColor: '#6366f1',
                    boxShadow: '0 0 8px #6366f1',
                    animation: 'pulseFlowHorizontal 0.8s infinite',
                  }}
                />
              )}
            </div>

            {/* ============================================================== */}
            {/* STAGE 5: Grounded RAG Console (Indigo) */}
            {/* ============================================================== */}
            <div
              onClick={() => handleOpenInspector('grounded-rag')}
              style={{
                width: '230px',
                backgroundColor: '#ffffff',
                borderRadius: '14px',
                padding: '14px 16px',
                border: simulationStage === 'completed'
                  ? '2px solid #6366f1'
                  : selectedNodeId === 'grounded-rag' && drawerOpen
                  ? '2px solid #6366f1'
                  : '1px solid #e2e8f0',
                boxShadow: '0 4px 16px rgba(99, 102, 241, 0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '9px',
                      backgroundColor: '#6366f1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>

                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#4338ca' }}>Grounded RAG</div>
                    <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>Qwen 2.5 QA</div>
                  </div>
                </div>

                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#6366f1', backgroundColor: '#ede9fe', padding: '1px 5px', borderRadius: '4px' }}>
                  Metal
                </span>
              </div>

              <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                  Verified Citations
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                  Sub-50ms ANN Search
                </div>
              </div>

              <button
                type="button"
                style={{
                  width: '100%',
                  marginTop: '10px',
                  padding: '4px 0',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  backgroundColor: '#f8fafc',
                  color: '#475569',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                INSPECT TOOL
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SLIDE-OVER ON-CANVAS TOOL INSPECTOR DRAWER (Does NOT switch tab) */}
      {/* ============================================================== */}
      {drawerOpen && selectedTool && (
        <aside
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '440px',
            maxWidth: '90vw',
            height: '100vh',
            backgroundColor: '#ffffff',
            boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.12)',
            borderLeft: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 100,
            animation: 'slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Drawer Top Header */}
          <div
            style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: selectedTool.badgeColor,
                }}
              />
              <div>
                <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#64748b' }}>
                  {selectedTool.category.toUpperCase()}
                </span>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {selectedTool.name}
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '22px',
                color: '#64748b',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
              }}
              title="Close Inspector"
            >
              &times;
            </button>
          </div>

          {/* Drawer Scrollable Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Engine & Status Bar */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                  ENGINE / DRIVER
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                  {selectedTool.engineVersion}
                </div>
              </div>

              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  color: '#059669',
                  padding: '3px 8px',
                  borderRadius: '9999px',
                }}
              >
                ● {selectedTool.status}
              </span>
            </div>

            {/* Role & Objective */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#475569', marginBottom: '4px' }}>
                ARCHITECTURE ROLE
              </div>
              <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, margin: 0 }}>
                {selectedTool.role}
              </p>
            </div>

            {/* Telemetry Metrics 2x2 Bento */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}
            >
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>PRIMARY VOLUME</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginTop: '3px' }}>
                  {selectedTool.telemetrySummary.primaryMetric}
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>SCOPE & SPECS</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginTop: '3px' }}>
                  {selectedTool.telemetrySummary.secondaryMetric}
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>LATENCY BENCHMARK</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#059669', marginTop: '3px' }}>
                  {selectedTool.telemetrySummary.latency}
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>THROUGHPUT / EGRESS</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb', marginTop: '3px' }}>
                  {selectedTool.telemetrySummary.throughput}
                </div>
              </div>
            </div>

            {/* Capabilities List */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#475569', marginBottom: '8px' }}>
                KEY SYSTEM CAPABILITIES
              </div>
              <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedTool.features.map((feature, idx) => (
                  <li key={idx} style={{ fontSize: '12px', color: '#334155', lineHeight: 1.45 }}>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Code / Schema / Live Sample Terminal Snippet */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#475569', marginBottom: '8px' }}>
                {selectedTool.samplePreviewTitle.toUpperCase()}
              </div>
              <pre
                style={{
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  overflowX: 'auto',
                  lineHeight: 1.5,
                  margin: 0,
                  border: '1px solid #334155',
                }}
              >
                <code>{selectedTool.sampleCodeOrSchema}</code>
              </pre>
            </div>
          </div>

          {/* Drawer Bottom Action */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              style={{
                width: '100%',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              CLOSE INSPECTOR
            </button>
          </div>
        </aside>
      )}

      {/* Floating Canvas Pan & Zoom Controls */}
      <div
        style={{
          position: 'fixed',
          bottom: '48px',
          right: '32px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(12px)',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          padding: '4px 10px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          zIndex: 40,
        }}
      >
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#64748b', marginRight: '4px' }}>
          CANVAS
        </span>

        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(parseFloat((z - 0.1).toFixed(2)), 0.4))}
          title="Zoom Out (Mouse Wheel Down)"
          style={{
            width: '28px',
            height: '28px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            backgroundColor: '#f8fafc',
            color: '#0f172a',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          -
        </button>

        <button
          type="button"
          onClick={() => {
            setZoom(1.0);
            setPan({ x: 0, y: 0 });
          }}
          title="Reset Zoom & Pan (100%)"
          style={{
            border: 'none',
            borderRadius: '6px',
            backgroundColor: 'transparent',
            color: '#0f172a',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 800,
            padding: '4px 8px',
            cursor: 'pointer',
          }}
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(parseFloat((z + 0.1).toFixed(2)), 2.4))}
          title="Zoom In (Mouse Wheel Up)"
          style={{
            width: '28px',
            height: '28px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            backgroundColor: '#f8fafc',
            color: '#0f172a',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          +
        </button>

        <div style={{ width: '1px', height: '18px', backgroundColor: '#e2e8f0', margin: '0 2px' }} />

        <button
          type="button"
          onClick={() => {
            setZoom(1.0);
            setPan({ x: 0, y: 0 });
          }}
          title="Reset to Center"
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            backgroundColor: '#f8fafc',
            color: '#475569',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            padding: '5px 8px',
            cursor: 'pointer',
          }}
        >
          RESET
        </button>
      </div>
    </div>
  );
};
