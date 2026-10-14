from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class AssociationRuleItem(BaseModel):
    antecedents: List[str]
    consequents: List[str]
    support: float
    confidence: float
    lift: float
    leverage: float
    conviction: float


class AssociationRulesResponse(BaseModel):
    summary: Dict[str, Any]
    frequent_itemsets: List[Dict[str, Any]]
    rules: List[AssociationRuleItem]


class ClusterProfileItem(BaseModel):
    cluster_id: int
    size: int
    percentage: float
    dominant_categories: List[str]
    sample_titles: List[str]


class ScatterPointItem(BaseModel):
    x: float
    y: float
    cluster: int
    category: str
    title: str
    paper_id: str


class ClustersResponse(BaseModel):
    summary: Dict[str, Any]
    validity_metrics: Dict[str, Any]
    cluster_profiles: List[ClusterProfileItem]
    scatter_2d: List[ScatterPointItem]


class GraphNodeItem(BaseModel):
    id: str
    label: str
    pagerank: float
    degree: int
    community: int
    paper_count: int


class GraphLinkItem(BaseModel):
    source: str
    target: str
    weight: float


class GraphResponse(BaseModel):
    network_summary: Dict[str, Any]
    top_influencers: List[GraphNodeItem]
    communities: List[Dict[str, Any]]
    graph_export: Dict[str, Any]


class AnomalyItem(BaseModel):
    paper_id: str
    title: str
    primary_category: str
    anomaly_score: float
    math_count: int
    word_count: int
    author_count: int
    category_count: int
    outlier_reasons: List[str]


class TrendVelocityItem(BaseModel):
    category: str
    recent_quarter_papers: int
    previous_quarter_papers: int
    growth_rate_pct: float
    momentum: str
    all_time_papers: int


class TrendsResponse(BaseModel):
    summary: Dict[str, Any]
    anomalies: List[AnomalyItem]
    trend_velocity: List[TrendVelocityItem]
