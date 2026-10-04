import { useState, useEffect } from 'react';
import { InteractiveWorkflowCanvas } from './components/InteractiveWorkflowCanvas';
import { EdaView } from './components/EdaView';
import { MiningPillarsView } from './components/MiningPillarsView';
import { GroundedRagChat } from './components/GroundedRagChat';
import { MetricsBento } from './components/MetricsBento';
import { GeometricTelemetryGauges } from './components/GeometricTelemetryGauges';
import { StorageInspector } from './components/StorageInspector';
import { LiveTelemetryFeed } from './components/LiveTelemetryFeed';
import { ToolLogos } from './components/ToolLogos';
import {
  fetchHealth,
  subscribeTelemetry,
  subscribeIngestionStream,
  triggerMiningPipeline,
  fetchStorageStats,
} from './api/client';

export type AppTab = 'schematic' | 'eda' | 'pillars' | 'rag' | 'logs';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('schematic');
  const [schematicViewMode, setSchematicViewMode] = useState<'canvas' | 'storage'>('canvas');
  const [pipelineStatus, setPipelineStatus] = useState<'IDLE' | 'RUNNING' | 'COMPLETED'>('IDLE');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  const [backendStatus, setBackendStatus] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const [lastTelemetryTick, setLastTelemetryTick] = useState<string>('');

  // Real-time Streaming State for Lakehouse Counter
  const [totalPapers, setTotalPapers] = useState<number>(10000);
  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [streamSpeed, setStreamSpeed] = useState<number>(0);

  // Cloudflare R2 Storage stats
  const [storageUsedGb, setStorageUsedGb] = useState<number>(5.524);
  const [storageUsedPct, setStorageUsedPct] = useState<number>(55.2);

  const [ragInitialQuery, setRagInitialQuery] = useState<string>('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('uth-theme', theme);
  }, [theme]);

  // Check health, load storage stats, and subscribe to SSE telemetry
  useEffect(() => {
    fetchHealth()
      .then(() => setBackendStatus('ONLINE'))
      .catch(() => setBackendStatus('OFFLINE'));

    fetchStorageStats()
      .then((data) => {
        if (data?.total_size_gb) setStorageUsedGb(data.total_size_gb);
        if (data?.used_percentage) setStorageUsedPct(data.used_percentage);
      })
      .catch(() => {});

    const unsubscribe = subscribeTelemetry(
      (data) => {
        setBackendStatus('ONLINE');
        if (data?.timestamp) {
          setLastTelemetryTick(data.timestamp.split('T')[1]?.split('.')[0] || '');
        }
      },
      () => setBackendStatus('OFFLINE')
    );

    const unsubStream = subscribeIngestionStream((event) => {
      if (event.type === 'PAPER_INGESTED') {
        setStreamActive(true);
        setTotalPapers(event.total_corpus || 10000);
        setStreamSpeed(event.speed_ppm || 0);
      } else if (event.type === 'HEARTBEAT' || event.type === 'CONNECTION_ESTABLISHED') {
        if (event.status === 'STREAMING') {
          setStreamActive(true);
          setTotalPapers(event.total_corpus || 10000);
          setStreamSpeed(event.speed_ppm || 0);
        } else if (event.status === 'PAUSED' || event.status === 'COMPLETED') {
          setStreamActive(false);
        }
      }
    });

    return () => {
      unsubscribe();
      unsubStream();
    };
  }, []);

  // Global Keyboard Shortcuts (1-5 for tabs, T for theme)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === '1') setActiveTab('schematic');
      else if (e.key === '2') setActiveTab('eda');
      else if (e.key === '3') setActiveTab('pillars');
      else if (e.key === '4') setActiveTab('rag');
      else if (e.key === '5') setActiveTab('logs');
      else if (e.key === 't' || e.key === 'T') {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
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
      {/* 1. LEFTMOST SLEEK VERTICAL MISSION CONTROL RAIL (Fixed) */}
      {/* ============================================================== */}
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
          zIndex: 60,
          borderRight: '1px solid var(--rail-border)',
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
        }}
      >
        {/* Brand Orange Squircle Badge */}
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
          onClick={() => setActiveTab('schematic')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="5" width="5" height="5" rx="1.5" />
            <rect x="14" y="5" width="5" height="5" rx="1.5" />
            <rect x="5" y="14" width="5" height="5" rx="1.5" />
            <rect x="14" y="14" width="5" height="5" rx="1.5" />
          </svg>
        </div>

        {/* Vertical Navigation 5 Tabs */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', alignItems: 'center' }}>
          {/* Tab 01: Schematic & Storage */}
          <button
            type="button"
            onClick={() => setActiveTab('schematic')}
            title="[1] Lakehouse Schematic & Storage"
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '9px',
              backgroundColor: activeTab === 'schematic' ? 'var(--bg-rail-active)' : 'transparent',
              color: activeTab === 'schematic' ? 'var(--rail-active-text)' : (theme === 'dark' ? '#94a3b8' : '#64748b'),
              border: activeTab === 'schematic' ? (theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid #bfdbfe') : 'none',
              boxShadow: activeTab === 'schematic' && theme === 'light' ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              gap: '2px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <rect x="3" y="17" width="6" height="4" rx="1" />
              <rect x="15" y="17" width="6" height="4" rx="1" />
              <path d="M12 7v4" />
              <path d="M6 17v-3a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3" />
            </svg>
            <span style={{ fontSize: '8.5px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>FLOW</span>
          </button>

          {/* Tab 02: Real-Time DuckDB EDA */}
          <button
            type="button"
            onClick={() => setActiveTab('eda')}
            title="[2] Real-Time Scientific EDA (DuckDB)"
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '9px',
              backgroundColor: activeTab === 'eda' ? 'var(--bg-rail-active)' : 'transparent',
              color: activeTab === 'eda' ? 'var(--rail-active-text)' : (theme === 'dark' ? '#94a3b8' : '#64748b'),
              border: activeTab === 'eda' ? (theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid #bfdbfe') : 'none',
              boxShadow: activeTab === 'eda' && theme === 'light' ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              gap: '2px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span style={{ fontSize: '8.5px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>EDA</span>
          </button>

          {/* Tab 03: 4 Mining Pillars */}
          <button
            type="button"
            onClick={() => setActiveTab('pillars')}
            title="[3] 4 Trụ Cột Khai Phá Dữ Liệu (4 Mining Pillars)"
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '9px',
              backgroundColor: activeTab === 'pillars' ? 'var(--bg-rail-active)' : 'transparent',
              color: activeTab === 'pillars' ? 'var(--rail-active-text)' : (theme === 'dark' ? '#94a3b8' : '#64748b'),
              border: activeTab === 'pillars' ? (theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid #bfdbfe') : 'none',
              boxShadow: activeTab === 'pillars' && theme === 'light' ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              gap: '2px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span style={{ fontSize: '8.5px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>MODEL</span>
          </button>

          {/* Tab 04: Grounded Scientific RAG */}
          <button
            type="button"
            onClick={() => setActiveTab('rag')}
            title="[4] Grounded Scientific RAG Chat"
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '9px',
              backgroundColor: activeTab === 'rag' ? 'var(--bg-rail-active)' : 'transparent',
              color: activeTab === 'rag' ? 'var(--rail-active-text)' : (theme === 'dark' ? '#94a3b8' : '#64748b'),
              border: activeTab === 'rag' ? (theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid #bfdbfe') : 'none',
              boxShadow: activeTab === 'rag' && theme === 'light' ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              gap: '2px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span style={{ fontSize: '8.5px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>RAG</span>
          </button>

          {/* Tab 05: Telemetry, Logs & Tool Registry */}
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            title="[5] Telemetry Logs & Core Engines"
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '9px',
              backgroundColor: activeTab === 'logs' ? 'var(--bg-rail-active)' : 'transparent',
              color: activeTab === 'logs' ? 'var(--rail-active-text)' : (theme === 'dark' ? '#94a3b8' : '#64748b'),
              border: activeTab === 'logs' ? (theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid #bfdbfe') : 'none',
              boxShadow: activeTab === 'logs' && theme === 'light' ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              gap: '2px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span style={{ fontSize: '8.5px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>LOGS</span>
          </button>
        </nav>

        {/* Bottom Rail: Theme Toggle & University Avatar */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode (Shortcut: T)`}
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

      {/* ============================================================== */}
      {/* 2. MAIN CONTAINER: STREAMLINED FLIGHT TELEMETRY HEADER */}
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
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 30,
          }}
        >
          {/* Left: Minimal Title & Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em', color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}>
              UTH SCIENTIFIC LAKEHOUSE &amp; MINING PIPELINE
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
              padding: '6px 16px',
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
                backgroundColor: pipelineStatus === 'RUNNING' ? '#ea580c' : streamActive ? '#10b981' : '#10b981',
                boxShadow: pipelineStatus === 'RUNNING' ? '0 0 8px #ea580c' : streamActive ? '0 0 10px #10b981' : 'none',
                animation: pipelineStatus === 'RUNNING' || streamActive ? 'stageGlowOrange 1.2s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: '12px', fontWeight: 600, color: theme === 'dark' ? '#cbd5e1' : '#334155' }}>
              {pipelineStatus === 'RUNNING'
                ? 'Pipeline Active: Harvesting arXiv batches, DuckDB Parquet & LanceDB Gold indexing...'
                : streamActive
                ? `Real-Time CDC Stream Active: ${totalPapers.toLocaleString()} papers synced (+${totalPapers - 10000} new) · ${streamSpeed} papers/min`
                : `Lakehouse Standby: ${totalPapers.toLocaleString()} papers, 2.22M formulas, 143k LanceDB vectors synced.`}
            </span>
          </div>

          {/* Right: Storage & Run Pipeline Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: '#64748b' }}>R2 LAKE:</span>
              <span style={{ fontWeight: 800, color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}>
                {(storageUsedGb + (totalPapers - 10000) * 0.00056).toFixed(3)} GB
              </span>
              <span
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5',
                  color: theme === 'dark' ? '#34d399' : '#059669',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontWeight: 700,
                  border: `1px solid ${theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'transparent'}`,
                }}
              >
                {Math.min(100, +(storageUsedPct + (totalPapers - 10000) * 0.0056).toFixed(1))}%
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
                  <span>RUNNING...</span>
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
            overflowY: activeTab === 'schematic' || activeTab === 'rag' || activeTab === 'eda' || activeTab === 'pillars' ? 'hidden' : 'auto',
            overflowX: 'hidden',
            padding: activeTab === 'schematic' ? '14px 20px' : activeTab === 'rag' ? '0' : activeTab === 'eda' || activeTab === 'pillars' ? '12px 24px' : '20px 24px',
            backgroundColor: 'transparent',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          {/* TAB 01: Schematic & Storage */}
          {activeTab === 'schematic' && (
            <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* Schematic Sub-view Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '8px', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                    padding: '3px',
                    borderRadius: '8px',
                    border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
                    gap: '4px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSchematicViewMode('canvas')}
                    style={{
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      backgroundColor: schematicViewMode === 'canvas' ? (theme === 'dark' ? '#1e293b' : '#ffffff') : 'transparent',
                      color: schematicViewMode === 'canvas' ? (theme === 'dark' ? '#38bdf8' : '#2563eb') : (theme === 'dark' ? '#94a3b8' : '#64748b'),
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: schematicViewMode === 'canvas' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
                    }}
                  >
                    FLOW CANVAS
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchematicViewMode('storage')}
                    style={{
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      backgroundColor: schematicViewMode === 'storage' ? (theme === 'dark' ? '#1e293b' : '#ffffff') : 'transparent',
                      color: schematicViewMode === 'storage' ? (theme === 'dark' ? '#38bdf8' : '#2563eb') : (theme === 'dark' ? '#94a3b8' : '#64748b'),
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: schematicViewMode === 'storage' ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
                    }}
                  >
                    BENTO &amp; STORAGE INSPECTOR
                  </button>
                </div>
              </div>

              {schematicViewMode === 'canvas' ? (
                <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <InteractiveWorkflowCanvas
                    onNavigateTab={(tab) => setActiveTab(tab)}
                    isPipelineRunning={pipelineStatus === 'RUNNING'}
                    onTriggerPipeline={handleTriggerPipeline}
                    theme={theme}
                  />
                </div>
              ) : (
                <div style={{ flex: 1, width: '100%', overflowY: 'auto', padding: '10px 0 30px' }}>
                  <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <MetricsBento />
                    <GeometricTelemetryGauges />
                    <StorageInspector />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 02: Real-Time DuckDB EDA */}
          {activeTab === 'eda' && (
            <div style={{ maxWidth: '1600px', width: '100%', height: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <EdaView
                theme={theme}
                onNavigateToRag={(title) => {
                  if (title) {
                    setRagInitialQuery(`What are the core findings, methodology, and empirical results of paper "${title}"?`);
                  }
                  setActiveTab('rag');
                }}
              />
            </div>
          )}

          {/* TAB 03: 4 Mining Pillars */}
          {activeTab === 'pillars' && (
            <div style={{ maxWidth: '1600px', width: '100%', height: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <MiningPillarsView
                theme={theme}
                onNavigateToRag={(title) => {
                  if (title) {
                    setRagInitialQuery(`What are the core findings, methodology, and empirical results of paper "${title}"?`);
                  }
                  setActiveTab('rag');
                }}
              />
            </div>
          )}

          {/* TAB 04: Grounded Scientific RAG */}
          {activeTab === 'rag' && (
            <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <GroundedRagChat
                theme={theme}
                initialQuery={ragInitialQuery}
                onClearInitialQuery={() => setRagInitialQuery('')}
              />
            </div>
          )}

          {/* TAB 05: Telemetry Logs & Core Engines */}
          {activeTab === 'logs' && (
            <div style={{ maxWidth: '1440px', width: '100%', height: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', padding: '10px 0 40px' }}>
              <ToolLogos />
              <LiveTelemetryFeed />
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
            padding: '0 20px',
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
            <span>{totalPapers.toLocaleString()} PAPERS</span>
            <span>&bull;</span>
            <span>{(143523 + (totalPapers - 10000) * 14).toLocaleString()} VECTORS</span>
            <span>&bull;</span>
            <span>{(2.22 + (totalPapers - 10000) * 0.00022).toFixed(2)}M FORMULAS</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
