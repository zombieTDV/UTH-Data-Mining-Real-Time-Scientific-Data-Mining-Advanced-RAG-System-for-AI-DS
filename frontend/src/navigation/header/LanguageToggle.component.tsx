import type { FC } from 'react';
import { useTranslation } from '../../hooks';

export const LanguageToggle: FC = () => {
  const { language, toggleLanguage, t } = useTranslation();

  return (
    <button
      onClick={toggleLanguage}
      title={t('nav.switchLanguage')}
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
        fontSize: '12px',
        fontWeight: 700,
        padding: 0,
        letterSpacing: '0.02em',
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
      {language === 'en' ? 'VI' : 'EN'}
    </button>
  );
};
