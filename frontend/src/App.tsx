import { useState, useEffect } from 'react';
import { NavRail } from './navigation/rail';
import { HeaderBar } from './navigation/header';
import { SchematicScreen, ExplorerScreen, EdaScreen, PillarsScreen, RagScreen, LogsScreen } from './screens';
import {
  fetchHealth,
  subscribeTelemetry,
  triggerMiningPipeline,
  fetchEdaSummary,
} from './services';
import { API_CONFIG } from './config';
import { useThemeStore, useLakehouseStreamStore } from './store';
import type { AppTab, PipelineStatus, BackendStatus, SchematicViewMode } from './types';

export default function App() {
  const { theme, toggleTheme } = useThemeStore();
  const {
    live,
    isStreaming,
    totalCorpus,
    totalVectors,
    sessionIngested,
    streamSpeed,
    storageUsedGb,
    storageUsedPct,
    storageStats,
    connectionStatus,
    initializeStream,
  } = useLakehouseStreamStore();

  const [activeTab, setActiveTab] = useState<AppTab>('schematic');
  const [schematicViewMode, setSchematicViewMode] = useState<SchematicViewMode>('canvas');
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('IDLE');
  const [healthStatus, setHealthStatus] = useState<BackendStatus>('ONLINE');
  const [lastTelemetryTick, setLastTelemetryTick] = useState<string>('');

  const [totalFormulas, setTotalFormulas] = useState<number>(0);

  const [ragInitialQuery, setRagInitialQuery] = useState<string>('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('uth-theme', theme);
  }, [theme]);

  // Check health, load live EDA and storage stats, and subscribe to SSE telemetry
  useEffect(() => {
    fetchHealth()
      .then(() => setHealthStatus('ONLINE'))
      .catch(() => setHealthStatus('OFFLINE'));

    fetchEdaSummary()
      .then((eda) => {
        if (eda?.dataset_overview?.total_math_formulas) {
          setTotalFormulas(eda.dataset_overview.total_math_formulas);
        }
      })
      .catch(() => {});

    // Counters, queue, DAG state and logs arrive from the backend monitor over one SSE stream (see streaming.store.ts).

    const unsubscribeTelemetry = subscribeTelemetry(
      (data) => {
        if (data?.timestamp) {
          setLastTelemetryTick(data.timestamp.split('T')[1]?.split('.')[0] || '');
        }
      },
      () => undefined
    );

    // Initialize singleton SSE stream with auto-reconnect
    const unsubscribeStream = initializeStream();

    return () => {
      unsubscribeTelemetry();
      unsubscribeStream();
    };
  }, [initializeStream]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.altKey && e.key === '1') setActiveTab('schematic');
      else if (e.altKey && e.key === '2') setActiveTab('explorer');
      else if (e.altKey && e.key === '3') setActiveTab('eda');
      else if (e.altKey && e.key === '4') setActiveTab('pillars');
      else if (e.altKey && e.key === '5') setActiveTab('rag');
      else if (e.altKey && e.key === '6') setActiveTab('logs');
      else if (e.shiftKey && (e.key === 'T' || e.key === 't')) toggleTheme();
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [toggleTheme]);

  // Re-run the mining engine and follow it until the backend publishes a manifest newer than the one we started from.
  const handleTriggerPipeline = async () => {
    try {
      const manifestUrl = `${API_CONFIG.baseUrl}/api/mining/manifest`;
      const before = await fetch(manifestUrl).then((r) => r.json()).catch(() => null);
      setPipelineStatus('RUNNING');
      await triggerMiningPipeline();
      const startedAt = before?.execution_timestamp;
      for (let i = 0; i < 90; i += 1) {
        await new Promise((r) => setTimeout(r, 2000));
        const m = await fetch(manifestUrl).then((r) => r.json()).catch(() => null);
        if (m && m.execution_timestamp !== startedAt && m.status === 'COMPLETED') {
          setPipelineStatus('COMPLETED');
          setTimeout(() => setPipelineStatus('IDLE'), 6000);
          return;
        }
      }
      setPipelineStatus('IDLE');
    } catch {
      setPipelineStatus('IDLE');
    }
  };

  const handleNavigateToRag = (title?: string) => {
    if (title) {
      setRagInitialQuery(`What are the core findings, methodology, and empirical results of paper "${title}"?`);
    }
    setActiveTab('rag');
  };

  // ONLINE only while the live monitor stream is connected and the health check passed
  const backendStatus: BackendStatus = connectionStatus === 'CONNECTED' && healthStatus === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
  const effectiveTotalPapers = totalCorpus;
  const effectiveTotalVectors = totalVectors;
  const effectiveTotalFormulas = live?.corpus?.formulas ?? totalFormulas; // live Silver total, EDA artifact as fallback
  const effectiveStorageGb = storageStats?.totalBucket?.totalSizeGb ?? storageUsedGb;
  const effectiveStoragePct = storageStats?.totalBucket?.usedPercentage ?? storageUsedPct;

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', backgroundColor: 'transparent', position: 'relative', overflow: 'hidden' }}>
      <NavRail
        activeTab={activeTab}
        theme={theme}
        onNavigate={setActiveTab}
        onToggleTheme={toggleTheme}
      />

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
        <HeaderBar
          backendStatus={backendStatus}
          lastTelemetryTick={lastTelemetryTick}
          pipelineStatus={pipelineStatus}
          streamActive={isStreaming}
          totalPapers={effectiveTotalPapers}
          totalFormulas={effectiveTotalFormulas}
          totalVectors={effectiveTotalVectors}
          sessionIngested={sessionIngested}
          streamSpeed={streamSpeed}
          storageUsedGb={effectiveStorageGb}
          storageUsedPct={effectiveStoragePct}
          onTriggerPipeline={handleTriggerPipeline}
        />
        <main
          style={{
            flex: 1,
            overflowY: (activeTab === 'logs' || activeTab === 'explorer') ? 'auto' : 'hidden',
            overflowX: 'hidden',
            padding: (activeTab === 'schematic' || activeTab === 'rag' || activeTab === 'explorer') ? '0' : activeTab === 'logs' ? '16px 20px' : '12px 20px',
            backgroundColor: 'transparent',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {activeTab === 'schematic' && (
            <SchematicScreen
              viewMode={schematicViewMode}
              onViewModeChange={setSchematicViewMode}
              theme={theme}
              pipelineStatus={pipelineStatus}
              onNavigateTab={setActiveTab}
              onTriggerPipeline={handleTriggerPipeline}
            />
          )}

          {activeTab === 'explorer' && (
            <ExplorerScreen theme={theme} />
          )}

          {activeTab === 'eda' && (
            <EdaScreen theme={theme} onNavigateToRag={handleNavigateToRag} />
          )}

          {activeTab === 'pillars' && (
            <PillarsScreen theme={theme} onNavigateToRag={handleNavigateToRag} />
          )}

          {activeTab === 'rag' && (
            <RagScreen
              theme={theme}
              initialQuery={ragInitialQuery}
              onClearInitialQuery={() => setRagInitialQuery('')}
            />
          )}

          {activeTab === 'logs' && <LogsScreen />}
        </main>
      </div>
    </div>
  );
}
