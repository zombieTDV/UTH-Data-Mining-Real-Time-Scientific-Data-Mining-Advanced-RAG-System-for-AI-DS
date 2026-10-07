import type { CSSProperties, FC } from 'react';
import { useAnimatedNumber } from '../../hooks';

export interface AnimatedCounterProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  formatter?: (val: number) => string;
  formatWithCommas?: boolean;
  showTrendGlow?: boolean;
  showTrendArrow?: boolean;
  animateOnMount?: boolean;
  initialValue?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * AnimatedCounter component renders a number that smoothly interpolates
 * towards new target values via requestAnimationFrame and easeOutExpo easing.
 * Flashes high-visibility cyberpunk/emerald or ruby glow pulse highlights on value shifts.
 */
export const AnimatedCounter: FC<AnimatedCounterProps> = ({
  value,
  duration = 800,
  decimals = 0,
  prefix = '',
  suffix = '',
  formatter,
  formatWithCommas = true,
  showTrendGlow = true,
  showTrendArrow = false,
  animateOnMount = true,
  initialValue = 0,
  className,
  style,
}) => {
  const safeValue = typeof value === 'number' && !Number.isNaN(value) ? value : 0;

  const { currentValue, trend } = useAnimatedNumber(safeValue, {
    duration,
    decimals,
    animateOnMount,
    initialValue,
  });

  let formattedNumber: string;
  if (formatter) {
    formattedNumber = formatter(currentValue);
  } else if (decimals > 0) {
    const fixed = currentValue.toFixed(decimals);
    if (formatWithCommas) {
      const parts = fixed.split('.');
      const intPart = Number(parts[0]).toLocaleString('en-US');
      formattedNumber = `${prefix}${intPart}.${parts[1]}${suffix}`;
    } else {
      formattedNumber = `${prefix}${fixed}${suffix}`;
    }
  } else {
    const rounded = Math.round(currentValue);
    const formatted = formatWithCommas ? rounded.toLocaleString('en-US') : String(rounded);
    formattedNumber = `${prefix}${formatted}${suffix}`;
  }

  const isUp = trend === 'up';
  const isDown = trend === 'down';

  const glowStyle: CSSProperties = showTrendGlow && trend !== 'idle' ? {
    color: isUp ? '#10b981' : isDown ? '#ef4444' : 'inherit',
    textShadow: isUp
      ? '0 0 10px rgba(16, 185, 129, 0.7), 0 0 18px rgba(16, 185, 129, 0.35)'
      : isDown
      ? '0 0 10px rgba(239, 68, 68, 0.7), 0 0 18px rgba(239, 68, 68, 0.35)'
      : 'none',
    transform: isUp ? 'translateY(-0.5px)' : isDown ? 'translateY(0.5px)' : 'none',
  } : {};

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        fontVariantNumeric: 'tabular-nums',
        transition: 'color 0.4s ease, text-shadow 0.45s ease, transform 0.25s ease',
        ...style,
        ...glowStyle,
      }}
    >
      <span>{formattedNumber}</span>
      {showTrendArrow && trend !== 'idle' && (
        <span
          style={{
            fontSize: '0.7em',
            fontWeight: 800,
            lineHeight: 1,
            color: isUp ? '#10b981' : '#ef4444',
            animation: 'fadeInTheater 0.15s ease-out',
            marginLeft: '2px',
          }}
        >
          {isUp ? '▲' : '▼'}
        </span>
      )}
    </span>
  );
};
