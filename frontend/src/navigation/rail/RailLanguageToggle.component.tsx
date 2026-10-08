import { useState, type FC } from 'react';
import { useTranslation } from '../../hooks';

export const RailLanguageToggle: FC = () => {
  const { language, setLanguage } = useTranslation();
  const [hoveredLang, setHoveredLang] = useState<'vi' | 'en' | null>(null);

  return (
    <div
      role="group"
      aria-label="Language selection"
      title={
        language === 'vi'
          ? 'Ngôn ngữ: Tiếng Việt (Click EN để đổi sang English)'
          : 'Language: English (Click VI to switch to Tiếng Việt)'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px',
        width: '44px',
        height: '24px',
        borderRadius: '7px',
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        boxSizing: 'border-box',
        gap: '2px',
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        onClick={() => setLanguage('vi')}
        onMouseEnter={() => setHoveredLang('vi')}
        onMouseLeave={() => setHoveredLang(null)}
        style={{
          flex: 1,
          height: '18px',
          padding: 0,
          borderRadius: '5px',
          fontSize: '9px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 800,
          border: language === 'vi' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid transparent',
          cursor: 'pointer',
          backgroundColor:
            language === 'vi'
              ? 'rgba(239, 68, 68, 0.22)'
              : hoveredLang === 'vi'
              ? 'rgba(239, 68, 68, 0.1)'
              : 'transparent',
          color: language === 'vi' ? '#ef4444' : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
          boxShadow: language === 'vi' ? '0 1px 3px rgba(239, 68, 68, 0.2)' : 'none',
        }}
      >
        VI
      </button>

      <button
        type="button"
        onClick={() => setLanguage('en')}
        onMouseEnter={() => setHoveredLang('en')}
        onMouseLeave={() => setHoveredLang(null)}
        style={{
          flex: 1,
          height: '18px',
          padding: 0,
          borderRadius: '5px',
          fontSize: '9px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 800,
          border: language === 'en' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
          cursor: 'pointer',
          backgroundColor:
            language === 'en'
              ? 'rgba(59, 130, 246, 0.22)'
              : hoveredLang === 'en'
              ? 'rgba(59, 130, 246, 0.1)'
              : 'transparent',
          color: language === 'en' ? '#3b82f6' : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
          boxShadow: language === 'en' ? '0 1px 3px rgba(59, 130, 246, 0.2)' : 'none',
        }}
      >
        EN
      </button>
    </div>
  );
};
