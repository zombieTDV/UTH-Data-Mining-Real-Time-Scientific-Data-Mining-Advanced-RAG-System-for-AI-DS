import type { FC } from 'react';
import { MiningPillarsView } from '../components/pillars';
import type { AppTheme } from '../types';

export interface PillarsScreenProps {
  theme: AppTheme;
  onNavigateToRag: (title: string) => void;
  dataVersion: string | null;
}

export const PillarsScreen: FC<PillarsScreenProps> = ({ theme, onNavigateToRag, dataVersion }) => {
  return (
    <div style={{ maxWidth: '1600px', width: '100%', height: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <MiningPillarsView
        theme={theme}
        onNavigateToRag={onNavigateToRag}
        dataVersion={dataVersion}
      />
    </div>
  );
};
