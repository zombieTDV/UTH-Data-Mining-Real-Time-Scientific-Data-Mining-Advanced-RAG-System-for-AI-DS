import type { FC, ReactNode } from 'react';

export interface StatCardProps {
  label: string;
  badge: string;
  badgeColor: string;
  value: ReactNode;
  unit?: string;
  description: string;
  footerLeft: ReactNode;
  footerRight: ReactNode;
  progressPercent?: number;
  glowColor?: string;
  gridColumn?: string;
  children?: ReactNode;
}

export const StatCard: FC<StatCardProps> = ({
  label,
  badge,
  badgeColor,
  value,
  unit,
  description,
  footerLeft,
  footerRight,
  progressPercent,
  glowColor,
  gridColumn = 'span 4',
  children,
}) => {
  return (
    <div style={{
      gridColumn,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {glowColor && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '80px',
          height: '80px',
          background: `radial-gradient(circle at top right, ${glowColor}, transparent 70%)`,
          pointerEvents: 'none'
        }} />
      )}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {label}
          </span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: badgeColor }}>
            {badge}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {value}
          </span>
          {unit && (
            <span style={{ fontSize: '16px', color: 'var(--text-muted)', fontWeight: 500 }}>
              {unit}
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
          {description}
        </div>
        {progressPercent !== undefined && (
          <div style={{
            height: '4px',
            background: 'var(--track-bg)',
            borderRadius: '2px',
            marginTop: '12px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
              borderRadius: '2px'
            }} />
          </div>
        )}
      </div>

      {children && <div>{children}</div>}

      <div style={{
        marginTop: '16px',
        paddingTop: '12px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)'
      }}>
        <span>{footerLeft}</span>
        <span>{footerRight}</span>
      </div>
    </div>
  );
};
