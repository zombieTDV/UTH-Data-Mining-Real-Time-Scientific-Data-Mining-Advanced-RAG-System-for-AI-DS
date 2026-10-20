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
          ? 'Đang dùng Tiếng Việt 🇻🇳 · Bấm để đổi sang English 🇬🇧'
          : 'Using English 🇬🇧 · Click to switch to Tiếng Việt 🇻🇳'
      }
      aria-label="Toggle language"
      style={{
        width: '34px',
        height: '34px',
        borderRadius: '8px',
        background: isHovered ? 'var(--bg-elevated)' : 'transparent',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isHovered ? 'scale(1.08)' : 'scale(1)',
        padding: 0,
      }}
    >
      {language === 'vi' ? (
        /* Vietnam Flag Roundel */
        <svg
          width="20"
          height="20"
          viewBox="0 0 32 32"
          style={{
            borderRadius: '50%',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.25)',
            display: 'block',
          }}
        >
          <clipPath id="vn-flag-clip">
            <circle cx="16" cy="16" r="16" />
          </clipPath>
          <g clipPath="url(#vn-flag-clip)">
            <rect width="32" height="32" fill="#da251d" />
            <polygon
              points="16,6.5 18.2,12.9 25,13.1 19.6,17.2 21.6,23.7 16,19.8 10.4,23.7 12.4,17.2 7,13.1 13.8,12.9"
              fill="#ffeb3b"
            />
          </g>
        </svg>
      ) : (
        /* UK Union Jack Roundel */
        <svg
          width="20"
          height="20"
          viewBox="0 0 32 32"
          style={{
            borderRadius: '50%',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.25)',
            display: 'block',
          }}
        >
          <clipPath id="uk-flag-clip">
            <circle cx="16" cy="16" r="16" />
          </clipPath>
          <g clipPath="url(#uk-flag-clip)">
            <rect width="32" height="32" fill="#012169" />
            <path d="M0,0 L32,32 M32,0 L0,32" stroke="#ffffff" strokeWidth="4.6" />
            <path d="M0,0 L32,32 M32,0 L0,32" stroke="#c8102e" strokeWidth="2.4" />
            <path d="M16,0 V32 M0,16 H32" stroke="#ffffff" strokeWidth="7" />
            <path d="M16,0 V32 M0,16 H32" stroke="#c8102e" strokeWidth="4.2" />
          </g>
        </svg>
      )}
    </button>
  );
};
