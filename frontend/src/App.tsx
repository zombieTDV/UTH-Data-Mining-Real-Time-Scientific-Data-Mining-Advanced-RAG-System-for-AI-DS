import { useState, useEffect } from 'react';
import { InteractiveWorkflowCanvas } from './components/InteractiveWorkflowCanvas';
import { EdaView } from './components/EdaView';
import { MiningPillarsView } from './components/MiningPillarsView';
import { GroundedRagChat } from './components/GroundedRagChat';
import { fetchHealth, subscribeTelemetry, triggerMiningPipeline } from './api/client';

export type AppTab = 'schematic' | 'eda' | 'pillars' | 'rag';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('schematic');
  const [pipelineStatus, setPipelineStatus] = useState<'IDLE' | 'RUNNING' | 'COMPLETED'>('IDLE');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  const [backendStatus, setBackendStatus] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const [lastTelemetryTick, setLastTelemetryTick] = useState<string>('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('uth-theme', theme);
  }, [theme]);

  // Check health and subscribe to SSE telemetry
  useEffect(() => {
    fetchHealth()
      .then(() => setBackendStatus('ONLINE'))
      .catch(() => setBackendStatus('OFFLINE'));

    const unsubscribe = subscribeTelemetry(
      (data) => {
        setBackendStatus('ONLINE');
        if (data?.timestamp) {
          setLastTelemetryTick(data.timestamp.split('T')[1]?.split('.')[0] || '');
        }
      },
      () => setBackendStatus('OFFLINE')
    );

    return () => unsubscribe();
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleTriggerPipeline = async () => {
    try {
      setPipelineStatus('RUNNING');
      await triggerMiningPipeline();
      setTimeout(() => {
        setPipelineStatus('COMPLETED');
        setTimeout(() => setPipelineStatus('IDLE'), 6000);
      }, 5000);
    } catch {
      setPipelineStatus('IDLE');
    }
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', backgroundColor: 'transparent', position: 'relative', overflow: 'hidden' }}>
      {/* ============================================================== */}
      {/* 1. ONLY LEFTMOST SLEEK DARK VERTICAL RAIL (Fixed, Never Drifts) */}
      {/* ============================================================== */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '58px',
          height: '100vh',
          backgroundColor: '#16161a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0',
          zIndex: 60,
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Brand Orange Squircle Badge */}
        <div
          title="UTH-AI Scientific Mining Lakehouse"
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
            marginBottom: '24px',
          }}
          onClick={() => setActiveTab('schematic')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="5" width="5" height="5" rx="1.5" />
            <rect x="14" y="5" width="5" height="5" rx="1.5" />
            <rect x="5" y="14" width="5" height="5" rx="1.5" />
            <rect x="14" y="14" width="5" height="5" rx="1.5" />
          </svg>
        </div>

        {/* Vertical Nav Navigation */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', alignItems: 'center' }}>
          {/* Pipeline Flow */}
          <button
            type="button"
            onClick={() => setActiveTab('schematic')}
            title="Interactive Pipeline Visualizer"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '9px',
              backgroundColor: activeTab === 'schematic' ? 'rgba(255, 255, 255, 0.16)' : 'transparent',
              color: activeTab === 'schematic' ? '#ffffff' : '#94a3b8',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <rect x="3" y="17" width="6" height="4" rx="1" />
              <rect x="15" y="17" width="6" height="4" rx="1" />
              <path d="M12 7v4" />
              <path d="M6 17v-3a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3" />
            </svg>
          </button>

          {/* Real-Time DuckDB EDA Dashboard (PowerBI Style) */}
          <button
            type="button"
            onClick={() => setActiveTab('eda')}
            title="EDA Analytics Dashboard (PowerBI Style)"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '9px',
              backgroundColor: activeTab === 'eda' ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
              color: activeTab === 'eda' ? '#ffffff' : '#94a3b8',
              border: activeTab === 'eda' ? '1px solid rgba(255, 255, 255, 0.25)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              gap: '2px',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span style={{ fontSize: '9px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>EDA</span>
          </button>

          {/* 4 Mining Pillars - Data Modeling */}
          <button
            type="button"
            onClick={() => setActiveTab('pillars')}
            title="4 Trụ cột Khai phá & Modeling Dữ liệu (4 Mining Pillars)"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '9px',
              backgroundColor: activeTab === 'pillars' ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
              color: activeTab === 'pillars' ? '#ffffff' : '#94a3b8',
              border: activeTab === 'pillars' ? '1px solid rgba(255, 255, 255, 0.25)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              gap: '2px',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span style={{ fontSize: '9px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>MODEL</span>
          </button>

          {/* Grounded RAG Chat (Right after MODEL) */}
          <button
            type="button"
            onClick={() => setActiveTab('rag')}
            title="Grounded Scientific RAG Chat"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '9px',
              backgroundColor: activeTab === 'rag' ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
              color: activeTab === 'rag' ? '#ffffff' : '#94a3b8',
              border: activeTab === 'rag' ? '1px solid rgba(255, 255, 255, 0.25)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              gap: '2px',
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span style={{ fontSize: '9px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>RAG</span>
          </button>
        </nav>

        {/* Bottom Rail: Theme toggle & Avatar */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {theme === 'dark' ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <div
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
            QM
          </div>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* 2. MAIN CONTAINER: STREAMLINED HEADER + DOTTED WORKSPACE */}
      {/* ============================================================== */}
      <div
        style={{
          marginLeft: '58px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        {/* Minimal Streamlined Header Bar */}
        <header
          style={{
            height: '52px',
            flexShrink: 0,
            backgroundColor: theme === 'dark' ? 'rgba(14, 20, 34, 0.92)' : 'rgba(255, 255, 255, 0.88)',
            backdropFilter: 'blur(8px)',
            borderBottom: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 30,
          }}
        >
          {/* Left: Minimal Title & Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em', color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}>
              UTH SCIENTIFIC LAKEHOUSE & MINING PIPELINE
            </span>

            <span
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: backendStatus === 'ONLINE' ? '#10b981' : '#ef4444',
                backgroundColor: backendStatus === 'ONLINE' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                padding: '2px 7px',
                borderRadius: '5px',
                fontWeight: 800,
              }}
            >
              ● FASTAPI {backendStatus} {lastTelemetryTick ? `[${lastTelemetryTick}]` : ''}
            </span>
          </div>

          {/* Center: Fixed Lakehouse Standby & Live Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
              padding: '6px 18px',
              borderRadius: '9999px',
              border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0'}`,
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: pipelineStatus === 'RUNNING' ? '#ea580c' : '#10b981',
                boxShadow: pipelineStatus === 'RUNNING' ? '0 0 8px #ea580c' : 'none',
                animation: pipelineStatus === 'RUNNING' ? 'stageGlowOrange 1.5s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: '12px', fontWeight: 600, color: theme === 'dark' ? '#cbd5e1' : '#334155' }}>
              {pipelineStatus === 'RUNNING'
                ? 'Pipeline Active: Ingesting papers, DuckDB parsing & LanceDB indexing...'
                : 'Lakehouse Standby: 10,000 papers, 2.22M formulas, 143k LanceDB vectors synced.'}
            </span>
          </div>

          {/* Right: Storage & Run Pipeline Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: '#64748b' }}>R2 LAKE:</span>
              <span style={{ fontWeight: 800, color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}>5.688 GB</span>
              <span style={{ backgroundColor: '#ecfdf5', color: '#059669', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                56.9%
              </span>
            </div>

            <button
              type="button"
              onClick={handleTriggerPipeline}
              disabled={pipelineStatus === 'RUNNING'}
              style={{
                backgroundColor: pipelineStatus === 'RUNNING' ? '#ea580c' : '#ff5722',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                cursor: pipelineStatus === 'RUNNING' ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(255, 87, 34, 0.35)',
                opacity: pipelineStatus === 'RUNNING' ? 0.85 : 1,
              }}
            >
              {pipelineStatus === 'RUNNING' ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                  </svg>
                  <span>RUNNING PIPELINE...</span>
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>RUN PIPELINE</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Workspace Body over the Dotted Grid Canvas */}
        <main
          style={{
            flex: 1,
            overflowY: activeTab === 'schematic' ? 'hidden' : 'auto',
            overflowX: 'hidden',
            padding: activeTab === 'schematic' ? '20px 24px' : '28px 36px',
            backgroundColor: 'transparent',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {activeTab === 'schematic' && (
            <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column' }}>
              <InteractiveWorkflowCanvas
                onNavigateTab={(tab) => setActiveTab(tab)}
                isPipelineRunning={pipelineStatus === 'RUNNING'}
                onTriggerPipeline={handleTriggerPipeline}
              />
            </div>
          )}

          {activeTab === 'eda' && (
            <div style={{ maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
              <EdaView />
            </div>
          )}

          {activeTab === 'pillars' && (
            <div style={{ maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
              <MiningPillarsView />
            </div>
          )}

          {activeTab === 'rag' && (
            <div style={{ maxWidth: '1440px', width: '100%', margin: '0 auto', height: '100%' }}>
              <GroundedRagChat />
            </div>
          )}
        </main>

        {/* Clean Engineering Status Bar */}
        <footer
          style={{
            height: '32px',
            flexShrink: 0,
            backgroundColor: theme === 'dark' ? 'rgba(14, 20, 34, 0.92)' : 'rgba(255, 255, 255, 0.85)',
            borderTop: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: theme === 'dark' ? '#94a3b8' : '#64748b',
          }}
        >
          <div>
            <span>UNIVERSITY OF TRANSPORT AND COMMUNICATIONS // REAL-TIME SCIENTIFIC DATA MINING LAKEHOUSE</span>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>10,000 PAPERS</span>
            <span>&bull;</span>
            <span>143,523 VECTORS</span>
            <span>&bull;</span>
            <span>2.22M FORMULAS</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
