import { useState, useEffect, useRef, useMemo, type FC, type MouseEvent } from 'react';
import {
  startStreamingIngestion,
  stopStreamingIngestion,
  executeDuckDbQuery,
  searchLakehouse,
  sendChatQuery,
  fetchEdaSummary,
  triggerSchedulerHarvest,
} from '../../services';
import { useLakehouseStreamStore } from '../../store';
import { useTranslation } from '../../hooks';
import { ScientificMath } from '../common/ScientificMath.component';
import { AnimatedCounter } from '../common/AnimatedCounter.component';
import { AirflowNode, AirflowPanel, FlowConnector, RabbitPanel, RabbitQueueNode } from './PipelineInfraNodes.component';

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
  'airflow-orchestrator': {
    id: 'airflow-orchestrator',
    name: 'Apache Airflow (Orchestrator)',
    category: 'Workflow Scheduling',
    role: 'Schedules the harvest DAGs; they only harvest metadata and publish it to RabbitMQ (single-writer design)',
    engineVersion: 'Apache Airflow 2.10 (Docker, LocalExecutor, Asia/Ho_Chi_Minh timetables)',
    badgeColor: '#0891b2',
    status: 'ONLINE',
    telemetrySummary: {
      primaryMetric: 'DAGs',
      secondaryMetric: 'Scheduler health',
      latency: 'Cron timetables, no catch-up',
      throughput: 'Batches of 1,000 with queue backpressure',
    },
    features: [
      'Tier 1 at 19:00 ICT: every new arXiv paper from the RSS feeds, published in one go',
      'Tier 2 at 19:10 ICT: CVF and arXiv take 1-hour turns, newest to 2024-01-01, inside the 20 GB budget',
      'Tier 3 (one-off): the 3,000 most-cited AI / CV / NLP / Robotics papers from Semantic Scholar',
      'Maintenance: Silver compaction daily 03:00, mining recompute weekly',
    ],
    samplePreviewTitle: 'DAG → queue contract',
    sampleCodeOrSchema: `dag_tier1_realtime_stream    19:00 ICT  RSS          -> publish all
dag_tier2_near_past_harvest  19:10 ICT  CVF <-> arXiv  -> 1,000 / batch, wait Q1 < 200
dag_tier3_landmark_harvest   manual     Semantic Scholar -> 1,000 / batch
dag_compact_silver           03:00 ICT  fold Silver parts into year files
dag_recompute_mining         Sun 00:00  EDA + 4 mining pillars`,
  },
  'rabbitmq-broker': {
    id: 'rabbitmq-broker',
    name: 'RabbitMQ (2-stage work queues)',
    category: 'Message Broker & Backpressure',
    role: 'Decouples harvesting, full-text fetching and the embedding model so no stage waits on another',
    engineVersion: 'RabbitMQ 3 (durable queues, publisher confirms, dead-letter queues)',
    badgeColor: '#ea580c',
    status: 'ONLINE',
    telemetrySummary: {
      primaryMetric: 'Queue depth',
      secondaryMetric: 'Workers',
      latency: 'Acked only after the stage output is durable',
      throughput: 'Embed queue capped for the model',
    },
    features: [
      'Q1 scientific_paper_ingest: harvested metadata, consumed by the fetch worker (HTML5 -> ar5iv -> abstract, Bronze, Silver)',
      'Q2 scientific_chunk_embed: Silver records, consumed by the embed worker (chunk, Nomic 768-D, Qdrant)',
      'Backpressure: the fetch worker pauses while Q2 is full; bulk DAGs wait for Q1 to drain between batches',
      'Each queue retries its own failures and dead-letters them after 3 attempts: a paper in Silver is never fetched again',
    ],
    samplePreviewTitle: 'Message flow',
    sampleCodeOrSchema: `Airflow DAG --metadata--> Q1 scientific_paper_ingest
                              |  fetch worker (1)
                              |  dedup (Silver) -> HTML -> Bronze -> Silver part
                              v
                         Q2 scientific_chunk_embed   (pauses fetch at 500)
                              |  embed worker (1)
                              |  chunk -> Nomic embed (1 call / batch) -> Qdrant
                              v
                         *.dead  after 3 retries`,
  },
  'start-flow': {
    id: 'start-flow',
    name: 'Source Ingest (federated harvesters)',
    category: 'Full-Text Ingestion Engine',
    role: 'Harvesters for arXiv, CVF and Semantic Scholar; full text comes from arXiv HTML5 / ar5iv, section by section',
    engineVersion: 'arXiv RSS + API · CVF open access · Semantic Scholar Graph API',
    badgeColor: '#7c3aed',
    status: 'SYNCED',
    telemetrySummary: {
      primaryMetric: 'Live corpus size',
      secondaryMetric: 'Tier 1 live stream · Tier 2 near-past · Tier 3 landmarks',
      latency: 'HTML5 first, abstract fallback',
      throughput: 'Dedup by paper_id or abstract SHA-256 against Silver',
    },
    features: [
      'Tier 1: arXiv RSS of cs.AI, cs.LG, cs.CV, cs.CL, stat.ML',
      'Tier 2: CVF main conferences and workshops, plus arXiv day by day back to 2024-01-01',
      'Tier 3: most-cited landmarks; open-access PDF (PyMuPDF) only for papers that are not on arXiv',
      'A paper is skipped when its paper_id or abstract hash is already in Silver',
    ],
    samplePreviewTitle: 'Content resolution order',
    sampleCodeOrSchema: `1. arXiv HTML5        https://arxiv.org/html/<id>
2. ar5iv HTML5        https://ar5iv.labs.arxiv.org/html/<id>
3. open-access PDF    Tier 3 papers without an arXiv id only
4. abstract           fallback, still embedded`,
  },
  'bronze-instance': {
    id: 'bronze-instance',
    name: 'MinIO Object Storage',
    category: 'Bronze Immutable Data Lake',
    role: 'One S3-compatible bucket holding raw payloads and the Silver and Gold artifacts',
    engineVersion: 'MinIO (S3-compatible API)',
    badgeColor: '#e11d48',
    status: 'ONLINE',
    telemetrySummary: {
      primaryMetric: 'Live bucket size',
      secondaryMetric: 'Live object count',
      latency: 'Local network, single node',
      throughput: 'No egress fees, no request quotas',
    },
    features: [
      'S3-compatible local object store: the only place pipelines persist data (nothing is written to local disk)',
      'Strict partitioning: bronze/arxiv/raw_html/, bronze/papers/, silver/, gold/mining/',
      'SHA-256 stored with every uploaded object',
      'Streaming Silver parts are folded into per-year Parquet files by the compaction DAG',
    ],
    samplePreviewTitle: 'MinIO Bucket Key Hierarchy',
    sampleCodeOrSchema: `s3://<bucket>/
├── bronze/
│   ├── arxiv/raw_html/<year>/<arxiv_id>.html
│   ├── papers/<year>/<paper_id>.json
│   └── tier2/, tier3/  (batch pipeline records)
├── silver/
│   ├── papers/year=YYYY/papers.parquet   (+ parts/ until compacted)
│   ├── tier2/near_past_papers.parquet
│   └── tier3/landmark_papers.parquet
├── gold/mining/*.json                    (EDA + 4 mining pillars)
├── manifests/                            (dedup registry, checkpoints)
└── state/, archive/`,
  },
  'review-duckdb': {
    id: 'review-duckdb',
    name: 'DuckDB & LaTeX Parser',
    category: 'In-Process Vectorized OLAP Engine',
    role: 'SQL over the Silver Parquet files in MinIO, plus formula statistics',
    engineVersion: 'DuckDB + httpfs (reads s3:// Parquet directly)',
    badgeColor: '#f59e0b',
    status: 'ACTIVE',
    telemetrySummary: {
      primaryMetric: 'Formulas extracted',
      secondaryMetric: 'Papers queryable',
      latency: 'Range reads: only the needed columns are fetched',
      throughput: 'Zero-copy Apache Arrow columnar memory',
    },
    features: [
      'Vectorized query execution in-process, reading Parquet straight from MinIO over S3',
      'The dashboard SQL box is read-only: a single SELECT / WITH statement, file and network access disabled',
      'Canonical section taxonomy (abstract, introduction, methodology, experiments, ...)',
      'Fast aggregations over category, year and formula density',
    ],
    samplePreviewTitle: 'DuckDB Query Example (dashboard SQL box)',
    sampleCodeOrSchema: `SELECT
    primary_category AS category,
    count(*)                  AS papers,
    sum(total_math_count)     AS formulas,
    round(avg(total_math_count), 1) AS avg_math
FROM papers            -- view over silver/papers/year=2026/papers.parquet
GROUP BY category
ORDER BY papers DESC
LIMIT 6;`,
  },
  'silver-parquet': {
    id: 'silver-parquet',
    name: 'Apache Parquet Columnar Lakehouse',
    category: 'Silver Curated Columnar Store',
    role: 'Canonical structured storage for exploratory data mining',
    engineVersion: 'Apache Parquet (zstd) via PyArrow',
    badgeColor: '#10b981',
    status: 'SYNCED',
    telemetrySummary: {
      primaryMetric: 'Parquet size',
      secondaryMetric: 'Partition tables',
      latency: 'Column projection & predicate pushdown',
      throughput: 'zstd compression',
    },
    features: [
      'One 23-column schema shared by every tier (stream, near-past, historical archive)',
      'Streaming writes land as small immutable parts; a daily DAG compacts them into year files',
      'Deduplicated by abstract hash (papers without a hash fall back to the paper id)',
      'Read by DuckDB, the mining engine and the backend explorer',
    ],
    samplePreviewTitle: 'Parquet Schema Architecture',
    sampleCodeOrSchema: `Schema (23 columns):
├── paper_id, abstract_hash, doi, journal_ref
├── title, abstract, authors: list<string>, categories: list<string>
├── primary_category, published_date, crawled_at
├── pdf_url, html_url
├── total_sections, total_math_count, total_words
├── sections_json, clean_full_text
├── transformed_at, cite_count
└── source, tier, content_origin   (provenance: arxiv_html5, ar5iv_html5, abstract_only, ...)`,
  },
  'gold-qdrant': {
    id: 'gold-qdrant',
    name: 'Qdrant & 4 Mining Pillars',
    category: 'Gold Vector Store & Mining Core',
    role: 'Dense contextual embeddings for RAG, and the machine-learning mining pillars',
    engineVersion: 'Qdrant (HNSW, cosine) + Nomic Embed Text v1.5 (768-D)',
    badgeColor: '#2563eb',
    status: 'ONLINE',
    telemetrySummary: {
      primaryMetric: 'Vectors indexed',
      secondaryMetric: 'Papers and index size',
      latency: 'HNSW approximate nearest neighbour',
      throughput: '4 mining pillars',
    },
    features: [
      'Section-aware chunks (about 450 words) embedded with Nomic and upserted with deterministic ids (idempotent)',
      'Pillar 1: FP-Growth association rules over categories and keywords',
      'Pillar 2: K-Means and DBSCAN clustering of abstract embeddings sampled from Qdrant',
      'Pillar 3: co-authorship graph with PageRank and Louvain communities; Pillar 4: Isolation Forest novelty / trend anomalies',
    ],
    samplePreviewTitle: 'Qdrant Vector Search',
    sampleCodeOrSchema: `from qdrant_client import QdrantClient

client = QdrantClient(url=QDRANT_URL)
hits = client.query_points(
    collection_name="scientific_papers_gold",
    query=query_embedding,          # 768-D Nomic vector
    limit=5,
    with_payload=True,
).points

# payload: paper_id, title, section_title, section_type, text, primary_category`,
  },
  'grounded-rag': {
    id: 'grounded-rag',
    name: 'Qwen 2.5 & Grounded RAG Engine',
    category: 'Scientific Synthesis & Inference',
    role: 'Academic question answering grounded in retrieved chunks, with citations',
    engineVersion: 'Qwen2.5-7B-Instruct (GGUF, llama.cpp on Apple Metal)',
    badgeColor: '#6366f1',
    status: 'ACTIVE',
    telemetrySummary: {
      primaryMetric: 'Verified citations gate',
      secondaryMetric: 'Local inference, Apple Silicon (Metal)',
      latency: 'Retrieve, rerank, then generate',
      throughput: 'Paper and section attributions',
    },
    features: [
      'Hybrid retrieval from Qdrant followed by cross-encoder reranking',
      'Answers must stay inside the retrieved context; unsupported claims are refused',
      'Every claim is annotated with [Paper ID, Section Title] brackets',
      'Equations are rendered with KaTeX',
    ],
    samplePreviewTitle: 'Academic Grounding Prompt Gate',
    sampleCodeOrSchema: `[SYSTEM INSTRUCTION: STRICT ACADEMIC GROUNDING]
You are a peer-reviewed research assistant.
Ground every assertion strictly in the provided Qdrant chunks.
- If information is not in the context, reply: "Context does not provide evidence."
- Always cite source papers using the format: [Paper ID, Section Name]
- Render equations in LaTeX syntax: $...$ or $$...$$

[RETRIEVED CONTEXT: top-k chunks from the Gold collection]`,
  },
};

