import type { AppTab, NavItem } from '../types';

export const NAV_ITEMS: NavItem[] = [
  { id: 'schematic', label: 'Schematic & Storage', shortcut: 'Alt+1', icon: 'flow' },
  { id: 'eda', label: 'Real-Time EDA', shortcut: 'Alt+2', icon: 'eda' },
  { id: 'pillars', label: '4 Mining Pillars', shortcut: 'Alt+3', icon: 'model' },
  { id: 'rag', label: 'Grounded RAG', shortcut: 'Alt+4', icon: 'rag' },
  { id: 'logs', label: 'Telemetry Logs', shortcut: 'Alt+5', icon: 'logs' },
];

export const ROUTES = {
  schematic: '/schematic',
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
