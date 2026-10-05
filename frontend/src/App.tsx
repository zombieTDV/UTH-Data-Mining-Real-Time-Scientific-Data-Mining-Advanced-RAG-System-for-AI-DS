import { useState, useEffect } from 'react';
import { NavRail } from './navigation/rail';
import { HeaderBar, StatusBar } from './navigation/header';
import { SchematicScreen, EdaScreen, PillarsScreen, RagScreen, LogsScreen } from './screens';
import {
  fetchHealth,
  subscribeTelemetry,
  subscribeIngestionStream,
  triggerMiningPipeline,
  fetchStorageStats,
} from './services';
import { useThemeStore } from './store';
import type { AppTab, PipelineStatus, BackendStatus, SchematicViewMode } from './types';

export default function App() {
  const { theme, toggleTheme } = useThemeStore();
  const [activeTab, setActiveTab] = useState<AppTab>('schematic');
  const [schematicViewMode, setSchematicViewMode] = useState<SchematicViewMode>('canvas');
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>('IDLE');
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('ONLINE');
  const [lastTelemetryTick, setLastTelemetryTick] = useState<string>('');
  const [totalPapers, setTotalPapers] = useState<number>(10000);
  const [streamActive, setStreamActive] = useState<boolean>(false);
  const [streamSpeed, setStreamSpeed] = useState<number>(0);
  const [storageUsedGb, setStorageUsedGb] = useState<number>(5.524);
  const [storageUsedPct, setStorageUsedPct] = useState<number>(55.2);
  const [ragInitialQuery, setRagInitialQuery] = useState<string>('');

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
        setTimeout(() => setPipelineStatus('IDLE'), 6000);
      }, 5000);
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
          streamActive={streamActive}
          totalPapers={totalPapers}
          streamSpeed={streamSpeed}
          storageUsedGb={storageUsedGb}
          storageUsedPct={storageUsedPct}
          onTriggerPipeline={handleTriggerPipeline}
        />

        <main
          style={{
            flex: 1,
            overflowY: activeTab === 'logs' ? 'auto' : 'hidden',
            overflowX: 'hidden',
            padding: activeTab === 'schematic' ? '14px 20px' : activeTab === 'rag' ? '0' : activeTab === 'logs' ? '20px 24px' : '12px 24px',
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

        <StatusBar totalPapers={totalPapers} />
      </div>
    </div>
  );
}
