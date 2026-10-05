import { useCallback, useRef, type RefObject } from 'react';

export interface UseTilt3DOptions {
  maxTilt?: number;
  glareAngle?: number;
  glareOpacity?: number;
  glareBorderRadius?: string;
  resetOnLeave?: boolean;
}

export interface UseTilt3DReturn {
  containerProps: {
    ref: RefObject<HTMLDivElement | null>;
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
    onMouseLeave: () => void;
  };
  style: {
    '--tilt-rx': string;
    '--tilt-ry': string;
  };
}

export function useTilt3D(options: UseTilt3DOptions = {}): UseTilt3DReturn {
  const { maxTilt = 8, resetOnLeave = true } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      const rx = (-y * maxTilt).toFixed(3);
      const ry = (x * maxTilt).toFixed(3);
      el.style.setProperty('--tilt-rx', `${rx}deg`);
      el.style.setProperty('--tilt-ry', `${ry}deg`);
    });
  }, [maxTilt]);

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (resetOnLeave) {
      const el = containerRef.current;
      if (el) {
        el.style.setProperty('--tilt-rx', '0deg');
        el.style.setProperty('--tilt-ry', '0deg');
      }
    }
  }, [resetOnLeave]);

  return {
    containerProps: {
      ref: containerRef,
      onMouseMove: handleMouseMove,
      onMouseLeave: handleMouseLeave,
    },
    style: {
      '--tilt-rx': '0deg',
      '--tilt-ry': '0deg',
    },
  };
}
