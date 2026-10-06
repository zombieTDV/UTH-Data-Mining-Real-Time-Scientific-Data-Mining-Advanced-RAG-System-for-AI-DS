import type { FC } from 'react';
import { useTranslation } from '../../hooks';

export const LanguageToggle: FC = () => {
  const { language, toggleLanguage } = useTranslation();

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      title={language === 'vi' ? 'Chuyển sang Tiếng Anh (Switch to English)' : 'Chuyển sang Tiếng Việt (Switch to Vietnamese)'}
      style={{
        width: '32px',
        height: '24px',
        borderRadius: '6px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        color: language === 'vi' ? '#ef4444' : '#3b82f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 800,
        letterSpacing: '0.04em',
        transition: 'all 0.15s ease',
      }}
    >
      {language.toUpperCase()}
    </button>
  );
};
