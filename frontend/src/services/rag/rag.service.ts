import { API_CONFIG } from '../../config';
import { APP_CONFIG } from '../../config';
import type { ChatRequest, ChatResponse } from '../../types';

export async function sendChatQuery(
  query: string,
  category?: string,
  topK: number = APP_CONFIG.defaultRagTopK,
): Promise<ChatResponse> {
  const body: ChatRequest = { query, category, top_k: topK };
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.chat}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Chat query failed: ${res.statusText}`);
  return res.json();
}
