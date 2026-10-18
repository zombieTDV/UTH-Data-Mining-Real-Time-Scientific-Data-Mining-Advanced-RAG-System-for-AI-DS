import { useState, useEffect } from 'react';
import { NavRail } from './navigation/rail';
import { HeaderBar } from './navigation/header';
import { SchematicScreen, ExplorerScreen, EdaScreen, PillarsScreen, RagScreen, LogsScreen } from './screens';
import {
  fetchHealth,
  subscribeTelemetry,
  triggerMiningPipeline,
  fetchMiningStatus,
  fetchEdaSummary,
} from './services';
import { useThemeStore, useLakehouseStreamStore } from './store';
import type { AppTab, PipelineStatus, BackendStatus, SchematicViewMode, MiningRunStatus } from './types';

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
  // Mining run state; last_run is the version of the EDA / Model artifacts, and EDA + Model refetch when it changes
  const [miningRun, setMiningRun] = useState<MiningRunStatus | null>(null);

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

    fetchMiningStatus()
      .then((s) => {
        setMiningRun(s);
        if (s.running) followMiningRun();
      })
      .catch(() => {});

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

  // Follow the mining run until the backend reports it finished; the new last_run makes EDA and Model refetch.
  const followMiningRun = async () => {
    setPipelineStatus('RUNNING');
    for (;;) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await fetchMiningStatus().catch(() => null);
      if (!s) continue;
      setMiningRun(s);
      if (!s.running) {
        setPipelineStatus(s.error ? 'IDLE' : 'COMPLETED');
        if (!s.error) setTimeout(() => setPipelineStatus('IDLE'), 6000);
        return;
      }
    }
  };

  const handleTriggerPipeline = async () => {
    if (pipelineStatus === 'RUNNING') return;
    try {
      await triggerMiningPipeline();
      await followMiningRun();
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
            <EdaScreen
              theme={theme}
              onNavigateToRag={handleNavigateToRag}
              miningRun={miningRun}
              pipelineStatus={pipelineStatus}
              onRefreshMining={handleTriggerPipeline}
            />
          )}

          {activeTab === 'pillars' && (
            <PillarsScreen theme={theme} onNavigateToRag={handleNavigateToRag} dataVersion={miningRun?.last_run ?? null} />
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
