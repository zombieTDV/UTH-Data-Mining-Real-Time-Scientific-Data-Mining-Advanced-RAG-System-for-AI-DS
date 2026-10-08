import { useState, useRef, type FC } from 'react';
import { PipelineFlow, StorageInspector } from '../components/schematic';
import { MetricsBento } from '../components/common';
import { useLakehouseStreamStore } from '../store';
import { useTranslation } from '../hooks';
import type { AppTab, AppTheme, PipelineStatus, SchematicViewMode } from '../types';

export interface SchematicScreenProps {
  viewMode?: SchematicViewMode;
  onViewModeChange?: (mode: SchematicViewMode) => void;
  theme?: AppTheme;
  pipelineStatus?: PipelineStatus;
  onNavigateTab?: (tab: AppTab) => void;
  onTriggerPipeline?: () => void;
}

export const SchematicScreen: FC<SchematicScreenProps> = ({
  theme = 'dark',
  pipelineStatus = 'IDLE',
  onNavigateTab,
  onTriggerPipeline,
}) => {
  const { language } = useTranslation();
  const { storageUsedGb, isStreaming } = useLakehouseStreamStore();
  const isDark = theme === 'dark';

  const [activeSection, setActiveSection] = useState<'bento' | 'medallion' | 'storage'>('bento');

  const bentoRef = useRef<HTMLDivElement>(null);
  const medallionRef = useRef<HTMLDivElement>(null);
  const storageRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (section: 'bento' | 'medallion' | 'storage') => {
    setActiveSection(section);
    const refMap = {
      bento: bentoRef,
      medallion: medallionRef,
      storage: storageRef,
    };
    refMap[section].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Top Schematic Control Bar (Anchored Header with Section Quick-Jumps) */}
      <div
        style={{
          height: '46px',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          zIndex: 30,
          gap: '16px',
        }}
      >
        {/* Left Side: Title & Real-Time Lakehouse Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px #10b981',
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span
              style={{
                fontSize: '12.5px',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
              }}
            >
              {language === 'vi'
                ? 'HỆ THỐNG LAKEHOUSE KHOA HỌC & KIẾN TRÚC MEDALLION'
                : 'SCIENTIFIC LAKEHOUSE & MEDALLION PIPELINE'}
            </span>

            {/* Micro Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                R2: {(storageUsedGb || 8.28).toFixed(2)} GB / 10 GB
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                DUCKDB SIMD: ONLINE
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                LANCEDB: 164.7K VECTORS
              </span>
              <span
                style={{
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: isStreaming ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                  color: isStreaming ? '#ef4444' : '#10b981',
                  border: isStreaming ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.25)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {isStreaming
                  ? (language === 'vi' ? '● ĐANG CÀO' : '● STREAMING')
                  : (language === 'vi' ? '● ĐỒNG BỘ' : '● SYNCED')}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Section Jump Navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--bg-surface-elevated, #162035)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              gap: '4px',
            }}
          >
            {[
              { id: 'bento' as const, label: language === 'vi' ? '01. BENTO CHỈ SỐ' : '01. CAPACITY BENTO' },
              { id: 'medallion' as const, label: language === 'vi' ? '02. TIẾN TRÌNH MEDALLION' : '02. MEDALLION FLOW' },
              { id: 'storage' as const, label: language === 'vi' ? '03. LĂNG KÍNH LƯU TRỮ' : '03. STORAGE LENS' },
            ].map((sec) => {
              const isSelected = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => scrollToSection(sec.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '5px',
                    fontSize: '10.5px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: isSelected ? 800 : 600,
                    border: isSelected ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid transparent',
                    backgroundColor: isSelected ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#dcfce7') : 'transparent',
                    color: isSelected ? (isDark ? '#34d399' : '#059669') : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {sec.label}
                </button>
              );
            })}
          </div>

          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('rag')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={language === 'vi' ? 'Chuyển sang RAG Chat hỏi đáp' : 'Switch to RAG Chat'}
            >
              <span>{language === 'vi' ? '▶ HỎI ĐÁP RAG' : '▶ RAG CHAT'}</span>
            </button>
          )}

          {onTriggerPipeline && (
            <button
              type="button"
              onClick={onTriggerPipeline}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                backgroundColor: pipelineStatus === 'RUNNING' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                color: pipelineStatus === 'RUNNING' ? '#ef4444' : '#10b981',
                border: pipelineStatus === 'RUNNING' ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(16, 185, 129, 0.4)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{language === 'vi' ? 'CHẠY PIPELINE' : 'RUN PIPELINE'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Unified Viewport (Single Scroll Container, Zero Tab Fragmenting) */}
      <div
        style={{
          flex: 1,
          width: '100%',
          overflowY: 'auto',
          padding: '20px 24px 48px',
          scrollBehavior: 'smooth',
        }}
      >
        <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* SECTION 1: METRICS BENTO & STORAGE CAPACITY */}
          <div ref={bentoRef} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                  PHÂN KHÚC 01
                </span>
                <span style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {language === 'vi' ? 'TỔNG QUAN QUY MÔ & DUNG LƯỢNG LƯU TRỮ' : 'LAKEHOUSE CAPACITY & METRICS BENTO'}
                </span>
              </div>
              <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {language === 'vi' ? 'Hạn mức 10GB Cloudflare R2 • 36,414 công trình • 2.22M công thức toán' : '10GB Cloudflare R2 Quota • 36,414 Works • 2.22M LaTeX Formulas'}
              </span>
            </div>
            <MetricsBento />
          </div>

          {/* SECTION 2: MEDALLION PIPELINE ARCHITECTURE */}
          <div ref={medallionRef} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  PHÂN KHÚC 02
                </span>
                <span style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {language === 'vi' ? 'KIẾN TRÚC TIẾN TRÌNH MEDALLION (BRONZE • SILVER • GOLD • INFERENCE)' : 'MEDALLION PIPELINE ARCHITECTURE (BRONZE • SILVER • GOLD • INFERENCE)'}
                </span>
              </div>
              <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {language === 'vi' ? 'Chuẩn hóa quy trình 4 tầng: Ingest thô -> Parquet DuckDB -> Vector LanceDB -> RAG học thuật' : '4-tier enterprise flow: Raw Ingestion -> Parquet DuckDB -> Vector LanceDB -> Academic RAG'}
              </span>
            </div>
            <PipelineFlow />
          </div>

          {/* SECTION 3: MULTI-TIER STORAGE LENS & SCHEDULER */}
          <div ref={storageRef} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  PHÂN KHÚC 03
                </span>
                <span style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {language === 'vi' ? 'LĂNG KÍNH LƯU TRỮ ĐA TẦNG & BỘ LẬP LỊCH TỰ HÀNH' : 'MULTI-TIER STORAGE LENS & AUTONOMOUS SCHEDULER'}
                </span>
              </div>
              <span style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {language === 'vi' ? 'Khảo sát cây thư mục R2, bảng Parquet nén Snappy 4.2x và điều khiển Daemon tự động' : 'Inspect R2 object tree, Snappy 4.2x Parquets, and configure autonomous crawl daemon'}
              </span>
            </div>
            <StorageInspector />
          </div>
        </div>
      </div>
    </div>
  );
};
