export interface SearchQuery {
  query: string;
  category?: string;
  top_k?: number;
}

export interface SearchHit {
  paper_id: string;
  title: string;
  snippet: string;
  score: number;
  category: string;
  published_date: string;
}

export interface SearchResponse {
  query: string;
  total_hits: number;
  hits: SearchHit[];
  took_ms: number;
}

export type SearchSortBy = 'relevance' | 'date' | 'citations';

export interface SearchFilters {
  categories?: string[];
  yearFrom?: number;
  yearTo?: number;
  minMathCount?: number;
  sortBy?: SearchSortBy;
}
