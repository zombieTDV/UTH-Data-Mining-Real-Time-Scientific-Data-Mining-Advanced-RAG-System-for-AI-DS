import type { FC, ReactNode } from 'react';

export interface GeometricTelemetryGaugesProps {
  children?: ReactNode;
}

export const GeometricTelemetryGauges: FC<GeometricTelemetryGaugesProps> = ({ children }) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: '14px',
      marginBottom: '24px'
    }}>
      {children}
    </div>
  );
};
