export interface AnalyticsOverview {
  total_papers: number;
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

export interface EdaResponse {
  dataset_overview: AnalyticsOverview;
  category_distribution: CategoryDistItem[];
  temporal_distribution: TemporalDistItem[];
  math_and_content_stats: MathAndContentStats;
  top_authors: TopAuthorItem[];
  category_cooccurrence: CategoryCooccurItem[];
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

export interface ScatterPointItem {
  x: number;
  y: number;
  cluster: number;
  category: string;
  title: string;
  paper_id: string;
}

export interface ClusterValidityMetrics {
  silhouette_score: number;
  davies_bouldin_index: number;
  calinski_harabasz_index: number;
}

export interface ClustersSummary {
  sample_analyzed: number;
  vector_dimensions: number;
  optimal_k: number;
  dbscan_clusters_found: number;
  dbscan_noise_ratio: number;
}

export interface ClustersResponse {
  summary: ClustersSummary;
  validity_metrics: ClusterValidityMetrics;
  cluster_profiles: ClusterProfileItem[];
  scatter_2d: ScatterPointItem[];
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

export type TrendMomentum = 'ACCELERATING' | 'STEADY' | 'COOLING';

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
  silverTables: string[];
  silverSizeBytes: number;
  goldTables: string[];
  goldChunkCount: number;
  goldSizeBytes: number;
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
}

export interface IngestionControlResponse {
  status: string;
  message: string;
}

export type IngestionEventType = 'PAPER_INGESTED' | 'HEARTBEAT' | 'CONNECTION_ESTABLISHED';

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
  vectors_synced?: number;
  latency_ms?: number;
}
