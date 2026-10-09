import type { AppTab, NavItem } from '../types';

export const NAV_ITEMS: NavItem[] = [
  { id: 'schematic', label: 'Schematic & Storage', shortcut: 'Alt+1', icon: 'flow' },
  { id: 'r2', label: 'R2 Lakehouse Explorer', shortcut: 'Alt+2', icon: 'r2' },
  { id: 'eda', label: 'Real-Time EDA', shortcut: 'Alt+3', icon: 'eda' },
  { id: 'pillars', label: '4 Mining Pillars', shortcut: 'Alt+4', icon: 'model' },
  { id: 'rag', label: 'Grounded RAG', shortcut: 'Alt+5', icon: 'rag' },
  { id: 'logs', label: 'Telemetry Logs', shortcut: 'Alt+6', icon: 'logs' },
];

export const ROUTES = {
  schematic: '/schematic',
  r2: '/r2',
  eda: '/eda',
  pillars: '/pillars',
  rag: '/rag',
  logs: '/logs',
  paper: (id: string) => `/paper/${id}`,
} as const;

export function navigateToTab(tab: AppTab): void {
  if (typeof window === 'undefined') return;
  const path = ROUTES[tab] ?? '/';
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
