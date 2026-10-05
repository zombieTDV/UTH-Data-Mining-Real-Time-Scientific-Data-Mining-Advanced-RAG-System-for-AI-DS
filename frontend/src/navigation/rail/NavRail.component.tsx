import type { FC } from 'react';
import { NAV_RAIL_ITEMS, type NavRailProps } from './NavRail.types';
import { RailIcon } from './RailIcon.component';
import { ThemeToggle } from './ThemeToggle.component';

export const NavRail: FC<NavRailProps> = ({ activeTab, theme, onNavigate, onToggleTheme }) => {
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
      <div
        title="UTH Scientific Data Mining Lakehouse"
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '9px',
          backgroundColor: '#ff5722',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          boxShadow: '0 4px 12px rgba(255, 87, 34, 0.4)',
          cursor: 'pointer',
          marginBottom: '20px',
        }}
        onClick={() => onNavigate('schematic')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <rect x="5" y="5" width="5" height="5" rx="1.5" />
          <rect x="14" y="5" width="5" height="5" rx="1.5" />
          <rect x="5" y="14" width="5" height="5" rx="1.5" />
          <rect x="14" y="14" width="5" height="5" rx="1.5" />
        </svg>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', alignItems: 'center' }}>
        {NAV_RAIL_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              title={item.title}
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
              <span style={{ fontSize: '8.5px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />

        <div
          title="University of Transport and Communications (UTH)"
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
