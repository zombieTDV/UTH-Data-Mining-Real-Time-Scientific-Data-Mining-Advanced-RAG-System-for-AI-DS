import type { FC } from 'react';

export interface RadialGaugeProps {
  percentage: number;
  primaryValue: string;
  secondaryValue: string;
}

export const RadialGauge: FC<RadialGaugeProps> = ({
  percentage,
  primaryValue,
  secondaryValue,
}) => {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div style={{
      position: 'relative',
      width: '130px',
      height: '130px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle
          cx="65"
          cy="65"
          r={radius}
          fill="none"
          stroke="var(--track-bg)"
          strokeWidth="10"
        />
        <circle
          cx="65"
          cy="65"
          r={radius}
          fill="none"
          stroke="var(--accent-bronze)"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 65 65)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <span style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {primaryValue}
        </span>
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontWeight: 600 }}>
          {secondaryValue}
        </span>
      </div>
    </div>
  );
};
