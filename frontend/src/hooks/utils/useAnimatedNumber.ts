import { useEffect, useRef, useState } from 'react';

export interface UseAnimatedNumberOptions {
  duration?: number;
  decimals?: number;
  animateOnMount?: boolean;
  initialValue?: number;
}

export type TrendDirection = 'up' | 'down' | 'idle';

export interface UseAnimatedNumberReturn {
  currentValue: number;
  trend: TrendDirection;
  isAnimating: boolean;
}

/**
 * High-performance hook for animating number transitions with Ease-Out Expo easing.
 * Detects increments vs decrements to trigger directional pulse glow effects.
 */
export function useAnimatedNumber(
  targetValue: number,
  options: UseAnimatedNumberOptions = {}
): UseAnimatedNumberReturn {
  const {
    duration = 800,
    animateOnMount = true,
    initialValue = 0,
  } = options;

  const [currentValue, setCurrentValue] = useState<number>(() => {
    return animateOnMount ? initialValue : targetValue;
  });
  const [trend, setTrend] = useState<TrendDirection>('idle');
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const prevTargetRef = useRef<number>(animateOnMount ? initialValue : targetValue);
  const currentValRef = useRef<number>(currentValue);
  currentValRef.current = currentValue;

  const rafRef = useRef<number | null>(null);
  const trendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prevTarget = prevTargetRef.current;
    if (prevTarget === targetValue && !animateOnMount) {
      return;
    }

    const direction: TrendDirection =
      targetValue > prevTarget ? 'up' : targetValue < prevTarget ? 'down' : 'idle';

    if (direction !== 'idle') {
      setTrend(direction);
    }
    setIsAnimating(true);

    if (trendTimeoutRef.current) {
      clearTimeout(trendTimeoutRef.current);
    }

    const startVal = currentValRef.current;
    const diff = targetValue - startVal;

    if (Math.abs(diff) < 0.000001 || duration <= 0) {
      setCurrentValue(targetValue);
      setIsAnimating(false);
      prevTargetRef.current = targetValue;
      trendTimeoutRef.current = setTimeout(() => {
        setTrend('idle');
      }, 500);
      return;
    }

    const startTime = performance.now();

    // Ease-Out Expo: Rapid explosion out of the gate, gliding to a silky smooth landing
    const easeOutExpo = (t: number): number => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / duration));
      const eased = easeOutExpo(progress);
      const nextVal = startVal + diff * eased;

      if (progress < 1) {
        setCurrentValue(nextVal);
        rafRef.current = requestAnimationFrame(step);
      } else {
        setCurrentValue(targetValue);
        setIsAnimating(false);
        prevTargetRef.current = targetValue;
        // Keep trend direction active briefly for post-landing glow
        trendTimeoutRef.current = setTimeout(() => {
          setTrend('idle');
        }, 650);
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [targetValue, duration, animateOnMount]);

  useEffect(() => {
    return () => {
      if (trendTimeoutRef.current) {
        clearTimeout(trendTimeoutRef.current);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { currentValue, trend, isAnimating };
}
