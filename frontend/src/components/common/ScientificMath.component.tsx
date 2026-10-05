import { type FC, useMemo, useState, type MouseEvent } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface ScientificMathProps {
  math: string;
  block?: boolean;
  className?: string;
  theme?: 'dark' | 'light';
}

export const ScientificMath: FC<ScientificMathProps> = ({
  math,
  block = false,
  className = '',
  theme = 'dark',
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const isDark = theme === 'dark';

  const html = useMemo(() => {
    try {
      return katex.renderToString(math.trim(), {
        displayMode: block,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return math;
    }
  }, [math, block]);

  const handleCopy = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    navigator.clipboard.writeText(math);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (block) {
    return (
      <div
        className={`scientific-math-block ${className}`}
        style={{
          position: 'relative',
          margin: '12px 0',
          padding: '12px 18px',
          borderRadius: '8px',
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.75)' : '#f8fafc',
          border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.25)' : '#cbd5e1'}`,
          color: isDark ? '#7dd3fc' : '#0369a1',
          overflowX: 'auto',
          textAlign: 'center',
          boxShadow: isDark ? '0 2px 10px rgba(0, 0, 0, 0.3)' : '0 1px 4px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div dangerouslySetInnerHTML={{ __html: html }} />
        <button
          type="button"
          onClick={handleCopy}
          title="Copy LaTeX source"
          style={{
            position: 'absolute',
            top: '6px',
            right: '8px',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.5)' : '#e2e8f0',
            color: isDark ? '#94a3b8' : '#475569',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#cbd5e1'}`,
            cursor: 'pointer',
            opacity: 0.8,
            transition: 'opacity 0.15s ease',
          }}
        >
          {copied ? 'Copied' : 'TeX'}
        </button>
      </div>
    );
  }

  return (
    <span
      className={`scientific-math-inline ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'baseline',
        margin: '0 2px',
        padding: '0 3px',
        borderRadius: '3px',
        backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.06)',
        color: isDark ? '#38bdf8' : '#0369a1',
        fontSize: '0.98em',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
