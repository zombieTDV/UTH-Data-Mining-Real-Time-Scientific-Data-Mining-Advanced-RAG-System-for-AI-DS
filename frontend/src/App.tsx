import { useState, useEffect } from 'react';
import { NavRail } from './navigation/rail';
import { HeaderBar } from './navigation/header';
import { SchematicScreen, EdaScreen, PillarsScreen, RagScreen, LogsScreen } from './screens';
import {
  fetchHealth,
  subscribeTelemetry,
  triggerMiningPipeline,
  fetchStorageStats,
  fetchEdaSummary,
} from './services';
import { useThemeStore, useLakehouseStreamStore } from './store';
import type { AppTab, PipelineStatus, BackendStatus, SchematicViewMode } from './types';

export default function App() {
  const { theme, toggleTheme } = useThemeStore();
  const {
    isStreaming,
    totalCorpus,
    sessionIngested,
    streamSpeed,
    storageUsedGb,
    storageUsedPct,
    storageStats,
    initializeStream,
    refreshStorageStats,
  } = useLakehouseStreamStore();

  const [activeTab, setActiveTab] = useState<AppTab>('schematic');
  const [schematicViewMode, setSchematicViewMode] = useState<SchematicViewMode>('canvas');
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('IDLE');
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('ONLINE');
  const [lastTelemetryTick, setLastTelemetryTick] = useState<string>('');

  // Real-time Streaming State for Lakehouse Counter (Active Lakehouse: 36,414 works, 164,702 vectors)
  const [totalPapers, setTotalPapers] = useState<number>(36414);
  const [totalFormulas, setTotalFormulas] = useState<number>(2220938);
  const [totalVectors, setTotalVectors] = useState<number>(164702);

  const [ragInitialQuery, setRagInitialQuery] = useState<string>('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('uth-theme', theme);
  }, [theme]);

  // Check health, load live EDA and storage stats, and subscribe to SSE telemetry
  useEffect(() => {
    fetchHealth()
      .then(() => setBackendStatus('ONLINE'))
      .catch(() => setBackendStatus('OFFLINE'));

    fetchEdaSummary()
      .then((eda) => {
        if (eda?.dataset_overview?.total_math_formulas) {
          setTotalFormulas(eda.dataset_overview.total_math_formulas);
        }
      })
      .catch(() => {});

    const syncStorageStats = () => {
      refreshStorageStats();
      fetchStorageStats()
        .then((data) => {
          if (data?.activeLakehouse) {
            const works =
              (data.activeLakehouse.arxivHtmlCount || 11660) +
              (data.activeLakehouse.openalexCount || 24754) +
              (data.activeLakehouse.conferenceCount || 0);
            setTotalPapers(works);
            if (data.activeLakehouse.activeLanceDbVectors) {
              setTotalVectors(data.activeLakehouse.activeLanceDbVectors);
            }
          } else if (data?.zones?.goldChunkCount) {
            setTotalVectors(data.zones.goldChunkCount);
          }
        })
        .catch(() => {});
    };

    syncStorageStats();
    const statsInterval = setInterval(syncStorageStats, 3000);

    const unsubscribeTelemetry = subscribeTelemetry(
      (data) => {
        setBackendStatus('ONLINE');
        if (data?.timestamp) {
          setLastTelemetryTick(data.timestamp.split('T')[1]?.split('.')[0] || '');
        }
      },
      () => setBackendStatus('OFFLINE')
    );

    // Initialize singleton SSE stream with auto-reconnect
    const unsubscribeStream = initializeStream();

    return () => {
      clearInterval(statsInterval);
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
      else if (e.altKey && e.key === '2') setActiveTab('eda');
      else if (e.altKey && e.key === '3') setActiveTab('pillars');
      else if (e.altKey && e.key === '4') setActiveTab('rag');
      else if (e.altKey && e.key === '5') setActiveTab('logs');
      else if (e.shiftKey && (e.key === 'T' || e.key === 't')) toggleTheme();
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [toggleTheme]);

  const handleTriggerPipeline = async () => {
    try {
      setPipelineStatus('RUNNING');
      await triggerMiningPipeline();
      setTimeout(() => {
        setPipelineStatus('COMPLETED');
        setTimeout(() => setPipelineStatus('IDLE'), 12000);
      }, 6500);
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

  // totalCorpus from SSE already reflects total baseline (36,414) + sessionIngested. Avoid double-adding sessionIngested!
  const effectiveTotalPapers = totalCorpus || (totalPapers + sessionIngested) || 36414;
  const effectiveTotalVectors = storageStats?.activeLakehouse?.activeLanceDbVectors || totalVectors || 164702;
  const effectiveTotalFormulas = totalFormulas || 2220938;
  const effectiveStorageGb = storageUsedGb || (storageStats?.activeLakehouse?.totalSizeGb ?? 8.277);
  const effectiveStoragePct = storageUsedPct || Math.min(100, (effectiveStorageGb / 10.0) * 100);

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
            overflowY: activeTab === 'logs' ? 'auto' : 'hidden',
            overflowX: 'hidden',
            padding: activeTab === 'schematic' ? '0' : activeTab === 'rag' ? '0' : activeTab === 'logs' ? '16px 20px' : '12px 20px',
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
