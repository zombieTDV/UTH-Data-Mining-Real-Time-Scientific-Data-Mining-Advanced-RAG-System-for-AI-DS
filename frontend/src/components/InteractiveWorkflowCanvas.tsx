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
  const [activeMessage, setActiveMessage] = useState<string>('Pipeline standby. All lakehouse partitions synced.');

  // When pipeline is triggered, drive realistic progressive animation
  useEffect(() => {
    if (!isPipelineRunning) {
      if (simulationStage !== 'idle' && simulationStage !== 'completed') {
        setSimulationStage('completed');
      }
      return;
    }

    // Sequence through stages: harvest -> bronze -> duckdb -> parallel -> completed
    setSimulationStage('harvest');
    setActiveMessage('Harvesting academic metadata and HTML5 papers via arXiv OAI-PMH...');
    setPapersHarvested(1240);

    const t1 = setTimeout(() => {
      setSimulationStage('bronze');
      setActiveMessage('Streaming immutable raw records directly to Cloudflare R2 Bronze Lake...');
      setPapersHarvested(5820);
    }, 1200);

    const t2 = setTimeout(() => {
      setSimulationStage('duckdb');
      setActiveMessage('Executing vectorized DuckDB OLAP & parsing 2.22M LaTeX formulas...');
      setPapersHarvested(10000);
      setFormulasExtracted(850000);
    }, 2500);

    const t3 = setTimeout(() => {
      setSimulationStage('parallel');
      setActiveMessage('Branching parallel execution: Silver Parquet EDA & LanceDB 4 Mining Pillars...');
      setFormulasExtracted(2224198);
      setVectorsIndexed(64000);
    }, 4000);

    const t4 = setTimeout(() => {
      setSimulationStage('completed');
      setActiveMessage('Pipeline complete: 10,000 papers, 143,523 vectors, 4 Mining Pillars ready.');
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
        position: 'relative',
        minHeight: '820px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
      }}
    >
      {/* Dynamic Pipeline Telemetry Banner */}
      <div
        style={{
          width: '100%',
          maxWidth: '840px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '12px 20px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          marginBottom: '32px',
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
              PIPELINE EXECUTION STATE
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
                : '0 2px 6px rgba(15, 23, 42, 0.2)',
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

      {/* Main Flow Canvas Tree */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          maxWidth: '820px',
          position: 'relative',
        }}
      >
        {/* ============================================================== */}
        {/* NODE 1: START FLOW (PURPLE BADGE) */}
        {/* ============================================================== */}
        <div
          onClick={() => handleNodeClick('start-flow', 'logs')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '12px 22px',
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
            zIndex: 10,
          }}
        >
          {/* Purple Icon Badge */}
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '9px',
              backgroundColor: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 2px 6px rgba(124, 58, 237, 0.3)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#6d28d9' }}>Start Flow</span>
              {isStageActive('harvest') && (
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: '#ede9fe',
                    color: '#7c3aed',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 700,
                  }}
                >
                  HARVESTING...
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              arXiv Harvester // {papersHarvested.toLocaleString()} Papers (cs.AI, cs.LG, cs.CV, cs.CL, stat.ML)
            </div>
          </div>
        </div>

        {/* Animated Connector Line 1 */}
        <div style={{ width: '2px', height: '44px', position: 'relative', backgroundColor: '#cbd5e1' }}>
          {isStageActive('harvest') && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '-2px',
                width: '6px',
                height: '16px',
                borderRadius: '3px',
                backgroundColor: '#7c3aed',
                boxShadow: '0 0 8px #7c3aed',
                animation: 'pulseFlow 0.8s infinite',
              }}
            />
          )}
        </div>

        {/* ============================================================== */}
        {/* NODE 2: INSTANCE / BRONZE LAKE (MAGENTA BADGE) */}
        {/* ============================================================== */}
        <div
          onClick={() => handleNodeClick('bronze-instance', 'logs')}
          style={{
            width: '100%',
            maxWidth: '400px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '12px 18px',
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
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '9px',
                backgroundColor: '#e11d48',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 6px rgba(225, 29, 72, 0.3)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Instance</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: '#fff1f2',
                    color: '#e11d48',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 700,
                  }}
                >
                  {isStageActive('bronze') ? 'UPLOADING...' : 'BRONZE R2'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Cloudflare R2 // 9,022 HTML5 + 12 OAI Batches (2.841 GB)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#059669', fontWeight: 700 }}>
              SYNCED
            </span>
          </div>
        </div>

        {/* Animated Connector Line 2 */}
        <div style={{ width: '2px', height: '44px', position: 'relative', backgroundColor: '#cbd5e1' }}>
          {isStageActive('bronze') && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '-2px',
                width: '6px',
                height: '16px',
                borderRadius: '3px',
                backgroundColor: '#e11d48',
                boxShadow: '0 0 8px #e11d48',
                animation: 'pulseFlow 0.8s infinite',
              }}
            />
          )}
        </div>

        {/* ============================================================== */}
        {/* NODE 3: REVIEW CASE (AMBER BADGE - DUCKDB & LATEX) */}
        {/* ============================================================== */}
        <div
          onClick={() => handleNodeClick('review-duckdb', 'eda')}
          style={{
            width: '100%',
            maxWidth: '400px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '12px 18px',
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
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '9px',
                backgroundColor: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Review Case</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: '#fef3c7',
                    color: '#d97706',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 700,
                  }}
                >
                  {isStageActive('duckdb') ? 'EXTRACTING...' : 'DUCKDB & LATEX'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                DuckDB SIMD // {formulasExtracted.toLocaleString()} Formulas Extracted
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onNavigateTab) onNavigateTab('eda');
            }}
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            VIEW EDA
          </button>
        </div>

        {/* Stem down to Parallel Fork Node */}
        <div style={{ width: '2px', height: '32px', position: 'relative', backgroundColor: '#cbd5e1' }}>
          {isStageActive('duckdb') && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '-2px',
                width: '6px',
                height: '16px',
                borderRadius: '3px',
                backgroundColor: '#f59e0b',
                boxShadow: '0 0 8px #f59e0b',
                animation: 'pulseFlow 0.8s infinite',
              }}
            />
          )}
        </div>

        {/* ============================================================== */}
        {/* NODE 4: PARALLEL SPLIT NODE (RED BADGE) */}
        {/* ============================================================== */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '9px',
            backgroundColor: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.35)',
            zIndex: 10,
          }}
          title="Parallel Execution Branch: Silver Parquet & Gold LanceDB"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="6" height="6" rx="1" />
            <rect x="15" y="15" width="6" height="6" rx="1" />
            <rect x="3" y="15" width="6" height="6" rx="1" />
            <path d="M6 9v3a3 3 0 0 0 3 3h6" />
          </svg>
        </div>

        {/* Branching Tree Lines */}
        <div style={{ width: '100%', maxWidth: '640px', position: 'relative' }}>
          <div style={{ width: '2px', height: '24px', backgroundColor: '#cbd5e1', margin: '0 auto' }} />
          <div style={{ width: '100%', height: '2px', backgroundColor: '#cbd5e1', position: 'relative' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ width: '2px', height: '24px', backgroundColor: '#cbd5e1', marginLeft: '120px' }} />
            <div style={{ width: '2px', height: '24px', backgroundColor: '#cbd5e1', marginRight: '120px' }} />
          </div>
        </div>

        {/* ============================================================== */}
        {/* PARALLEL BRANCHES: PATH 1 (SILVER EDA) & PATH 2 (GOLD PILLARS) */}
        {/* ============================================================== */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '32px',
            width: '100%',
            maxWidth: '780px',
            marginTop: '4px',
          }}
        >
          {/* PATH 1 (LEFT: GREEN BADGE - SILVER PARQUET EDA) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                backgroundColor: '#0f172a',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 12px',
                borderRadius: '9999px',
                marginBottom: '10px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              }}
            >
              Path 1: Silver Parquet
            </div>

            <div
              onClick={() => handleNodeClick('silver-parquet', 'eda')}
              style={{
                width: '100%',
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
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '9px',
                      backgroundColor: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>

                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Step Submitted</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Silver Parquet // Real-Time EDA</div>
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
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  OPEN EDA
                </button>
              </div>

              <div
                style={{
                  marginTop: '10px',
                  paddingTop: '8px',
                  borderTop: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: '#64748b',
                }}
              >
                <span>Partition: year=2026</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>231.73 MB Parquet</span>
              </div>
            </div>

            <div style={{ width: '2px', height: '48px', backgroundColor: '#cbd5e1' }} />
            {/* Orange Anchor Ring */}
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                border: '4px solid #ea580c',
                boxShadow: '0 2px 6px rgba(234, 88, 12, 0.3)',
              }}
              title="Path 1 Anchor Endpoint"
            />
          </div>

          {/* PATH 2 (RIGHT: BLUE BADGE - GOLD LANCEDB 4 PILLARS) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                backgroundColor: '#0f172a',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 12px',
                borderRadius: '9999px',
                marginBottom: '10px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              }}
            >
              Path 2: Gold LanceDB
            </div>

            <div
              onClick={() => handleNodeClick('gold-lancedb', 'pillars')}
              style={{
                width: '100%',
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
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '9px',
                      backgroundColor: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>

                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Approved Status</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Gold LanceDB // 4 Mining Pillars</div>
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
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  4 PILLARS
                </button>
              </div>

              <div
                style={{
                  marginTop: '10px',
                  paddingTop: '8px',
                  borderTop: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: '#64748b',
                }}
              >
                <span>768-dim Embeddings</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{vectorsIndexed.toLocaleString()} Vectors</span>
              </div>
            </div>

            <div style={{ width: '2px', height: '48px', backgroundColor: '#cbd5e1' }} />
            {/* Orange Anchor Ring */}
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                border: '4px solid #ea580c',
                boxShadow: '0 2px 6px rgba(234, 88, 12, 0.3)',
              }}
              title="Path 2 Anchor Endpoint"
            />
          </div>
        </div>

        {/* Merge Flow Stem into Grounded RAG synthesis */}
        <div style={{ width: '100%', maxWidth: '640px', marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ width: '2px', height: '24px', backgroundColor: '#cbd5e1', marginLeft: '120px' }} />
            <div style={{ width: '2px', height: '24px', backgroundColor: '#cbd5e1', marginRight: '120px' }} />
          </div>
          <div style={{ width: '100%', height: '2px', backgroundColor: '#cbd5e1' }} />
          <div style={{ width: '2px', height: '24px', backgroundColor: '#cbd5e1', margin: '0 auto' }} />
        </div>

        {/* ============================================================== */}
        {/* FINAL NODE: GROUNDED RAG SYNTHESIS ENGINE */}
        {/* ============================================================== */}
        <div
          onClick={() => handleNodeClick('grounded-rag', 'rag')}
          style={{
            width: '100%',
            maxWidth: '460px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '14px 20px',
            border: simulationStage === 'completed'
              ? '2px solid #6366f1'
              : selectedNodeId === 'grounded-rag'
              ? '2px solid #6366f1'
              : '1px solid #e2e8f0',
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            marginTop: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '9px',
                backgroundColor: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Grounded RAG Console</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: '#ede9fe',
                    color: '#6d28d9',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 700,
                  }}
                >
                  VERIFIED QA
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Anti-Hallucination Guardrails // Exact Paper Citations
              </div>
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
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(99, 102, 241, 0.3)',
            }}
          >
            OPEN CHAT
          </button>
        </div>
      </div>
    </div>
  );
};
