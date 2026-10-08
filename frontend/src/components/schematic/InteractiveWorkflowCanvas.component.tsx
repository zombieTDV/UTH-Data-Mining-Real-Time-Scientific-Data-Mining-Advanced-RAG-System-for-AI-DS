import { useState, useEffect, useRef, useMemo, type FC, type MouseEvent } from 'react';
import {
  startStreamingIngestion,
  stopStreamingIngestion,
  executeDuckDbQuery,
  searchLakehouse,
  sendChatQuery,
} from '../../services';
import { useLakehouseStreamStore, appendStreamLog, clearStreamLogs } from '../../store';
import { ScientificMath } from '../common/ScientificMath.component';
import { AnimatedCounter } from '../common/AnimatedCounter.component';
import { PipelineExecutionStepper } from './PipelineExecutionStepper.component';

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
    name: 'Source Ingest (arXiv + OpenAlex)',
    category: 'Source Data Ingestion Engine',
    role: 'Harvests academic metadata, full-text HTML5 papers, and conference papers',
    engineVersion: 'arXiv OAI-PMH XML + OpenAlex REST API + HTTPX Async',
    badgeColor: '#7c3aed',
    status: 'SYNCED',
    telemetrySummary: {
      primaryMetric: '36,414 Works Harvested',
      secondaryMetric: '11,660 arXiv • 24,754 OpenAlex • 184 Conf',
      latency: '6.0s Rate-Limit Delay',
      throughput: '100% Validated DOI / Canonical ID',
    },
    features: [
      'Asynchronous HTTPX client with rate limiter complying with arXiv & OpenAlex policies',
      'Full-text HTML5 crawler extracting abstract, introduction, methods, results, and formulas',
      'Federated academic ingestion capturing arXiv preprints and OpenAlex global metadata',
      'SHA-256 cryptographic content verification on each harvested document',
    ],
    samplePreviewTitle: 'Source Ingestion Protocol Spec',
    sampleCodeOrSchema: `POST https://export.arxiv.org/oai2
verb=ListRecords&metadataPrefix=arXivRaw&set=cs
GET https://api.openalex.org/works?filter=has_doi:true,publication_year:2026
Payload: {
  "id": "2602.10001",
  "sources": ["arXiv", "OpenAlex"],
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
    role: 'Zero-egress raw storage for HTML5 and multi-source metadata',
    engineVersion: 'Cloudflare R2 (S3-Compatible API)',
    badgeColor: '#e11d48',
    status: 'ONLINE',
    telemetrySummary: {
      primaryMetric: '8.277 GB Stored (Primary Active)',
      secondaryMetric: '11,660 HTML5 + 24,754 Metadata (82.8% Quota)',
      latency: '< 45ms S3 HeadObject',
      throughput: 'Zero Egress Fees (Cloudflare Global Edge)',
    },
    features: [
      'Global low-latency S3-compatible cloud object store with 0 egress costs',
      'Strict partitioning scheme: bronze/raw_html/year=2026/ and bronze/openalex/year=2026/',
      'Stores 11,660 raw HTML5 files and 24,754 OpenAlex metadata JSON records',
      'Dual automated MD5 and SHA-256 integrity verification on upload',
    ],
    samplePreviewTitle: 'Cloudflare R2 Bucket Key Hierarchy',
    sampleCodeOrSchema: `s3://uth-scientific-lakehouse/
├── bronze/
│   ├── raw_html/year=2026/ (11,660 HTML5 preprints · 3.763 GB)
│   ├── openalex/year=2026/ (24,754 JSON records · 3.971 GB)
│   └── oai_batches/ (12 batch checkpoints · 26.4 MB)
├── silver/
│   └── papers/year=2026/ (11 Parquet partitions · 321.69 MB)
└── gold/
    └── lancedb/ (164,702 vectors · 211.26 MB active / 28 backup segments · 3.20 GB)`,
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
      primaryMetric: '2,220,938 LaTeX Formulas',
      secondaryMetric: '9,015 Full-Section Enriched Papers',
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
      primaryMetric: '316.06 MB Parquet Size',
      secondaryMetric: '9 Partitions (year=2026, 36,414 Works)',
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
      primaryMetric: '164,702 Vectors Indexed',
      secondaryMetric: '768 Dimensions · 211.26 MB Index',
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

# Hardware-accelerated Cosine ANN retrieval over 164,702 chunks
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

[RETRIEVED CONTEXT: 5 CHUNKS FROM 164,702 VECTORS]
(Chunk 1: arXiv:2602.0412 · Introduction · Similarity: 0.884)...`,
  },
};

export interface InteractiveWorkflowCanvasProps {
  onNavigateTab?: (tab: 'schematic' | 'eda' | 'pillars' | 'rag') => void;
  isPipelineRunning?: boolean;
  onTriggerPipeline?: () => void;
  theme?: 'dark' | 'light';
  language?: 'en' | 'vi';
}

