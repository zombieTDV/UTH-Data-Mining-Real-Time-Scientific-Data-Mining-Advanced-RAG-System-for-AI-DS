import type { FC } from 'react';
import { GroundedRagChat } from '../components/rag';
import type { AppTheme } from '../types';

export interface RagScreenProps {
  theme: AppTheme;
  initialQuery: string;
  onClearInitialQuery: () => void;
}

export const RagScreen: FC<RagScreenProps> = ({ theme, initialQuery, onClearInitialQuery }) => {
  return (
    <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <GroundedRagChat
        theme={theme}
        initialQuery={initialQuery}
        onClearInitialQuery={onClearInitialQuery}
      />
    </div>
  );
};
