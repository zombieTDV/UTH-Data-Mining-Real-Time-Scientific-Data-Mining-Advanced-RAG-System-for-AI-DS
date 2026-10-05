import { API_CONFIG } from '../../config';
import type {
  EdaResponse,
  AssociationRulesResponse,
  ClustersResponse,
  GraphResponse,
  TrendsResponse,
} from '../../types';

export async function fetchEdaSummary(): Promise<EdaResponse> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.eda}`);
  if (!res.ok) throw new Error(`Failed to load EDA: ${res.statusText}`);
  return res.json();
}

export async function fetchAssociationRules(): Promise<AssociationRulesResponse> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.associationRules}`);
  if (!res.ok) throw new Error(`Failed to load Association Rules: ${res.statusText}`);
  return res.json();
}

export async function fetchClusters(): Promise<ClustersResponse> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.clusters}`);
  if (!res.ok) throw new Error(`Failed to load Clusters: ${res.statusText}`);
  return res.json();
}

export async function fetchGraph(): Promise<GraphResponse> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.graph}`);
  if (!res.ok) throw new Error(`Failed to load Graph: ${res.statusText}`);
  return res.json();
}

export async function fetchTrends(): Promise<TrendsResponse> {
  const res = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.trends}`);
  if (!res.ok) throw new Error(`Failed to load Trends: ${res.statusText}`);
  return res.json();
}
