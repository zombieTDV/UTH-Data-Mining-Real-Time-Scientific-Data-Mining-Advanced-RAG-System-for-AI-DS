import type { FC } from 'react';

export interface StatusBarProps {
  totalPapers: number;
  totalVectors?: number;
  totalFormulas?: number;
}

export const StatusBar: FC<StatusBarProps> = ({
  totalPapers,
  totalVectors = 143523,
  totalFormulas = 2220938,
}) => {
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
        <span>{(totalVectors + Math.max(0, totalPapers - 13000) * 14).toLocaleString()} VECTORS</span>
        <span>&bull;</span>
        <span>{(totalFormulas / 1000000).toFixed(2)}M FORMULAS</span>
      </div>
    </footer>
  );
};
