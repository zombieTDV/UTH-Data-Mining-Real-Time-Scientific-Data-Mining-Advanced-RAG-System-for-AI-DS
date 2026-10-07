export interface ChatCitation {
  paper_id: string;
  section?: string;
  title?: string;
  similarity?: number;
}

export interface ChatRequest {
  query: string;
  category?: string;
  top_k?: number;
}

export interface ChatResponse {
  query: string;
  answer: string;
  citations: string[];
  similarity_score: string;
  generation_time: string;
  context_chunks_used: number;
  authority_boosted?: boolean;
  top_influencer_author?: string;
  rule_expansions?: string[];
}

export interface ChatStreamChunk {
  token: string;
  done?: boolean;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  citations?: string[];
  timestamp: string;
  similarity_score?: string;
  generation_time?: string;
}

export interface ChatSuggestion {
  id: string;
  label: string;
  query: string;
}
