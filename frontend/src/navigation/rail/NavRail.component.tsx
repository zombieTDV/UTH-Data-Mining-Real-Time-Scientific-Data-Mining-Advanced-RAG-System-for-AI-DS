import type { FC } from 'react';
import { NAV_RAIL_ITEMS, type NavRailProps } from './NavRail.types';
import { RailIcon } from './RailIcon.component';
import { ThemeToggle } from './ThemeToggle.component';
import { RailLanguageToggle } from './RailLanguageToggle.component';
import { useTranslation } from '../../hooks';

export const NavRail: FC<NavRailProps> = ({ activeTab, theme, onNavigate, onToggleTheme }) => {
  const { t, language } = useTranslation();

  const getTabLabel = (id: string, fallback: string) => {
    switch (id) {
      case 'schematic': return t('nav.schematic') || fallback;
      case 'eda': return t('nav.eda') || fallback;
      case 'pillars': return t('nav.pillars') || fallback;
      case 'rag': return t('nav.rag') || fallback;
      case 'logs': return t('nav.logs') || fallback;
      default: return fallback;
    }
  };

  const getTabTitle = (id: string, fallback: string) => {
    switch (id) {
      case 'schematic': return t('nav.schematicTitle') || fallback;
      case 'eda': return t('nav.edaTitle') || fallback;
      case 'pillars': return t('nav.pillarsTitle') || fallback;
      case 'rag': return t('nav.ragTitle') || fallback;
      case 'logs': return t('nav.logsTitle') || fallback;
      default: return fallback;
    }
  };
  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: '58px',
        height: '100vh',
        backgroundColor: 'var(--bg-rail)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 0',
        zIndex: 50,
        borderRight: '1px solid var(--rail-border)',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      }}
    >
      {/* Top Brand Logo Anchor (Official UTH Brand Icon & Colors, routes to Home/FLOW) */}
      <div
        title={language === 'vi' ? 'Trang chủ - Trường Đại học Giao thông Vận tải TP.HCM (UTH)' : 'Home - Ho Chi Minh City University of Transport (UTH)'}
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #025052 0%, #088486 60%, #0d9ea1 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          boxShadow: '0 4px 14px rgba(8, 132, 134, 0.4)',
          cursor: 'pointer',
          marginBottom: '20px',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
        onClick={() => onNavigate('schematic')}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.06)';
          e.currentTarget.style.boxShadow = '0 6px 18px rgba(8, 132, 134, 0.55)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 14px rgba(8, 132, 134, 0.4)';
        }}
      >
        <span
          style={{
            fontFamily: '"Times New Roman", "Playfair Display", Georgia, serif',
            fontWeight: 900,
            fontSize: '13px',
            letterSpacing: '0.04em',
            color: '#ffffff',
            textShadow: '0 1px 3px rgba(0,0,0,0.4)',
            userSelect: 'none',
          }}
        >
          UTH
        </span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', alignItems: 'center' }}>
        {NAV_RAIL_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              title={getTabTitle(item.id, item.title)}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '9px',
                backgroundColor: isActive ? 'var(--bg-rail-active)' : 'transparent',
                color: isActive ? 'var(--rail-active-text)' : 'var(--text-secondary)',
                border: isActive ? '1px solid var(--border-highlight)' : '1px solid transparent',
                boxShadow: isActive ? '0 2px 8px rgba(0, 0, 0, 0.12)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                gap: '2px',
              }}
            >
              <RailIcon tab={item.id} />
              <span style={{ fontSize: '8.5px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{getTabLabel(item.id, item.label)}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Section with Hover-reveal for Controls and Preserved Account Avatar */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          alignItems: 'center',
          paddingBottom: '12px',
        }}
      >
        {/* Controls container with subtle hover reveal */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: 'center',
            opacity: 0.45,
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.45';
          }}
        >
          <RailLanguageToggle />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        {/* User Account / Profile Slot (Preserved for future authentication & profile features) */}
        <div
          title={language === 'vi' ? 'Tài khoản người dùng (UTH ID)' : 'User Account (UTH ID)'}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #025052 0%, #088486 100%)',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(8, 132, 134, 0.35)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            border: '1.5px solid rgba(255, 255, 255, 0.25)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.08)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(8, 132, 134, 0.55)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(8, 132, 134, 0.35)';
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      </div>
    </aside>
  );
};
