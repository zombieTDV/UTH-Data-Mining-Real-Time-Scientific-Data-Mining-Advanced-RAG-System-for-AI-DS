import type { FC } from 'react';

export interface StatusBarProps {
  totalPapers: number;
}

export const StatusBar: FC<StatusBarProps> = ({ totalPapers }) => {
  return (
    <footer
      style={{
        height: '32px',
        flexShrink: 0,
        backgroundColor: 'var(--footer-bg)',
        borderTop: '1px solid var(--footer-border)',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
      }}
    >
      <div>
        <span>UNIVERSITY OF TRANSPORT AND COMMUNICATIONS // REAL-TIME SCIENTIFIC DATA MINING LAKEHOUSE</span>
      </div>
      <div style={{ display: 'flex', gap: '16px' }}>
        <span>{totalPapers.toLocaleString()} PAPERS</span>
        <span>&bull;</span>
        <span>{(143523 + (totalPapers - 10000) * 14).toLocaleString()} VECTORS</span>
        <span>&bull;</span>
        <span>{(2.22 + (totalPapers - 10000) * 0.00022).toFixed(2)}M FORMULAS</span>
      </div>
    </footer>
  );
};
