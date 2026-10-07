import { memo, type FC, type ReactNode, type CSSProperties } from 'react';
import { useTilt3D } from '../../hooks/utils/useTilt3D';

export type GlassVariant = 'subtle' | 'default' | 'elevated' | 'overlay';
export type GlassDepth = 1 | 2 | 3 | 4;
export type GlassAnimation = 'enter' | 'float' | 'sheen' | 'pulse';

export interface GlassCardProps {
  variant?: GlassVariant;
  depth?: GlassDepth;
  tilt?: boolean;
  float?: boolean;
  animation?: GlassAnimation;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  glow?: string;
  glowAccent?: 'silver' | 'bronze' | 'gold' | 'emerald' | 'violet';
  staggerIndex?: number;
}

const GLASS_CLASS: Record<GlassVariant, string> = {
  subtle: 'glass glass--subtle',
  default: 'glass',
  elevated: 'glass glass--elevated',
  overlay: 'glass glass--overlay',
};

const DEPTH_CLASS: Record<GlassDepth, string> = {
  1: 'depth-1',
  2: 'depth-2',
  3: 'depth-3',
  4: 'depth-4',
};

const GLOW_CLASS: Record<string, string> = {
  silver: 'depth-glow-silver',
  bronze: 'depth-glow-bronze',
  gold: 'depth-glow-gold',
  emerald: 'depth-glow-emerald',
  violet: 'depth-glow-violet',
};

const ANIM_CLASS: Record<GlassAnimation, string> = {
  enter: 'anim-enter',
  float: 'anim-float',
  sheen: 'anim-sheen',
  pulse: 'anim-pulse',
};

export const GlassCard: FC<GlassCardProps> = memo(({
  variant = 'default',
  depth = 2,
  tilt = false,
  float = false,
  animation,
  className = '',
  style,
  children,
  glow,
  glowAccent,
  staggerIndex,
}) => {
  const tilt3d = useTilt3D();

  const baseClass = GLASS_CLASS[variant];
  const depthClass = DEPTH_CLASS[depth];
  const tiltClass = tilt ? 'tilt-3d tilt-3d--interactive tilt-3d--far tilt-3d--active tilt-3d--rest' : '';
  const animClass = animation ? ANIM_CLASS[animation] : '';
  const glowClass = glowAccent ? GLOW_CLASS[glowAccent] : '';

  const staggerDelay = staggerIndex !== undefined
    ? { animationDelay: `${staggerIndex * 60}ms` }
    : {};

  const classes = [baseClass, depthClass, tiltClass, animClass, glowClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      {...(tilt ? tilt3d.containerProps : {})}
      className={classes}
      style={{ ...style, ...staggerDelay, ...(tilt ? tilt3d.style : {}) }}
    >
      {glow && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '80px',
            height: '80px',
            background: `radial-gradient(circle at top right, ${glow}, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
      )}
      {float && (
        <div
          className="anim-float"
          style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none' }}
        />
      )}
      {children}
    </div>
  );
});
