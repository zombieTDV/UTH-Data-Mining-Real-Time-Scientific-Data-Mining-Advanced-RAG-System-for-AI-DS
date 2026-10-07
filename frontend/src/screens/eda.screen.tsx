import type { FC } from 'react';
import { EdaView } from '../components/eda';
import type { AppTheme } from '../types';

export interface EdaScreenProps {
  theme: AppTheme;
  onNavigateToRag: (title?: string) => void;
}

export const EdaScreen: FC<EdaScreenProps> = ({ theme, onNavigateToRag }) => {
  return (
    <div style={{ maxWidth: '1600px', width: '100%', height: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <EdaView
        theme={theme}
        onNavigateToRag={onNavigateToRag}
      />
    </div>
  );
};
