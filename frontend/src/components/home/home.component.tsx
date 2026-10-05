import type { FC, ReactNode } from 'react';

export interface HomeProps {
  toolbar?: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
}

export const Home: FC<HomeProps> = ({ toolbar, content, footer }) => {
  return (
    <div style={{
      flex: 1,
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    }}>
      {toolbar && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          marginBottom: '8px',
          gap: '8px'
        }}>
          {toolbar}
        </div>
      )}
      {content}
      {footer && <div>{footer}</div>}
    </div>
  );
};
