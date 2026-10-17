export interface AnalyticsOverview {
  total_papers: number;
  fulltext_papers_count?: number;
  enriched_html_papers: number;
  enrichment_ratio: number;
  total_math_formulas: number;
  total_words: number;
  avg_sections_per_paper: number;
  avg_math_per_paper: number;
  avg_words_per_paper: number;
  earliest_publication: string;
  latest_publication: string;
}

export interface CategoryDistItem {
  category: string;
  count: number;
  percentage: number;
  total_math_formulas: number;
  avg_words: number;
}

export interface TemporalDistItem {
  period: string;
  count: number;
}

export interface TopAuthorItem {
  author: string;
  paper_count: number;
}

export interface CategoryCooccurItem {
  category_a: string;
  category_b: string;
  cooccurrence_count: number;
}

export interface MathAndContentStats {
  math_quantiles: {
    p25: number;
    median: number;
    p75: number;
    p95: number;
    max: number;
  };
  word_quantiles: {
    p25: number;
    median: number;
    p75: number;
    p95: number;
    max: number;
  };
}

export interface GmmClusterEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle_deg: number;
}

export interface GmmClusterInfo {
  cluster_id: number;
  name: string;
  badge: string;
  color: string;
  mean: [number, number];
  covariance: [[number, number], [number, number]];
  ellipse: GmmClusterEllipse;
  weight: number;
  count: number;
  percentage: number;
}

export interface SourceCompositionItem {
  source: string;
  label: string;
  paper_count: number;
  percentage: number;
  raw_format: string;
  size_mb: number;
  description: string;
  color: string;
}

export interface MissingnessAuditItem {
  field: string;
  label: string;
  total: number;
  present: number;
  missing: number;
  completeness_pct: number;
  status: string;
}

export interface HarvestTimelineItem {
  year: string;
  arxiv_count: number;
  openreview_count: number;
  cvf_count: number;
  total: number;
}

export interface CollectionSourceItem {
  name: string;
  count: number;
  percentage: number;
  color: string;
  badge: string;
  harvest_mode: string;
}

export interface CollectionMissingnessItem {
  field: string;
  display_name: string;
  present: number;
  missing: number;
  pct_missing: number;
  status: string;
  color: string;
}

export interface CollectionTimelineItem {
  year: string;
  count: number;
  sources: Record<string, number>;
}

export interface CollectionEdaSummary {
  total_papers?: number;
  total_size_gb?: number;
  ingestion_rate_ppm?: number;
  active_dedup_rate_pct?: number;
  sources_composition?: SourceCompositionItem[];
  missingness_audit?: MissingnessAuditItem[];
  harvest_timeline?: HarvestTimelineItem[];
  sources?: CollectionSourceItem[];
  total_collected?: number;
  missingness?: CollectionMissingnessItem[];
  timeline?: CollectionTimelineItem[];
  collection_notes?: string;
}

export interface ProcessingCleaningStep {
  step: string;
  reduction_pct?: number;
  extraction_accuracy?: number;
  coverage_pct?: number;
  status: string;
}

export interface ProcessingEdaSummary {
  fulltext_papers_count?: number;
  total_math_formulas?: number;
  total_words?: number;
  avg_words_per_paper?: number;
  avg_math_per_paper?: number;
  avg_sections_per_paper?: number;
  primary_clean_ratio?: number;
  latex_preservation_pct?: number;
  metrics?: {
    total_words_extracted: number;
    total_math_extracted: number;
    total_sections_extracted: number;
    avg_words_per_paper: number;
    avg_math_per_paper: number;
    avg_sections_per_paper: number;
  };
  cleaning_steps?: ProcessingCleaningStep[];
  math_density_histogram?: Array<{ bin: string; count: number; pct: number }>;
}