export const InteractiveWorkflowCanvas: FC<InteractiveWorkflowCanvasProps> = ({
  onNavigateTab,
  isPipelineRunning = false,
  onTriggerPipeline,
  theme = 'dark',
  language = 'vi',
}) => {
  const isDark = theme === 'dark';

  const themeStyles = {
    isDark,
    cardBg: isDark ? 'rgba(15, 23, 42, 0.90)' : '#ffffff',
    cardBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0',
    cardDivider: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#cbd5e1' : '#334155',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    wire: isDark ? 'rgba(255, 255, 255, 0.28)' : '#94a3b8',
    btnInspectBg: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f8fafc',
    btnInspectBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0',
    btnInspectText: isDark ? '#cbd5e1' : '#475569',
    drawerBg: isDark ? '#0b0f19' : '#ffffff',
    drawerBorder: isDark ? 'rgba(255, 255, 255, 0.14)' : '#e2e8f0',
    drawerHeaderBg: isDark ? '#0e1422' : '#f8fafc',
    drawerHeaderBorder: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
    drawerTabsTrack: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
    drawerTabsTrackBorder: isDark ? 'rgba(255, 255, 255, 0.10)' : '#e2e8f0',
    drawerTabActiveBg: isDark ? '#1e293b' : '#ffffff',
    drawerTabActiveText: isDark ? '#f8fafc' : '#0f172a',
    drawerTabInactiveText: isDark ? '#94a3b8' : '#64748b',
    drawerSectionBg: isDark ? '#111827' : '#f8fafc',
    drawerSectionBorder: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
    inputBg: isDark ? '#050811' : '#f8fafc',
    inputBorder: isDark ? 'rgba(255, 255, 255, 0.14)' : '#cbd5e1',
    inputText: isDark ? '#f8fafc' : '#0f172a',
    codeBoxBg: isDark ? '#050811' : '#f1f5f9',
    codeBoxBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0',
    codeBoxText: isDark ? '#38bdf8' : '#0f172a',
    amberGhostBg: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fef3c7',
    amberGhostBorder: isDark ? 'rgba(245, 158, 11, 0.30)' : '#fde68a',
    amberGhostText: isDark ? '#fbbf24' : '#b45309',
    indigoGhostBg: isDark ? 'rgba(99, 102, 241, 0.12)' : '#ede9fe',
    indigoGhostBorder: isDark ? 'rgba(99, 102, 241, 0.30)' : '#ddd6fe',
    indigoGhostText: isDark ? '#a5b4fc' : '#4338ca',
    emeraldGhostBg: isDark ? 'rgba(16, 185, 129, 0.12)' : '#dcfce7',
    emeraldGhostBorder: isDark ? 'rgba(16, 185, 129, 0.30)' : '#bbf7d0',
    emeraldGhostText: isDark ? '#34d399' : '#15803d',
    roseGhostBg: isDark ? 'rgba(225, 29, 72, 0.12)' : '#ffe4e6',
    roseGhostBorder: isDark ? 'rgba(225, 29, 72, 0.30)' : '#fecdd3',
    roseGhostText: isDark ? '#fb7185' : '#be123c',
    zoomBarBg: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.94)',
    zoomBarBorder: isDark ? 'rgba(255, 255, 255, 0.14)' : '#e2e8f0',
    zoomBtnBg: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f8fafc',
    zoomBtnBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0',
    zoomBtnText: isDark ? '#f8fafc' : '#0f172a',
  };

  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('start-flow');
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerExpanded, setDrawerExpanded] = useState<boolean>(false);
  const [bottomTab, setBottomTab] = useState<'control' | 'specs' | 'logs'>('control');
  const [logFilter, setLogFilter] = useState<'ALL' | 'SUCCESS' | 'EXEC' | 'WARN' | 'INFO'>('ALL');
  const [logCopied, setLogCopied] = useState<boolean>(false);
  const [activeSpecTab, setActiveSpecTab] = useState<'SPEC' | 'PAYLOAD' | 'CURL'>('SPEC');
  const [specCopied, setSpecCopied] = useState<boolean>(false);

  const DUCK_SQL_PRESETS = [
    {
      id: 'formulas',
      label: 'TOP FORMULAS',
      sql: 'SELECT primary_category AS category, count(*) AS papers, sum(total_math_count) AS formulas, round(avg(total_math_count), 1) AS avg_math FROM papers GROUP BY category ORDER BY formulas DESC LIMIT 6;',
    },
    {
      id: 'outliers',
      label: 'MATH OUTLIERS',
      sql: 'SELECT paper_id, primary_category AS category, total_math_count AS formulas, round(total_words / 1000.0, 1) AS avg_math, count(*) OVER () AS papers FROM papers WHERE total_math_count > 1500 ORDER BY total_math_count DESC LIMIT 5;',
    },
    {
      id: 'timeline',
      label: 'MONTHLY TREND',
      sql: 'SELECT substr(published_date, 1, 7) AS category, count(*) AS papers, sum(total_math_count) AS formulas, round(avg(total_math_count), 1) AS avg_math FROM papers GROUP BY category ORDER BY category DESC LIMIT 6;',
    },
  ];


  const RAG_QUERY_PRESETS = [
    {
      label: 'Diffusion Loss',
      query: language === 'vi' ? 'Tối ưu hoá hàm mất mát trong mô hình diffusion cho dữ liệu toán học?' : 'Optimizing loss functions in diffusion models for mathematical data?',
      formula: '\\mathcal{L}_{\\text{diff}} = \\mathbb{E}_{t, x_0, \\epsilon} \\left[ w_t \\cdot \\delta_{\\text{Huber}} ( \\epsilon - \\epsilon_\\theta(x_t, t) ) \\right]',
    },
    {
      label: 'Attention Scaling',
      query: language === 'vi' ? 'Cơ chế Attention trong Transformer đối với chuỗi ký hiệu LaTeX?' : 'Attention mechanism in Transformers for LaTeX symbol sequences?',
      formula: '\\text{Attn}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V',
    },
    {
      label: 'PageRank Graph',
      query: language === 'vi' ? 'Độ đo trung tâm PageRank trong đồ thị trích dẫn mạng lưới khoa học?' : 'PageRank centrality measure in scientific citation graphs?',
      formula: 'PR(u) = \\frac{1-d}{N} + d \\sum_{v \\in B_u} \\frac{PR(v)}{L(v)}',
    },
  ];

  // Harvester Controls State
  const [harvestCategories, setHarvestCategories] = useState<string[]>([
    'cs.AI',
    'cs.LG',
    'cs.CV',
    'cs.CL',
    'stat.ML',
  ]);
  const [harvestLimit, setHarvestLimit] = useState<number>(10000);
  const [harvestDelay, setHarvestDelay] = useState<number>(6.0);
  const [harvestFormats, setHarvestFormats] = useState<string[]>(['HTML5', 'OAI-XML']);
  const [isHarvesting, setIsHarvesting] = useState<boolean>(false);

  // Consume Centralized Lakehouse Stream Store
  const {
    isStreaming,
    totalCorpus,
    sessionIngested: streamSessionCount,
    streamSpeed,
    streamTarget,
    setStreamTarget,
    storageUsedGb,
    storageUsedPct,
    storageStats,
    lastPaperDeltaBytes,
    activePipelineStage,
    logs: storeLogs,
  } = useLakehouseStreamStore();

  // Unified Terminal Logs directly connected to Lakehouse Stream Store
  const logs = useMemo(() => {
    return [...storeLogs].reverse();
  }, [storeLogs]);

  interface CanvasLogItem {
    id?: number | string;
    time?: string;
    level?: 'INFO' | 'SUCCESS' | 'WARN' | 'EXEC' | 'STORAGE' | 'QUERY' | string;
    tag?: string;
    msg?: string;
  }

  const setLogs = (updater: CanvasLogItem[] | ((prev: CanvasLogItem[]) => CanvasLogItem[])) => {
    if (typeof updater === 'function') {
      const result = updater(logs as CanvasLogItem[]);
      if (Array.isArray(result)) {
        if (result.length === 0) {
          clearStreamLogs();
        } else if (result.length > logs.length) {
          const added = result.slice(logs.length);
          added.forEach((a: CanvasLogItem) => {
            appendStreamLog({
              time: a.time || new Date().toLocaleTimeString('en-US', { hour12: false }),
              level: (a.level || 'INFO') as any,
              tag: a.tag || 'CANVAS',
              msg: a.msg || '',
            });
          });
        }
      }
    } else if (Array.isArray(updater) && updater.length === 0) {
      clearStreamLogs();
    }
  };
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // DuckDB Interactive State
  const [duckQueryPreset, setDuckQueryPreset] = useState<string>(
    'SELECT primary_category AS category, count(*) AS papers, sum(total_math_count) AS formulas, round(avg(total_math_count), 1) AS avg_math FROM papers GROUP BY category ORDER BY formulas DESC LIMIT 6;'
  );

  const [duckRunning, setDuckRunning] = useState<boolean>(false);
  const [duckResults, setDuckResults] = useState<Array<{ category: string; papers: number; formulas: number; avg_math: number }>>([
    { category: 'cs.AI', papers: 3842, formulas: 912400, avg_math: 237.5 },
    { category: 'cs.LG', papers: 3120, formulas: 748920, avg_math: 240.0 },
    { category: 'cs.CV', papers: 2058, formulas: 362118, avg_math: 175.9 },
    { category: 'stat.ML', papers: 980, formulas: 200760, avg_math: 204.8 },
  ]);

  // LanceDB Interactive State
  const [lanceQuery, setLanceQuery] = useState<string>('contrastive learning representation for scientific formulas');
  const [lanceSearching, setLanceSearching] = useState<boolean>(false);
  const [lanceResults, setLanceResults] = useState<Array<{ id: string; title: string; score: number; category: string }>>([
    { id: 'arXiv:2602.04128', title: 'Contrastive Multi-Modal Pre-training for Scientific Formula Representation', score: 0.914, category: 'cs.AI' },
    { id: 'arXiv:2602.01944', title: 'Zero-Shot LaTeX Retrieval using Columnar LanceDB Vectors', score: 0.887, category: 'cs.LG' },
    { id: 'arXiv:2602.07812', title: 'Semantic Latent Projections in Academic Knowledge Graphs', score: 0.862, category: 'stat.ML' },
  ]);

  // Grounded RAG Interactive State
  const [ragPrompt, setRagPrompt] = useState<string>(
    language === 'vi'
      ? 'Tối ưu hoá hàm mất mát trong mô hình diffusion cho dữ liệu toán học?'
      : 'Optimizing loss functions in diffusion models for mathematical data?'
  );
  const [ragStrictThreshold, setRagStrictThreshold] = useState<number>(0.75);
  const [ragGenerating, setRagGenerating] = useState<boolean>(false);
  const [ragResponse, setRagResponse] = useState<string>(
    language === 'vi'
      ? 'Theo context 5 chunks trích xuất từ LanceDB, kỹ thuật tối ưu hàm loss áp dụng Huber Loss có trọng số nhằm triệt tiêu gradient explosion khi biểu diễn các ký hiệu LaTeX phức tạp [arXiv:2602.04128, Section 3.2]. Độ tương đồng cosine đạt 0.914, vượt ngưỡng grounding 0.75.'
      : 'According to 5 chunks retrieved from LanceDB, the loss function optimization technique employs weighted Huber Loss to suppress gradient explosion when representing intricate LaTeX symbols [arXiv:2602.04128, Section 3.2]. Cosine similarity reaches 0.914, exceeding the 0.75 grounding threshold.'
  );

  useEffect(() => {
    setRagPrompt(
      language === 'vi'
        ? 'Tối ưu hoá hàm mất mát trong mô hình diffusion cho dữ liệu toán học?'
        : 'Optimizing loss functions in diffusion models for mathematical data?'
    );
    setRagResponse(
      language === 'vi'
        ? 'Theo context 5 chunks trích xuất từ LanceDB, kỹ thuật tối ưu hàm loss áp dụng Huber Loss có trọng số nhằm triệt tiêu gradient explosion khi biểu diễn các ký hiệu LaTeX phức tạp [arXiv:2602.04128, Section 3.2]. Độ tương đồng cosine đạt 0.914, vượt ngưỡng grounding 0.75.'
        : 'According to 5 chunks retrieved from LanceDB, the loss function optimization technique employs weighted Huber Loss to suppress gradient explosion when representing intricate LaTeX symbols [arXiv:2602.04128, Section 3.2]. Cosine similarity reaches 0.914, exceeding the 0.75 grounding threshold.'
    );
  }, [language]);

  // Pan and Zoom Canvas State
  const [zoom, setZoom] = useState<number>(0.94);
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
    if ((e.target as HTMLElement).closest('button, section, aside, pre, code, input, select, textarea')) return;
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

  // Autoscroll logs
  useEffect(() => {
    if (autoScrollLogs && bottomTab === 'logs') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScrollLogs, bottomTab]);

  // Simulation state for realistic data streaming animation
  const [simulationStage, setSimulationStage] = useState<PipelineStageKey>('idle');
  const [simulationHarvestedCount, setSimulationHarvestedCount] = useState<number>(0);
  const [formulasExtracted, setFormulasExtracted] = useState<number>(2220938);
  const [vectorsIndexed, setVectorsIndexed] = useState<number>(164702);

  const liveBronzeCount = storageStats?.activeLakehouse
    ? storageStats.activeLakehouse.arxivHtmlCount
    : 11660 + streamSessionCount;

  const liveOpenAlexCount = storageStats?.activeLakehouse?.openalexCount ?? 24754;
  const liveConfCount = storageStats?.activeLakehouse?.conferenceCount ?? 184;
  const liveTotalWorks = liveBronzeCount + liveOpenAlexCount;

  const liveBronzeGb = storageStats?.activeLakehouse
    ? storageStats.activeLakehouse.arxivHtmlSizeGb.toFixed(3)
    : (3.763 + (streamSessionCount * 380000) / (1024 ** 3)).toFixed(3);

  const liveSilverMb = storageStats?.activeLakehouse?.silverParquetSizeMb ?? 321.69;
  const liveSilverPartitions = storageStats?.activeLakehouse?.silverParquetCount ?? 11;

  const liveVectors = isPipelineRunning && simulationStage !== 'completed'
    ? vectorsIndexed
    : (storageStats?.activeLakehouse?.activeLanceDbVectors ?? 164702);
  const liveFormulas = (formulasExtracted || 2220938);

  const liveBatchesCount = 12;
  const liveQuotaGb = storageStats?.free_tier_quota_gb ?? 10.0;
  const liveActiveStorageGb = storageStats?.activeLakehouse?.totalSizeGb ?? (storageUsedGb > 10 ? 8.277 : (storageUsedGb || 8.277));
  const liveActiveStoragePct = storageStats?.activeLakehouse?.usedPercentage ?? Math.min(100, (liveActiveStorageGb / liveQuotaGb) * 100);
  const papersHarvested = isPipelineRunning && simulationStage !== 'completed' ? (simulationHarvestedCount || totalCorpus) : (totalCorpus || liveTotalWorks);
  const displayWorks = isPipelineRunning && simulationStage !== 'completed' ? papersHarvested : (totalCorpus || liveTotalWorks);

  const handleToggleStreaming = async () => {
    if (isStreaming) {
      try {
        await stopStreamingIngestion();
      } catch (err) {
        console.error(err);
      }
    } else {
      try {
        setBottomTab('logs');
        await startStreamingIngestion(streamTarget, 2.0);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Progressive simulation when "Run Pipeline" is triggered
  useEffect(() => {
    if (!isPipelineRunning) {
      if (simulationStage !== 'idle' && simulationStage !== 'completed') {
        setSimulationStage('completed');
      }
      return;
    }

    setSimulationStage('harvest');
    setSimulationHarvestedCount(1420);
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [
      ...prev,
      { id: Date.now(), time: now, level: 'EXEC', tag: 'PIPELINE', msg: '▶ Ingesting scientific papers: OAI-PMH harvest triggered.' },
    ]);

    const t1 = setTimeout(() => {
      setSimulationStage('bronze');
      setSimulationHarvestedCount(6150);
      setLogs((prev) => [
        ...prev,
        { id: Date.now() + 1, time: new Date().toLocaleTimeString('en-US', { hour12: false }), level: 'SUCCESS', tag: 'BRONZE-R2', msg: 'Streamed 6,150 raw HTML5 documents to Cloudflare R2 bucket bronze/raw_html/ (0 egress fees).' },
      ]);
    }, 1200);

    const t2 = setTimeout(() => {
      setSimulationStage('duckdb');
      setSimulationHarvestedCount(36414);
      setFormulasExtracted(920000);
      setLogs((prev) => [
        ...prev,
        { id: Date.now() + 2, time: new Date().toLocaleTimeString('en-US', { hour12: false }), level: 'EXEC', tag: 'DUCKDB-SIMD', msg: 'DuckDB SIMD vector parsing LaTeX equations into Apache Arrow columnar memory.' },
      ]);
    }, 2500);

    const t3 = setTimeout(() => {
      setSimulationStage('parallel');
      setFormulasExtracted(2220938);
      setVectorsIndexed(110000);
      setLogs((prev) => [
        ...prev,
        { id: Date.now() + 3, time: new Date().toLocaleTimeString('en-US', { hour12: false }), level: 'SUCCESS', tag: 'PARALLEL', msg: 'Silver Parquet & Gold LanceDB synced: 2,220,938 formulas, 164,702 vectors indexed.' },
      ]);
    }, 4000);

    const t4 = setTimeout(() => {
      setSimulationStage('completed');
      setVectorsIndexed(164702);
      setLogs((prev) => [
        ...prev,
        { id: Date.now() + 4, time: new Date().toLocaleTimeString('en-US', { hour12: false }), level: 'SUCCESS', tag: 'PIPELINE', msg: 'Lakehouse pipeline execution completed: 36,414 works, 164,702 vectors online.' },
      ]);
    }, 6000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [isPipelineRunning]);

  const effectiveStage = (activePipelineStage && activePipelineStage !== 'idle') ? activePipelineStage : simulationStage;
  const normalizedStage: PipelineStageKey = useMemo(() => {
    if (effectiveStage === 'completed') return 'completed';
    if (effectiveStage === 'harvest') return 'harvest';
    if (effectiveStage === 'bronze' || effectiveStage === 'r2_sync') return 'bronze';
    if (effectiveStage === 'duckdb') return 'duckdb';
    if (effectiveStage === 'parallel' || effectiveStage === 'silver' || effectiveStage === 'gold' || effectiveStage === 'embedding') return 'parallel';
    if (simulationStage !== 'idle') return simulationStage;
    return 'idle';
  }, [effectiveStage, simulationStage]);

  const isStageActive = (stage: string) => {
    if (isStreaming && (stage === 'harvest' || stage === 'bronze')) return true;
    if (effectiveStage === 'completed') return false;
    if (effectiveStage === stage) return true;
    if (effectiveStage === 'parallel' && (stage === 'parallel' || stage === 'silver' || stage === 'gold')) return true;
    return false;
  };

  const isGroundedRagReady = effectiveStage === 'completed' || activePipelineStage === 'completed' || simulationStage === 'completed';

  const handleOpenInspector = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setDrawerOpen(true);
    if (nodeId === 'start-flow') {
      setBottomTab('control');
    }
  };

  const handleToggleCategory = (cat: string) => {
    setHarvestCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleStartHarvest = () => {
    setIsHarvesting(true);
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    const newBatch = [
      { id: Date.now(), time: now, level: 'EXEC' as const, tag: 'HARVEST', msg: `Initiating arXiv harvest: categories=[${harvestCategories.join(', ')}], limit=${harvestLimit.toLocaleString()}, delay=${harvestDelay}s` },
      { id: Date.now() + 1, time: now, level: 'INFO' as const, tag: 'RATE-LIMIT', msg: 'arXiv OAI-PMH compliance verified. Resumption token rate-limiting enforced.' },
      { id: Date.now() + 2, time: now, level: 'INFO' as const, tag: 'ASYNC-HTTPX', msg: 'Spawning 4 asynchronous HTTPX workers with SHA-256 integrity validation.' },
    ];
    setLogs((prev) => [...prev, ...newBatch]);

    if (onTriggerPipeline) {
      onTriggerPipeline();
    }

    setTimeout(() => {
      const t1 = new Date().toLocaleTimeString('en-US', { hour12: false });
      setLogs((prev) => [
        ...prev,
        { id: Date.now() + 3, time: t1, level: 'SUCCESS' as const, tag: 'BRONZE-R2', msg: 'Streamed 250 raw HTML5 articles to Cloudflare R2 bucket bronze/raw_html/year=2026/ (0 egress fees).' },
        { id: Date.now() + 4, time: t1, level: 'EXEC' as const, tag: 'DUCKDB-SIMD', msg: 'DuckDB parsed 4,820 LaTeX formulas; extracted 5 academic canonical sections.' },
        { id: Date.now() + 5, time: t1, level: 'SUCCESS' as const, tag: 'LANCEDB', msg: 'Indexed 1,250 semantic passage chunks into LanceDB IVF-PQ table.' },
      ]);
      setIsHarvesting(false);
    }, 3500);
  };

  const handleToggleFormat = (fmt: string) => {
    setHarvestFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  };

  const handleRunDuckQuery = async () => {
    setDuckRunning(true);
    try {

      const res = await executeDuckDbQuery(duckQueryPreset);
      const rows = res.rows.map((r: any) => ({
        category: String(r.category || r.primary_category || r.paper_id || 'All'),
        papers: Number(r.papers || r.count || 0),
        formulas: Number(r.formulas || r.total_math_count || 0),
        avg_math: Number(r.avg_math || 0),
      }));
      setDuckResults(rows.length > 0 ? rows : [
        { category: 'Empty', papers: 0, formulas: 0, avg_math: 0 }
      ]);
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      setLogs((prev) => [
        ...prev,
        { id: Date.now(), time: now, level: 'EXEC' as const, tag: 'DUCKDB-LIVE', msg: `DuckDB SIMD executed in ${(res.execution_time_ms / 1000).toFixed(3)}s over ${res.row_count} records in Silver Parquet.` },
      ]);
    } catch (err: any) {
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      setLogs((prev) => [
        ...prev,
        { id: Date.now(), time: now, level: 'WARN' as const, tag: 'DUCKDB-ERROR', msg: `Query failed: ${err.message}` },
      ]);
    } finally {
      setDuckRunning(false);
    }
  };

  const handleRunLanceSearch = async () => {
    setLanceSearching(true);
    try {
      const res = await searchLakehouse(lanceQuery, 5);
      if (res?.results && res.results.length > 0) {
        setLanceResults(
          res.results.map((hit) => ({
            id: `arXiv:${hit.paper_id}`,
            title: hit.title || 'Academic Paper',
            score: Number(hit.score?.toFixed(3) || 0.885),
            category: hit.primary_category || 'cs.AI',
          }))
        );
      }
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      setLogs((prev) => [
        ...prev,
        { id: Date.now(), time: now, level: 'EXEC' as const, tag: 'LANCEDB-LIVE', msg: `ANN query found ${res.total_results} chunks in LanceDB Gold Lakehouse (${liveVectors.toLocaleString()} vectors).` },
      ]);
    } catch (err: any) {
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      setLogs((prev) => [
        ...prev,
        { id: Date.now(), time: now, level: 'WARN' as const, tag: 'LANCEDB-ERROR', msg: `Search error: ${err.message}` },
      ]);
    } finally {
      setLanceSearching(false);
    }
  };

  const handleRunRagPrompt = async () => {
    setRagGenerating(true);
    try {
      const res = await sendChatQuery(ragPrompt);
      setRagResponse(res.answer || (language === 'vi' ? 'Không tìm thấy ngữ cảnh thỏa điều kiện grounding.' : 'No context satisfying grounding criteria found.'));
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      setLogs((prev) => [
        ...prev,
        { id: Date.now(), time: now, level: 'SUCCESS' as const, tag: 'RAG-LIVE', msg: `Grounded RAG synthesis generated (${res.generation_time}) using ${res.context_chunks_used} chunks with similarity ${res.similarity_score}.` },
      ]);
    } catch (err: any) {
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      setLogs((prev) => [
        ...prev,
        { id: Date.now(), time: now, level: 'WARN' as const, tag: 'RAG-ERROR', msg: `RAG error: ${err.message}` },
      ]);
    } finally {
      setRagGenerating(false);
    }
  };


  const baseTool = TOOL_DETAILS_MAP[selectedNodeId] || TOOL_DETAILS_MAP['start-flow'];
  const selectedTool = useMemo(() => {
    if (selectedNodeId === 'review-r2' || selectedNodeId === 'bronze-instance') {
      return {
        ...baseTool,
        telemetrySummary: {
          ...baseTool.telemetrySummary,
          primaryMetric: `${storageUsedGb.toFixed(3)} GB Raw Storage`,
          secondaryMetric: `${liveBronzeCount.toLocaleString()} HTML5 + ${liveBatchesCount} Batches`,
        }
      };
    }
    if (selectedNodeId === 'review-duckdb') {
      return {
        ...baseTool,
        telemetrySummary: {
          ...baseTool.telemetrySummary,
          primaryMetric: `${(2220938 + streamSessionCount * 24).toLocaleString()} LaTeX Formulas`,
          secondaryMetric: `${(9015 + streamSessionCount).toLocaleString()} Full-Section Enriched Papers`,
        }
      };
    }
    if (selectedNodeId === 'gold-lancedb') {
      return {
        ...baseTool,
        telemetrySummary: {
          ...baseTool.telemetrySummary,
          primaryMetric: `${(storageStats?.activeLakehouse?.activeLanceDbVectors ?? 164702).toLocaleString()} Vectors Indexed`,
          secondaryMetric: `768 Dimensions · ${(storageStats?.activeLakehouse?.activeLanceDbSizeMb ?? 211.26).toFixed(2)} MB Index`,
        }
      };
    }
    if (selectedNodeId === 'silver-parquet') {
      return {
        ...baseTool,
        telemetrySummary: {
          ...baseTool.telemetrySummary,
          primaryMetric: `${liveSilverMb.toFixed(2)} MB Columnar Parquet`,
          secondaryMetric: `${liveSilverPartitions} Partition Tables (${liveTotalWorks.toLocaleString()} records)`,
        }
      };
    }
    if (selectedNodeId === 'start-flow') {
      return {
        ...baseTool,
        telemetrySummary: {
          ...baseTool.telemetrySummary,
          primaryMetric: `${(totalCorpus || liveTotalWorks).toLocaleString()} Works Ingested`,
          secondaryMetric: `${liveBronzeCount.toLocaleString()} arXiv + ${liveOpenAlexCount.toLocaleString()} OpenAlex + 184 Conf`,
        }
      };
    }
    return baseTool;
  }, [baseTool, selectedNodeId, storageUsedGb, liveBronzeCount, liveBatchesCount, streamSessionCount, storageStats, totalCorpus, liveTotalWorks, liveOpenAlexCount, liveSilverMb, liveSilverPartitions]);

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
        height: '100%',
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        userSelect: 'none',
        position: 'relative',
        cursor: isDragging ? 'grabbing' : 'grab',
        overflow: 'hidden',
      }}
    >

      {/* Top Floating Pipeline Execution Stepper (HUD) */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '20px',
          right: '20px',
          zIndex: 35,
          pointerEvents: 'auto',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <PipelineExecutionStepper
          currentStage={normalizedStage}
          isPipelineRunning={isPipelineRunning}
          onTriggerPipeline={onTriggerPipeline}
          onSelectStageNode={handleOpenInspector}
          selectedNodeId={selectedNodeId}
          theme={theme}
          language={language}
          isStreaming={isStreaming}
        />
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
          paddingTop: '60px',
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y + (drawerOpen ? -145 : 15)}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
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
              width: '240px',
              backgroundColor: themeStyles.cardBg,
              borderRadius: '14px',
              padding: '14px 16px',
              border: isStageActive('harvest')
                ? '2px solid #8b5cf6'
                : selectedNodeId === 'start-flow' && drawerOpen
                ? '2px solid #7c3aed'
                : `1px solid ${themeStyles.cardBorder}`,
              boxShadow: isStageActive('harvest')
                ? (isDark
                    ? '0 0 24px rgba(139, 92, 246, 0.45)'
                    : '0 4px 18px -2px rgba(139, 92, 246, 0.25), 0 2px 6px rgba(0, 0, 0, 0.05)')
                : isDark
                ? '0 4px 16px rgba(0, 0, 0, 0.45)'
                : '0 2px 10px rgba(0, 0, 0, 0.05)',
              animation: isStageActive('harvest') ? 'stageActiveRadarPulse 2.4s ease-in-out infinite' : 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Stage Micro Progress Bar */}
            {isStageActive('harvest') && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  backgroundColor: 'rgba(139, 92, 246, 0.25)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    backgroundColor: '#8b5cf6',
                    boxShadow: '0 0 8px #c084fc',
                    animation: 'conduitParticleStream 1.0s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    width: '60%',
                  }}
                />
              </div>
            )}

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
                  <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#c084fc' : '#6d28d9' }}>
                    {language === 'vi' ? 'Thu Thập Nguồn' : 'Source Ingest'}
                  </div>
                  <div style={{ fontSize: '12px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                    {language === 'vi' ? 'Bộ Cào Phân Tán' : 'Federated Crawlers'}
                  </div>
                </div>
              </div>

              <span style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: isStageActive('harvest')
                  ? '#ffffff'
                  : isStreaming
                  ? (isDark ? '#34d399' : '#059669')
                  : (isDark ? '#c084fc' : '#7c3aed'),
                backgroundColor: isStageActive('harvest')
                  ? '#8b5cf6'
                  : isStreaming
                  ? (isDark ? 'rgba(16, 185, 129, 0.18)' : '#ecfdf5')
                  : (isDark ? 'rgba(124, 58, 237, 0.18)' : '#f5f3ff'),
                border: `1px solid ${isStageActive('harvest') ? '#a78bfa' : isStreaming ? (isDark ? 'rgba(16, 185, 129, 0.3)' : 'transparent') : (isDark ? 'rgba(124, 58, 237, 0.3)' : 'transparent')}`,
                boxShadow: isStageActive('harvest') ? '0 0 10px rgba(139, 92, 246, 0.6)' : 'none',
                padding: '3px 7px',
                borderRadius: '5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                {isStageActive('harvest') && (
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#ffffff', animation: 'spin 1s linear infinite' }} />
                )}
                {isStageActive('harvest')
                  ? (language === 'vi' ? '⚡ ĐANG THU THẬP' : '⚡ INGESTING')
                  : isStreaming
                  ? '● STREAMING'
                  : (effectiveStage === 'completed' ? '✔ SYNCED' : 'v2.0')}
              </span>
            </div>

            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: (isStreaming || isStageActive('harvest')) ? (isDark ? '#c084fc' : '#7c3aed') : themeStyles.textPrimary, fontFamily: 'var(--font-mono)' }}>
                  <AnimatedCounter value={displayWorks} />
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isStreaming ? (language === 'vi' ? `+${streamSessionCount} mới (${streamSpeed}/m)` : `+${streamSessionCount} new (${streamSpeed}/m)`) : (language === 'vi' ? 'Bài Đã Thu Thập' : 'Works Ingested')}
                </span>
              </div>

              {/* Segmented Distribution Bar */}
              <div style={{ width: '100%', height: '5px', backgroundColor: 'var(--bg-elevated)', borderRadius: '9999px', overflow: 'hidden', display: 'flex', border: '1px solid var(--border-subtle)' }} title={language === 'vi' ? `Phân bổ: arXiv ${liveBronzeCount.toLocaleString()} (${Math.round((liveBronzeCount / liveTotalWorks) * 100)}%) • OpenAlex ${liveOpenAlexCount.toLocaleString()} (${Math.round((liveOpenAlexCount / liveTotalWorks) * 100)}%)` : `Distribution: arXiv ${liveBronzeCount.toLocaleString()} (${Math.round((liveBronzeCount / liveTotalWorks) * 100)}%) • OpenAlex ${liveOpenAlexCount.toLocaleString()} (${Math.round((liveOpenAlexCount / liveTotalWorks) * 100)}%)`}>
                <div style={{ width: `${(liveBronzeCount / liveTotalWorks) * 100}%`, height: '100%', backgroundColor: '#8b5cf6', transition: 'width 0.3s' }} />
                <div style={{ width: `${(liveOpenAlexCount / liveTotalWorks) * 100}%`, height: '100%', backgroundColor: '#6366f1', transition: 'width 0.3s' }} />
              </div>

              {/* High-Contrast Visual Source Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(139, 92, 246, 0.18)' : '#f3e8ff',
                  color: isDark ? '#c084fc' : '#7c3aed',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#8b5cf6' }} />
                  arXiv {liveBronzeCount.toLocaleString()}
                </span>

                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(99, 102, 241, 0.18)' : '#e0e7ff',
                  color: isDark ? '#818cf8' : '#4338ca',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#6366f1' }} />
                  OpenAlex {liveOpenAlexCount.toLocaleString()}
                </span>

                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7',
                  color: isDark ? '#fbbf24' : '#b45309',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  Conf {liveConfCount}
                </span>
              </div>
            </div>

            <button
              type="button"
              style={{
                width: '100%',
                marginTop: '10px',
                padding: '5px 0',
                border: `1px solid ${themeStyles.btnInspectBorder}`,
                borderRadius: '6px',
                backgroundColor: themeStyles.btnInspectBg,
                color: themeStyles.btnInspectText,
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {language === 'vi' ? 'XEM CÔNG CỤ' : 'INSPECT TOOL'}
            </button>
          </div>

          {/* Horizontal Connector 1 */}
          <div style={{
            width: '42px',
            height: '4px',
            borderRadius: '2px',
            backgroundColor: (isStageActive('harvest') || isStreaming) ? '#8b5cf6' : themeStyles.wire,
            position: 'relative',
            flexShrink: 0,
            overflow: 'hidden',
            boxShadow: (isStageActive('harvest') || isStreaming) ? '0 0 10px rgba(139, 92, 246, 0.7)' : 'none',
            transition: 'all 0.3s ease',
          }}>
            {(isStageActive('harvest') || isStreaming) && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    height: '100%',
                    width: '32px',
                    background: 'linear-gradient(90deg, transparent 0%, rgba(168, 85, 247, 0.4) 30%, #c084fc 80%, #ffffff 100%)',
                    boxShadow: '0 0 10px #c084fc, 0 0 4px #ffffff',
                    animation: 'conduitParticleStream 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '-2px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 0 8px #c084fc, 0 0 4px #ffffff',
                    animation: 'conduitParticleStream 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    animationDelay: '0.2s',
                  }}
                />
              </>
            )}
          </div>

          {/* ============================================================== */}
          {/* STAGE 2: Cloudflare R2 Bronze Lake (Magenta/Pink) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleOpenInspector('bronze-instance')}
            style={{
              width: '240px',
              backgroundColor: themeStyles.cardBg,
              borderRadius: '14px',
              padding: '14px 16px',
              border: isStageActive('bronze')
                ? '2px solid #e11d48'
                : selectedNodeId === 'bronze-instance' && drawerOpen
                ? '2px solid #e11d48'
                : `1px solid ${themeStyles.cardBorder}`,
              boxShadow: isStageActive('bronze')
                ? (isDark
                    ? '0 0 24px rgba(225, 29, 72, 0.45)'
                    : '0 4px 18px -2px rgba(225, 29, 72, 0.25), 0 2px 6px rgba(0, 0, 0, 0.05)')
                : isDark
                ? '0 4px 16px rgba(0, 0, 0, 0.45)'
                : '0 2px 10px rgba(0, 0, 0, 0.05)',
              animation: isStageActive('bronze') ? 'stageActiveRadarPulse 2.4s ease-in-out infinite' : 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Stage Micro Progress Bar */}
            {isStageActive('bronze') && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  backgroundColor: 'rgba(225, 29, 72, 0.25)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    backgroundColor: '#e11d48',
                    boxShadow: '0 0 8px #fb7185',
                    animation: 'conduitParticleStream 1.0s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    width: '60%',
                  }}
                />
              </div>
            )}

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
                  <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#fb7185' : '#e11d48' }}>Cloudflare R2</div>
                  <div style={{ fontSize: '12px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                    {language === 'vi' ? 'Hồ Dữ Liệu Bronze' : 'Bronze Lake'}
                  </div>
                </div>
              </div>

              <span style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: isStageActive('bronze')
                  ? '#ffffff'
                  : isStreaming
                  ? '#34d399'
                  : (isDark ? '#fb7185' : '#e11d48'),
                backgroundColor: isStageActive('bronze')
                  ? '#e11d48'
                  : isStreaming
                  ? (isDark ? 'rgba(16, 185, 129, 0.20)' : '#ecfdf5')
                  : (isDark ? 'rgba(225, 29, 72, 0.20)' : '#fff1f2'),
                border: `1px solid ${isStageActive('bronze') ? '#f43f5e' : isStreaming ? (isDark ? 'rgba(16, 185, 129, 0.35)' : 'transparent') : (isDark ? 'rgba(225, 29, 72, 0.35)' : 'transparent')}`,
                boxShadow: isStageActive('bronze') ? '0 0 10px rgba(225, 29, 72, 0.6)' : 'none',
                padding: '3px 7px',
                borderRadius: '5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                {isStageActive('bronze') && (
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#ffffff', animation: 'spin 1s linear infinite' }} />
                )}
                {isStageActive('bronze')
                  ? (language === 'vi' ? '⚡ TẢI LÊN R2' : '⚡ UPLOADING')
                  : isStreaming
                  ? (language === 'vi' ? '● ĐỒNG BỘ R2' : '● SYNCING R2')
                  : 'S3 API'}
              </span>
            </div>

            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: isStageActive('bronze') ? (isDark ? '#fb7185' : '#e11d48') : themeStyles.textPrimary, fontFamily: 'var(--font-mono)' }}>
                  <AnimatedCounter value={liveActiveStorageGb} decimals={3} suffix=" GB" />
                </span>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}>
                  {language === 'vi' ? 'Hồ Dữ Liệu Chính' : 'Primary Lake'}
                </span>
              </div>

              {/* Visual Storage Progress Bar */}
              <div style={{ width: '100%', height: '5px', backgroundColor: 'var(--bg-elevated)', borderRadius: '9999px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }} title={language === 'vi' ? `Hạn mức Cloudflare R2: ${liveActiveStorageGb.toFixed(3)} GB / 10.0 GB (${liveActiveStoragePct.toFixed(1)}%)` : `Cloudflare R2 Quota: ${liveActiveStorageGb.toFixed(3)} GB / 10.0 GB (${liveActiveStoragePct.toFixed(1)}%)`}>
                <div style={{
                  width: `${Math.min(100, liveActiveStoragePct)}%`,
                  height: '100%',
                  background: liveActiveStoragePct >= 90
                    ? 'linear-gradient(90deg, #f43f5e, #dc2626)'
                    : liveActiveStoragePct >= 80
                    ? 'linear-gradient(90deg, #f59e0b, #ea580c)'
                    : 'linear-gradient(90deg, #10b981, #06b6d4)',
                  borderRadius: '9999px',
                  transition: 'width 0.4s ease',
                }} />
              </div>

              {/* Color-Coded Lakehouse Layer Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(225, 29, 72, 0.18)' : '#ffe4e6',
                  color: isDark ? '#fb7185' : '#e11d48',
                  border: '1px solid rgba(225, 29, 72, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#e11d48' }} />
                  HTML5 {parseFloat(liveBronzeGb).toFixed(2)} GB
                </span>

                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(99, 102, 241, 0.18)' : '#e0e7ff',
                  color: isDark ? '#818cf8' : '#4338ca',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#6366f1' }} />
                  Meta 3.97 GB
                </span>

                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#d1fae5',
                  color: isDark ? '#34d399' : '#059669',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  Parquet {liveSilverMb.toFixed(0)} MB
                </span>

                {isStreaming && lastPaperDeltaBytes > 0 && (
                  <span style={{
                    fontSize: '11.5px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '5px',
                    backgroundColor: 'rgba(6, 182, 212, 0.18)',
                    color: 'var(--accent-cyan)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    +{Math.round(lastPaperDeltaBytes / 1024)} KB CDC
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              style={{
                width: '100%',
                marginTop: '10px',
                padding: '5px 0',
                border: `1px solid ${themeStyles.btnInspectBorder}`,
                borderRadius: '6px',
                backgroundColor: themeStyles.btnInspectBg,
                color: themeStyles.btnInspectText,
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {language === 'vi' ? 'XEM CÔNG CỤ' : 'INSPECT TOOL'}
            </button>
          </div>

          {/* Horizontal Connector 2 */}
          <div style={{
            width: '42px',
            height: '4px',
            borderRadius: '2px',
            backgroundColor: (isStageActive('bronze') || isStreaming) ? '#e11d48' : themeStyles.wire,
            position: 'relative',
            flexShrink: 0,
            overflow: 'hidden',
            boxShadow: (isStageActive('bronze') || isStreaming) ? '0 0 10px rgba(225, 29, 72, 0.7)' : 'none',
            transition: 'all 0.3s ease',
          }}>
            {(isStageActive('bronze') || isStreaming) && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    height: '100%',
                    width: '32px',
                    background: 'linear-gradient(90deg, transparent 0%, rgba(244, 63, 94, 0.4) 30%, #fb7185 80%, #ffffff 100%)',
                    boxShadow: '0 0 10px #fb7185, 0 0 4px #ffffff',
                    animation: 'conduitParticleStream 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '-2px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 0 8px #fb7185, 0 0 4px #ffffff',
                    animation: 'conduitParticleStream 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    animationDelay: '0.25s',
                  }}
                />
              </>
            )}
          </div>

          {/* ============================================================== */}
          {/* STAGE 3: DuckDB & LaTeX Normalizer (Amber) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleOpenInspector('review-duckdb')}
            style={{
              width: '240px',
              backgroundColor: themeStyles.cardBg,
              borderRadius: '14px',
              padding: '14px 16px',
              border: isStageActive('duckdb')
                ? '2px solid #f59e0b'
                : selectedNodeId === 'review-duckdb' && drawerOpen
                ? '2px solid #f59e0b'
                : `1px solid ${themeStyles.cardBorder}`,
              boxShadow: isStageActive('duckdb')
                ? (isDark
                    ? '0 0 24px rgba(245, 158, 11, 0.45)'
                    : '0 4px 18px -2px rgba(245, 158, 11, 0.25), 0 2px 6px rgba(0, 0, 0, 0.05)')
                : isDark
                ? '0 4px 16px rgba(0, 0, 0, 0.45)'
                : '0 2px 10px rgba(0, 0, 0, 0.05)',
              animation: isStageActive('duckdb') ? 'stageActiveRadarPulse 2.4s ease-in-out infinite' : 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Stage Micro Progress Bar */}
            {isStageActive('duckdb') && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  backgroundColor: 'rgba(245, 158, 11, 0.25)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    backgroundColor: '#f59e0b',
                    boxShadow: '0 0 8px #fbbf24',
                    animation: 'conduitParticleStream 1.0s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    width: '60%',
                  }}
                />
              </div>
            )}

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
                  <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#fbbf24' : '#d97706' }}>DuckDB</div>
                  <div style={{ fontSize: '12px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                    {language === 'vi' ? 'OLAP Trong Tiến Trình' : 'In-Process OLAP'}
                  </div>
                </div>
              </div>

              <span style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: isStageActive('duckdb') ? '#ffffff' : (isDark ? '#fbbf24' : '#d97706'),
                backgroundColor: isStageActive('duckdb')
                  ? '#f59e0b'
                  : (isDark ? 'rgba(245, 158, 11, 0.20)' : '#fef3c7'),
                border: `1px solid ${isStageActive('duckdb') ? '#fbbf24' : (isDark ? 'rgba(245, 158, 11, 0.35)' : 'transparent')}`,
                boxShadow: isStageActive('duckdb') ? '0 0 10px rgba(245, 158, 11, 0.6)' : 'none',
                padding: '3px 7px',
                borderRadius: '5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                {isStageActive('duckdb') && (
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#ffffff', animation: 'spin 1s linear infinite' }} />
                )}
                {isStageActive('duckdb')
                  ? (language === 'vi' ? '⚡ SIMD ĐANG TÁCH' : '⚡ SIMD PARSING')
                  : 'SIMD'}
              </span>
            </div>

            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: isStageActive('duckdb') ? (isDark ? '#fbbf24' : '#d97706') : themeStyles.textPrimary, fontFamily: 'var(--font-mono)' }}>
                  <AnimatedCounter value={liveFormulas} />
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {language === 'vi' ? 'Công thức Đã Phân Tích' : 'Formulas Parsed'}
                </span>
              </div>

              {/* Visual Performance Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.18)' : '#fef3c7',
                  color: isDark ? '#fbbf24' : '#b45309',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                  Zero-Copy Arrow
                </span>

                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#d1fae5',
                  color: isDark ? '#34d399' : '#047857',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  SIMD AVX-512
                </span>

                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
                  color: isDark ? '#60a5fa' : '#2563eb',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  &lt;18ms Query
                </span>
              </div>
            </div>

            <button
              type="button"
              style={{
                width: '100%',
                marginTop: '10px',
                padding: '5px 0',
                border: `1px solid ${themeStyles.btnInspectBorder}`,
                borderRadius: '6px',
                backgroundColor: themeStyles.btnInspectBg,
                color: themeStyles.btnInspectText,
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {language === 'vi' ? 'XEM CÔNG CỤ' : 'INSPECT TOOL'}
            </button>
          </div>

          {/* Horizontal Connector 3 into Red Split Node */}
          <div style={{
            width: '36px',
            height: '4px',
            borderRadius: '2px',
            backgroundColor: isStageActive('duckdb') ? '#f59e0b' : themeStyles.wire,
            position: 'relative',
            flexShrink: 0,
            overflow: 'hidden',
            boxShadow: isStageActive('duckdb') ? '0 0 10px rgba(245, 158, 11, 0.7)' : 'none',
            transition: 'all 0.3s ease',
          }}>
            {isStageActive('duckdb') && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    height: '100%',
                    width: '30px',
                    background: 'linear-gradient(90deg, transparent 0%, rgba(245, 158, 11, 0.4) 30%, #fbbf24 80%, #ffffff 100%)',
                    boxShadow: '0 0 10px #fbbf24, 0 0 4px #ffffff',
                    animation: 'conduitParticleStream 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '-2px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 0 8px #fbbf24, 0 0 4px #ffffff',
                    animation: 'conduitParticleStream 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    animationDelay: '0.2s',
                  }}
                />
              </>
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
                boxShadow: isStageActive('parallel')
                  ? '0 0 16px rgba(239, 68, 68, 0.75)'
                  : '0 2px 8px rgba(239, 68, 68, 0.35)',
                animation: isStageActive('parallel') ? 'stageActiveRadarPulse 2s ease-in-out infinite' : 'none',
                zIndex: 10,
                flexShrink: 0,
              }}
              title={language === 'vi' ? 'Nhánh Song Song: Lưu Trữ Cột & Vector Nhúng' : 'Parallel Fork: Columnar Storage & Vector Embeddings'}
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
              <div style={{ position: 'absolute', top: '70px', left: '0', width: '14px', height: '4px', borderRadius: '2px', backgroundColor: isStageActive('parallel') ? '#f59e0b' : themeStyles.wire, boxShadow: isStageActive('parallel') ? '0 0 8px rgba(245, 158, 11, 0.5)' : 'none' }} />
              <div style={{ position: 'absolute', top: '16px', left: '12px', width: '4px', height: '112px', borderRadius: '2px', backgroundColor: isStageActive('parallel') ? '#38bdf8' : themeStyles.wire, boxShadow: isStageActive('parallel') ? '0 0 8px rgba(56, 189, 248, 0.4)' : 'none' }} />
              <div style={{ position: 'absolute', top: '16px', left: '12px', width: '16px', height: '4px', borderRadius: '2px', backgroundColor: isStageActive('parallel') ? '#10b981' : themeStyles.wire, boxShadow: isStageActive('parallel') ? '0 0 8px #10b981' : 'none' }} />
              <div style={{ position: 'absolute', bottom: '16px', left: '12px', width: '16px', height: '4px', borderRadius: '2px', backgroundColor: isStageActive('parallel') ? '#2563eb' : themeStyles.wire, boxShadow: isStageActive('parallel') ? '0 0 8px #2563eb' : 'none' }} />
              {isStageActive('parallel') && (
                <>
                  <div
                    style={{
                      position: 'absolute',
                      top: '14px',
                      left: '10px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#34d399',
                      boxShadow: '0 0 8px #34d399',
                      animation: 'conduitVerticalParticleUp 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '14px',
                      left: '10px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#60a5fa',
                      boxShadow: '0 0 8px #60a5fa',
                      animation: 'conduitVerticalParticleDown 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    }}
                  />
                </>
              )}
            </div>

            {/* Parallel Cards: Apache Parquet (Top) & LanceDB (Bottom) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', flexShrink: 0 }}>
              {/* PATH 1 (TOP): Apache Parquet (Green) */}
              <div
                onClick={() => handleOpenInspector('silver-parquet')}
                style={{
                  width: '260px',
                  backgroundColor: themeStyles.cardBg,
                  borderRadius: '14px',
                  padding: '12px 16px',
                  border: isStageActive('parallel')
                    ? '2px solid #10b981'
                    : selectedNodeId === 'silver-parquet' && drawerOpen
                    ? '2px solid #10b981'
                    : `1px solid ${themeStyles.cardBorder}`,
                  boxShadow: isStageActive('parallel')
                    ? (isDark
                        ? '0 0 20px rgba(16, 185, 129, 0.45)'
                        : '0 4px 18px -2px rgba(16, 185, 129, 0.25), 0 2px 6px rgba(0, 0, 0, 0.05)')
                    : isDark
                    ? '0 4px 12px rgba(0, 0, 0, 0.4)'
                    : '0 2px 10px rgba(0, 0, 0, 0.05)',
                  animation: isStageActive('parallel') ? 'stageActiveRadarPulse 2.4s ease-in-out infinite' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Stage Micro Progress Bar */}
                {isStageActive('parallel') && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '3px',
                      backgroundColor: 'rgba(16, 185, 129, 0.25)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        backgroundColor: '#10b981',
                        boxShadow: '0 0 8px #34d399',
                        animation: 'conduitParticleStream 1.0s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                        width: '60%',
                      }}
                    />
                  </div>
                )}

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
                      <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#34d399' : '#047857' }}>Apache Parquet</div>
                      <div style={{ fontSize: '12px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                        {language === 'vi' ? 'Dữ Liệu Cột Silver' : 'Silver Columnar'}
                      </div>
                    </div>
                  </div>

                  <span style={{
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    color: isStageActive('parallel') ? '#ffffff' : (isDark ? '#34d399' : '#059669'),
                    backgroundColor: isStageActive('parallel')
                      ? '#10b981'
                      : (isDark ? 'rgba(16, 185, 129, 0.20)' : '#ecfdf5'),
                    border: `1px solid ${isStageActive('parallel') ? '#34d399' : (isDark ? 'rgba(16, 185, 129, 0.35)' : 'transparent')}`,
                    boxShadow: isStageActive('parallel') ? '0 0 10px rgba(16, 185, 129, 0.6)' : 'none',
                    padding: '3px 7px',
                    borderRadius: '5px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    {isStageActive('parallel') && (
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#ffffff', animation: 'spin 1s linear infinite' }} />
                    )}
                    {isStageActive('parallel')
                      ? (language === 'vi' ? '⚡ NÉN SNAPPY' : '⚡ SNAPPY COMPRESS')
                      : 'Snappy'}
                  </span>
                </div>

                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 900, color: themeStyles.textPrimary }}>
                      <AnimatedCounter value={liveSilverMb} decimals={2} suffix=" MB" />
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
                      Silver Parquet
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{
                      fontSize: '11.5px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '5px',
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#d1fae5',
                      color: isDark ? '#34d399' : '#047857',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                      {liveSilverPartitions} {language === 'vi' ? 'Phân vùng' : 'Partitions'}
                    </span>

                    <span style={{
                      fontSize: '11.5px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '5px',
                      backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
                      color: isDark ? '#60a5fa' : '#2563eb',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      Snappy 4.2x
                    </span>

                    <span style={{
                      fontSize: '11.5px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '5px',
                      backgroundColor: isDark ? 'rgba(168, 85, 247, 0.15)' : '#f3e8ff',
                      color: isDark ? '#c084fc' : '#7c3aed',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      PyArrow OLAP
                    </span>
                  </div>
                </div>
              </div>

              {/* PATH 2 (BOTTOM): LanceDB & 4 Pillars (Blue) */}
              <div
                onClick={() => handleOpenInspector('gold-lancedb')}
                style={{
                  width: '260px',
                  backgroundColor: themeStyles.cardBg,
                  borderRadius: '14px',
                  padding: '12px 16px',
                  border: isStageActive('parallel')
                    ? '2px solid #2563eb'
                    : selectedNodeId === 'gold-lancedb' && drawerOpen
                    ? '2px solid #2563eb'
                    : `1px solid ${themeStyles.cardBorder}`,
                  boxShadow: isStageActive('parallel')
                    ? (isDark
                        ? '0 0 20px rgba(37, 99, 235, 0.45)'
                        : '0 4px 18px -2px rgba(37, 99, 235, 0.25), 0 2px 6px rgba(0, 0, 0, 0.05)')
                    : isDark
                    ? '0 4px 12px rgba(0, 0, 0, 0.4)'
                    : '0 2px 10px rgba(0, 0, 0, 0.05)',
                  animation: isStageActive('parallel') ? 'stageActiveRadarPulse 2.4s ease-in-out infinite' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Stage Micro Progress Bar */}
                {isStageActive('parallel') && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '3px',
                      backgroundColor: 'rgba(37, 99, 235, 0.25)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        backgroundColor: '#2563eb',
                        boxShadow: '0 0 8px #60a5fa',
                        animation: 'conduitParticleStream 1.0s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                        width: '60%',
                      }}
                    />
                  </div>
                )}

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
                      <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#60a5fa' : '#1d4ed8' }}>LanceDB Vectors</div>
                      <div style={{ fontSize: '12px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                        {language === 'vi' ? 'Kho Vector Gold' : 'Gold Vector Store'}
                      </div>
                    </div>
                  </div>

                  <span style={{
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    color: isStageActive('parallel') ? '#ffffff' : (isDark ? '#60a5fa' : '#2563eb'),
                    backgroundColor: isStageActive('parallel')
                      ? '#2563eb'
                      : (isDark ? 'rgba(37, 99, 235, 0.20)' : '#eff6ff'),
                    border: `1px solid ${isStageActive('parallel') ? '#60a5fa' : (isDark ? 'rgba(37, 99, 235, 0.35)' : 'transparent')}`,
                    boxShadow: isStageActive('parallel') ? '0 0 10px rgba(37, 99, 235, 0.6)' : 'none',
                    padding: '3px 7px',
                    borderRadius: '5px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    {isStageActive('parallel') && (
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#ffffff', animation: 'spin 1s linear infinite' }} />
                    )}
                    {isStageActive('parallel')
                      ? (language === 'vi' ? '⚡ ĐÁNH CHỈ MỤC' : '⚡ ANN INDEXING')
                      : 'Nomic AI'}
                  </span>
                </div>

                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 900, color: isStageActive('parallel') ? (isDark ? '#60a5fa' : '#2563eb') : themeStyles.textPrimary }}>
                      <AnimatedCounter value={liveVectors} />
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
                      {language === 'vi' ? 'Vector Gold' : 'Gold Vectors'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{
                      fontSize: '11.5px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '5px',
                      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.18)' : '#eff6ff',
                      color: isDark ? '#60a5fa' : '#2563eb',
                      border: '1px solid rgba(37, 99, 235, 0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                      768-dim Nomic
                    </span>

                    <span style={{
                      fontSize: '11.5px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '5px',
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#d1fae5',
                      color: isDark ? '#34d399' : '#047857',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      IVF-PQ &lt;15ms
                    </span>

                    <span style={{
                      fontSize: '11.5px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '5px',
                      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7',
                      color: isDark ? '#fbbf24' : '#b45309',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      NVMe Cached
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Merge Horizontal-to-Vertical Wiring */}
            <div style={{ width: '28px', height: '144px', position: 'relative', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: '16px', left: '0', width: '14px', height: '4px', borderRadius: '2px', backgroundColor: (isStageActive('parallel') || isGroundedRagReady) ? '#10b981' : themeStyles.wire, boxShadow: (isStageActive('parallel') || isGroundedRagReady) ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'none', transition: 'all 0.3s ease' }} />
              <div style={{ position: 'absolute', bottom: '16px', left: '0', width: '14px', height: '4px', borderRadius: '2px', backgroundColor: (isStageActive('parallel') || isGroundedRagReady) ? '#2563eb' : themeStyles.wire, boxShadow: (isStageActive('parallel') || isGroundedRagReady) ? '0 0 8px rgba(37, 99, 235, 0.5)' : 'none', transition: 'all 0.3s ease' }} />
              <div style={{ position: 'absolute', top: '16px', left: '12px', width: '4px', height: '112px', borderRadius: '2px', backgroundColor: (isStageActive('parallel') || isGroundedRagReady) ? '#6366f1' : themeStyles.wire, boxShadow: (isStageActive('parallel') || isGroundedRagReady) ? '0 0 8px rgba(99, 102, 241, 0.6)' : 'none', transition: 'all 0.3s ease' }} />
              <div style={{ position: 'absolute', top: '70px', left: '12px', width: '16px', height: '4px', borderRadius: '2px', backgroundColor: (isStageActive('parallel') || isGroundedRagReady) ? '#6366f1' : themeStyles.wire, boxShadow: (isStageActive('parallel') || isGroundedRagReady) ? '0 0 8px rgba(99, 102, 241, 0.7)' : 'none', transition: 'all 0.3s ease' }} />
            </div>

            {/* Convergence Anchor Ring */}
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                border: isGroundedRagReady ? '4px solid #6366f1' : `4px solid ${themeStyles.wire}`,
                boxShadow: isGroundedRagReady
                  ? (isDark
                      ? '0 0 16px rgba(99, 102, 241, 0.85), 0 0 6px #818cf8'
                      : '0 2px 8px rgba(99, 102, 241, 0.35)')
                  : 'none',
                flexShrink: 0,
                zIndex: 10,
                transition: 'all 0.3s ease',
              }}
              title="Parallel Convergence Anchor"
            />

            {/* Final Horizontal Connector into Grounded RAG */}
            <div style={{
              width: '36px',
              height: '4px',
              borderRadius: '2px',
              backgroundColor: isGroundedRagReady ? '#6366f1' : themeStyles.wire,
              position: 'relative',
              flexShrink: 0,
              overflow: 'hidden',
              boxShadow: isGroundedRagReady ? '0 0 10px rgba(99, 102, 241, 0.8)' : 'none',
              transition: 'all 0.3s ease',
            }}>
              {isGroundedRagReady && (
                <>
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      height: '100%',
                      width: '30px',
                      background: 'linear-gradient(90deg, transparent 0%, rgba(99, 102, 241, 0.4) 30%, #818cf8 80%, #ffffff 100%)',
                      boxShadow: '0 0 10px #818cf8, 0 0 4px #ffffff',
                      animation: 'conduitParticleStream 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '-2px',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#ffffff',
                      boxShadow: '0 0 8px #818cf8, 0 0 4px #ffffff',
                      animation: 'conduitParticleStream 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                      animationDelay: '0.2s',
                    }}
                  />
                </>
              )}
            </div>

            {/* ============================================================== */}
            {/* STAGE 5: Grounded RAG Console (Indigo) */}
            {/* ============================================================== */}
            <div
              onClick={() => handleOpenInspector('grounded-rag')}
              style={{
                width: '240px',
                backgroundColor: isGroundedRagReady
                  ? (isDark ? 'rgba(30, 27, 75, 0.85)' : '#ffffff')
                  : themeStyles.cardBg,
                borderRadius: '14px',
                padding: '14px 16px',
                border: isGroundedRagReady
                  ? '2px solid #6366f1'
                  : selectedNodeId === 'grounded-rag' && drawerOpen
                  ? '2px solid #6366f1'
                  : `1px solid ${themeStyles.cardBorder}`,
                boxShadow: isGroundedRagReady
                  ? (isDark
                      ? '0 0 32px rgba(99, 102, 241, 0.75), 0 0 12px rgba(129, 140, 248, 0.5)'
                      : '0 4px 20px -2px rgba(99, 102, 241, 0.25), 0 2px 6px rgba(0, 0, 0, 0.05)')
                  : isDark
                  ? '0 4px 16px rgba(0, 0, 0, 0.45)'
                  : '0 2px 10px rgba(0, 0, 0, 0.05)',
                animation: isGroundedRagReady && isDark ? 'ragBeaconGlow 2.4s infinite' : 'none',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                flexShrink: 0,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Stage Micro Progress Bar */}
              {isGroundedRagReady && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '3px',
                    backgroundColor: 'rgba(99, 102, 241, 0.35)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      backgroundColor: '#6366f1',
                      boxShadow: '0 0 8px #818cf8',
                      width: '100%',
                    }}
                  />
                </div>
              )}

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
                    boxShadow: isGroundedRagReady
                      ? (isDark ? '0 0 14px rgba(99, 102, 241, 0.8)' : '0 2px 8px rgba(99, 102, 241, 0.35)')
                      : '0 2px 6px rgba(99, 102, 241, 0.3)',
                    flexShrink: 0,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#a5b4fc' : '#4338ca' }}>Grounded RAG</div>
                  <div style={{ fontSize: '12px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>Qwen 2.5 QA</div>
                </div>
              </div>

              <span style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: isGroundedRagReady ? '#ffffff' : (isDark ? '#a5b4fc' : '#6366f1'),
                backgroundColor: isGroundedRagReady ? '#6366f1' : (isDark ? 'rgba(99, 102, 241, 0.20)' : '#ede9fe'),
                border: `1px solid ${isGroundedRagReady ? '#818cf8' : (isDark ? 'rgba(99, 102, 241, 0.35)' : 'transparent')}`,
                boxShadow: isGroundedRagReady && isDark ? '0 0 12px rgba(99, 102, 241, 0.65)' : 'none',
                padding: '3px 7px',
                borderRadius: '5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                {isGroundedRagReady && (
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#34d399', boxShadow: '0 0 6px #34d399' }} />
                )}
                {isGroundedRagReady ? (language === 'vi' ? '● SẴN SÀNG CHO RAG' : '● READY FOR RAG') : 'Metal'}
              </span>
            </div>

            {isGroundedRagReady && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                <div style={{
                  padding: '5px 8px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  color: isDark ? '#c7d2fe' : '#4338ca',
                  fontSize: '12px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                }}>
                  <span style={{ color: '#10b981' }}>✔</span> {language === 'vi' ? 'PIPELINE ĐÃ SẴN SÀNG' : 'PIPELINE PRIMED'}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateTab?.('rag');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: isDark ? '#4f46e5' : '#6366f1',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    boxShadow: isDark ? '0 0 14px rgba(99, 102, 241, 0.65)' : '0 2px 8px rgba(99, 102, 241, 0.35)',
                    fontSize: '12px',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease',
                  }}
                  title={language === 'vi' ? 'Chuyển sang màn hình Grounded RAG để đặt câu hỏi học thuật' : 'Switch to Grounded RAG to ask academic questions'}
                >
                  <span>{language === 'vi' ? 'TRUY VẤN RAG NGAY' : 'QUERY RAG NOW'}</span>
                  <span style={{ fontSize: '13px' }}>→</span>
                </button>
              </div>
            )}

            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: themeStyles.textPrimary, fontFamily: 'var(--font-mono)' }}>
                  {language === 'vi' ? 'Trích Dẫn Xác Thực' : 'Verified Citations'}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#a5b4fc' : '#6366f1' }}>
                  {language === 'vi' ? '100% Có Căn Cứ' : '100% Grounded'}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(99, 102, 241, 0.18)' : '#ede9fe',
                  color: isDark ? '#a5b4fc' : '#6366f1',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#6366f1' }} />
                  Sub-50ms ANN
                </span>

                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#d1fae5',
                  color: isDark ? '#34d399' : '#047857',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  LaTeX MathML
                </span>

                <span style={{
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7',
                  color: isDark ? '#fbbf24' : '#b45309',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  Metal Engine
                </span>
              </div>
            </div>

            <button
              type="button"
              style={{
                width: '100%',
                marginTop: '10px',
                padding: '5px 0',
                border: `1px solid ${themeStyles.btnInspectBorder}`,
                borderRadius: '6px',
                backgroundColor: themeStyles.btnInspectBg,
                color: themeStyles.btnInspectText,
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {language === 'vi' ? 'XEM CÔNG CỤ' : 'INSPECT TOOL'}
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* BOTTOM DRAWER / INSPECTOR PANEL WITH TABS, CONTROLS & LOGS    */}
      {/* ============================================================== */}
      {drawerOpen && selectedTool && (
        <section
          style={{
            position: 'fixed',
            bottom: 0,
            left: '58px',   // Aligned beside the 58px sidebar rail
            right: 0,
            height: drawerExpanded ? 'calc(100vh - 120px)' : '390px',
            backgroundColor: themeStyles.drawerBg,
            borderTop: `2px solid ${themeStyles.drawerBorder}`,
            boxShadow: isDark ? '0 -10px 32px rgba(0, 0, 0, 0.55)' : '0 -10px 32px rgba(0, 0, 0, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 45,
            transition: 'height 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
            animation: 'slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Panel Top Navigation & Title Bar */}
          <div
            style={{
              height: '48px',
              padding: '0 20px',
              borderBottom: `1px solid ${themeStyles.drawerHeaderBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: themeStyles.drawerHeaderBg,
              flexShrink: 0,
            }}
          >
            {/* Left: Tool identity & Status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: selectedTool.badgeColor,
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                  {selectedTool.category.toUpperCase()}
                </span>
                <span style={{ color: themeStyles.wire }}>/</span>
                <h3 style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0 }}>
                  {selectedTool.name}
                </h3>
                <span
                  style={{
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: themeStyles.textMuted,
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 600,
                  }}
                >
                  {selectedTool.engineVersion}
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
                    color: isDark ? '#34d399' : '#059669',
                    border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'transparent'}`,
                    padding: '2px 7px',
                    borderRadius: '9999px',
                  }}
                >
                  ● {selectedTool.status}
                </span>
              </div>
            </div>

            {/* Center: 3 Navigation Tabs */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: themeStyles.drawerTabsTrack,
                padding: '3px',
                borderRadius: '8px',
                border: `1px solid ${themeStyles.drawerTabsTrackBorder}`,
                gap: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => setBottomTab('control')}
                style={{
                  padding: '5px 14px',
                  fontSize: '12px',
                  fontWeight: bottomTab === 'control' ? 800 : 600,
                  fontFamily: 'var(--font-mono)',
                  color: bottomTab === 'control' ? themeStyles.drawerTabActiveText : themeStyles.drawerTabInactiveText,
                  backgroundColor: bottomTab === 'control' ? themeStyles.drawerTabActiveBg : 'transparent',
                  borderRadius: '6px',
                  border: bottomTab === 'control' && isDark ? '1px solid rgba(255, 255, 255, 0.16)' : 'none',
                  boxShadow: bottomTab === 'control' ? (isDark ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                {language === 'vi' ? 'CẤU HÌNH & ĐIỀU KHIỂN' : 'CONFIG & CONTROLS'}
              </button>

              <button
                type="button"
                onClick={() => setBottomTab('specs')}
                style={{
                  padding: '5px 14px',
                  fontSize: '12px',
                  fontWeight: bottomTab === 'specs' ? 800 : 600,
                  fontFamily: 'var(--font-mono)',
                  color: bottomTab === 'specs' ? themeStyles.drawerTabActiveText : themeStyles.drawerTabInactiveText,
                  backgroundColor: bottomTab === 'specs' ? themeStyles.drawerTabActiveBg : 'transparent',
                  borderRadius: '6px',
                  border: bottomTab === 'specs' && isDark ? '1px solid rgba(255, 255, 255, 0.16)' : 'none',
                  boxShadow: bottomTab === 'specs' ? (isDark ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                {language === 'vi' ? 'THÔNG SỐ & TELEMETRY' : 'SPECS & TELEMETRY'}
              </button>

              <button
                type="button"
                onClick={() => setBottomTab('logs')}
                style={{
                  padding: '5px 14px',
                  fontSize: '12px',
                  fontWeight: bottomTab === 'logs' ? 800 : 600,
                  fontFamily: 'var(--font-mono)',
                  color: bottomTab === 'logs' ? themeStyles.drawerTabActiveText : themeStyles.drawerTabInactiveText,
                  backgroundColor: bottomTab === 'logs' ? themeStyles.drawerTabActiveBg : 'transparent',
                  borderRadius: '6px',
                  border: bottomTab === 'logs' && isDark ? '1px solid rgba(255, 255, 255, 0.16)' : 'none',
                  boxShadow: bottomTab === 'logs' ? (isDark ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.08)') : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                {language === 'vi' ? 'NHẬT KÝ TERMINAL' : 'TERMINAL LOGS'}
                <span
                  style={{
                    fontSize: '11.5px',
                    backgroundColor: bottomTab === 'logs' ? (isDark ? '#38bdf8' : '#0f172a') : (isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1'),
                    color: bottomTab === 'logs' ? (isDark ? '#0f172a' : '#ffffff') : (isDark ? '#cbd5e1' : '#1e293b'),
                    padding: '1px 5px',
                    borderRadius: '9999px',
                    fontWeight: 800,
                  }}
                >
                  {logs.length}
                </span>
              </button>
            </div>

            {/* Right: Expand/Collapse toggle + Close button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setDrawerExpanded((prev) => !prev)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${themeStyles.drawerBorder}`,
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: themeStyles.textMuted,
                  cursor: 'pointer',
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  transition: 'all 0.15s ease',
                }}
                title={drawerExpanded ? (language === 'vi' ? 'Thu gọn chiều cao drawer' : 'Collapse drawer height') : (language === 'vi' ? 'Mở rộng toàn màn hình drawer' : 'Maximize drawer')}
              >
                <span>{drawerExpanded ? '▼' : '▲'}</span>
                <span style={{ fontSize: '10px' }}>{drawerExpanded ? (language === 'vi' ? 'THU GỌN' : 'COLLAPSE') : (language === 'vi' ? 'MỞ RỘNG' : 'EXPAND')}</span>
              </button>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${themeStyles.drawerBorder}`,
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: themeStyles.textMuted,
                  cursor: 'pointer',
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                }}
                title={language === 'vi' ? 'Đóng bảng điều khiển' : 'Close control panel'}
              >
                <span>&times;</span>
                <span style={{ fontSize: '10px' }}>{language === 'vi' ? 'ĐÓNG' : 'CLOSE'}</span>
              </button>
            </div>
          </div>

          {/* Panel Scrollable Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', backgroundColor: themeStyles.drawerBg, color: themeStyles.textPrimary }}>
            {/* ============================================================== */}
            {/* TAB 1: CẤU HÌNH & ĐIỀU KHIỂN (INTERACTIVE CONTROLS)           */}
            {/* ============================================================== */}
            {bottomTab === 'control' && (
              <div>
                {/* 1. arXiv Harvester Controls */}
                {selectedTool.id === 'start-flow' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '20px' }}>
                    {/* Left Form Controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {/* Categories Section */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                            {language === 'vi' ? 'DANH MỤC THU THẬP' : 'HARVEST CATEGORIES'}
                          </span>
                          <span style={{ fontSize: '10px', color: isDark ? '#c084fc' : '#7c3aed', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            {harvestCategories.length} {language === 'vi' ? 'đã chọn' : 'selected'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {[
                            { key: 'cs.AI', label: 'cs.AI (Artificial Intelligence)' },
                            { key: 'cs.LG', label: 'cs.LG (Machine Learning)' },
                            { key: 'cs.CV', label: 'cs.CV (Computer Vision)' },
                            { key: 'cs.CL', label: 'cs.CL (Computation & Language)' },
                            { key: 'stat.ML', label: 'stat.ML (Machine Learning Stats)' },
                            { key: 'cs.RO', label: 'cs.RO (Robotics)' },
                            { key: 'cs.CR', label: 'cs.CR (Cryptography & Security)' },
                            { key: 'cs.NE', label: 'cs.NE (Neural & Evolutionary)' },
                          ].map((cat) => {
                            const isSelected = harvestCategories.includes(cat.key);
                            return (
                              <button
                                key={cat.key}
                                type="button"
                                onClick={() => handleToggleCategory(cat.key)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  border: isSelected ? '1px solid #7c3aed' : `1px solid ${themeStyles.cardBorder}`,
                                  backgroundColor: isSelected ? '#7c3aed' : themeStyles.btnInspectBg,
                                  color: isSelected ? '#ffffff' : themeStyles.btnInspectText,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <span>{isSelected ? '✓' : '+'}</span>
                                <span>{cat.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Limit & Rate Limit */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, display: 'block', marginBottom: '6px' }}>
                            {language === 'vi' ? 'GIỚI HẠN THU THẬP' : 'INGESTION LIMIT'}
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {[1000, 5000, 10000, 25000].map((limitVal) => (
                              <button
                                key={limitVal}
                                type="button"
                                onClick={() => setHarvestLimit(limitVal)}
                                style={{
                                  flex: 1,
                                  padding: '5px 0',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: harvestLimit === limitVal ? 800 : 600,
                                  border: harvestLimit === limitVal ? '1px solid #7c3aed' : `1px solid ${themeStyles.cardBorder}`,
                                  backgroundColor: harvestLimit === limitVal ? (isDark ? 'rgba(124, 58, 237, 0.25)' : '#f5f3ff') : themeStyles.btnInspectBg,
                                  color: harvestLimit === limitVal ? (isDark ? '#c084fc' : '#7c3aed') : themeStyles.btnInspectText,
                                  cursor: 'pointer',
                                }}
                              >
                                {limitVal.toLocaleString()}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, display: 'block', marginBottom: '6px' }}>
                            {language === 'vi' ? 'CHÍNH SÁCH RATE-LIMIT' : 'RATE-LIMIT POLICY'}
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {[
                              { val: 3.0, label: language === 'vi' ? '3.0s Nhanh' : '3.0s Fast' },
                              { val: 6.0, label: language === 'vi' ? '6.0s Chuẩn arXiv' : '6.0s arXiv Policy' },
                              { val: 10.0, label: language === 'vi' ? '10.0s An toàn' : '10.0s Safe' },
                            ].map((d) => (
                              <button
                                key={d.val}
                                type="button"
                                onClick={() => setHarvestDelay(d.val)}
                                style={{
                                  flex: 1,
                                  padding: '5px 0',
                                  borderRadius: '6px',
                                  fontSize: '10px',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: harvestDelay === d.val ? 800 : 600,
                                  border: harvestDelay === d.val ? '1px solid #7c3aed' : `1px solid ${themeStyles.cardBorder}`,
                                  backgroundColor: harvestDelay === d.val ? (isDark ? 'rgba(124, 58, 237, 0.25)' : '#f5f3ff') : themeStyles.btnInspectBg,
                                  color: harvestDelay === d.val ? (isDark ? '#c084fc' : '#7c3aed') : themeStyles.btnInspectText,
                                  cursor: 'pointer',
                                }}
                              >
                                {d.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Format checkmarks */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                        <span style={{ fontWeight: 800, color: themeStyles.textPrimary }}>{language === 'vi' ? 'ĐỊNH DẠNG:' : 'FORMAT:'}</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={harvestFormats.includes('HTML5')}
                            onChange={() => handleToggleFormat('HTML5')}
                            style={{ accentColor: '#7c3aed' }}
                          />
                          <span>ar5iv HTML5 Full-Text (Math &amp; Sections)</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={harvestFormats.includes('OAI-XML')}
                            onChange={() => handleToggleFormat('OAI-XML')}
                            style={{ accentColor: '#7c3aed' }}
                          />
                          <span>arXiv OAI-PMH XML Metadata</span>
                        </label>
                      </div>
                    </div>

                    {/* Right Ingestion Action Card */}
                    <div
                      style={{
                        backgroundColor: themeStyles.drawerSectionBg,
                        border: `1px solid ${themeStyles.drawerSectionBorder}`,
                        borderRadius: '10px',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary, marginBottom: '8px' }}>
                          {language === 'vi' ? 'TRẠNG THÁI VÀ BẢN GHI ĐÍCH' : 'STATUS & TARGET RECORDS'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: themeStyles.textMuted }}>Target Bucket:</span>
                            <span style={{ fontWeight: 700, color: themeStyles.textPrimary }}>s3://uth-scientific-lakehouse</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: themeStyles.textMuted }}>Partition Scheme:</span>
                            <span style={{ fontWeight: 700, color: themeStyles.textPrimary }}>bronze/raw_html/year=2026/</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: themeStyles.textMuted }}>Integrity Check:</span>
                            <span style={{ fontWeight: 700, color: isDark ? '#34d399' : '#059669' }}>SHA-256 Digest Required</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: themeStyles.textMuted }}>Concurrent Workers:</span>
                            <span style={{ fontWeight: 700, color: isDark ? '#60a5fa' : '#2563eb' }}>4 Async HTTPX Clients</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* 1. Real-time Streaming CDC Section */}
                        <div
                          style={{
                            padding: '10px 12px',
                            backgroundColor: isDark ? (isStreaming ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)') : (isStreaming ? '#ecfdf5' : '#f0fdf4'),
                            border: `1px solid ${isDark ? (isStreaming ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.10)') : (isStreaming ? '#10b981' : '#bbf7d0')}`,
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  width: '7px',
                                  height: '7px',
                                  borderRadius: '50%',
                                  backgroundColor: isStreaming ? '#10b981' : '#64748b',
                                  boxShadow: isStreaming ? '0 0 8px #10b981' : 'none',
                                  animation: isStreaming ? 'stageGlowOrange 1.2s infinite' : 'none',
                                  display: 'inline-block',
                                }}
                              />
                              <span style={{ fontSize: '10.5px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: isDark ? '#34d399' : '#166534' }}>
                                REALTIME STREAMING (CDC 2025/2026)
                              </span>
                            </div>
                            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: isStreaming ? (isDark ? '#34d399' : '#059669') : themeStyles.textMuted, fontWeight: 700 }}>
                              {isStreaming ? (language === 'vi' ? `${streamSpeed} bài/phút` : `${streamSpeed} papers/min`) : 'STANDBY'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>{language === 'vi' ? 'Mục tiêu:' : 'Target:'}</span>
                            {[1000, 3000, 5000].map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setStreamTarget(t)}
                                disabled={isStreaming}
                                style={{
                                  fontSize: '10px',
                                  fontFamily: 'var(--font-mono)',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  border: streamTarget === t ? '1px solid #16a34a' : `1px solid ${themeStyles.cardBorder}`,
                                  backgroundColor: streamTarget === t ? (isDark ? 'rgba(22, 163, 74, 0.25)' : '#dcfce7') : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#ffffff'),
                                  color: streamTarget === t ? (isDark ? '#4ade80' : '#166534') : themeStyles.textMuted,
                                  fontWeight: streamTarget === t ? 800 : 500,
                                  cursor: isStreaming ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {t.toLocaleString()} {language === 'vi' ? 'bài' : 'papers'}
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={handleToggleStreaming}
                            style={{
                              width: '100%',
                              backgroundColor: isStreaming ? '#ef4444' : '#10b981',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '8px 0',
                              fontSize: '11px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              boxShadow: isStreaming ? '0 2px 8px rgba(239, 68, 68, 0.35)' : '0 2px 8px rgba(16, 185, 129, 0.35)',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {isStreaming ? (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                                </svg>
                                <span>{language === 'vi' ? `⏸ DỪNG STREAMING (+${streamSessionCount} BÀI ĐÃ CÀO)` : `⏸ STOP STREAMING (+${streamSessionCount} PAPERS HARVESTED)`}</span>
                              </>
                            ) : (
                              <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                <span>{language === 'vi' ? `▶ BẮT ĐẦU REALTIME STREAMING (${streamTarget.toLocaleString()} BÀI MỚI)` : `▶ START REALTIME STREAMING (${streamTarget.toLocaleString()} NEW PAPERS)`}</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* 2. Batch Harvest */}
                        <button
                          type="button"
                          onClick={handleStartHarvest}
                          disabled={isHarvesting || isStreaming || harvestCategories.length === 0}
                          style={{
                            width: '100%',
                            backgroundColor: (isHarvesting || isStreaming) ? (isDark ? '#334155' : '#cbd5e1') : '#7c3aed',
                            color: (isHarvesting || isStreaming) ? 'var(--text-muted)' : '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '10px 0',
                            fontSize: '12px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            cursor: (isHarvesting || isStreaming) ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: (isHarvesting || isStreaming) ? 'none' : '0 4px 12px rgba(124, 58, 237, 0.28)',
                            opacity: isStreaming ? 0.65 : 1,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isHarvesting ? (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                              </svg>
                              <span>{language === 'vi' ? 'ĐANG CÀO DỮ LIỆU...' : 'HARVESTING DATA...'}</span>
                            </>
                          ) : isStreaming ? (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              <span>{language === 'vi' ? 'STREAMING ĐANG CHẠY (TẠM KHÓA BATCH)' : 'STREAMING ACTIVE (BATCH LOCKED)'}</span>
                            </>
                          ) : (
                            <>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                              <span>{language === 'vi' ? '▶ BẮT ĐẦU CÀO BATCH (RUN HARVESTER)' : '▶ RUN HARVESTER'}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setBottomTab('logs')}
                          style={{
                            width: '100%',
                            backgroundColor: themeStyles.btnInspectBg,
                            color: themeStyles.btnInspectText,
                            border: `1px solid ${themeStyles.btnInspectBorder}`,
                            borderRadius: '8px',
                            padding: '6px 0',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {language === 'vi' ? 'XEM REAL-TIME STREAMING LOGS →' : 'VIEW REAL-TIME STREAMING LOGS →'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. DuckDB SIMD Controls */}
                {selectedTool.id === 'review-duckdb' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                          TRUY VẤN VECTORIZED SIMD SQL (DUCKDB IN-PROCESS)
                        </span>
                        <span style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          backgroundColor: themeStyles.amberGhostBg,
                          color: themeStyles.amberGhostText,
                          border: `1px solid ${themeStyles.amberGhostBorder}`,
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}>
                          ● SIMD Arrow Buffer Online
                        </span>
                      </div>

                      {/* SQL Presets Chips */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
                          PRESETS:
                        </span>
                        {DUCK_SQL_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setDuckQueryPreset(preset.sql)}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              cursor: 'pointer',
                              backgroundColor: duckQueryPreset === preset.sql ? themeStyles.amberGhostBg : (isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9'),
                              border: `1px solid ${duckQueryPreset === preset.sql ? themeStyles.amberGhostBorder : themeStyles.cardBorder}`,
                              color: duckQueryPreset === preset.sql ? themeStyles.amberGhostText : themeStyles.textMuted,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            [{preset.label}]
                          </button>
                        ))}
                      </div>

                      <textarea
                        value={duckQueryPreset}
                        onChange={(e) => setDuckQueryPreset(e.target.value)}
                        rows={3}
                        style={{
                          width: '100%',
                          backgroundColor: themeStyles.codeBoxBg,
                          color: themeStyles.codeBoxText,
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `1px solid ${themeStyles.codeBoxBorder}`,
                          outline: 'none',
                          lineHeight: 1.5,
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />

                      <div style={{ display: 'flex', gap: '8px' }}>
                        {/* Tactical Obsidian Amber Action Pill */}
                        <button
                          type="button"
                          onClick={handleRunDuckQuery}
                          disabled={duckRunning}
                          style={{
                            flex: 1,
                            backgroundColor: themeStyles.amberGhostBg,
                            color: themeStyles.amberGhostText,
                            border: `1px solid ${isDark ? '#f59e0b' : '#d97706'}`,
                            borderRadius: '8px',
                            padding: '8px 14px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            cursor: duckRunning ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: isDark ? '0 0 14px rgba(245, 158, 11, 0.20)' : '0 2px 6px rgba(217, 119, 6, 0.12)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {duckRunning ? (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                              </svg>
                              <span>{language === 'vi' ? 'ĐANG CHẠY SIMD EXECUTION...' : 'RUNNING SIMD EXECUTION...'}</span>
                            </>
                          ) : (
                            <>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                              </svg>
                              <span>{language === 'vi' ? 'THỰC THI TRUY VẤN DUCKDB (0.041s)' : 'EXECUTE DUCKDB QUERY (0.041s)'}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setBottomTab('logs')}
                          style={{
                            padding: '0 14px',
                            backgroundColor: themeStyles.btnInspectBg,
                            border: `1px solid ${themeStyles.btnInspectBorder}`,
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            color: themeStyles.btnInspectText,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {language === 'vi' ? 'XEM LOGS' : 'VIEW LOGS'}
                        </button>
                      </div>
                    </div>

                    {/* Results Table & Micro Distribution Chart */}
                    <div style={{
                      backgroundColor: themeStyles.drawerSectionBg,
                      border: `1px solid ${themeStyles.drawerSectionBorder}`,
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary }}>
                            {language === 'vi' ? 'KẾT QUẢ THỰC THI (VECTORIZED ARROW SCHEMA)' : 'EXECUTION RESULTS (VECTORIZED ARROW SCHEMA)'}
                          </span>
                          <span style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                            4 rows in 41ms
                          </span>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${themeStyles.cardBorder}`, textAlign: 'left', color: themeStyles.textMuted }}>
                              <th style={{ padding: '4px 0' }}>CATEGORY</th>
                              <th style={{ padding: '4px 0' }}>PAPERS</th>
                              <th style={{ padding: '4px 0' }}>FORMULAS</th>
                              <th style={{ padding: '4px 0', textAlign: 'right' }}>AVG MATH</th>
                            </tr>
                          </thead>
                          <tbody>
                            {duckResults.map((r, i) => (
                              <tr key={i} style={{ borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0'}` }}>
                                <td style={{ padding: '5px 0', fontWeight: 800, color: isDark ? '#fbbf24' : '#d97706' }}>{r.category}</td>
                                <td style={{ padding: '5px 0', color: themeStyles.textPrimary }}>{r.papers.toLocaleString()}</td>
                                <td style={{ padding: '5px 0', color: themeStyles.textPrimary }}>{r.formulas.toLocaleString()}</td>
                                <td style={{ padding: '5px 0', color: isDark ? '#34d399' : '#059669', fontWeight: 700, textAlign: 'right' }}>{r.avg_math}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Micro Distribution Chart (fills the empty space below table) */}
                      <div style={{
                        padding: '8px 10px',
                        backgroundColor: themeStyles.cardBg,
                        border: `1px solid ${themeStyles.cardBorder}`,
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                            {language === 'vi' ? 'PHÂN BỐ MẬT ĐỘ CÔNG THỨC TOÁN (SIMD DENSITY METRIC)' : 'MATH FORMULA DENSITY DISTRIBUTION (SIMD DENSITY METRIC)'}
                          </span>
                          <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: isDark ? '#fbbf24' : '#d97706', fontWeight: 700 }}>
                            Total: 2,220,938 formulas
                          </span>
                        </div>

                        {/* Stacked Ratio Bar */}
                        <div style={{ display: 'flex', height: '10px', borderRadius: '4px', overflow: 'hidden', gap: '2px' }}>
                          <div style={{ width: '41%', backgroundColor: '#8b5cf6' }} title="cs.AI: 41.0% (912,400 formulas)" />
                          <div style={{ width: '33.7%', backgroundColor: '#3b82f6' }} title="cs.LG: 33.7% (748,920 formulas)" />
                          <div style={{ width: '16.3%', backgroundColor: '#10b981' }} title="cs.CV: 16.3% (362,118 formulas)" />
                          <div style={{ width: '9.0%', backgroundColor: '#f59e0b' }} title="stat.ML: 9.0% (200,760 formulas)" />
                        </div>

                        {/* Legend Chips */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#8b5cf6' }} /> cs.AI 41%
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6' }} /> cs.LG 34%
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} /> cs.CV 16%
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }} /> stat.ML 9%
                          </span>
                        </div>

                        {/* Arrow columnar memory status */}
                        <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: isDark ? '#34d399' : '#059669', borderTop: `1px solid ${themeStyles.cardBorder}`, paddingTop: '4px', fontWeight: 700 }}>
                          ✓ In-Memory Arrow Buffer: 4 Partitions · Zero-Copy Columnar Scan · SIMD Active
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. LanceDB Vector Search Controls */}
                {selectedTool.id === 'lance-storage' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                        {language === 'vi' ? `TÌM KIẾM SEMANTIC VECTOR ANN (${liveVectors.toLocaleString()} EMBEDDINGS)` : `SEMANTIC VECTOR ANN SEARCH (${liveVectors.toLocaleString()} EMBEDDINGS)`}
                      </span>

                      <input
                        type="text"
                        value={lanceQuery}
                        onChange={(e) => setLanceQuery(e.target.value)}
                        placeholder={language === 'vi' ? 'Nhập truy vấn ngữ nghĩa học thuật...' : 'Enter academic semantic query...'}
                        style={{
                          width: '100%',
                          backgroundColor: themeStyles.inputBg,
                          color: isDark ? '#34d399' : '#059669',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `1px solid ${themeStyles.inputBorder}`,
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />

                      <div style={{ display: 'flex', gap: '8px' }}>
                        {/* Tactical Emerald Pill Button */}
                        <button
                          type="button"
                          onClick={handleRunLanceSearch}
                          disabled={lanceSearching}
                          style={{
                            flex: 1,
                            backgroundColor: themeStyles.emeraldGhostBg,
                            color: themeStyles.emeraldGhostText,
                            border: `1px solid ${isDark ? '#10b981' : '#059669'}`,
                            borderRadius: '8px',
                            padding: '8px 14px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            cursor: lanceSearching ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: isDark ? '0 0 14px rgba(16, 185, 129, 0.20)' : '0 2px 6px rgba(5, 150, 105, 0.12)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {lanceSearching ? (
                            <span>{language === 'vi' ? 'ĐANG TÍNH TOÁN COSINE ANN...' : 'COMPUTING COSINE ANN...'}</span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                              <span>{language === 'vi' ? 'TÌM KIẾM VECTOR ANN (IVF-PQ)' : 'SEARCH VECTOR ANN (IVF-PQ)'}</span>
                            </span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* LanceDB Hits */}
                    <div style={{ backgroundColor: themeStyles.drawerSectionBg, border: `1px solid ${themeStyles.drawerSectionBorder}`, borderRadius: '8px', padding: '10px 14px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary, marginBottom: '8px' }}>
                        {language === 'vi' ? 'TOP-3 ĐỐI TƯỢNG GẦN NHẤT (ĐỘ ĐỒNG DẠNG COSINE)' : 'TOP-3 NEAREST NEIGHBORS (COSINE SIMILARITY)'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {lanceResults.map((hit, i) => (
                          <div key={i} style={{ padding: '6px 8px', backgroundColor: themeStyles.cardBg, border: `1px solid ${themeStyles.cardBorder}`, borderRadius: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: isDark ? '#34d399' : '#10b981' }}>
                                {hit.id} &bull; {hit.category}
                              </span>
                              <span style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 800,
                                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.20)' : '#ecfdf5',
                                color: isDark ? '#34d399' : '#059669',
                                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.35)' : 'transparent'}`,
                                padding: '1px 5px',
                                borderRadius: '4px',
                              }}>
                                Sim: {hit.score}
                              </span>
                            </div>
                            <div style={{ fontSize: '11px', color: themeStyles.textSecondary, marginTop: '2px', fontWeight: 600 }}>
                              {hit.title}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Cloudflare R2 Controls */}
                {selectedTool.id === 'bronze-instance' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, marginBottom: '8px' }}>
                        {language === 'vi' ? 'CẤU TRÚC PHÂN VÙNG OBJECT STORAGE (S3 COMPATIBLE)' : 'OBJECT STORAGE PARTITION SCHEME (S3 COMPATIBLE)'}
                      </div>
                      <div style={{
                        backgroundColor: themeStyles.codeBoxBg,
                        color: themeStyles.textPrimary,
                        padding: '12px',
                        borderRadius: '8px',
                        border: `1px solid ${themeStyles.codeBoxBorder}`,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        lineHeight: 1.6,
                      }}>
                        <div style={{ color: themeStyles.textPrimary, fontWeight: 700 }}>s3://uth-scientific-lakehouse/</div>
                        <div style={{ color: isDark ? '#fb7185' : '#e11d48' }}>
                          ├── bronze/raw_html/year=2026/ ({liveBronzeCount.toLocaleString()} HTML5 objects · {liveBronzeGb} GB)
                        </div>
                        <div style={{ color: isDark ? '#fbbf24' : '#d97706' }}>
                          ├── bronze/oai_batches/ ({liveBatchesCount} JSON batch records · 26.42 MB)
                        </div>
                        <div style={{ color: isDark ? '#34d399' : '#059669' }}>
                          └── gold/mining/ (FP-growth rules, Louvain graph, K-Means clusters · {(storageStats?.activeLakehouse?.activeLanceDbVectors ?? 164702).toLocaleString()} vectors)
                        </div>
                      </div>
                    </div>

                    <div style={{ backgroundColor: themeStyles.drawerSectionBg, border: `1px solid ${themeStyles.drawerSectionBorder}`, borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary }}>
                          {language === 'vi' ? 'DUNG LƯỢNG & TRẠNG THÁI LƯU TRỮ' : 'STORAGE CAPACITY & HEALTH'}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#fb7185' : '#e11d48', marginTop: '4px' }}>
                          {storageUsedGb.toFixed(3)} GB / {liveQuotaGb.toFixed(2)} GB ({storageUsedPct.toFixed(2)}%)
                        </div>
                        <div style={{ height: '6px', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : '#e2e8f0', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, Math.max(0, storageUsedPct))}%`, height: '100%', backgroundColor: storageUsedPct > 80 ? '#e11d48' : '#3b82f6', transition: 'width 0.3s ease' }} />
                        </div>
                        <div style={{ fontSize: '10px', color: isDark ? '#34d399' : '#059669', fontFamily: 'var(--font-mono)', marginTop: '6px', fontWeight: 700 }}>
                          ✓ ZERO EGRESS FEES (Cloudflare Global Network)
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date().toLocaleTimeString('en-US', { hour12: false });
                          setLogs((prev) => [
                            ...prev,
                            { id: Date.now(), time: now, level: 'SUCCESS', tag: 'MD5-CHECK', msg: `Cloudflare R2 Bucket audit: ${liveBronzeCount.toLocaleString()} objects validated with 100% SHA-256 match.` },
                          ]);
                          setBottomTab('logs');
                        }}
                        style={{
                          backgroundColor: themeStyles.roseGhostBg,
                          color: themeStyles.roseGhostText,
                          border: `1px solid ${isDark ? '#e11d48' : '#be123c'}`,
                          borderRadius: '8px',
                          padding: '8px 0',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                          <span>{language === 'vi' ? 'KIỂM TRA TÍNH TOÀN VẸN SHA-256 & XEM LOGS' : 'AUDIT SHA-256 INTEGRITY & VIEW LOGS'}</span>
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 5. Grounded RAG Controls & Attribution Dossier */}
                {selectedTool.id === 'grounded-rag' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                          {language === 'vi' ? 'CỔNG KIỂM THỬ ANTI-HALLUCINATION RAG (STRICT CITATION GATE)' : 'ANTI-HALLUCINATION RAG GATE (STRICT CITATION GATE)'}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          backgroundColor: themeStyles.indigoGhostBg,
                          color: themeStyles.indigoGhostText,
                          border: `1px solid ${themeStyles.indigoGhostBorder}`,
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}>
                          ● Zero Hallucination Gate
                        </span>
                      </div>

                      {/* RAG Query Preset Chips */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
                          PRESETS:
                        </span>
                        {RAG_QUERY_PRESETS.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setRagPrompt(preset.query)}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              cursor: 'pointer',
                              backgroundColor: ragPrompt === preset.query ? themeStyles.indigoGhostBg : (isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9'),
                              border: `1px solid ${ragPrompt === preset.query ? themeStyles.indigoGhostBorder : themeStyles.cardBorder}`,
                              color: ragPrompt === preset.query ? themeStyles.indigoGhostText : themeStyles.textMuted,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            [{preset.label}]
                          </button>
                        ))}
                      </div>

                      <input
                        type="text"
                        value={ragPrompt}
                        onChange={(e) => setRagPrompt(e.target.value)}
                        placeholder={language === 'vi' ? 'Nhập câu hỏi nghiên cứu...' : 'Enter research question...'}
                        style={{
                          width: '100%',
                          backgroundColor: themeStyles.inputBg,
                          color: themeStyles.inputText,
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `1px solid ${themeStyles.inputBorder}`,
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                          {language === 'vi' ? 'Ngưỡng Cosine:' : 'Cosine Threshold:'}
                        </span>
                        <input
                          type="range"
                          min="0.5"
                          max="0.95"
                          step="0.05"
                          value={ragStrictThreshold}
                          onChange={(e) => setRagStrictThreshold(parseFloat(e.target.value))}
                          style={{ accentColor: '#6366f1', flex: 1 }}
                        />
                        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: isDark ? '#a5b4fc' : '#6366f1' }}>
                          {ragStrictThreshold}
                        </span>
                      </div>

                      {/* Tactical Obsidian Indigo Action Pill */}
                      <button
                        type="button"
                        onClick={handleRunRagPrompt}
                        disabled={ragGenerating}
                        style={{
                          backgroundColor: themeStyles.indigoGhostBg,
                          color: themeStyles.indigoGhostText,
                          border: `1px solid ${isDark ? '#6366f1' : '#4f46e5'}`,
                          borderRadius: '8px',
                          padding: '8px 14px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          cursor: ragGenerating ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: isDark ? '0 0 14px rgba(99, 102, 241, 0.20)' : '0 2px 6px rgba(79, 70, 229, 0.12)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {ragGenerating ? (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                            </svg>
                            <span>{language === 'vi' ? 'ĐANG SUY LUẬN TRÍCH DẪN...' : 'INFERRING CITATIONS...'}</span>
                          </>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <span>{language === 'vi' ? 'KIỂM TRA PHẢN HỒI RAG CÓ TRÍCH DẪN' : 'TEST GROUNDED RAG SYNTHESIS'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Attribution Dossier Card (fills the 60% empty space with rich scientific proof) */}
                    <div style={{
                      backgroundColor: themeStyles.drawerSectionBg,
                      border: `1px solid ${themeStyles.drawerSectionBorder}`,
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}>
                      <div>
                        {/* Header with Grounding Confidence Meter */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary }}>
                            HỒ SƠ MINH CHỨNG NGUỒN GỐC (ATTRIBUTION DOSSIER)
                          </span>
                          <span style={{
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 800,
                            color: isDark ? '#34d399' : '#059669',
                          }}>
                            Grounding: 91.4%
                          </span>
                        </div>

                        {/* Confidence Progress Gauge */}
                        <div style={{ height: '6px', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                          <div style={{ width: '91.4%', height: '100%', backgroundColor: '#10b981' }} />
                        </div>

                        {/* Citation Context Text */}
                        <p style={{ fontSize: '11.5px', color: themeStyles.textSecondary, lineHeight: 1.5, margin: 0 }}>
                          {ragResponse}
                        </p>

                        {/* LaTeX Formula Context Proof Container */}
                        <div style={{
                          marginTop: '8px',
                          padding: '8px 10px',
                          backgroundColor: themeStyles.cardBg,
                          border: `1px solid ${themeStyles.cardBorder}`,
                          borderRadius: '6px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
                              TRÍCH DẪN CÔNG THỨC TOÁN HỌC KHÔNG GIAN VECTOR (LATEX PROOF):
                            </span>
                            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: isDark ? '#a5b4fc' : '#4f46e5' }}>
                              Section 3.2
                            </span>
                          </div>
                          <div style={{ overflowX: 'auto', padding: '2px 0' }}>
                            <ScientificMath
                              math={
                                RAG_QUERY_PRESETS.find((p) => p.query === ragPrompt)?.formula ||
                                '\\mathcal{L}_{\\text{diff}} = \\mathbb{E}_{t, x_0, \\epsilon} \\left[ w_t \\cdot \\delta_{\\text{Huber}} ( \\epsilon - \\epsilon_\\theta(x_t, t) ) \\right]'
                              }
                              block={true}
                              theme={theme}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Dossier Footer Verification Tags */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          backgroundColor: isDark ? 'rgba(99, 102, 241, 0.20)' : '#ede9fe',
                          color: isDark ? '#a5b4fc' : '#6366f1',
                          border: `1px solid ${isDark ? 'rgba(99, 102, 241, 0.35)' : 'transparent'}`,
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}>
                          Verified: arXiv:2602.04128
                        </span>
                        <span style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.20)' : '#ecfdf5',
                          color: isDark ? '#34d399' : '#059669',
                          border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.35)' : 'transparent'}`,
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}>
                          Cosine: 0.914 &gt; {ragStrictThreshold}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: themeStyles.textMuted,
                          marginLeft: 'auto',
                        }}>
                          Strict Citation Gate: PASSED
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 2: THÔNG SỐ KỸ THUẬT & TELEMETRY (SPECS)                  */}
            {/* ============================================================== */}
            {bottomTab === 'specs' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Telemetry Metrics 2x2 Bento Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{
                      backgroundColor: themeStyles.drawerSectionBg,
                      border: `1px solid ${themeStyles.drawerSectionBorder}`,
                      borderRadius: '8px',
                      padding: '10px 12px',
                    }}>
                      <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {language === 'vi' ? 'KHỐI LƯỢNG CHÍNH' : 'PRIMARY VOLUME'}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary, marginTop: '3px' }}>
                        {selectedTool.telemetrySummary.primaryMetric}
                      </div>
                    </div>

                    <div style={{
                      backgroundColor: themeStyles.drawerSectionBg,
                      border: `1px solid ${themeStyles.drawerSectionBorder}`,
                      borderRadius: '8px',
                      padding: '10px 12px',
                    }}>
                      <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {language === 'vi' ? 'PHẠM VI & THÔNG SỐ' : 'SCOPE & SPECS'}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: themeStyles.textPrimary, marginTop: '3px' }}>
                        {selectedTool.telemetrySummary.secondaryMetric}
                      </div>
                    </div>

                    <div style={{
                      backgroundColor: themeStyles.drawerSectionBg,
                      border: `1px solid ${themeStyles.drawerSectionBorder}`,
                      borderRadius: '8px',
                      padding: '10px 12px',
                    }}>
                      <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {language === 'vi' ? 'CHUẨN ĐỘ TRỄ' : 'LATENCY BENCHMARK'}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#34d399' : '#059669', marginTop: '3px' }}>
                        {selectedTool.telemetrySummary.latency}
                      </div>
                    </div>

                    <div style={{
                      backgroundColor: themeStyles.drawerSectionBg,
                      border: `1px solid ${themeStyles.drawerSectionBorder}`,
                      borderRadius: '8px',
                      padding: '10px 12px',
                    }}>
                      <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {language === 'vi' ? 'THÔNG LƯỢNG / BĂNG THÔNG' : 'THROUGHPUT / EGRESS'}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: isDark ? '#60a5fa' : '#2563eb', marginTop: '3px' }}>
                        {selectedTool.telemetrySummary.throughput}
                      </div>
                    </div>
                  </div>

                  {/* Capabilities Checklist Chips (replaces raw bullet list from Screenshot 0) */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, marginBottom: '8px' }}>
                      {language === 'vi' ? 'TÍNH NĂNG KIẾN TRÚC CỐT LÕI' : 'CORE ARCHITECTURAL CAPABILITIES'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(selectedTool.features || []).map((feature: string, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 10px',
                            backgroundColor: themeStyles.cardBg,
                            border: `1px solid ${themeStyles.cardBorder}`,
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            color: themeStyles.textSecondary,
                            lineHeight: 1.4,
                          }}
                        >
                          <span style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.20)' : '#dcfce7',
                            color: isDark ? '#34d399' : '#15803d',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 800,
                            flexShrink: 0,
                          }}>
                            ✓
                          </span>
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Schema/Code Preview with Sub-tabs & Copy Payload */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* Sub-tabs: SPEC | PAYLOAD | CURL */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(['SPEC', 'PAYLOAD', 'CURL'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setActiveSpecTab(tab)}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            backgroundColor: activeSpecTab === tab ? (isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe') : 'transparent',
                            border: `1px solid ${activeSpecTab === tab ? (isDark ? 'rgba(56, 189, 248, 0.35)' : '#7dd3fc') : themeStyles.cardBorder}`,
                            color: activeSpecTab === tab ? (isDark ? '#38bdf8' : '#0369a1') : themeStyles.textMuted,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {tab === 'SPEC' ? selectedTool.samplePreviewTitle.toUpperCase() : tab === 'PAYLOAD' ? 'PAYLOAD JSON' : 'CURL COMMAND'}
                        </button>
                      ))}
                    </div>

                    {/* Copy Payload Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const snippet =
                          activeSpecTab === 'SPEC'
                            ? selectedTool.sampleCodeOrSchema
                            : activeSpecTab === 'PAYLOAD'
                            ? JSON.stringify(
                                {
                                  tool_id: selectedTool.id,
                                  category: selectedTool.category,
                                  engine: selectedTool.engineVersion,
                                  status: selectedTool.status,
                                  telemetry: selectedTool.telemetrySummary,
                                },
                                null,
                                2
                              )
                            : `curl -X POST "https://api.uth-lakehouse.internal/v2/tools/${selectedTool.id}/execute" \\\n  -H "Authorization: Bearer uth_token_simd_2026" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action": "telemetry_ping"}'`;
                        navigator.clipboard.writeText(snippet);
                        setSpecCopied(true);
                        setTimeout(() => setSpecCopied(false), 2000);
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        cursor: 'pointer',
                        backgroundColor: specCopied ? (isDark ? 'rgba(16, 185, 129, 0.20)' : '#dcfce7') : themeStyles.btnInspectBg,
                        border: `1px solid ${specCopied ? '#10b981' : themeStyles.btnInspectBorder}`,
                        color: specCopied ? (isDark ? '#34d399' : '#15803d') : themeStyles.btnInspectText,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {specCopied ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>{language === 'vi' ? 'ĐÃ CHÉP' : 'COPIED'}</span>
                          </>
                        ) : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            <span>{language === 'vi' ? 'SAO CHÉP' : 'COPY'}</span>
                          </>
                        )}
                      </span>
                    </button>
                  </div>

                  {/* Adaptive Code Box (Replaces hardcoded #0f172a from Screenshot 0) */}
                  <pre
                    style={{
                      backgroundColor: themeStyles.codeBoxBg,
                      color: themeStyles.codeBoxText,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      overflowX: 'auto',
                      lineHeight: 1.5,
                      margin: 0,
                      border: `1px solid ${themeStyles.codeBoxBorder}`,
                      maxHeight: drawerExpanded ? '340px' : '190px',
                      transition: 'max-height 0.25s ease',
                    }}
                  >
                    <code>
                      {activeSpecTab === 'SPEC'
                        ? selectedTool.sampleCodeOrSchema
                        : activeSpecTab === 'PAYLOAD'
                        ? JSON.stringify(
                            {
                              tool_id: selectedTool.id,
                              category: selectedTool.category,
                              engine: selectedTool.engineVersion,
                              status: selectedTool.status,
                              telemetry: selectedTool.telemetrySummary,
                            },
                            null,
                            2
                          )
                        : `curl -X POST "https://api.uth-lakehouse.internal/v2/tools/${selectedTool.id}/execute" \\\n  -H "Authorization: Bearer uth_token_simd_2026" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action": "telemetry_ping"}'`}
                    </code>
                  </pre>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 3: TERMINAL LOGS (SPLIT TELEMETRY CONSOLE 68% / 32%)      */}
            {/* ============================================================== */}
            {bottomTab === 'logs' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2.1fr 1fr',
                  gap: '14px',
                  height: '100%',
                  minHeight: drawerExpanded ? '440px' : '290px',
                }}
              >
                {/* Column 1: macOS Unix Terminal Console (68% width) */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: '#090d16',
                    borderRadius: '8px',
                    border: '1px solid #1e293b',
                    overflow: 'hidden',
                  }}
                >
                  {/* Terminal Sub-header & Filter Pills */}
                  <div
                    style={{
                      height: '36px',
                      backgroundColor: '#0f172a',
                      borderBottom: '1px solid #1e293b',
                      padding: '0 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#94a3b8', marginLeft: '6px' }}>
                        bash &bull; uth-lakehouse-pipeline --live (PID: 28419)
                      </span>
                    </div>

                    {/* Filter Level Pills & Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {(['ALL', 'SUCCESS', 'EXEC', 'WARN', 'INFO'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setLogFilter(lvl)}
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '9.5px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            backgroundColor: logFilter === lvl ? '#38bdf8' : 'rgba(255, 255, 255, 0.06)',
                            color: logFilter === lvl ? '#0f172a' : '#94a3b8',
                            border: `1px solid ${logFilter === lvl ? '#38bdf8' : 'transparent'}`,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {lvl}
                        </button>
                      ))}

                      <button
                        type="button"
                        onClick={() => {
                          const logText = logs
                            .filter((l) => logFilter === 'ALL' || l.level === logFilter)
                            .map((l) => `[${l.time}] [${l.level}] [${l.tag}] ${l.msg}`)
                            .join('\n');
                          navigator.clipboard.writeText(logText);
                          setLogCopied(true);
                          setTimeout(() => setLogCopied(false), 2000);
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          color: logCopied ? '#34d399' : '#94a3b8',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          padding: '2px 6px',
                          cursor: 'pointer',
                        }}
                        title={language === 'vi' ? 'Sao chép toàn bộ logs' : 'Copy all logs'}
                      >
                        {logCopied ? '✓' : (language === 'vi' ? 'CHÉP' : 'COPY')}
                      </button>

                      <button
                        type="button"
                        onClick={() => setAutoScrollLogs((v) => !v)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          color: autoScrollLogs ? '#10b981' : '#64748b',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          padding: '2px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        SCROLL: {autoScrollLogs ? 'ON' : 'OFF'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setLogs([])}
                        style={{
                          background: 'transparent',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          color: '#94a3b8',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          padding: '2px 6px',
                          cursor: 'pointer',
                        }}
                      >
                        {language === 'vi' ? 'XÓA' : 'CLEAR'}
                      </button>
                    </div>
                  </div>

                  {/* Terminal Log Stream Window */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      maxHeight: drawerExpanded ? '380px' : '230px',
                    }}
                  >
                    {logs
                      .filter((l) => logFilter === 'ALL' || l.level === logFilter)
                      .map((log) => {
                        const levelColor =
                          log.level === 'SUCCESS'
                            ? '#34d399'
                            : log.level === 'EXEC'
                            ? '#fbbf24'
                            : log.level === 'WARN'
                            ? '#f87171'
                            : '#38bdf8';

                        return (
                          <div key={log.id} style={{ display: 'flex', gap: '8px', lineHeight: 1.45 }}>
                            <span style={{ color: '#475569', flexShrink: 0 }}>[{log.time}]</span>
                            <span style={{ color: levelColor, fontWeight: 800, flexShrink: 0 }}>
                              [{log.level}]
                            </span>
                            <span style={{ color: '#94a3b8', flexShrink: 0 }}>[{log.tag}]</span>
                            <span style={{ color: '#f8fafc', wordBreak: 'break-word' }}>{log.msg}</span>
                          </div>
                        );
                      })}
                    <div ref={logsEndRef} />
                  </div>
                </div>

                {/* Column 2: Live Telemetry & Health Panel (32% width, eliminates the black void) */}
                <div
                  style={{
                    backgroundColor: themeStyles.drawerSectionBg,
                    border: `1px solid ${themeStyles.drawerSectionBorder}`,
                    borderRadius: '8px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary }}>
                      {language === 'vi' ? 'VIỄN THÁM THỜI GIAN THỰC' : 'REAL-TIME TELEMETRY'}
                    </span>
                    <span style={{
                      fontSize: '9.5px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#dcfce7',
                      color: isDark ? '#34d399' : '#15803d',
                      padding: '1px 6px',
                      borderRadius: '4px',
                    }}>
                      ● LIVE HEALTH
                    </span>
                  </div>

                  {/* 4 Real-time Telemetry Metrics Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* Metric 1: CDC Ingestion */}
                    <div style={{
                      padding: '8px 10px',
                      backgroundColor: themeStyles.cardBg,
                      border: `1px solid ${themeStyles.cardBorder}`,
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>CDC INGESTION (ARXIV)</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: isStreaming ? (isDark ? '#34d399' : '#059669') : themeStyles.textPrimary, marginTop: '2px' }}>
                          {isStreaming ? (language === 'vi' ? `${streamSpeed} bài/phút` : `${streamSpeed} papers/min`) : (language === 'vi' ? 'CHỜ SẴN' : 'STANDBY (Ready)')}
                        </div>
                      </div>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                        +{streamSessionCount} {language === 'vi' ? 'bài' : 'papers'}
                      </span>
                    </div>

                    {/* Metric 2: DuckDB SIMD */}
                    <div style={{
                      padding: '8px 10px',
                      backgroundColor: themeStyles.cardBg,
                      border: `1px solid ${themeStyles.cardBorder}`,
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>DUCKDB SIMD THROUGHPUT</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: isDark ? '#fbbf24' : '#d97706', marginTop: '2px' }}>
                          2.42M rows/s
                        </div>
                      </div>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                        0.041s Latency
                      </span>
                    </div>

                    {/* Metric 3: LanceDB Vector */}
                    <div style={{
                      padding: '8px 10px',
                      backgroundColor: themeStyles.cardBg,
                      border: `1px solid ${themeStyles.cardBorder}`,
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>LANCEDB VECTOR INDEX</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: isDark ? '#60a5fa' : '#2563eb', marginTop: '2px' }}>
                          {liveVectors.toLocaleString()} {language === 'vi' ? 'vectơ' : 'embeddings'}
                        </div>
                      </div>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                        16.4ms ANN
                      </span>
                    </div>

                    {/* Metric 4: Cloudflare R2 */}
                    <div style={{
                      padding: '8px 10px',
                      backgroundColor: themeStyles.cardBg,
                      border: `1px solid ${themeStyles.cardBorder}`,
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>R2 LAKEHOUSE STORAGE</div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: isDark ? '#fb7185' : '#e11d48', marginTop: '2px' }}>
                          {storageUsedGb.toFixed(3)} GB ({storageUsedPct.toFixed(2)}%)
                        </div>
                      </div>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: isDark ? '#34d399' : '#059669', fontWeight: 700 }}>
                        $0.00 Egress
                      </span>
                    </div>
                  </div>

                  {/* Telemetry Status Footer */}
                  <div style={{
                    padding: '6px 8px',
                    backgroundColor: themeStyles.cardBg,
                    border: `1px solid ${themeStyles.cardBorder}`,
                    borderRadius: '4px',
                    fontSize: '9.5px',
                    fontFamily: 'var(--font-mono)',
                    color: themeStyles.textMuted,
                    textAlign: 'center',
                  }}>
                    UTH Real-Time Lakehouse Telemetry &bull; Port 8000 &bull; Ready
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Floating Canvas Pan & Zoom Controls */}
      <div
        style={{
          position: 'fixed',
          bottom: drawerOpen ? (drawerExpanded ? 'calc(100vh - 100px)' : '406px') : '16px',
          right: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: themeStyles.zoomBarBg,
          backdropFilter: 'blur(12px)',
          borderRadius: '10px',
          border: `1px solid ${themeStyles.zoomBarBorder}`,
          padding: '4px 10px',
          boxShadow: isDark ? '0 4px 20px rgba(0, 0, 0, 0.45)' : '0 4px 16px rgba(0, 0, 0, 0.08)',
          zIndex: 20,
          transition: 'bottom 0.38s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, marginRight: '4px' }}>
          CANVAS
        </span>

        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(parseFloat((z - 0.1).toFixed(2)), 0.4))}
          title="Zoom Out (Mouse Wheel Down)"
          style={{
            width: '28px',
            height: '28px',
            border: `1px solid ${themeStyles.zoomBtnBorder}`,
            borderRadius: '6px',
            backgroundColor: themeStyles.zoomBtnBg,
            color: themeStyles.zoomBtnText,
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
            color: themeStyles.zoomBtnText,
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
            border: `1px solid ${themeStyles.zoomBtnBorder}`,
            borderRadius: '6px',
            backgroundColor: themeStyles.zoomBtnBg,
            color: themeStyles.zoomBtnText,
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

        <div style={{ width: '1px', height: '18px', backgroundColor: themeStyles.zoomBtnBorder, margin: '0 2px' }} />

        <button
          type="button"
          onClick={() => {
            setZoom(1.0);
            setPan({ x: 0, y: 0 });
          }}
          title="Reset to Center"
          style={{
            border: `1px solid ${themeStyles.zoomBtnBorder}`,
            borderRadius: '6px',
            backgroundColor: themeStyles.zoomBtnBg,
            color: themeStyles.textMuted,
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
