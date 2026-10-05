import type { AppTab } from '../types';

export type RootStackParamList = {
  Tabs: undefined;
  Paper: { id: string };
  Settings: undefined;
};

export type TabsParamList = {
  Schematic: undefined;
  Eda: undefined;
  Pillars: undefined;
  Rag: { initialQuery?: string } | undefined;
  Logs: undefined;
};

export type AppRouteParams = {
  tab: AppTab;
  paperId?: string;
  initialQuery?: string;
};