export interface EdaResponse {
  dataset_overview: AnalyticsOverview;
  category_distribution: CategoryDistItem[];
  temporal_distribution: TemporalDistItem[];
  math_and_content_stats: MathAndContentStats;
  top_authors: TopAuthorItem[];
  category_cooccurrence: CategoryCooccurItem[];
  correlations?: {
    pearson: Record<string, Record<string, { r: number; p: string; note: string }>>;
    spearman: Record<string, Record<string, { r: number; p: string; note: string }>>;
    sample_size: number;
  };
  scatter_points?: Array<{
    id: string;
    title: string;
    category: string;
    words: number;
    formulas: number;
    author: string;
    abstract?: string;
    sampleFormula?: string;
    gmm_cluster?: number;
    gmm_prob?: number;
  }>;
  diagnostic_3lenses?: Diagnostic3Lenses;
  collection_eda?: CollectionEdaSummary;
  processing_eda?: ProcessingEdaSummary;
  rag_audit_metrics?: {
    total_vectors: number;
    vector_dimension: number;
    embedding_model: string;
    context_window_tokens: number;
    index_type: string;
    section_distribution: Array<{
      section: string;
      chunks: number;
      percentage: number;
    }>;
  };
}

export interface Diagnostic3Lenses {
  lens1_topology: {
    matrix_shape: [number, number];
    total_papers_evaluated: number;
    total_lakehouse_papers: number;
    memory_footprint_mb: number;
    null_counts: Record<string, number>;
    dtypes: Record<string, string>;
  };
  lens2_univariate: Record<string, {
    key: string;
    label: string;
    short: string;
    unit: string;
    desc: string;
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    skewness: number;
    skew_category: string;
    skew_interpretation: string;
    kurtosis: number;
    kurtosis_category: string;
    kurtosis_interpretation: string;
    dagostino_k2: number;
    dagostino_p: string;
    is_normal: boolean;
    normality_verdict: string;
    histogram_bins: Array<{ x0: number; x1: number; count: number }>;
    kde_points: Array<{ x: number; y: number }>;
    qq_points: Array<{ theoretical: number; empirical: number; quantile: number }>;
  }>;
  lens3_multivariate: {
    pairs: Record<string, {
      pair_id: string;
      title: string;
      x_key: string;
      y_key: string;
      x_label: string;
      x_unit: string;
      y_label: string;
      y_unit: string;
      pearson_r: number;
      pearson_p: string;
      spearman_rho: number;
      spearman_p: string;
      mutual_information: number;
      linear_fit: {
        slope: number;
        intercept: number;
        r_squared: number;
      };
      spline_points: Array<{ x: number; y: number }>;
      warning: {
        badge: string;
        title: string;
        text: string;
      };
      gmm_clusters?: GmmClusterInfo[];
      scatter_samples: Array<{
        id: string;
        title: string;
        category: string;
        x: number;
        y: number;
        author: string;
        abstract?: string;
        sampleFormula?: string;
        gmm_cluster?: number;
        gmm_prob?: number;
      }>;
    }>;
    active_pair_default: string;
  };
  downstream_governance: Array<{
    rule_id: string;
    observed_geometry: string;
    empirical_evidence: string;
    pipeline_requirement: string;
    applied_in_lakehouse: string;
    tag: string;
    badge_color: string;
  }>;
}

export interface AssociationRuleItem {
  antecedents: string[];
  consequents: string[];
  support: number;
  confidence: number;
  lift: number;
  leverage: number;
  conviction: number;
}

export interface FrequentItemset {
  itemset: string[];
  support: number;
}

export interface AssociationRulesSummary {
  total_transactions: number;
  total_unique_items: number;
  frequent_itemsets_count: number;
  mined_rules_count: number;
  min_support_used: number;
  min_lift_threshold: number;
}

export interface AssociationRulesResponse {
  summary: AssociationRulesSummary;
  frequent_itemsets: FrequentItemset[];
  rules: AssociationRuleItem[];
}

export interface ClusterProfileItem {
  cluster_id: number;
  size: number;
  percentage: number;
  dominant_categories: Array<{ category: string; count: number }>;
  sample_titles: string[];
}

export interface GmmEllipseItem {
  cluster_id: number;
  name: string;
  short_title: string;
  color: string;
  weight: number;
  cx: number;
  cy: number;
  rx_1sigma: number;
  ry_1sigma: number;
  rx_2sigma: number;
  ry_2sigma: number;
  angle_deg: number;
}

