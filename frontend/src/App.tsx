import { useState, useEffect } from 'react';
import { InteractiveWorkflowCanvas } from './components/InteractiveWorkflowCanvas';
import { EdaView } from './components/EdaView';
import { MiningPillarsView } from './components/MiningPillarsView';
import { GroundedRagChat } from './components/GroundedRagChat';
import { LiveTelemetryFeed } from './components/LiveTelemetryFeed';
import { ToolLogosGrid } from './components/ToolLogos';
import { fetchHealth, subscribeTelemetry, triggerMiningPipeline } from './api/client';

export type AppTab = 'schematic' | 'eda' | 'pillars' | 'rag' | 'logs';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('schematic');
  const [workflowName, setWorkflowName] = useState<string>('UTH Scientific Lakehouse & Mining Workflow');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState<boolean>(false);
  const [pipelineStatus, setPipelineStatus] = useState<'IDLE' | 'RUNNING' | 'COMPLETED'>('IDLE');
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(3); // Default to Step Submitted / Silver Parquet

  const [theme, setTheme] = useState<'dark' | 'light'>('light'); // Default to light mode matching ui_ex.jpg substrate

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
        setTimeout(() => setPipelineStatus('IDLE'), 4000);
      }, 3000);
    } catch {
      setPipelineStatus('IDLE');
    }
  };

  // Steps definition for the secondary left sidebar matching ui_ex.jpg
  const PIPELINE_STEPS = [
    {
      id: 'step-harvest',
      name: 'arXiv Ingest',
      subtitle: 'Start Flow',
      badgeColor: '#8b5cf6',
      tab: 'schematic' as AppTab,
    },
    {
      id: 'step-bronze',
      name: 'Instance',
      subtitle: 'Cloudflare R2 Bronze Lake',
      badgeColor: '#e11d48',
      tab: 'logs' as AppTab,
    },
    {
      id: 'step-duckdb',
      name: 'Review Case',
      subtitle: 'DuckDB & LaTeX Parser',
      badgeColor: '#f59e0b',
      tab: 'eda' as AppTab,
    },
    {
      id: 'step-silver',
      name: 'Step Submitted',
      subtitle: 'Silver Parquet & Real-Time EDA',
      badgeColor: '#10b981',
      tab: 'eda' as AppTab,
    },
    {
      id: 'step-gold',
      name: 'Approved Status',
      subtitle: 'Gold LanceDB & 4 Mining Pillars',
      badgeColor: '#2563eb',
      tab: 'pillars' as AppTab,
    },
    {
      id: 'step-rag',
      name: 'Grounded RAG',
      subtitle: 'Academic QA Synthesis',
      badgeColor: '#6366f1',
      tab: 'rag' as AppTab,
    },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: '#f1f5f9', color: '#0f172a' }}>
      {/* ============================================================== */}
      {/* 1. LEFTMOST DARK VERTICAL ICON RAIL (Matching ui_ex.jpg) */}
      {/* ============================================================== */}
      <aside
        style={{
          width: '60px',
          backgroundColor: '#16161a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0',
          flexShrink: 0,
          zIndex: 50,
        }}
      >
        {/* Brand Orange Badge (Top logo from ui_ex.jpg) */}
        <div
          title="UTH-AI Scientific Lakehouse"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
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
          {/* 4 diamond dots / squircle mark */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="5" width="5" height="5" rx="1.5" />
            <rect x="14" y="5" width="5" height="5" rx="1.5" />
            <rect x="5" y="14" width="5" height="5" rx="1.5" />
            <rect x="14" y="14" width="5" height="5" rx="1.5" />
          </svg>
        </div>

        {/* Quick Add (+) Button */}
        <button
          type="button"
          onClick={handleTriggerPipeline}
          title="Trigger Pipeline Step"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            marginBottom: '24px',
            fontSize: '16px',
            lineHeight: 1,
            transition: 'background 0.15s ease',
          }}
        >
          +
        </button>

        {/* Vertical Navigation Icons */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', alignItems: 'center' }}>
          {/* Flow / Hierarchy Graph (Active tab) */}
          <button
            type="button"
            onClick={() => setActiveTab('schematic')}
            title="Interactive Workflow Canvas"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: activeTab === 'schematic' ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
              color: activeTab === 'schematic' ? '#ffffff' : '#94a3b8',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <rect x="3" y="17" width="6" height="4" rx="1" />
              <rect x="15" y="17" width="6" height="4" rx="1" />
              <path d="M12 7v4" />
              <path d="M6 17v-3a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3" />
            </svg>
          </button>

          {/* Real-Time EDA (Code / Terminal / Data icon) */}
          <button
            type="button"
            onClick={() => setActiveTab('eda')}
            title="Real-Time DuckDB EDA"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: activeTab === 'eda' ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
              color: activeTab === 'eda' ? '#ffffff' : '#94a3b8',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </button>

          {/* 4 Mining Pillars (Git branch / Network icon) */}
          <button
            type="button"
            onClick={() => setActiveTab('pillars')}
            title="4 Mining Pillars (Rules, Clusters, Graph, Novelty)"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: activeTab === 'pillars' ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
              color: activeTab === 'pillars' ? '#ffffff' : '#94a3b8',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          </button>

          {/* Grounded RAG Chat (Book / Chat icon) */}
          <button
            type="button"
            onClick={() => setActiveTab('rag')}
            title="Grounded Scientific RAG Chat"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: activeTab === 'rag' ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
              color: activeTab === 'rag' ? '#ffffff' : '#94a3b8',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </button>

          {/* Telemetry & Logs */}
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            title="Live Telemetry & Cloudflare R2 Storage"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: activeTab === 'logs' ? 'rgba(255, 255, 255, 0.18)' : 'transparent',
              color: activeTab === 'logs' ? '#ffffff' : '#94a3b8',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </button>
        </nav>

        {/* Bottom Rail Icons: Settings & Avatar */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            style={{
              width: '36px',
              height: '36px',
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          {/* User Profile Avatar */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 700,
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
      {/* 2. SECONDARY LEFT SIDEBAR: "STEPS" (Matching ui_ex.jpg) */}
      {/* ============================================================== */}
      <aside
        style={{
          width: '260px',
          backgroundColor: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          zIndex: 40,
        }}
      >
        {/* Steps Header with hamburger list icon */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Steps</span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: '#f1f5f9',
                color: '#64748b',
                padding: '1px 6px',
                borderRadius: '9999px',
              }}
            >
              {PIPELINE_STEPS.length}
            </span>
          </div>

          <button
            type="button"
            title="List view options"
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        {/* List of Step Cards */}
        <div
          style={{
            flex: 1,
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            overflowY: 'auto',
          }}
        >
          {PIPELINE_STEPS.map((step, index) => {
            const isSelected = selectedStepIndex === index;
            return (
              <div
                key={step.id}
                onClick={() => {
                  setSelectedStepIndex(index);
                  setActiveTab(step.tab);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: isSelected ? '#f8fafc' : '#ffffff',
                  border: isSelected ? `1.5px solid ${step.badgeColor}` : '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 1px 4px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: step.badgeColor,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{step.name}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>{step.subtitle}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab(step.tab);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    fontSize: '14px',
                  }}
                >
                  •••
                </button>
              </div>
            );
          })}
        </div>

        {/* Prominent Vivid Orange Button: Add a Step / Run Master Pipeline (Matching ui_ex.jpg) */}
        <div style={{ padding: '16px 14px', borderTop: '1px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={handleTriggerPipeline}
            disabled={pipelineStatus === 'RUNNING'}
            style={{
              width: '100%',
              backgroundColor: '#ff5722',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: pipelineStatus === 'RUNNING' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(255, 87, 34, 0.35)',
              opacity: pipelineStatus === 'RUNNING' ? 0.8 : 1,
              transition: 'transform 0.1s ease',
            }}
          >
            {pipelineStatus === 'RUNNING' ? (
              <span>Running Master Pipeline...</span>
            ) : (
              <span>Add a Step</span>
            )}
          </button>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* 3. RIGHT CONTENT AREA: HEADER + MAIN WORKFLOW / INSPECTOR */}
      {/* ============================================================== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top Header Bar matching ui_ex.jpg */}
        <header
          style={{
            height: '60px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 30,
          }}
        >
          {/* Left: Workflow Name pill/input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isEditingName ? (
              <input
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                autoFocus
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#0f172a',
                  border: '1px solid #3b82f6',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  outline: 'none',
                }}
              />
            ) : (
              <div
                onClick={() => setIsEditingName(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  cursor: 'pointer',
                  backgroundColor: '#f8fafc',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{workflowName}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
            )}

            <div
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: backendStatus === 'ONLINE' ? '#10b981' : '#ef4444',
                backgroundColor: backendStatus === 'ONLINE' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                padding: '4px 8px',
                borderRadius: '6px',
                fontWeight: 700,
              }}
            >
              ● FASTAPI {backendStatus} {lastTelemetryTick ? `[${lastTelemetryTick}]` : ''}
            </div>
          </div>

          {/* Center: Mode Switcher tabs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#f1f5f9',
              padding: '3px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
            }}
          >
            {[
              { key: 'schematic' as AppTab, label: 'Workflow Canvas' },
              { key: 'eda' as AppTab, label: 'Real-Time EDA' },
              { key: 'pillars' as AppTab, label: '4 Mining Pillars' },
              { key: 'rag' as AppTab, label: 'Grounded RAG' },
              { key: 'logs' as AppTab, label: 'Telemetry & Quota' },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    border: 'none',
                    backgroundColor: isActive ? '#ffffff' : 'transparent',
                    color: isActive ? '#0f172a' : '#64748b',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Right: Storage Quota & Status Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: '#64748b' }}>R2 LAKE:</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>5.688 GB</span>
              <span style={{ backgroundColor: '#ecfdf5', color: '#059669', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                56.9%
              </span>
            </div>

            {/* Status Dropdown button matching ui_ex.jpg */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#0f172a',
                  cursor: 'pointer',
                }}
              >
                <span>Status</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {statusDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '38px',
                    right: 0,
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                    padding: '8px',
                    width: '180px',
                    zIndex: 60,
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', padding: '4px 8px' }}>
                    PIPELINE STATE
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', fontSize: '12px', color: '#059669', fontWeight: 600 }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669' }} />
                    Active & Operational
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', fontSize: '12px', color: '#2563eb' }}>
                    <span>10k Papers Synced</span>
                  </div>
                  <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }} />
                  <button
                    type="button"
                    onClick={handleTriggerPipeline}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: '6px 8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#ff5722',
                      cursor: 'pointer',
                    }}
                  >
                    Force Re-Index All
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Workspace Body */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 32px',
            backgroundColor: activeTab === 'schematic' ? '#f8fafc' : 'var(--bg-canvas)',
          }}
        >
          {activeTab === 'schematic' && (
            <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <InteractiveWorkflowCanvas
                onNavigateTab={(tab) => setActiveTab(tab)}
                onTriggerPipeline={handleTriggerPipeline}
                isPipelineRunning={pipelineStatus === 'RUNNING'}
              />
            </div>
          )}

          {activeTab === 'eda' && (
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <EdaView />
            </div>
          )}

          {activeTab === 'pillars' && (
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <MiningPillarsView />
            </div>
          )}

          {activeTab === 'rag' && (
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <GroundedRagChat />
            </div>
          )}

          {activeTab === 'logs' && (
            <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <LiveTelemetryFeed />
              <ToolLogosGrid />
            </div>
          )}
        </main>

        {/* Tactical Footer */}
        <footer
          style={{
            height: '36px',
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            color: '#64748b',
          }}
        >
          <div>
            <span>UNIVERSITY OF TRANSPORT AND COMMUNICATIONS // REAL-TIME SCIENTIFIC DATA MINING LAKEHOUSE</span>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>10,000 PAPERS PARQUET</span>
            <span>&bull;</span>
            <span>143,523 LANCEDB VECTORS</span>
            <span>&bull;</span>
            <span>2.22M LATEX FORMULAS</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
