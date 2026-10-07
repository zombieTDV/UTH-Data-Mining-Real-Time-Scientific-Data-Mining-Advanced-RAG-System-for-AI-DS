import { ROUTES } from './routes';
import type { AppTab } from '../types';

export const LINKING_CONFIG = {
  prefixes: ['http://localhost:5173', 'https://uth-data-mining.app'],
  config: {
    screens: {
      Schematic: ROUTES.schematic,
      Eda: ROUTES.eda,
      Pillars: ROUTES.pillars,
      Rag: ROUTES.rag,
      Logs: ROUTES.logs,
    },
  },
} as const;

export function buildPaperLink(paperId: string): string {
  return ROUTES.paper(paperId);
}

export function matchTabFromPath(path: string): AppTab | null {
  const map: Record<string, AppTab> = {
    [ROUTES.schematic]: 'schematic',
    [ROUTES.eda]: 'eda',
    [ROUTES.pillars]: 'pillars',
    [ROUTES.rag]: 'rag',
    [ROUTES.logs]: 'logs',
  };
  return map[path] ?? null;
}
