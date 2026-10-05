import type { FC } from 'react';
import { useThemeStore } from '../../store';
import { useTranslation } from '../../hooks';

export const ThemeToggle: FC = () => {
  const { theme, toggleTheme } = useThemeStore();
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      title={t('nav.toggleTheme')}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-secondary)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        color: 'var(--text-secondary)',
        fontSize: '16px',
        padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
};