export interface InteractiveWorkflowCanvasProps {
  onNavigateTab?: (tab: 'schematic' | 'eda' | 'pillars' | 'rag' | 'logs') => void;
  isPipelineRunning?: boolean;
  onTriggerPipeline?: () => void;
  theme?: 'dark' | 'light';
}

export const InteractiveWorkflowCanvas: FC<InteractiveWorkflowCanvasProps> = ({
  theme = 'dark',
  onNavigateTab,
}) => {
  const { language } = useTranslation();
  const isVi = language === 'vi';
  const isDark = theme === 'dark';

  const themeStyles = {
    isDark,
    cardBg: isDark ? 'rgba(15, 23, 42, 0.90)' : '#ffffff',
    cardBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0',
    cardDivider: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#cbd5e1' : '#334155',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    wire: isDark ? 'rgba(255, 255, 255, 0.22)' : '#cbd5e1',
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
  const [activeModal, setActiveModal] = useState<
    'none' | 'airflow' | 'harvest' | 'rabbitmq' | 'storage' | 'parquet' | 'duckdb' | 'qdrant' | 'rag'
  >('none');

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
      query: isVi
        ? 'Tối ưu hoá hàm mất mát trong mô hình diffusion cho dữ liệu toán học?'
        : 'Optimizing loss functions in diffusion models for mathematical data?',
      formula: '\\mathcal{L}_{\\text{diff}} = \\mathbb{E}_{t, x_0, \\epsilon} \\left[ w_t \\cdot \\delta_{\\text{Huber}} ( \\epsilon - \\epsilon_\\theta(x_t, t) ) \\right]',
    },
    {
      label: 'Attention Scaling',
      query: isVi
        ? 'Cơ chế Attention trong Transformer đối với chuỗi ký hiệu LaTeX?'
        : 'Attention mechanism in Transformers for LaTeX symbol sequences?',
      formula: '\\text{Attn}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V',
    },
    {
      label: 'PageRank Graph',
      query: isVi
        ? 'Độ đo trung tâm PageRank trong đồ thị trích dẫn mạng lưới khoa học?'
        : 'PageRank centrality measure in scientific citation graphs?',
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
  const [isHarvesting, setIsHarvesting] = useState<boolean>(false);

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

  // Qdrant vector search (interactive panel)
  const [vectorQuery, setVectorQuery] = useState<string>('contrastive learning representation for scientific formulas');
  const [vectorSearching, setVectorSearching] = useState<boolean>(false);
  const [vectorResults, setVectorResults] = useState<Array<{ id: string; title: string; score: number; category: string }>>([]);

  // Grounded RAG Interactive State
  const [ragPrompt, setRagPrompt] = useState<string>('Tối ưu hoá hàm mất mát trong mô hình diffusion cho dữ liệu toán học?');
  const [ragStrictThreshold, setRagStrictThreshold] = useState<number>(0.75);
  const [ragGenerating, setRagGenerating] = useState<boolean>(false);
  const [ragResponse, setRagResponse] = useState<string>('');

  // Pan and Zoom Canvas State
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const contentRef = useRef<HTMLDivElement>(null);

  // Zoom that fits the whole pipeline (Airflow -> RAG) into the canvas width, never above 1:1
  const fitZoom = () => {
    const box = canvasRef.current;
    const content = contentRef.current;
    if (!box || !content || !content.scrollWidth) return 1;
    // scrollWidth: the cards overflow the flex row, so offsetWidth would only report the viewport width
    return Math.min(1, Math.max(0.4, parseFloat(((box.clientWidth - 48) / content.scrollWidth).toFixed(2))));
  };
  useEffect(() => {
    setZoom(fitZoom());
  }, []);

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

  // Close any open modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveModal('none');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

  // Nothing here is simulated: every figure comes from the backend monitor (store) or the EDA/mining artifacts.
  const simulationStage: PipelineStageKey = 'idle';
  const [formulasExtracted, setFormulasExtracted] = useState<number>(0);
  useEffect(() => {
    fetchEdaSummary().then((eda) => setFormulasExtracted(eda?.dataset_overview?.total_math_formulas ?? 0)).catch(() => undefined);
  }, []);

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
    totalVectors,
    triggerStorageSync,
    live,
  } = useLakehouseStreamStore();

  // Orchestration / messaging activity, straight from the monitor snapshot
  const airflowActive = (live?.airflow?.dags ?? []).some((d) => d.running && d.kind === 'harvest');
  const q = live?.queue;
  const fetchFlowing = !!q && q.ready + q.unacked > 0 && q.consumers > 0; // Q1 -> fetch worker -> MinIO
  const embedQueued = !!q && (q.embed_ready ?? 0) + (q.embed_unacked ?? 0) > 0; // Silver -> Q2
  const embedFlowing = embedQueued && (q?.embed_consumers ?? 0) > 0; // Q2 -> embed worker -> Qdrant

  const sourceBreakdown = storageStats?.sourceBreakdown || storageStats?.activeLakehouse?.sourceBreakdown;
  const liveArxivCount = sourceBreakdown?.arxiv ?? 0;
  const liveDoiCount = sourceBreakdown?.doi ?? 0;
  const liveOpenReviewCount = sourceBreakdown?.openreview ?? 0;
  const liveCvfCount = sourceBreakdown?.cvf ?? 0;
  const liveZenodoCount = sourceBreakdown?.zenodo ?? 0;
  const liveTotalWorks = totalCorpus || sourceBreakdown?.total_deduplicated || 0;
  const liveBronzeCount = liveArxivCount;

  const liveBronzeGb = (storageStats?.activeLakehouse?.arxivHtmlSizeGb ?? 0).toFixed(3);
  const liveSilverMb = storageStats?.activeLakehouse?.silverParquetSizeMb ?? 0;
  const liveSilverPartitions = storageStats?.activeLakehouse?.silverParquetCount ?? 0;

  const liveVectors = totalVectors || (storageStats?.activeLakehouse?.activeVectors ?? 0);
  const liveFormulas = formulasExtracted;

  const liveBatchesCount = 0;
  const liveQuotaGb = storageStats?.free_tier_quota_gb ?? 10.0;
  const displayWorks = liveTotalWorks;

  const handleToggleStreaming = async () => {
    if (isStreaming) {
      try {
        await stopStreamingIngestion();
      } catch (err) {
        console.error(err);
      }
    } else {
      try {
        await startStreamingIngestion(streamTarget, 2.0);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const effectiveStage = (activePipelineStage && activePipelineStage !== 'idle') 
    ? activePipelineStage 
    : (isStreaming ? 'harvest' : simulationStage);

  const isStageActive = (stage: string) => {
    // When real-time streaming ingestion is running, the entire Lakehouse pipeline is active end-to-end
    if (isStreaming) return true;
    if (effectiveStage === 'completed') return true;
    if (effectiveStage === stage) return true;
    if ((effectiveStage === 'harvest' || effectiveStage === 'bronze') && (stage === 'harvest' || stage === 'bronze')) return true;
    if ((effectiveStage === 'duckdb' || effectiveStage === 'silver') && (stage === 'duckdb' || stage === 'silver')) return true;
    if ((effectiveStage === 'parallel' || effectiveStage === 'gold' || effectiveStage === 'embedding') && (stage === 'parallel' || stage === 'gold' || stage === 'silver')) return true;
    if (effectiveStage === 'r2_sync' && (stage === 'bronze' || stage === 'silver' || stage === 'gold')) return true;
    return false;
  };

  const isGroundedRagReady = isStreaming || effectiveStage === 'completed' || activePipelineStage === 'completed' || liveTotalWorks > 0;

  const handleOpenInspector = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    if (nodeId === 'airflow-orchestrator') setActiveModal('airflow');
    else if (nodeId === 'start-flow') setActiveModal('harvest');
    else if (nodeId.startsWith('rabbitmq')) setActiveModal('rabbitmq');
    else if (nodeId === 'bronze-instance') setActiveModal('storage');
    else if (nodeId === 'silver-parquet') setActiveModal('parquet');
    else if (nodeId === 'review-duckdb') setActiveModal('duckdb');
    else if (nodeId === 'gold-qdrant') setActiveModal('qdrant');
    else if (nodeId === 'grounded-rag') setActiveModal('rag');
  };

  const handleToggleCategory = (cat: string) => {
    setHarvestCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // Starts a real Tier 2 run in Apache Airflow (limit = number of papers). Progress arrives through the live log stream.
  const handleStartHarvest = async () => {
    setIsHarvesting(true);
    try {
      await triggerSchedulerHarvest('tier2', harvestLimit, true, true);
      setActiveModal('none');
    } catch (err: any) {
      console.warn('Could not trigger the Tier 2 DAG:', err);
    } finally {
      setIsHarvesting(false);
    }
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
    } catch (err: any) {
      console.warn('DuckDB Query failed:', err);
    } finally {
      setDuckRunning(false);
    }
  };

  const handleRunVectorSearch = async () => {
    setVectorSearching(true);
    try {
      const res = await searchLakehouse(vectorQuery, 5);
      if (res?.results && res.results.length > 0) {
        setVectorResults(
          res.results.map((hit) => ({
            id: `arXiv:${hit.paper_id}`,
            title: hit.title || 'Academic Paper',
            score: Number(hit.score?.toFixed(3) || 0.885),
            category: hit.primary_category || 'cs.AI',
          }))
        );
      }
    } catch (err: any) {
      console.warn('Vector search error:', err);
    } finally {
      setVectorSearching(false);
    }
  };

  const handleRunRagPrompt = async () => {
    setRagGenerating(true);
    try {
      const res = await sendChatQuery(ragPrompt);
      setRagResponse(res.answer || 'Không tìm thấy ngữ cảnh thỏa điều kiện grounding.');
    } catch (err: any) {
      console.warn('RAG error:', err);
    } finally {
      setRagGenerating(false);
    }
  };


  const baseTool = TOOL_DETAILS_MAP[selectedNodeId.startsWith('rabbitmq') ? 'rabbitmq-broker' : selectedNodeId] || TOOL_DETAILS_MAP['start-flow'];
  const selectedTool = useMemo(() => {
    if (selectedNodeId === 'bronze-instance') {
      const totalGb = storageStats?.totalBucket?.totalSizeGb ?? storageUsedGb;
      const totalObjects = storageStats?.totalBucket?.totalObjects ?? 0;
      const activeGb = storageStats?.activeLakehouse?.totalSizeGb ?? 0;
      const archiveGb = storageStats?.backupStorage?.totalSizeGb ?? 0;
      return {
        ...baseTool,
        telemetrySummary: {
          ...baseTool.telemetrySummary,
          primaryMetric: `${totalGb.toFixed(2)} GB in MinIO (${totalObjects.toLocaleString()} objects)`,
          secondaryMetric: `Lakehouse: ${activeGb.toFixed(2)} GB • Archive: ${archiveGb.toFixed(2)} GB`,
        }
      };
    }
    if (selectedNodeId === 'review-duckdb') {
      return {
        ...baseTool,
        telemetrySummary: {
          ...baseTool.telemetrySummary,
          primaryMetric: `${liveFormulas.toLocaleString()} LaTeX Formulas`,
          secondaryMetric: `${liveTotalWorks.toLocaleString()} papers queryable`,
        }
      };
    }
    if (selectedNodeId === 'gold-qdrant') {
      const activeMb = storageStats?.activeLakehouse?.activeVectorsSizeMb ?? 0;
      return {
        ...baseTool,
        telemetrySummary: {
          ...baseTool.telemetrySummary,
          primaryMetric: `${liveVectors.toLocaleString()} Vectors Indexed`,
          secondaryMetric: `${liveTotalWorks.toLocaleString()} Papers • 768 Dim • ${activeMb.toFixed(2)} MB gold/`,
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
    if (selectedNodeId === 'airflow-orchestrator') {
      const dags = live?.airflow?.dags ?? [];
      return {
        ...baseTool,
        status: (live?.airflow?.reachable && live.airflow.scheduler_healthy ? 'ONLINE' : 'STANDBY') as ToolDetail['status'],
        telemetrySummary: {
          ...baseTool.telemetrySummary,
          primaryMetric: `${dags.filter((d) => d.running).length} running · ${dags.filter((d) => d.paused).length} paused · ${dags.length} DAGs`,
          secondaryMetric: live?.airflow?.reachable ? (live.airflow.scheduler_healthy ? 'Scheduler healthy' : 'Scheduler down') : 'Airflow unreachable',
        },
      };
    }
    if (selectedNodeId.startsWith('rabbitmq')) {
      const qq = live?.queue;
      return {
        ...baseTool,
        status: (qq?.status === 'HEALTHY' ? 'ACTIVE' : 'STANDBY') as ToolDetail['status'],
        telemetrySummary: {
          ...baseTool.telemetrySummary,
          primaryMetric: `Q1 ${(qq?.ready ?? 0).toLocaleString()} · Q2 ${(qq?.embed_ready ?? 0).toLocaleString()} waiting`,
          secondaryMetric: `fetch ×${qq?.consumers ?? 0} · embed ×${qq?.embed_consumers ?? 0} · dead ${qq?.dead ?? 0}`,
        },
      };
    }
    if (selectedNodeId === 'start-flow') {
      const works = liveTotalWorks;
      return {
        ...baseTool,
        telemetrySummary: {
          ...baseTool.telemetrySummary,
          primaryMetric: `${works.toLocaleString()} Deduplicated Works`,
          secondaryMetric: `${(liveDoiCount / 1000).toFixed(1)}k DOI · ${(liveArxivCount / 1000).toFixed(1)}k arXiv · ${(liveCvfCount / 1000).toFixed(1)}k CVF · ${(liveOpenReviewCount / 1000).toFixed(1)}k OpenRev · ${liveZenodoCount.toLocaleString()} Zenodo`,
        }
      };
    }
    return baseTool;
  }, [baseTool, selectedNodeId, live, storageUsedGb, liveDoiCount, liveArxivCount, liveOpenReviewCount, liveCvfCount, liveZenodoCount, liveBatchesCount, streamSessionCount, storageStats, totalCorpus, liveTotalWorks, liveSilverMb, liveSilverPartitions]);

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

      {/* ============================================================== */}
      {/* HORIZONTAL DATA MINING PIPELINE (Centered in Viewport & Zoomable) */}
      {/* ============================================================== */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div
          ref={contentRef}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex',
            alignItems: 'center',
            minWidth: '1280px',
            flexShrink: 0, // keep the row as wide as its cards so scale() is centred on the whole pipeline
            padding: '10px',
          }}
        >
          {/* STAGE 0: Apache Airflow orchestrator (Cyan) */}
          <AirflowNode
            live={live}
            theme={themeStyles}
            selected={selectedNodeId === 'airflow-orchestrator' && activeModal === 'airflow'}
            onClick={() => handleOpenInspector('airflow-orchestrator')}
          />
          <FlowConnector active={airflowActive} theme={themeStyles} rgb="8, 145, 178" head="#22d3ee" />

          {/* ============================================================== */}
          {/* STAGE 1: arXiv Harvester (Purple) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleOpenInspector('start-flow')}
            style={{
              width: '240px',
              backgroundColor: isStageActive('harvest')
                ? (isDark ? 'rgba(88, 28, 135, 0.35)' : '#f3e8ff')
                : themeStyles.cardBg,
              borderRadius: '14px',
              padding: '14px 16px',
              border: isStageActive('harvest')
                ? '2px solid #a855f7'
                : selectedNodeId === 'start-flow' && activeModal === 'harvest'
                ? '2px solid #7c3aed'
                : `1px solid ${themeStyles.cardBorder}`,
              boxShadow: isStageActive('harvest')
                ? (isDark
                    ? '0 0 32px rgba(168, 85, 247, 0.75), 0 0 12px rgba(192, 132, 252, 0.5)'
                    : '0 0 24px rgba(147, 51, 234, 0.45), 0 4px 16px rgba(147, 51, 234, 0.2)')
                : isDark
                ? '0 4px 16px rgba(0, 0, 0, 0.45)'
                : '0 4px 16px rgba(0, 0, 0, 0.05)',
              animation: isStageActive('harvest') ? 'stageGlowPurple 2.2s infinite ease-in-out' : 'none',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
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
                  <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#c084fc' : '#6d28d9' }}>
                    {isVi ? 'Thu Thập Nguồn' : 'Source Ingest'}
                  </div>
                  <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                    {isVi ? 'Bộ Cào Đa Nguồn' : 'Federated Crawlers'}
                  </div>
                </div>
              </div>

              <span style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: isStreaming ? (isDark ? '#34d399' : '#059669') : (isDark ? '#c084fc' : '#7c3aed'),
                backgroundColor: isStreaming
                  ? (isDark ? 'rgba(16, 185, 129, 0.18)' : '#ecfdf5')
                  : (isDark ? 'rgba(124, 58, 237, 0.18)' : '#f5f3ff'),
                border: `1px solid ${isStreaming ? (isDark ? 'rgba(16, 185, 129, 0.3)' : 'transparent') : (isDark ? 'rgba(124, 58, 237, 0.3)' : 'transparent')}`,
                padding: '1px 5px',
                borderRadius: '4px',
              }}>
                {isStreaming ? '● STREAMING' : 'v2.0'}
              </span>
            </div>

            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: isStreaming ? (isDark ? '#34d399' : '#059669') : themeStyles.textPrimary, fontFamily: 'var(--font-mono)' }}>
                  <AnimatedCounter value={displayWorks} />
                </span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isStreaming
                    ? (isVi ? `+${streamSessionCount} mới (${streamSpeed}/m)` : `+${streamSessionCount} new (${streamSpeed}/m)`)
                    : (isVi ? 'Bài Đã Thu Thập' : 'Works Ingested')}
                </span>
              </div>

              {/* Segmented Distribution Bar */}
              <div
                style={{ width: '100%', height: '5px', backgroundColor: 'var(--bg-elevated)', borderRadius: '9999px', overflow: 'hidden', display: 'flex', border: '1px solid var(--border-subtle)' }}
                title={`Phân bổ 5 Nguồn: DOI/Journals ${liveDoiCount.toLocaleString()} (${Math.round((liveDoiCount / liveTotalWorks) * 100)}%) • arXiv ${liveArxivCount.toLocaleString()} (${Math.round((liveArxivCount / liveTotalWorks) * 100)}%) • CVF ${liveCvfCount.toLocaleString()} (${Math.round((liveCvfCount / liveTotalWorks) * 100)}%) • OpenReview ${liveOpenReviewCount.toLocaleString()} (${Math.round((liveOpenReviewCount / liveTotalWorks) * 100)}%) • Zenodo ${liveZenodoCount.toLocaleString()} (<2%)`}
              >
                <div style={{ width: `${(liveDoiCount / liveTotalWorks) * 100}%`, height: '100%', backgroundColor: '#2563eb', transition: 'width 0.3s' }} title={`DOI / Journals: ${liveDoiCount.toLocaleString()}`} />
                <div style={{ width: `${(liveArxivCount / liveTotalWorks) * 100}%`, height: '100%', backgroundColor: '#8b5cf6', transition: 'width 0.3s' }} title={`arXiv: ${liveArxivCount.toLocaleString()}`} />
                <div style={{ width: `${(liveCvfCount / liveTotalWorks) * 100}%`, height: '100%', backgroundColor: '#10b981', transition: 'width 0.3s' }} title={`CVF: ${liveCvfCount.toLocaleString()}`} />
                <div style={{ width: `${(liveOpenReviewCount / liveTotalWorks) * 100}%`, height: '100%', backgroundColor: '#f59e0b', transition: 'width 0.3s' }} title={`OpenReview: ${liveOpenReviewCount.toLocaleString()}`} />
                <div style={{ width: `${Math.max(1, (liveZenodoCount / liveTotalWorks) * 100)}%`, height: '100%', backgroundColor: '#06b6d4', transition: 'width 0.3s' }} title={`Zenodo: ${liveZenodoCount.toLocaleString()}`} />
              </div>

              {/* High-Contrast Visual Source Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(37, 99, 235, 0.18)' : '#dbeafe',
                  color: isDark ? '#60a5fa' : '#1d4ed8',
                  border: '1px solid rgba(37, 99, 235, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                  DOI {liveDoiCount.toLocaleString()}
                </span>

                <span style={{
                  fontSize: '9.5px',
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
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#d1fae5',
                  color: isDark ? '#34d399' : '#059669',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  CVF {liveCvfCount.toLocaleString()}
                </span>

                <span style={{
                  fontSize: '9.5px',
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
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                  OpenReview {liveOpenReviewCount.toLocaleString()}
                </span>

                <span style={{
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '5px',
                  backgroundColor: isDark ? 'rgba(6, 182, 212, 0.15)' : '#cffafe',
                  color: isDark ? '#22d3ee' : '#0891b2',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#06b6d4' }} />
                  Zenodo {liveZenodoCount.toLocaleString()}
                </span>
              </div>

              {/* In-Node Quick Action */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveModal('harvest');
                }}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  padding: '5px 8px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  borderRadius: '6px',
                  backgroundColor: isDark ? 'rgba(124, 58, 237, 0.22)' : '#ede9fe',
                  color: isDark ? '#c084fc' : '#7c3aed',
                  border: `1px solid ${isDark ? 'rgba(124, 58, 237, 0.4)' : '#ddd6fe'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>⚡ {isVi ? 'Điều Khiển Thu Thập' : 'Ingest Controls'}</span>
              </button>
            </div>
          </div>

          {/* Horizontal Connector 1 */}
          <div style={{
            width: '42px',
            height: '2px',
            backgroundColor: isStageActive('harvest') ? 'rgba(124, 58, 237, 0.4)' : themeStyles.wire,
            position: 'relative',
            flexShrink: 0,
            overflow: 'hidden',
            boxShadow: isStageActive('harvest') ? '0 0 10px rgba(124, 58, 237, 0.6)' : 'none',
            transition: 'all 0.3s ease',
          }}>
            {isStageActive('harvest') && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  height: '100%',
                  width: '32px',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(168, 85, 247, 0.4) 30%, #c084fc 80%, #ffffff 100%)',
                  boxShadow: '0 0 10px #c084fc, 0 0 4px #ffffff',
                  animation: 'laserDataStream 1.0s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                }}
              />
            )}
          </div>

          {/* STAGE 1b: RabbitMQ Q1 (metadata -> fetch worker, which writes Bronze + Silver) */}
          <RabbitQueueNode
            stage="ingest"
            live={live}
            theme={themeStyles}
            selected={selectedNodeId === 'rabbitmq-q1' && activeModal === 'rabbitmq'}
            onClick={() => handleOpenInspector('rabbitmq-q1')}
          />
          <FlowConnector active={fetchFlowing} theme={themeStyles} rgb="234, 88, 12" head="#fb923c" />

          {/* ============================================================== */}
          {/* STAGE 2: MinIO Bronze lake (Magenta/Pink) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleOpenInspector('bronze-instance')}
            style={{
              width: '240px',
              backgroundColor: isStageActive('bronze')
                ? (isDark ? 'rgba(159, 18, 57, 0.35)' : '#ffe4e6')
                : themeStyles.cardBg,
              borderRadius: '14px',
              padding: '14px 16px',
              border: isStageActive('bronze')
                ? '2px solid #f43f5e'
                : selectedNodeId === 'bronze-instance' && activeModal === 'storage'
                ? '2px solid #e11d48'
                : `1px solid ${themeStyles.cardBorder}`,
              boxShadow: isStageActive('bronze')
                ? (isDark
                    ? '0 0 32px rgba(244, 63, 94, 0.75), 0 0 12px rgba(251, 113, 133, 0.5)'
                    : '0 0 24px rgba(225, 29, 72, 0.45), 0 4px 16px rgba(225, 29, 72, 0.2)')
                : isDark
                ? '0 4px 16px rgba(0, 0, 0, 0.45)'
                : '0 4px 16px rgba(0, 0, 0, 0.05)',
              animation: isStageActive('bronze') ? 'stageGlowRose 2.2s infinite ease-in-out' : 'none',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
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
                  <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#fb7185' : '#e11d48' }}>MinIO S3</div>
                  <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                    {isVi ? 'Hồ Dữ Liệu Bronze' : 'Bronze Lake'}
                  </div>
                </div>
              </div>

              <span style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: isStreaming ? '#34d399' : (isDark ? '#fb7185' : '#e11d48'),
                backgroundColor: isStreaming
                  ? (isDark ? 'rgba(16, 185, 129, 0.20)' : '#ecfdf5')
                  : (isDark ? 'rgba(225, 29, 72, 0.20)' : '#fff1f2'),
                border: `1px solid ${isStreaming ? (isDark ? 'rgba(16, 185, 129, 0.35)' : 'transparent') : (isDark ? 'rgba(225, 29, 72, 0.35)' : 'transparent')}`,
                padding: '1px 5px',
                borderRadius: '4px',
              }}>
                {isStreaming ? '● SYNCING' : 'S3 API'}
              </span>
            </div>

            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: themeStyles.textPrimary, fontFamily: 'var(--font-mono)' }}>
                  <AnimatedCounter value={storageUsedGb} decimals={3} suffix=" GB" />
                </span>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}>
                  {isVi ? 'Hồ Lưu Trữ Chính' : 'Primary Lake'}
                </span>
              </div>

              {/* Visual Storage Progress Bar */}
              <div style={{ width: '100%', height: '4px', backgroundColor: 'var(--bg-elevated)', borderRadius: '9999px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }} title={`Ngân sách dung lượng: ${storageUsedGb.toFixed(3)} GB / 10.0 GB (${storageUsedPct.toFixed(1)}%)`}>
                <div style={{
                  width: `${Math.min(100, storageUsedPct)}%`,
                  height: '100%',
                  background: storageUsedPct >= 90
                    ? 'linear-gradient(90deg, #f43f5e, #dc2626)'
                    : storageUsedPct >= 80
                    ? 'linear-gradient(90deg, #f59e0b, #ea580c)'
                    : 'linear-gradient(90deg, #10b981, #06b6d4)',
                  borderRadius: '9999px',
                  transition: 'width 0.4s ease',
                }} />
              </div>

              {/* Color-Coded Lakehouse Layer Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{
                  fontSize: '9.5px',
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
                  fontSize: '9.5px',
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
                  fontSize: '9.5px',
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
                    fontSize: '9.5px',
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

              {/* In-Node Quick Action */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveModal('storage');
                }}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  padding: '5px 8px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  borderRadius: '6px',
                  backgroundColor: isDark ? 'rgba(225, 29, 72, 0.22)' : '#ffe4e6',
                  color: isDark ? '#fb7185' : '#e11d48',
                  border: `1px solid ${isDark ? 'rgba(225, 29, 72, 0.4)' : '#fecdd3'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>🔍 {isVi ? 'Quản Trị Phân Vùng MinIO' : 'MinIO Partitions'}</span>
              </button>
            </div>
          </div>

          {/* Horizontal Connector 2 */}
          <div style={{
            width: '42px',
            height: '2px',
            backgroundColor: isStageActive('bronze') ? 'rgba(225, 29, 72, 0.4)' : themeStyles.wire,
            position: 'relative',
            flexShrink: 0,
            overflow: 'hidden',
            boxShadow: isStageActive('bronze') ? '0 0 10px rgba(225, 29, 72, 0.6)' : 'none',
            transition: 'all 0.3s ease',
          }}>
            {isStageActive('bronze') && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  height: '100%',
                  width: '32px',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(244, 63, 94, 0.4) 30%, #fb7185 80%, #ffffff 100%)',
                  boxShadow: '0 0 10px #fb7185, 0 0 4px #ffffff',
                  animation: 'laserDataStream 1.0s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                }}
              />
            )}
          </div>

          {/* ============================================================== */}
          {/* SILVER: Parquet on the write path; DuckDB hangs below it as the analytics reader */}
          {/* ============================================================== */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {/* PATH 1 (TOP): Apache Parquet (Green) */}
            <div
              onClick={() => handleOpenInspector('silver-parquet')}
              style={{
                width: '260px',
                backgroundColor: isStageActive('parallel')
                  ? (isDark ? 'rgba(6, 78, 59, 0.35)' : '#d1fae5')
                  : themeStyles.cardBg,
                borderRadius: '14px',
                padding: '12px 16px',
                border: isStageActive('parallel')
                  ? '2px solid #10b981'
                  : selectedNodeId === 'silver-parquet' && activeModal === 'parquet'
                  ? '2px solid #10b981'
                  : `1px solid ${themeStyles.cardBorder}`,
                boxShadow: isStageActive('parallel')
                  ? (isDark
                      ? '0 0 32px rgba(16, 185, 129, 0.75), 0 0 12px rgba(52, 211, 153, 0.5)'
                      : '0 0 24px rgba(5, 150, 105, 0.45), 0 4px 16px rgba(5, 150, 105, 0.2)')
                  : isDark
                  ? '0 4px 16px rgba(0, 0, 0, 0.45)'
                  : '0 4px 16px rgba(0, 0, 0, 0.05)',
                animation: isStageActive('parallel') ? 'stageGlowEmerald 2.2s infinite ease-in-out' : 'none',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
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
                    <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#34d399' : '#047857' }}>Apache Parquet</div>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>Silver Columnar</div>
                  </div>
                </div>

                <span style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: isDark ? '#34d399' : '#059669',
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.20)' : '#ecfdf5',
                  border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.35)' : 'transparent'}`,
                  padding: '1px 5px',
                  borderRadius: '4px',
                }}>
                  Snappy
                </span>
              </div>

              <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: themeStyles.textPrimary }}>
                    <AnimatedCounter value={liveSilverMb} decimals={2} suffix=" MB" />
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>
                    Silver Parquet
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  <span style={{
                    fontSize: '9.5px',
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
                    {liveSilverPartitions} Partitions
                  </span>

                  <span style={{
                    fontSize: '9.5px',
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
                    fontSize: '9.5px',
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

                {/* In-Node Quick Action */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveModal('parquet');
                  }}
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    padding: '5px 8px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    borderRadius: '6px',
                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.22)' : '#d1fae5',
                    color: isDark ? '#34d399' : '#059669',
                    border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.4)' : '#a7f3d0'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>🔍 {isVi ? 'Xem Parquet Schema & Số Liệu' : 'Inspect Parquet Schema'}</span>
                </button>
              </div>
            </div>

            {/* read-only branch: DuckDB / EDA / mining query Silver, they are not on the write path */}
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                width: '0',
                height: '40px',
                borderLeft: `2px dashed ${isStageActive('duckdb') ? 'rgba(245, 158, 11, 0.8)' : themeStyles.wire}`,
              }}
            />
            <span
              style={{
                position: 'absolute',
                top: 'calc(100% + 13px)',
                left: 'calc(50% + 8px)',
                fontSize: '9.5px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: themeStyles.textMuted,
                whiteSpace: 'nowrap',
              }}
            >
              
            </span>
            <div style={{ position: 'absolute', top: 'calc(100% + 40px)', left: '50%', transform: 'translateX(-50%)' }}>
              {/* ============================================================== */}
              {/* STAGE 3: DuckDB & LaTeX Normalizer (Amber) */}
              {/* ============================================================== */}
              <div
                onClick={() => handleOpenInspector('review-duckdb')}
                style={{
                  width: '240px',
                  backgroundColor: isStageActive('duckdb')
                    ? (isDark ? 'rgba(146, 64, 14, 0.35)' : '#fef3c7')
                    : themeStyles.cardBg,
                  borderRadius: '14px',
                  padding: '14px 16px',
                  border: isStageActive('duckdb')
                    ? '2px solid #f59e0b'
                    : selectedNodeId === 'review-duckdb' && activeModal === 'duckdb'
                    ? '2px solid #f59e0b'
                    : `1px solid ${themeStyles.cardBorder}`,
                  boxShadow: isStageActive('duckdb')
                    ? (isDark
                        ? '0 0 32px rgba(245, 158, 11, 0.75), 0 0 12px rgba(251, 191, 36, 0.5)'
                        : '0 0 24px rgba(217, 119, 6, 0.45), 0 4px 16px rgba(217, 119, 6, 0.2)')
                    : isDark
                    ? '0 4px 16px rgba(0, 0, 0, 0.45)'
                    : '0 4px 16px rgba(0, 0, 0, 0.05)',
                  animation: isStageActive('duckdb') ? 'stageGlowAmber 2.2s infinite ease-in-out' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
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
                      <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#fbbf24' : '#d97706' }}>DuckDB</div>
                      <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>
                        {isVi ? 'OLAP Trong Tiến Trình' : 'In-Process OLAP'}
                      </div>
                    </div>
                  </div>

                  <span style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: isDark ? '#fbbf24' : '#d97706',
                    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.20)' : '#fef3c7',
                    border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.35)' : 'transparent'}`,
                    padding: '1px 5px',
                    borderRadius: '4px',
                  }}>
                    SIMD
                  </span>
                </div>

                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 900, color: themeStyles.textPrimary, fontFamily: 'var(--font-mono)' }}>
                      <AnimatedCounter value={liveFormulas} />
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>
                      {isVi ? 'Công Thức Đã Tách' : 'Formulas Parsed'}
                    </span>
                  </div>

                  {/* Visual Performance Chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    <span style={{
                      fontSize: '9.5px',
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
                      fontSize: '9.5px',
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
                      fontSize: '9.5px',
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

                  {/* In-Node Quick Action */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveModal('duckdb');
                    }}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '5px 8px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      borderRadius: '6px',
                      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.22)' : '#fef3c7',
                      color: isDark ? '#fbbf24' : '#b45309',
                      border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.4)' : '#fde68a'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>⚡ {isVi ? 'Chạy Truy Vấn SQL DuckDB' : 'Run SQL Query'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* STAGE 4: RabbitMQ Q2 (Silver records -> embed worker) */}
          <FlowConnector active={embedQueued} theme={themeStyles} rgb="16, 185, 129" head="#34d399" />
          <RabbitQueueNode
            stage="embed"
            live={live}
            theme={themeStyles}
            selected={selectedNodeId === 'rabbitmq-q2' && activeModal === 'rabbitmq'}
            onClick={() => handleOpenInspector('rabbitmq-q2')}
          />
          <FlowConnector active={embedFlowing} theme={themeStyles} rgb="234, 88, 12" head="#fb923c" />

          {/* GOLD: Qdrant */}
          {/* PATH 2 (BOTTOM): Qdrant & 4 Pillars (Blue) */}
          <div
            onClick={() => handleOpenInspector('gold-qdrant')}
            style={{
              width: '260px',
              backgroundColor: isStageActive('parallel')
                ? (isDark ? 'rgba(30, 58, 138, 0.35)' : '#dbeafe')
                : themeStyles.cardBg,
              borderRadius: '14px',
              padding: '12px 16px',
              border: isStageActive('parallel')
                ? '2px solid #3b82f6'
                : selectedNodeId === 'gold-qdrant' && activeModal === 'qdrant'
                ? '2px solid #2563eb'
                : `1px solid ${themeStyles.cardBorder}`,
              boxShadow: isStageActive('parallel')
                ? (isDark
                    ? '0 0 32px rgba(59, 130, 246, 0.75), 0 0 12px rgba(96, 165, 250, 0.5)'
                    : '0 0 24px rgba(37, 99, 235, 0.45), 0 4px 16px rgba(37, 99, 235, 0.2)')
                : isDark
                ? '0 4px 16px rgba(0, 0, 0, 0.45)'
                : '0 4px 16px rgba(0, 0, 0, 0.05)',
              animation: isStageActive('parallel') ? 'stageGlowBlue 2.2s infinite ease-in-out' : 'none',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
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
                  <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#60a5fa' : '#1d4ed8' }}>Qdrant Vectors</div>
                  <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>Gold Vector Store</div>
                </div>
              </div>

              <span style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: isDark ? '#60a5fa' : '#2563eb',
                backgroundColor: isDark ? 'rgba(37, 99, 235, 0.20)' : '#eff6ff',
                border: `1px solid ${isDark ? 'rgba(37, 99, 235, 0.35)' : 'transparent'}`,
                padding: '1px 5px',
                borderRadius: '4px',
              }}>
                Nomic AI
              </span>
            </div>

            <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: 'var(--font-mono)' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: themeStyles.textPrimary }}>
                  <AnimatedCounter value={liveVectors} />
                </span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>
                  Gold Vectors
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <span style={{
                  fontSize: '9.5px',
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
                  fontSize: '9.5px',
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
                  HNSW ANN
                </span>

                <span style={{
                  fontSize: '9.5px',
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

              {/* In-Node Quick Action */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveModal('qdrant');
                }}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  padding: '5px 8px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  borderRadius: '6px',
                  backgroundColor: isDark ? 'rgba(37, 99, 235, 0.22)' : '#eff6ff',
                  color: isDark ? '#60a5fa' : '#2563eb',
                  border: `1px solid ${isDark ? 'rgba(37, 99, 235, 0.4)' : '#bfdbfe'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>🔍 {isVi ? 'Tìm Kiếm Vector Semantics' : 'Search Vectors'}</span>
              </button>
            </div>
          </div>

            {/* Final Horizontal Connector into Grounded RAG */}
            <div style={{
                    width: '36px',
                    height: '2px',
                    backgroundColor: isGroundedRagReady ? 'rgba(99, 102, 241, 0.6)' : themeStyles.wire,
                    position: 'relative',
                    flexShrink: 0,
                    overflow: 'hidden',
                    boxShadow: isGroundedRagReady ? '0 0 10px rgba(99, 102, 241, 0.8)' : 'none',
                    transition: 'all 0.3s ease',
                  }}>
                    {isGroundedRagReady && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          height: '100%',
                          width: '30px',
                          background: 'linear-gradient(90deg, transparent 0%, rgba(99, 102, 241, 0.4) 30%, #818cf8 80%, #ffffff 100%)',
                          boxShadow: '0 0 10px #818cf8, 0 0 4px #ffffff',
                          animation: 'laserDataStream 1.0s cubic-bezier(0.4, 0, 0.2, 1) infinite',
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
                      width: '240px',
                      backgroundColor: (isStageActive('parallel') || isGroundedRagReady)
                        ? (isDark ? 'rgba(49, 46, 129, 0.35)' : '#e0e7ff')
                        : themeStyles.cardBg,
                      borderRadius: '14px',
                      padding: '14px 16px',
                      border: (isStageActive('parallel') || isGroundedRagReady)
                        ? '2px solid #818cf8'
                        : selectedNodeId === 'grounded-rag' && activeModal === 'rag'
                        ? '2px solid #6366f1'
                        : `1px solid ${themeStyles.cardBorder}`,
                      boxShadow: (isStageActive('parallel') || isGroundedRagReady)
                        ? (isDark
                            ? '0 0 32px rgba(99, 102, 241, 0.8), 0 0 14px rgba(129, 140, 248, 0.6)'
                            : '0 0 24px rgba(99, 102, 241, 0.45), 0 4px 16px rgba(99, 102, 241, 0.2)')
                        : isDark
                        ? '0 4px 16px rgba(0, 0, 0, 0.45)'
                        : '0 4px 16px rgba(99, 102, 241, 0.1)',
                      animation: (isStageActive('parallel') || isGroundedRagReady) ? 'ragBeaconGlow 2.4s infinite' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
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
                            boxShadow: isGroundedRagReady
                              ? '0 0 14px rgba(99, 102, 241, 0.8)'
                              : '0 2px 6px rgba(99, 102, 241, 0.3)',
                            flexShrink: 0,
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        </div>

                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#a5b4fc' : '#4338ca' }}>
                            {isVi ? 'RAG Khoa Học' : 'Grounded RAG'}
                          </div>
                          <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>Qwen 2.5 QA</div>
                        </div>
                      </div>

                      <span style={{
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        color: isGroundedRagReady ? '#ffffff' : (isDark ? '#a5b4fc' : '#6366f1'),
                        backgroundColor: isGroundedRagReady ? '#6366f1' : (isDark ? 'rgba(99, 102, 241, 0.20)' : '#ede9fe'),
                        border: `1px solid ${isGroundedRagReady ? '#818cf8' : (isDark ? 'rgba(99, 102, 241, 0.35)' : 'transparent')}`,
                        boxShadow: isGroundedRagReady ? '0 0 12px rgba(99, 102, 241, 0.65)' : 'none',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}>
                        {isGroundedRagReady && (
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#34d399', boxShadow: '0 0 6px #34d399' }} />
                        )}
                        {isGroundedRagReady ? (isVi ? '● SẴN SÀNG TRUY VẤN' : '● READY FOR RAG') : 'Metal'}
                      </span>
                    </div>

                    {isGroundedRagReady && (
                      <div style={{
                        marginTop: '8px',
                        padding: '4px 8px',
                        borderRadius: '5px',
                        backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : 'rgba(99, 102, 241, 0.12)',
                        border: '1px solid rgba(99, 102, 241, 0.4)',
                        color: isDark ? '#c7d2fe' : '#4338ca',
                        fontSize: '9.5px',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                      }}>
                        <span style={{ color: '#10b981' }}>✔</span> {isVi ? 'PIPELINE ĐÃ ĐỒNG BỘ · SẴN SÀNG TRUY VẤN' : 'PIPELINE PRIMED · READY TO QUERY'}
                      </div>
                    )}

              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${themeStyles.cardDivider}`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: themeStyles.textPrimary, fontFamily: 'var(--font-mono)' }}>
                    {isVi ? 'Trích Dẫn Xác Thực' : 'Verified Citations'}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: isDark ? '#a5b4fc' : '#6366f1' }}>
                    {isVi ? '100% Khách Quan' : '100% Grounded'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  <span style={{
                    fontSize: '9.5px',
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
                    fontSize: '9.5px',
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
                    fontSize: '9.5px',
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

                {/* In-Node Quick Actions for Grounded RAG */}
                <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNavigateTab) {
                        onNavigateTab('rag');
                      } else {
                        setActiveModal('rag');
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      fontSize: '10.5px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                      borderRadius: '6px',
                      backgroundColor: isDark ? '#6366f1' : '#4f46e5',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>💬 {isVi ? 'Mở Chat RAG ↗' : 'Open RAG Chat ↗'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveModal('rag');
                    }}
                    style={{
                      padding: '6px 10px',
                      fontSize: '10.5px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      borderRadius: '6px',
                      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.22)' : '#ede9fe',
                      color: isDark ? '#a5b4fc' : '#4338ca',
                      border: `1px solid ${isDark ? 'rgba(99, 102, 241, 0.4)' : '#c7d2fe'}`,
                      cursor: 'pointer',
                    }}
                    title={isVi ? 'Kiểm thử nhanh' : 'Quick test'}
                  >
                    ⚡
                  </button>
                </div>
              </div>
            </div>
        </div>
      </div>

            {/* ============================================================== */}
      {/* MODERN GLASSMORPHIC MODAL WORKBENCH (ZERO-DRAWER ARCHITECTURE)  */}
      {/* ============================================================== */}
      {activeModal !== 'none' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(8px)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onClick={() => setActiveModal('none')}
        >
          <div
            style={{
              backgroundColor: isDark ? '#0b0f19' : '#ffffff',
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.16)' : '#e2e8f0'}`,
              borderRadius: '16px',
              width: '100%',
              maxWidth: activeModal === 'duckdb' || activeModal === 'parquet' ? '900px' : '780px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: isDark
                ? '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 40px rgba(0, 0, 0, 0.5)'
                : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                height: '52px',
                padding: '0 20px',
                borderBottom: `1px solid ${themeStyles.cardBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: isDark ? '#0e1422' : '#f8fafc',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor:
                      activeModal === 'parquet' ? '#10b981' :
                      activeModal === 'duckdb' ? '#f59e0b' :
                      activeModal === 'qdrant' ? '#2563eb' :
                      activeModal === 'harvest' ? '#7c3aed' :
                      activeModal === 'storage' ? '#e11d48' :
                      activeModal === 'airflow' ? '#0891b2' :
                      activeModal === 'rabbitmq' ? '#ea580c' : '#6366f1',
                    boxShadow: '0 0 8px currentColor',
                  }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                    {selectedTool?.category?.toUpperCase() || (
                      activeModal === 'parquet' ? 'SILVER CURATED STORE' :
                      activeModal === 'duckdb' ? 'VECTORIZED OLAP' :
                      activeModal === 'qdrant' ? 'GOLD VECTOR STORE' :
                      activeModal === 'harvest' ? 'SOURCE INGESTION' :
                      activeModal === 'storage' ? 'OBJECT STORAGE LAKE' :
                      activeModal === 'airflow' ? 'WORKFLOW SCHEDULER' :
                      activeModal === 'rabbitmq' ? 'MESSAGE BROKER' : 'SCIENTIFIC RAG'
                    )}
                  </span>
                  <span style={{ color: themeStyles.wire }}>/</span>
                  <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: themeStyles.textPrimary, margin: 0 }}>
                    {activeModal === 'parquet' ? 'Apache Parquet Columnar Lakehouse' :
                     activeModal === 'duckdb' ? 'DuckDB & LaTeX Parser' :
                     activeModal === 'qdrant' ? 'Qdrant Vector Store & Semantic Search' :
                     activeModal === 'harvest' ? 'Source Ingest (Federated Harvesters)' :
                     activeModal === 'storage' ? 'MinIO Object Storage Lake' :
                     activeModal === 'airflow' ? 'Apache Airflow Orchestrator' :
                     activeModal === 'rabbitmq' ? 'RabbitMQ 2-Stage Work Queues' : 'Qwen 2.5 & Grounded RAG QA'}
                  </h3>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                  ESC
                </span>
                <button
                  type="button"
                  onClick={() => setActiveModal('none')}
                  title="Đóng (ESC)"
                  style={{
                    background: 'transparent',
                    border: `1px solid ${themeStyles.cardBorder}`,
                    color: themeStyles.textMuted,
                    borderRadius: '8px',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', color: themeStyles.textPrimary }}>
              {/* 1. APACHE PARQUET MODAL (Fixes White Screen & Displays Real Telemetry) */}
              {activeModal === 'parquet' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Real-time Telemetry Bento Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: themeStyles.drawerSectionBg, border: `1px solid ${themeStyles.drawerSectionBorder}` }}>
                      <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
                        DUNG LƯỢNG PARQUET
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#10b981', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                        {liveSilverMb.toFixed(2)} MB
                      </div>
                      <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginTop: '2px' }}>
                        Nén Snappy / ZSTD 4.2x
                      </div>
                    </div>

                    <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: themeStyles.drawerSectionBg, border: `1px solid ${themeStyles.drawerSectionBorder}` }}>
                      <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
                        BÀI BÁO ĐÃ CHUẨN HOÁ
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: themeStyles.textPrimary, marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                        {liveTotalWorks.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginTop: '2px' }}>
                        Deduplicated theo SHA-256
                      </div>
                    </div>

                    <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: themeStyles.drawerSectionBg, border: `1px solid ${themeStyles.drawerSectionBorder}` }}>
                      <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
                        CÔNG THỨC TOÁN HỌC
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#f59e0b', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                        {formulasExtracted.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginTop: '2px' }}>
                        MathML & LaTeX Chuẩn
                      </div>
                    </div>

                    <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: themeStyles.drawerSectionBg, border: `1px solid ${themeStyles.drawerSectionBorder}` }}>
                      <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
                        FILE PHÂN VÙNG
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#3b82f6', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                        {liveSilverPartitions} Partitions
                      </div>
                      <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginTop: '2px' }}>
                        s3://.../silver/papers/
                      </div>
                    </div>
                  </div>

                  {/* Schema Architecture Section */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                        CẤU TRÚC CANONICAL SCHEMA (23 TRƯỜNG DỮ LIỆU PYARROW)
                      </span>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 700 }}>
                        ✓ Column Projection & Pushdown Enabled
                      </span>
                    </div>

                    <div style={{
                      backgroundColor: themeStyles.codeBoxBg,
                      border: `1px solid ${themeStyles.codeBoxBorder}`,
                      borderRadius: '10px',
                      padding: '14px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      lineHeight: 1.6,
                      maxHeight: '260px',
                      overflowY: 'auto',
                    }}>
                      <div style={{ color: '#38bdf8', fontWeight: 700, marginBottom: '6px' }}>
                        Schema • pyarrow.Table • silver/papers/year=YYYY/papers.parquet
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 20px' }}>
                        <div><span style={{ color: '#10b981' }}>paper_id:</span> string (Primary Key)</div>
                        <div><span style={{ color: '#10b981' }}>abstract_hash:</span> string (SHA-256 Lakehouse Dedup)</div>
                        <div><span style={{ color: '#10b981' }}>doi:</span> string (CrossRef Identifier)</div>
                        <div><span style={{ color: '#10b981' }}>title:</span> string (Normalized Scientific Title)</div>
                        <div><span style={{ color: '#10b981' }}>abstract:</span> string (Full-Text Normalized)</div>
                        <div><span style={{ color: '#10b981' }}>authors:</span> list&lt;string&gt; (Author Graph)</div>
                        <div><span style={{ color: '#10b981' }}>categories:</span> list&lt;string&gt; (cs.AI, cs.LG, stat.ML...)</div>
                        <div><span style={{ color: '#10b981' }}>primary_category:</span> string (Partition Key)</div>
                        <div><span style={{ color: '#10b981' }}>published_date:</span> timestamp[us]</div>
                        <div><span style={{ color: '#10b981' }}>total_sections:</span> int32 (HTML5 / ar5iv section count)</div>
                        <div><span style={{ color: '#10b981' }}>total_math_count:</span> int32 (MathML Formula Density)</div>
                        <div><span style={{ color: '#10b981' }}>total_words:</span> int32 (Corpus Volume)</div>
                        <div><span style={{ color: '#10b981' }}>sections_json:</span> string (Hierarchical Taxonomy)</div>
                        <div><span style={{ color: '#10b981' }}>clean_full_text:</span> string (Gold Embedding Source)</div>
                        <div><span style={{ color: '#10b981' }}>source:</span> string (arxiv | cvf | semanticscholar)</div>
                        <div><span style={{ color: '#10b981' }}>content_origin:</span> string (arxiv_html5 | ar5iv | abstract)</div>
                      </div>
                    </div>
                  </div>

                  {/* LaTeX / MathML Normalized Formula Sample */}
                  <div style={{
                    backgroundColor: themeStyles.drawerSectionBg,
                    border: `1px solid ${themeStyles.drawerSectionBorder}`,
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}>
                    <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f59e0b' }}>
                      CÔNG THỨC TOÁN HỌC CHUẨN HOÁ TRONG PARQUET (MATHML / LATEX AST):
                    </div>
                    <div style={{
                      backgroundColor: themeStyles.codeBoxBg,
                      border: `1px solid ${themeStyles.codeBoxBorder}`,
                      borderRadius: '6px',
                      padding: '8px',
                      textAlign: 'center',
                    }}>
                      <ScientificMath math="\mathcal{L}_{\text{diff}} = \mathbb{E}_{t, x_0, \epsilon} \left[ w_t \cdot \delta_{\text{Huber}} ( \epsilon - \epsilon_\theta(x_t, t) ) \right]" block />
                    </div>
                  </div>

                  {/* Footer CTAs */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: `1px solid ${themeStyles.cardDivider}` }}>
                    <div style={{ fontSize: '11px', color: themeStyles.textMuted }}>
                      Apache Parquet được nén với Snappy/ZSTD, hỗ trợ truy vấn không sao chép (zero-copy) qua DuckDB httpfs.
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveModal('duckdb')}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#f59e0b',
                        color: '#000000',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '11.5px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)',
                      }}
                    >
                      ⚡ {isVi ? 'Truy Vấn File Parquet Bằng DuckDB' : 'Query Parquet with DuckDB'}
                    </button>
                  </div>
                </div>
              )}

              {/* 2. DUCKDB SQL QUERY WORKBENCH MODAL */}
              {activeModal === 'duckdb' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Preset Queries */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, marginBottom: '8px' }}>
                      CÂU TRUY VẤN MẪU (SQL PRESETS)
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {DUCK_SQL_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setDuckQueryPreset(p.sql)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: duckQueryPreset === p.sql ? 800 : 600,
                            backgroundColor: duckQueryPreset === p.sql
                              ? (isDark ? 'rgba(245, 158, 11, 0.25)' : '#fef3c7')
                              : themeStyles.cardBg,
                            color: duckQueryPreset === p.sql ? '#f59e0b' : themeStyles.textMuted,
                            border: `1px solid ${duckQueryPreset === p.sql ? '#f59e0b' : themeStyles.cardBorder}`,
                            cursor: 'pointer',
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SQL Textarea */}
                  <div>
                    <textarea
                      value={duckQueryPreset}
                      onChange={(e) => setDuckQueryPreset(e.target.value)}
                      rows={4}
                      style={{
                        width: '100%',
                        backgroundColor: themeStyles.codeBoxBg,
                        color: isDark ? '#fbbf24' : '#b45309',
                        border: `1px solid ${themeStyles.codeBoxBorder}`,
                        borderRadius: '8px',
                        padding: '12px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11.5px',
                        lineHeight: 1.5,
                        resize: 'none',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Execute Button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      disabled={duckRunning}
                      onClick={handleRunDuckQuery}
                      style={{
                        padding: '8px 18px',
                        backgroundColor: duckRunning ? '#64748b' : '#f59e0b',
                        color: '#000000',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        cursor: duckRunning ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)',
                      }}
                    >
                      {duckRunning ? '⏳ ĐANG THỰC THI SIMD...' : '⚡ THỰC THI DUCKDB SIMD'}
                    </button>
                  </div>

                  {/* Tabular Results View */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, marginBottom: '8px' }}>
                      KẾT QUẢ TRUY VẤN (DUCKDB VECTORIZED ARROW RESULT)
                    </div>
                    <div style={{
                      backgroundColor: themeStyles.drawerSectionBg,
                      border: `1px solid ${themeStyles.drawerSectionBorder}`,
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                        <thead>
                          <tr style={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f1f5f9', borderBottom: `1px solid ${themeStyles.cardBorder}` }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: themeStyles.textMuted }}>CATEGORY / RECORD</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', color: themeStyles.textMuted }}>PAPERS</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', color: themeStyles.textMuted }}>TOTAL FORMULAS</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', color: themeStyles.textMuted }}>AVG MATH / PAPER</th>
                          </tr>
                        </thead>
                        <tbody>
                          {duckResults.map((r, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${themeStyles.cardDivider}` }}>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: '#f59e0b' }}>{r.category}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{r.papers.toLocaleString()}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>{r.formulas.toLocaleString()}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{r.avg_math}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ fontSize: '10px', color: themeStyles.textMuted, marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
                      ✓ Vectorized in-process SIMD execution reading directly from MinIO Parquet over S3.
                    </div>
                  </div>
                </div>
              )}

              {/* 3. QDRANT VECTOR SEARCH MODAL */}
              {activeModal === 'qdrant' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={vectorQuery}
                      onChange={(e) => setVectorQuery(e.target.value)}
                      placeholder="Nhập câu truy vấn ngữ nghĩa (ví dụ: diffusion loss, contrastive learning)..."
                      style={{
                        flex: 1,
                        backgroundColor: themeStyles.inputBg,
                        border: `1px solid ${themeStyles.inputBorder}`,
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        color: themeStyles.inputText,
                        outline: 'none',
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleRunVectorSearch()}
                    />
                    <button
                      type="button"
                      disabled={vectorSearching}
                      onClick={handleRunVectorSearch}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        cursor: vectorSearching ? 'wait' : 'pointer',
                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)',
                      }}
                    >
                      {vectorSearching ? '⏳ ĐANG TÌM...' : '🔍 TÌM KIẾM VECTOR'}
                    </button>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, marginBottom: '8px' }}>
                      KẾT QUẢ TÌM KIẾM THEO COSINE SIMILARITY ({liveVectors.toLocaleString()} vectors trong Qdrant Gold)
                    </div>

                    {vectorResults.length === 0 ? (
                      <div style={{
                        padding: '30px',
                        textAlign: 'center',
                        backgroundColor: themeStyles.drawerSectionBg,
                        borderRadius: '8px',
                        border: `1px solid ${themeStyles.drawerSectionBorder}`,
                        color: themeStyles.textMuted,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                      }}>
                        Nhập từ khoá và bấm [TÌM KIẾM VECTOR] để kiểm tra cosine similarity thực tế trong cơ sở dữ liệu vector.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {vectorResults.map((hit, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '12px 14px',
                              borderRadius: '8px',
                              backgroundColor: themeStyles.drawerSectionBg,
                              border: `1px solid ${themeStyles.drawerSectionBorder}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '12px',
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#3b82f6', backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff', padding: '1px 6px', borderRadius: '4px' }}>
                                  {hit.id}
                                </span>
                                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                                  {hit.category}
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: themeStyles.textPrimary }}>
                                {hit.title}
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 900, fontFamily: 'var(--font-mono)', color: '#10b981' }}>
                                {(hit.score * 100).toFixed(1)}% match
                              </span>
                              <div style={{ width: '80px', height: '4px', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.round(hit.score * 100)}%`, height: '100%', backgroundColor: '#10b981' }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 4. SOURCE INGESTION MODAL */}
              {activeModal === 'harvest' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Harvester Trigger Section */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: themeStyles.drawerSectionBg, border: `1px solid ${themeStyles.drawerSectionBorder}`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#7c3aed' }}>
                        ⚡ KÍCH HOẠT AIRFLOW HARVEST DAG (TIER 2)
                      </div>
                      <div style={{ fontSize: '11px', color: themeStyles.textMuted }}>
                        Gửi lệnh kích hoạt harvest luân phiên CVF và arXiv về Apache Airflow theo batch.
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                          Giới hạn bài báo:
                        </span>
                        <input
                          type="number"
                          value={harvestLimit}
                          onChange={(e) => setHarvestLimit(Math.max(1, parseInt(e.target.value) || 100))}
                          style={{
                            width: '100px',
                            backgroundColor: themeStyles.inputBg,
                            border: `1px solid ${themeStyles.inputBorder}`,
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            color: themeStyles.inputText,
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={isHarvesting}
                        onClick={handleStartHarvest}
                        style={{
                          marginTop: '4px',
                          padding: '8px 14px',
                          backgroundColor: '#7c3aed',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          cursor: isHarvesting ? 'wait' : 'pointer',
                        }}
                      >
                        {isHarvesting ? '⏳ ĐANG KÍCH HOẠT DAG...' : '🚀 BẮT ĐẦU THU THẬP TIER 2'}
                      </button>
                    </div>

                    <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: themeStyles.drawerSectionBg, border: `1px solid ${themeStyles.drawerSectionBorder}`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#10b981' }}>
                        🌊 REAL-TIME STREAMING INGESTION
                      </div>
                      <div style={{ fontSize: '11px', color: themeStyles.textMuted }}>
                        Luồng CDC thời gian thực cập nhật liên tục từ RSS feeds vào Lakehouse.
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isStreaming ? '#10b981' : '#64748b' }} />
                        <span style={{ fontWeight: 800, color: isStreaming ? '#10b981' : themeStyles.textMuted }}>
                          {isStreaming ? `STREAMING ACTIVE (${streamSpeed.toFixed(1)} docs/s)` : 'STREAMING STANDBY'}
                        </span>
                      </div>

                      {/* Stream Target Selector */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>Mục tiêu:</span>
                        {[50, 100, 200, 500].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setStreamTarget(t)}
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: streamTarget === t ? 800 : 600,
                              backgroundColor: streamTarget === t ? (isDark ? 'rgba(16, 185, 129, 0.25)' : '#d1fae5') : themeStyles.cardBg,
                              color: streamTarget === t ? '#10b981' : themeStyles.textMuted,
                              border: `1px solid ${streamTarget === t ? '#10b981' : themeStyles.cardBorder}`,
                              cursor: 'pointer',
                            }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={handleToggleStreaming}
                        style={{
                          marginTop: '4px',
                          padding: '8px 14px',
                          backgroundColor: isStreaming ? '#e11d48' : '#059669',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        {isStreaming ? '⏹ DỪNG STREAMING' : '▶ BẮT ĐẦU STREAMING REAL-TIME'}
                      </button>
                    </div>
                  </div>

                  {/* Category Pills Filter */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, marginBottom: '6px' }}>
                      DANH MỤC THU THẬP TỰ ĐỘNG
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {['cs.AI', 'cs.LG', 'cs.CV', 'cs.CL', 'stat.ML', 'math.PR', 'cs.RO', 'stat.TH'].map((cat) => {
                        const active = harvestCategories.includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => handleToggleCategory(cat)}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '5px',
                              fontSize: '10.5px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: active ? 800 : 600,
                              backgroundColor: active ? (isDark ? 'rgba(124, 58, 237, 0.25)' : '#ede9fe') : themeStyles.cardBg,
                              color: active ? (isDark ? '#c084fc' : '#7c3aed') : themeStyles.textMuted,
                              border: `1px solid ${active ? '#7c3aed' : themeStyles.cardBorder}`,
                              cursor: 'pointer',
                            }}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Breakdown of Sources */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, marginBottom: '8px' }}>
                      TỔNG QUAN NGUỒN DỮ LIỆU ĐÃ THU THẬP ({liveTotalWorks.toLocaleString()} BÀI BÁO)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: themeStyles.cardBg, border: `1px solid ${themeStyles.cardBorder}`, textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>arXiv OpenAccess</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#7c3aed', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>{liveArxivCount.toLocaleString()}</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: themeStyles.cardBg, border: `1px solid ${themeStyles.cardBorder}`, textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>CVF Conferences</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#10b981', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>{liveCvfCount.toLocaleString()}</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: themeStyles.cardBg, border: `1px solid ${themeStyles.cardBorder}`, textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>OpenReview</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#f59e0b', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>{liveOpenReviewCount.toLocaleString()}</div>
                      </div>
                      <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: themeStyles.cardBg, border: `1px solid ${themeStyles.cardBorder}`, textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: themeStyles.textMuted, fontFamily: 'var(--font-mono)' }}>Zenodo Open-Data</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#06b6d4', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>{liveZenodoCount.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. MINIO STORAGE MODAL */}
              {activeModal === 'storage' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, marginBottom: '8px' }}>
                        PHÂN CẤP BUCKET OBJECT STORAGE (S3 COMPATIBLE)
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
                        <div style={{ color: themeStyles.textPrimary, fontWeight: 700 }}>{`s3://${storageStats?.bucket ?? 'uth-lakehouse'}/`}</div>
                        <div style={{ color: isDark ? '#fb7185' : '#e11d48' }}>
                          ├── bronze/raw_html/ ({liveBronzeCount.toLocaleString()} HTML5 files &bull; {liveBronzeGb} GB)
                        </div>
                        <div style={{ color: isDark ? '#34d399' : '#059669' }}>
                          ├── silver/papers/ ({liveSilverPartitions} Parquet partitions &bull; {liveSilverMb.toFixed(0)} MB)
                        </div>
                        <div style={{ color: isDark ? '#38bdf8' : '#0284c7' }}>
                          └── gold/mining/ ({liveVectors.toLocaleString()} vectors &bull; models &bull; Graph cache)
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: themeStyles.drawerSectionBg, border: `1px solid ${themeStyles.drawerSectionBorder}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textPrimary }}>
                          DUNG LƯỢNG &amp; HẠN MỨC LƯU TRỮ
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#e11d48', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                          {storageUsedGb.toFixed(3)} GB / {liveQuotaGb.toFixed(2)} GB ({storageUsedPct.toFixed(1)}%)
                        </div>
                        <div style={{ height: '6px', backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, Math.max(0, storageUsedPct))}%`, height: '100%', backgroundColor: storageUsedPct > 80 ? '#e11d48' : '#3b82f6', transition: 'width 0.3s ease' }} />
                        </div>
                        <div style={{ fontSize: '10px', color: '#10b981', fontFamily: 'var(--font-mono)', marginTop: '8px', fontWeight: 700 }}>
                          ✓ LOCAL MINIO S3 (Zero Egress Fees)
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          await triggerStorageSync();
                        }}
                        style={{
                          marginTop: '12px',
                          padding: '8px',
                          backgroundColor: themeStyles.roseGhostBg,
                          color: themeStyles.roseGhostText,
                          border: `1px solid ${isDark ? '#e11d48' : '#be123c'}`,
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        ⚡ QUÉT LẠI BUCKET MINIO S3
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 6. AIRFLOW MODAL */}
              {activeModal === 'airflow' && (
                <div>
                  <AirflowPanel live={live} theme={themeStyles} />
                </div>
              )}

              {/* 7. RABBITMQ MODAL */}
              {activeModal === 'rabbitmq' && (
                <div>
                  <RabbitPanel live={live} theme={themeStyles} />
                </div>
              )}

              {/* 8. GROUNDED RAG MODAL */}
              {activeModal === 'rag' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Preset Questions */}
                  <div>
                    <div style={{ fontSize: '10.5px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary, marginBottom: '6px' }}>
                      CÂU HỎI MẪU (RAG PRESET PROMPTS)
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {RAG_QUERY_PRESETS.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setRagPrompt(p.query)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '10.5px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: ragPrompt === p.query ? 800 : 600,
                            backgroundColor: ragPrompt === p.query
                              ? (isDark ? 'rgba(99, 102, 241, 0.25)' : '#e0e7ff')
                              : themeStyles.cardBg,
                            color: ragPrompt === p.query
                              ? (isDark ? '#c7d2fe' : '#4338ca')
                              : themeStyles.textMuted,
                            border: `1px solid ${ragPrompt === p.query ? '#6366f1' : themeStyles.cardBorder}`,
                            cursor: 'pointer',
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={ragPrompt}
                      onChange={(e) => setRagPrompt(e.target.value)}
                      placeholder="Nhập câu hỏi khoa học cần trích dẫn chính xác..."
                      style={{
                        flex: 1,
                        backgroundColor: themeStyles.inputBg,
                        border: `1px solid ${themeStyles.inputBorder}`,
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        color: themeStyles.inputText,
                        outline: 'none',
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleRunRagPrompt()}
                    />
                    <button
                      type="button"
                      disabled={ragGenerating}
                      onClick={handleRunRagPrompt}
                      style={{
                        padding: '10px 18px',
                        backgroundColor: '#6366f1',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        cursor: ragGenerating ? 'wait' : 'pointer',
                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
                      }}
                    >
                      {ragGenerating ? '⏳ ĐANG TỔNG HỢP...' : '⚡ TỔNG HỢP RAG'}
                    </button>
                  </div>

                  {/* Strict Threshold Slider */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', backgroundColor: themeStyles.drawerSectionBg, borderRadius: '6px', border: `1px solid ${themeStyles.drawerSectionBorder}` }}>
                    <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                      Ngưỡng Cosine Tối Thiểu (Cosine Strict Gate):
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="range"
                        min="0.5"
                        max="0.95"
                        step="0.05"
                        value={ragStrictThreshold}
                        onChange={(e) => setRagStrictThreshold(parseFloat(e.target.value))}
                        style={{ accentColor: '#6366f1', cursor: 'pointer', width: '90px' }}
                      />
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#6366f1' }}>
                        {ragStrictThreshold.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {ragResponse && (
                    <div style={{
                      padding: '14px',
                      borderRadius: '8px',
                      backgroundColor: themeStyles.drawerSectionBg,
                      border: `1px solid ${themeStyles.drawerSectionBorder}`,
                      fontSize: '12.5px',
                      lineHeight: 1.6,
                    }}>
                      <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#6366f1', marginBottom: '6px' }}>
                        KẾT QUẢ TỔNG HỢP CÓ TRÍCH DẪN (GROUNDED CITATIONS):
                      </div>
                      <div style={{ color: themeStyles.textPrimary }}>{ragResponse}</div>
                    </div>
                  )}

                  {/* Big CTA to Full RAG Chat Interface */}
                  <div style={{
                    padding: '16px',
                    borderRadius: '10px',
                    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : '#ede9fe',
                    border: `1px solid ${isDark ? 'rgba(99, 102, 241, 0.35)' : '#c7d2fe'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: isDark ? '#a5b4fc' : '#4338ca' }}>
                        Trải nghiệm RAG Trò Chuyện Đầy Đủ
                      </div>
                      <div style={{ fontSize: '11px', color: themeStyles.textMuted, marginTop: '2px' }}>
                        Hỗ trợ trò chuyện đa lượt, render công thức KaTeX và đối chiếu trích dẫn nguồn trực quan.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal('none');
                        onNavigateTab?.('rag');
                      }}
                      style={{
                        padding: '10px 18px',
                        backgroundColor: '#6366f1',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
                      }}
                    >
                      💬 CHUYỂN SANG TAB CHAT RAG ↗
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* FLOATING CANVAS PAN & ZOOM CONTROLS (STABLE AT BOTTOM RIGHT)   */}
      {/* ============================================================== */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
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
            setZoom(fitZoom());
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
            setZoom(fitZoom());
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
