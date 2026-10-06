export interface PaperAuthor {
  name: string;
  affiliation?: string;
}

export interface PaperSection {
  heading: string;
  text: string;
  math_count?: number;
}

export interface PaperEntitySection extends PaperSection {
  score?: number;
  section_title?: string;
}

export interface PaperEntity {
  paper_id: string;
  arxiv_id?: string;
  doi?: string;
  title: string;
  authors: string[];
  abstract: string;
  primary_category: string;
  categories?: string[];
  published_date?: string;
  updated_date?: string;
  math_count?: number;
  word_count?: number;
  section_count?: number;
  sections?: PaperEntitySection[];
  html_url?: string;
  pdf_url?: string;

  // LanceDB ChunkDto properties returned by GET /api/papers/{paper_id}
  chunk_id?: string;
  text?: string;
  section_title?: string;
  score?: number;
  year?: number;
  source?: string;
  authority_score?: number;
  authority_author?: string;
  rule_expansions?: string[];
}

export interface PaperChunkEntity {
  chunk_id: string;
  paper_id: string;
  text: string;
  embedding?: number[];
  section_heading?: string;
  token_count: number;
}

export type PaperListItem = Pick<
  PaperEntity,
  'paper_id' | 'title' | 'authors' | 'primary_category' | 'published_date' | 'math_count' | 'word_count'
>;
