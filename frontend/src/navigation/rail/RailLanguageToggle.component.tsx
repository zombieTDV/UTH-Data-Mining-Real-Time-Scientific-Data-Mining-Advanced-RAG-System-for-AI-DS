import { useState, type FC } from 'react';
import { useTranslation } from '../../hooks';

export const RailLanguageToggle: FC = () => {
  const { language, toggleLanguage } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isActive, setIsActive] = useState(false);

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsActive(false);
      }}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
      title={
        language === 'vi'
          ? 'Ngôn ngữ: Tiếng Việt (Nhấn để chuyển sang English)'
          : 'Language: English (Click to switch to Tiếng Việt)'
      }
      style={{
        width: '34px',
        height: '34px',
        borderRadius: '8px',
        background: isHovered
          ? language === 'vi'
            ? 'rgba(239, 68, 68, 0.14)'
            : 'rgba(59, 130, 246, 0.14)'
          : 'transparent',
        border: isHovered
          ? language === 'vi'
            ? '1px solid rgba(239, 68, 68, 0.35)'
            : '1px solid rgba(59, 130, 246, 0.35)'
          : '1px solid transparent',
        color: language === 'vi' ? '#ef4444' : '#3b82f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        transform: isActive ? 'scale(0.92)' : isHovered ? 'scale(1.05)' : 'none',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 800,
        letterSpacing: '0.04em',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
    >
      {language.toUpperCase()}
    </button>
  );
};
