import { useState, useEffect, type FC } from 'react';

export type PipelineStageKey =
  | 'idle'
  | 'harvest'
  | 'bronze'
  | 'duckdb'
  | 'parallel'
  | 'completed';

export interface InteractiveWorkflowCanvasProps {
  onNavigateTab?: (tab: 'schematic' | 'eda' | 'pillars' | 'rag' | 'logs') => void;
  onTriggerPipeline?: () => void;
  isPipelineRunning?: boolean;
}

export const InteractiveWorkflowCanvas: FC<InteractiveWorkflowCanvasProps> = ({
  onNavigateTab,
  onTriggerPipeline,
  isPipelineRunning = false,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('silver-parquet');

  // Simulation state for realistic data streaming animation
  const [simulationStage, setSimulationStage] = useState<PipelineStageKey>('idle');
  const [papersHarvested, setPapersHarvested] = useState<number>(10000);
  const [formulasExtracted, setFormulasExtracted] = useState<number>(2224198);
  const [vectorsIndexed, setVectorsIndexed] = useState<number>(143523);
  const [activeMessage, setActiveMessage] = useState<string>(
    'Lakehouse Standby: 10,000 papers, 2.22M formulas, 143k LanceDB vectors synced.'
  );

  // Progressive simulation when "Run Pipeline" is triggered
  useEffect(() => {
    if (!isPipelineRunning) {
      if (simulationStage !== 'idle' && simulationStage !== 'completed') {
        setSimulationStage('completed');
      }
      return;
    }

    setSimulationStage('harvest');
    setActiveMessage('Phase 1: Ingesting academic papers and HTML5 bodies via arXiv OAI-PMH...');
    setPapersHarvested(1420);

    const t1 = setTimeout(() => {
      setSimulationStage('bronze');
      setActiveMessage('Phase 2: Streaming raw batches into Cloudflare R2 Bronze Lakehouse...');
      setPapersHarvested(6150);
    }, 1200);

    const t2 = setTimeout(() => {
      setSimulationStage('duckdb');
      setActiveMessage('Phase 3: SIMD DuckDB parsing & extracting 2.22M LaTeX formulas...');
      setPapersHarvested(10000);
      setFormulasExtracted(920000);
    }, 2500);

    const t3 = setTimeout(() => {
      setSimulationStage('parallel');
      setActiveMessage('Phase 4: Parallel execution: Curated Parquet EDA & Gold LanceDB 4 Mining Pillars...');
      setFormulasExtracted(2224198);
      setVectorsIndexed(68000);
    }, 4000);

    const t4 = setTimeout(() => {
      setSimulationStage('completed');
      setActiveMessage('Phase 5: Pipeline synced. LanceDB vector indices & Grounded RAG ready.');
      setVectorsIndexed(143523);
    }, 6000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [isPipelineRunning]);

  const isStageActive = (stage: string) => {
    if (simulationStage === 'completed') return false;
    if (simulationStage === stage) return true;
    if (simulationStage === 'parallel' && (stage === 'silver' || stage === 'gold')) return true;
    return false;
  };

  const handleNodeClick = (nodeId: string, tab?: 'eda' | 'pillars' | 'rag' | 'logs') => {
    setSelectedNodeId(nodeId);
    if (tab && onNavigateTab) {
      onNavigateTab(tab);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        alignItems: 'center',
        userSelect: 'none',
      }}
    >
      {/* Dynamic Telemetry Status Header */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '12px 20px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          marginBottom: '28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: isPipelineRunning ? '#ea580c' : '#10b981',
              boxShadow: isPipelineRunning ? '0 0 10px #ea580c' : 'none',
              animation: isPipelineRunning ? 'stageGlowOrange 1.5s infinite' : 'none',
            }}
          />
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#64748b' }}>
              HORIZONTAL DATA MINING PIPELINE // STREAM TELEMETRY
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
              {activeMessage}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={onTriggerPipeline}
            disabled={isPipelineRunning}
            style={{
              backgroundColor: isPipelineRunning ? '#ea580c' : '#0f172a',
              color: '#ffffff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              cursor: isPipelineRunning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: isPipelineRunning
                ? '0 0 16px rgba(234, 88, 12, 0.4)'
                : '0 2px 6px rgba(15, 23, 42, 0.15)',
              transition: 'all 0.2s ease',
            }}
          >
            {isPipelineRunning ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
                <span>RUNNING ENGINE...</span>
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>RUN PIPELINE</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* HORIZONTAL PIPELINE CANVAS (LEFT TO RIGHT) */}
      {/* ============================================================== */}
      <div
        style={{
          width: '100%',
          overflowX: 'auto',
          paddingBottom: '20px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            minWidth: '1260px',
            padding: '20px 10px',
          }}
        >
          {/* ============================================================== */}
          {/* STAGE 1: arXiv Harvester (Purple Badge) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleNodeClick('start-flow', 'logs')}
            style={{
              width: '210px',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '14px 16px',
              border: isStageActive('harvest')
                ? '2px solid #8b5cf6'
                : selectedNodeId === 'start-flow'
                ? '2px solid #7c3aed'
                : '1px solid #e2e8f0',
              boxShadow: isStageActive('harvest')
                ? '0 0 20px rgba(139, 92, 246, 0.35)'
                : '0 2px 8px rgba(0, 0, 0, 0.04)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  backgroundColor: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 2px 6px rgba(124, 58, 237, 0.3)',
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#6d28d9' }}>Start Flow</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>01. arXiv Ingest</div>
              </div>
            </div>

            <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                {papersHarvested.toLocaleString()} Papers
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                OAI-PMH & ar5iv HTML5
              </div>
            </div>
          </div>

          {/* Horizontal Connector 1 */}
          <div style={{ width: '42px', height: '2px', backgroundColor: '#cbd5e1', position: 'relative', flexShrink: 0 }}>
            {isStageActive('harvest') && (
              <div
                style={{
                  position: 'absolute',
                  top: '-3px',
                  left: '0',
                  width: '16px',
                  height: '8px',
                  borderRadius: '4px',
                  backgroundColor: '#7c3aed',
                  boxShadow: '0 0 8px #7c3aed',
                  animation: 'pulseFlowHorizontal 0.8s infinite',
                }}
              />
            )}
          </div>

          {/* ============================================================== */}
          {/* STAGE 2: Bronze R2 Lakehouse (Magenta Badge) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleNodeClick('bronze-instance', 'logs')}
            style={{
              width: '210px',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '14px 16px',
              border: isStageActive('bronze')
                ? '2px solid #e11d48'
                : selectedNodeId === 'bronze-instance'
                ? '2px solid #e11d48'
                : '1px solid #e2e8f0',
              boxShadow: isStageActive('bronze')
                ? '0 0 20px rgba(225, 29, 72, 0.35)'
                : '0 2px 8px rgba(0, 0, 0, 0.04)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  backgroundColor: '#e11d48',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 2px 6px rgba(225, 29, 72, 0.3)',
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#e11d48' }}>Instance</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>02. Bronze Lake</div>
              </div>
            </div>

            <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                2.841 GB Raw
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                Cloudflare R2 Bucket
              </div>
            </div>
          </div>

          {/* Horizontal Connector 2 */}
          <div style={{ width: '42px', height: '2px', backgroundColor: '#cbd5e1', position: 'relative', flexShrink: 0 }}>
            {isStageActive('bronze') && (
              <div
                style={{
                  position: 'absolute',
                  top: '-3px',
                  left: '0',
                  width: '16px',
                  height: '8px',
                  borderRadius: '4px',
                  backgroundColor: '#e11d48',
                  boxShadow: '0 0 8px #e11d48',
                  animation: 'pulseFlowHorizontal 0.8s infinite',
                }}
              />
            )}
          </div>

          {/* ============================================================== */}
          {/* STAGE 3: DuckDB & LaTeX Parser (Amber Badge) */}
          {/* ============================================================== */}
          <div
            onClick={() => handleNodeClick('review-duckdb', 'eda')}
            style={{
              width: '220px',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '14px 16px',
              border: isStageActive('duckdb')
                ? '2px solid #f59e0b'
                : selectedNodeId === 'review-duckdb'
                ? '2px solid #f59e0b'
                : '1px solid #e2e8f0',
              boxShadow: isStageActive('duckdb')
                ? '0 0 20px rgba(245, 158, 11, 0.35)'
                : '0 2px 8px rgba(0, 0, 0, 0.04)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  backgroundColor: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)',
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#d97706' }}>Review Case</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>03. DuckDB & LaTeX</div>
              </div>
            </div>

            <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                {formulasExtracted.toLocaleString()} Formulas
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                Vectorized SIMD Engine
              </div>
            </div>
          </div>

          {/* Horizontal Connector 3 into Red Split Node */}
          <div style={{ width: '36px', height: '2px', backgroundColor: '#cbd5e1', position: 'relative', flexShrink: 0 }}>
            {isStageActive('duckdb') && (
              <div
                style={{
                  position: 'absolute',
                  top: '-3px',
                  left: '0',
                  width: '16px',
                  height: '8px',
                  borderRadius: '4px',
                  backgroundColor: '#f59e0b',
                  boxShadow: '0 0 8px #f59e0b',
                  animation: 'pulseFlowHorizontal 0.8s infinite',
                }}
              />
            )}
          </div>

          {/* ============================================================== */}
          {/* PARALLEL SPLIT NODE & PARALLEL BRANCHES (TOP & BOTTOM) */}
          {/* ============================================================== */}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {/* Red Fork Icon Badge */}
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.35)',
                zIndex: 10,
                flexShrink: 0,
              }}
              title="Parallel Fork: Silver EDA and Gold Vector Mining"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="6" height="6" rx="1" />
                <rect x="15" y="15" width="6" height="6" rx="1" />
                <rect x="3" y="15" width="6" height="6" rx="1" />
                <path d="M6 9v3a3 3 0 0 0 3 3h6" />
              </svg>
            </div>

            {/* Split Horizontal-to-Vertical Wiring */}
            <div style={{ width: '28px', height: '140px', position: 'relative', flexShrink: 0 }}>
              {/* Horizontal center spur */}
              <div style={{ position: 'absolute', top: '70px', left: '0', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
              {/* Vertical branch bar */}
              <div style={{ position: 'absolute', top: '18px', left: '14px', width: '2px', height: '104px', backgroundColor: '#cbd5e1' }} />
              {/* Top horizontal branch into Path 1 */}
              <div style={{ position: 'absolute', top: '18px', left: '14px', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
              {/* Bottom horizontal branch into Path 2 */}
              <div style={{ position: 'absolute', bottom: '18px', left: '14px', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
            </div>

            {/* Parallel Cards Stack: Path 1 (Top) & Path 2 (Bottom) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flexShrink: 0 }}>
              {/* PATH 1 (TOP): Silver Parquet & Real-Time EDA (Green Badge) */}
              <div
                onClick={() => handleNodeClick('silver-parquet', 'eda')}
                style={{
                  width: '260px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  border: isStageActive('parallel')
                    ? '2px solid #10b981'
                    : selectedNodeId === 'silver-parquet'
                    ? '2px solid #10b981'
                    : '1px solid #e2e8f0',
                  boxShadow: isStageActive('parallel')
                    ? '0 0 20px rgba(16, 185, 129, 0.35)'
                    : '0 2px 8px rgba(0, 0, 0, 0.04)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>

                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#047857' }}>Step Submitted</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>04. Silver Parquet & EDA</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNavigateTab) onNavigateTab('eda');
                    }}
                    style={{
                      backgroundColor: '#ecfdf5',
                      color: '#059669',
                      border: '1px solid #a7f3d0',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    OPEN EDA
                  </button>
                </div>

                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: '#64748b' }}>Partition: 2026</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>231.73 MB Parquet</span>
                </div>
              </div>

              {/* PATH 2 (BOTTOM): Gold LanceDB & 4 Mining Pillars (Blue Badge) */}
              <div
                onClick={() => handleNodeClick('gold-lancedb', 'pillars')}
                style={{
                  width: '260px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  border: isStageActive('parallel')
                    ? '2px solid #2563eb'
                    : selectedNodeId === 'gold-lancedb'
                    ? '2px solid #2563eb'
                    : '1px solid #e2e8f0',
                  boxShadow: isStageActive('parallel')
                    ? '0 0 20px rgba(37, 99, 235, 0.35)'
                    : '0 2px 8px rgba(0, 0, 0, 0.04)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                        flexShrink: 0,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>

                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#1d4ed8' }}>Approved Status</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>05. LanceDB & 4 Pillars</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNavigateTab) onNavigateTab('pillars');
                    }}
                    style={{
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      border: '1px solid #bfdbfe',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    4 PILLARS
                  </button>
                </div>

                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: '#64748b' }}>768-dim Vectors</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{vectorsIndexed.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Merge Horizontal-to-Vertical Wiring */}
            <div style={{ width: '28px', height: '140px', position: 'relative', flexShrink: 0 }}>
              {/* Top horizontal line from Path 1 */}
              <div style={{ position: 'absolute', top: '18px', left: '0', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
              {/* Bottom horizontal line from Path 2 */}
              <div style={{ position: 'absolute', bottom: '18px', left: '0', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
              {/* Vertical merge bar */}
              <div style={{ position: 'absolute', top: '18px', left: '14px', width: '2px', height: '104px', backgroundColor: '#cbd5e1' }} />
              {/* Horizontal center spur into Grounded RAG */}
              <div style={{ position: 'absolute', top: '70px', left: '14px', width: '14px', height: '2px', backgroundColor: '#cbd5e1' }} />
            </div>

            {/* Orange Anchor Ring (Convergence point) */}
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                border: '4px solid #ea580c',
                boxShadow: '0 2px 6px rgba(234, 88, 12, 0.3)',
                flexShrink: 0,
                zIndex: 10,
              }}
              title="Parallel Convergence Anchor"
            />

            {/* Final Horizontal Connector into Grounded RAG */}
            <div style={{ width: '36px', height: '2px', backgroundColor: '#cbd5e1', position: 'relative', flexShrink: 0 }}>
              {simulationStage === 'completed' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    left: '0',
                    width: '16px',
                    height: '8px',
                    borderRadius: '4px',
                    backgroundColor: '#6366f1',
                    boxShadow: '0 0 8px #6366f1',
                    animation: 'pulseFlowHorizontal 0.8s infinite',
                  }}
                />
              )}
            </div>

            {/* ============================================================== */}
            {/* STAGE 5: Grounded RAG Console (Indigo Badge) */}
            {/* ============================================================== */}
            <div
              onClick={() => handleNodeClick('grounded-rag', 'rag')}
              style={{
                width: '240px',
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                padding: '14px 16px',
                border: simulationStage === 'completed'
                  ? '2px solid #6366f1'
                  : selectedNodeId === 'grounded-rag'
                  ? '2px solid #6366f1'
                  : '1px solid #e2e8f0',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      backgroundColor: '#6366f1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>

                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#4338ca' }}>Grounded RAG</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>06. Citation QA</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onNavigateTab) onNavigateTab('rag');
                  }}
                  style={{
                    backgroundColor: '#6366f1',
                    color: '#ffffff',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(99, 102, 241, 0.25)',
                  }}
                >
                  CHAT
                </button>
              </div>

              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                  Verified Grounding
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  Exact Paper & Section Attributions
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