export interface ScatterPointItem {
  x: number;
  y: number;
  cluster: number;
  category: string;
  title: string;
  paper_id: string;
  confidence?: number;
  all_probs?: number[];
  is_cross_domain?: boolean;
  secondary_cluster?: number;
}

export interface ClusterValidityMetrics {
  silhouette_score: number;
  davies_bouldin_index: number;
  calinski_harabasz_index: number;
  bic_score?: number;
  aic_score?: number;
  log_likelihood?: number;
  soft_separation_margin?: number;
  cross_domain_ratio?: number;
}

export interface ClustersSummary {
  sample_analyzed: number;
  vector_dimensions: number;
  optimal_k: number;
  dbscan_clusters_found: number;
  dbscan_noise_ratio: number;
  model_type?: string;
  covariance_type?: string;
}

export interface ClustersResponse {
  summary: ClustersSummary;
  validity_metrics: ClusterValidityMetrics;
  cluster_profiles: ClusterProfileItem[];
  scatter_2d: ScatterPointItem[];
  gmm_ellipses?: GmmEllipseItem[];
}

export interface GraphNodeItem {
  id: string;
  label: string;
  pagerank: number;
  degree: number;
  community: number;
  paper_count: number;
}

export interface GraphLinkItem {
  source: string;
  target: string;
  weight: number;
}

export interface NetworkSummary {
  total_authors: number;
  total_collaborations: number;
  total_nodes?: number;
  total_edges?: number;
  total_papers_indexed?: number;
  network_density: number;
  connected_components: number;
  total_communities_detected: number;
}

export interface TopInfluencerItem {
  author: string;
  pagerank: number;
  degree: number;
  paper_count: number;
  community_id: number;
}

export interface CommunityItem {
  community_id: number;
  total_members: number;
  representative_authors: string[];
}

export interface GraphExport {
  nodes: GraphNodeItem[];
  links: GraphLinkItem[];
}

export interface GraphResponse {
  network_summary: NetworkSummary;
  top_influencers: TopInfluencerItem[];
  communities: CommunityItem[];
  graph_export: GraphExport;
}

export interface AnomalyItem {
  paper_id: string;
  title: string;
  primary_category: string;
  anomaly_score: number;
  math_count: number;
  word_count: number;
  author_count: number;
  category_count: number;
  outlier_reasons: string[];
}

export type TrendMomentum = 'SURGING' | 'STABLE' | 'DECLINING' | 'ACCELERATING' | 'STEADY' | 'COOLING';

export interface TrendVelocityItem {
  category: string;
  recent_quarter_papers: number;
  previous_quarter_papers: number;
  growth_rate_pct: number;
  momentum: TrendMomentum;
  all_time_papers: number;
}

export interface TrendsSummary {
  total_papers_analyzed: number;
  total_anomalies_detected: number;
  anomaly_rate: number;
  tracked_categories_velocity: number;
}

export interface TrendsResponse {
  summary: TrendsSummary;
  anomalies: AnomalyItem[];
  trend_velocity: TrendVelocityItem[];
}

export interface StorageZoneInfo {
  bronzeCount: number;
  bronzeSizeBytes: number;
  openalexCount?: number;
  openalexSizeBytes?: number;
  openreviewCount?: number;
  openreviewSizeBytes?: number;
  cvfCount?: number;
  cvfSizeBytes?: number;
  silverTables: string[];
  silverSizeBytes: number;
  goldTables: string[];
  goldChunkCount: number;
  goldSizeBytes: number;
  goldBackupChunkCount?: number;
  goldBackupSizeBytes?: number;
}

export interface SourceBreakdownInfo {
  arxiv: number;
  doi?: number;
  openalex: number;
  openreview: number;
  cvf: number;
  zenodo: number;
  total_deduplicated: number;
  tier1_landmark: number;
  tier2_near_past: number;
  active_rag_papers: number;
  active_rag_vectors: number;
}

