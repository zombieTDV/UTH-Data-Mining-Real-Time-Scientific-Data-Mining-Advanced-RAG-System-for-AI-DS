import { useState, type FC } from 'react';
import { useTranslation } from '../../hooks';

export const LanguageToggle: FC = () => {
  const { language, setLanguage } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  const toggleLanguage = () => {
    setLanguage(language === 'vi' ? 'en' : 'vi');
  };

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={
        language === 'vi'
          ? 'Đang dùng Tiếng Việt · Bấm để đổi sang English'
          : 'Using English · Click to switch to Tiếng Việt'
      }
      style={{
        width: '34px',
        height: '34px',
        borderRadius: '8px',
        background: isHovered ? 'var(--bg-elevated)' : 'transparent',
        border: '1px solid ' + (isHovered ? 'var(--border-highlight)' : 'transparent'),
        color: language === 'vi' ? '#ef4444' : '#3b82f6',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        padding: '0',
        gap: '1px',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.9 }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <span
        style={{
          fontSize: '8px',
          fontWeight: 900,
          fontFamily: 'var(--font-mono)',
          lineHeight: 1,
          letterSpacing: '0.04em',
        }}
      >
        {language.toUpperCase()}
      </span>
    </button>
  );
};
