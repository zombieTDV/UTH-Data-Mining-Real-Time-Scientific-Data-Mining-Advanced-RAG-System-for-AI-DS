import type { FC } from 'react';
import { NAV_RAIL_ITEMS, type NavRailProps } from './NavRail.types';
import { RailIcon } from './RailIcon.component';
import { ThemeToggle } from './ThemeToggle.component';
import { LanguageToggle } from './LanguageToggle.component';
import { useTranslation } from '../../hooks';

export const NavRail: FC<NavRailProps> = ({ activeTab, theme, onNavigate, onToggleTheme }) => {
  const { t, language } = useTranslation();

  const getTabLabel = (id: string, fallback: string) => {
    switch (id) {
      case 'schematic': return t('nav.schematic') || fallback;
      case 'explorer': return t('nav.explorer') || fallback;
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
      case 'explorer': return t('nav.explorerTitle') || fallback;
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
      <button
        type="button"
        title={
          language === 'vi'
            ? 'Trường Đại học Giao thông Vận tải TP.HCM (UTH) • Về trang chủ'
            : 'Ho Chi Minh City University of Transport (UTH) • Home'
        }
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '9px',
          background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
          cursor: 'pointer',
          border: 'none',
          padding: 0,
          marginBottom: '20px',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
        onClick={() => onNavigate('schematic')}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.06)';
          e.currentTarget.style.boxShadow = '0 6px 18px rgba(37, 99, 235, 0.45)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 14px rgba(37, 99, 235, 0.35)';
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'scale(0.94)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'scale(1.06)';
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      </button>

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

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        <LanguageToggle />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />

        <div
          title="Trường Đại học Giao thông Vận tải TP.HCM - UTH (Ho Chi Minh City University of Transport)"
          style={{
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(59, 130, 246, 0.4)',
          }}
        >
          UTH
        </div>
      </div>
    </aside>
  );
};
