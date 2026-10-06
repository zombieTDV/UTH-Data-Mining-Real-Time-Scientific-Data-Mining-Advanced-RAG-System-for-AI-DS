import type { FC } from 'react';
import { useTranslation } from '../../hooks';

export const LanguageToggle: FC = () => {
  const { language, setLanguage } = useTranslation();

  return (
    <div
      role="group"
      aria-label="Language selection"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px',
        borderRadius: '7px',
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        gap: '2px',
      }}
    >
      <button
        type="button"
        onClick={() => setLanguage('vi')}
        style={{
          padding: '3px 8px',
          borderRadius: '5px',
          fontSize: '10.5px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 800,
          border: 'none',
          cursor: 'pointer',
          backgroundColor: language === 'vi' ? 'rgba(239, 68, 68, 0.16)' : 'transparent',
          color: language === 'vi' ? '#ef4444' : 'var(--text-muted)',
          transition: 'all 0.15s ease',
        }}
        title="Tiếng Việt (Vietnamese)"
      >
        VI
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        style={{
          padding: '3px 8px',
          borderRadius: '5px',
          fontSize: '10.5px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 800,
          border: 'none',
          cursor: 'pointer',
          backgroundColor: language === 'en' ? 'rgba(59, 130, 246, 0.16)' : 'transparent',
          color: language === 'en' ? '#3b82f6' : 'var(--text-muted)',
          transition: 'all 0.15s ease',
        }}
        title="English"
      >
        EN
      </button>
    </div>
  );
};
