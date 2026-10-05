import { API_CONFIG } from '../../config';
import type { PaperEntity } from '../../types';

export async function fetchPaper(paperId: string): Promise<PaperEntity[]> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.paperById}/${encodeURIComponent(paperId)}`);
  if (!res.ok) throw new Error(`Paper fetch failed: ${res.statusText}`);
  return res.json();
}
