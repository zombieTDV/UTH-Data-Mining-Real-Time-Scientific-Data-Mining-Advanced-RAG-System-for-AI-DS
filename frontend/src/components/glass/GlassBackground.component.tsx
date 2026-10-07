import { memo, type FC, type CSSProperties } from 'react';

export interface GlassBackgroundProps {
  blobCount?: 2 | 3 | 4;
  style?: CSSProperties;
}

interface BlobPreset {
  color: string;
  size: string;
  duration: string;
  delay: string;
}

const MESH_PRESETS: Record<number, BlobPreset[]> = {
  2: [
    { color: 'rgba(96, 165, 250, 0.08)', size: '600px', duration: '22s', delay: '0s' },
    { color: 'rgba(192, 132, 252, 0.07)', size: '500px', duration: '28s', delay: '-8s' },
  ],
  3: [
    { color: 'rgba(96, 165, 250, 0.06)', size: '700px', duration: '18s', delay: '-3s' },
    { color: 'rgba(245, 158, 11, 0.06)', size: '550px', duration: '25s', delay: '-12s' },
    { color: 'rgba(251, 191, 36, 0.05)', size: '450px', duration: '30s', delay: '-10s' },
  ],
  4: [
    { color: 'rgba(96, 165, 250, 0.05)', size: '800px', duration: '20s', delay: '-5s' },
    { color: 'rgba(245, 158, 11, 0.05)', size: '600px', duration: '26s', delay: '-8s' },
    { color: 'rgba(251, 191, 36, 0.04)', size: '500px', duration: '22s', delay: '-14s' },
    { color: 'rgba(16, 185, 129, 0.04)', size: '350px', duration: '28s', delay: '-18s' },
  ],
};

export const GlassBackground: FC<GlassBackgroundProps> = memo(({
  blobCount = 3,
  style,
}) => {
  const presets = MESH_PRESETS[blobCount] ?? MESH_PRESETS[3];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {presets.map((preset, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: preset.size,
            height: preset.size,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${preset.color} 0%, transparent 70%)`,
            left: i % 2 === 0 ? '0%' : '50%',
            top: i < 2 ? '0%' : '50%',
            animation: `glassFloat ${preset.duration} ease-in-out infinite`,
            animationDelay: preset.delay,
          }}
        />
      ))}
    </div>
  );
});