export interface ActiveLakehouseInfo {
  totalObjects: number;
  totalSizeBytes: number;
  totalSizeGb: number;
  usedPercentage: number;
  arxivHtmlCount: number;
  arxivHtmlSizeBytes: number;
  arxivHtmlSizeGb: number;
  openalexCount: number;
  openalexSizeBytes: number;
  openalexSizeGb: number;
  openreviewCount?: number;
  openreviewSizeBytes?: number;
  openreviewSizeMb?: number;
  cvfCount?: number;
  cvfSizeBytes?: number;
  cvfSizeMb?: number;
  silverParquetCount: number;
  silverParquetSizeBytes: number;
  silverParquetSizeMb: number;
  conferenceCount?: number;
  activeLanceDbVectors: number;
  activeLanceDbSizeBytes: number;
  activeLanceDbSizeMb: number;
  sourceBreakdown?: SourceBreakdownInfo;
}

export interface GoldVectorLakehouseInfo {
  totalObjects: number;
  totalSizeBytes: number;
  totalSizeGb: number;
  vectorCount?: number;
  description: string;
}

export interface BackupStorageInfo extends GoldVectorLakehouseInfo {}

export interface TotalBucketInfo {
  totalObjects: number;
  totalSizeBytes: number;
  totalSizeGb: number;
  usedPercentage: number;
  freeTierQuotaGb: number;
  overageGb: number;
  estimatedOverageCostUsd: number;
}

export interface StorageStatsResponse {
  bucket: string;
  status: string;
  total_objects: number;
  total_size_bytes: number;
  total_size_gb: number;
  free_tier_quota_gb: number;
  used_percentage: number;
  zones: StorageZoneInfo;
  remoteIndicesReady: boolean;
  activeLakehouse?: ActiveLakehouseInfo;
  goldVectorLakehouse?: GoldVectorLakehouseInfo;
  backupStorage?: BackupStorageInfo;
  totalBucket?: TotalBucketInfo;
  sourceBreakdown?: SourceBreakdownInfo;
  last_synced?: string;
}

export interface HealthResponse {
  status: string;
  lancedb_ready: boolean;
  parquet_ready: boolean;
}

export interface TriggerPipelineResponse {
  status: string;
  message: string;
}

export interface IngestionStatus {
  status: string;
  target_papers: number;
  session_ingested: number;
  total_corpus: number;
  speed_ppm: number;
  elapsed_seconds: number;
  storage_total_bytes?: number;
  storage_total_gb?: number;
  storage_used_pct?: number;
}

export interface IngestionControlResponse {
  status: string;
  message: string;
}

export type IngestionEventType = 'PAPER_INGESTED' | 'HEARTBEAT' | 'CONNECTION_ESTABLISHED' | 'STAGE_CHANGE';

export interface IngestionEvent {
  type: IngestionEventType;
  status?: 'STREAMING' | 'PAUSED' | 'COMPLETED';
  total_corpus?: number;
  speed_ppm?: number;
  timestamp?: string;
  paper_id?: string;
  title?: string;
  category?: string;
  session_ingested?: number;
  stage?: string;
  vectors_synced?: number;
  latency_ms?: number;
  bronze_bytes_delta?: number;
  silver_records?: number;
  storage_total_bytes?: number;
  storage_total_gb?: number;
  storage_used_pct?: number;
  total_vectors?: number;
  total_sections?: number;
  total_words?: number;
}

export interface DuckDbQueryResult {
  columns: string[];
  rows: Record<string, any>[];
  row_count: number;
  execution_time_ms: number;
}

export interface LakehouseSearchResult {
  query: string;
  mode: string;
  total_results: number;
  results: Array<{
    chunk_id: string;
    paper_id: string;
    title: string;
    text: string;
    primary_category?: string;
    score?: number;
  }>;
}

export interface DuckDbQueryResult {
  columns: string[];
  rows: Record<string, any>[];
  row_count: number;
  execution_time_ms: number;
}

export interface LakehouseSearchResult {
  query: string;
  mode: string;
  total_results: number;
  results: Array<{
    chunk_id: string;
    paper_id: string;
    title: string;
    text: string;
    primary_category?: string;
    score?: number;
  }>;
}
