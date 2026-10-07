import type { FC } from 'react';

export interface CategoryStatsCardProps {
  metricLabel: string;
  title: string;
  subtitle: string;
  footerLabel: string;
  footerValue: string;
  footerColor: string;
}

export const CategoryStatsCard: FC<CategoryStatsCardProps> = ({
  metricLabel,
  title,
  subtitle,
  footerLabel,
  footerValue,
  footerColor,
}) => {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--card-shadow)',
      padding: '22px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'relative'
    }}>
      <div>
        <div style={{
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '4px'
        }}>
          {metricLabel}
        </div>
        <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          {title}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {subtitle}
        </div>
        <div style={{ marginTop: '14px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          {footerLabel}: <strong style={{ color: footerColor, fontSize: '13px' }}>{footerValue}</strong>
        </div>
      </div>
    </div>
  );
};
