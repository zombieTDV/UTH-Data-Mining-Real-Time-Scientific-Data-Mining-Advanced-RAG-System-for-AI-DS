import { useState, useEffect, type FC } from 'react';
import { InteractiveWorkflowCanvas, PipelineFlow, StorageInspector } from '../components/schematic';
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

export type CanvasOverlayType = 'none' | 'bento' | 'medallion' | 'storage';

export const SchematicScreen: FC<SchematicScreenProps> = ({
  theme = 'dark',
  pipelineStatus = 'IDLE',
  onNavigateTab,
  onTriggerPipeline,
}) => {
  const { language } = useTranslation();
  const { storageUsedGb, isStreaming } = useLakehouseStreamStore();
  const isDark = theme === 'dark';

  const [activeOverlay, setActiveOverlay] = useState<CanvasOverlayType>('none');

  // Keyboard shortcut listener: Escape to close overlay, B for Bento, M for Medallion, S for Storage
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.key === 'Escape') {
        setActiveOverlay('none');
      } else if (e.key === 'b' || e.key === 'B') {
        setActiveOverlay((prev) => (prev === 'bento' ? 'none' : 'bento'));
      } else if (e.key === 'm' || e.key === 'M') {
        setActiveOverlay((prev) => (prev === 'medallion' ? 'none' : 'medallion'));
      } else if (e.key === 's' || e.key === 'S') {
        setActiveOverlay((prev) => (prev === 'storage' ? 'none' : 'storage'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
      {/* Top Schematic Control Bar (Integrated Header with Direct Icon Triggers) */}
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
        {/* Left Side: Title & Live Lakehouse Badges */}
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
                ? 'SƠ ĐỒ LUỒNG PIPELINE LAKEHOUSE (CANVAS FLOW)'
                : 'LAKEHOUSE WORKFLOW PIPELINE CANVAS'}
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

        {/* Right Side: Integrated Icon Triggers to Open Bento, Medallion, and Storage on top of Canvas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Integrated Tool Icons Group */}
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
            {/* 1. Bento Metrics Icon Button */}
            <button
              type="button"
              onClick={() => setActiveOverlay((prev) => (prev === 'bento' ? 'none' : 'bento'))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '5px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: activeOverlay === 'bento' ? 800 : 600,
                backgroundColor: activeOverlay === 'bento' ? (isDark ? 'rgba(56, 189, 248, 0.25)' : '#e0f2fe') : 'transparent',
                color: activeOverlay === 'bento' ? '#38bdf8' : 'var(--text-secondary)',
                border: activeOverlay === 'bento' ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={language === 'vi' ? 'Bật/tắt bảng chỉ số Bento (Phím B)' : 'Toggle Bento Metrics (Key B)'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" />
                <rect x="14" y="3" width="7" height="5" />
                <rect x="14" y="12" width="7" height="9" />
                <rect x="3" y="16" width="7" height="5" />
              </svg>
              <span>{language === 'vi' ? 'BENTO CHỈ SỐ' : 'BENTO METRICS'}</span>
            </button>

            {/* 2. Medallion Flow Icon Button */}
            <button
              type="button"
              onClick={() => setActiveOverlay((prev) => (prev === 'medallion' ? 'none' : 'medallion'))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '5px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: activeOverlay === 'medallion' ? 800 : 600,
                backgroundColor: activeOverlay === 'medallion' ? (isDark ? 'rgba(16, 185, 129, 0.25)' : '#dcfce7') : 'transparent',
                color: activeOverlay === 'medallion' ? '#10b981' : 'var(--text-secondary)',
                border: activeOverlay === 'medallion' ? '1px solid rgba(16, 185, 129, 0.6)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={language === 'vi' ? 'Bật/tắt kiến trúc Medallion (Phím M)' : 'Toggle Medallion Flow (Key M)'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span>{language === 'vi' ? 'KIẾN TRÚC MEDALLION' : 'MEDALLION FLOW'}</span>
            </button>

            {/* 3. Storage Inspector Icon Button */}
            <button
              type="button"
              onClick={() => setActiveOverlay((prev) => (prev === 'storage' ? 'none' : 'storage'))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '5px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: activeOverlay === 'storage' ? 800 : 600,
                backgroundColor: activeOverlay === 'storage' ? (isDark ? 'rgba(245, 158, 11, 0.25)' : '#fef3c7') : 'transparent',
                color: activeOverlay === 'storage' ? '#f59e0b' : 'var(--text-secondary)',
                border: activeOverlay === 'storage' ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={language === 'vi' ? 'Bật/tắt lăng kính lưu trữ R2 & Điều phối (Phím S)' : 'Toggle Storage Inspector & Scheduler (Key S)'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
              <span>{language === 'vi' ? 'LĂNG KÍNH LƯU TRỮ' : 'STORAGE LENS'}</span>
            </button>
          </div>

          {/* Quick Jump to RAG */}
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

          {/* Run Pipeline Button */}
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

      {/* Main Viewport: THE INTERACTIVE CANVAS FLOW (Always rendered & running) */}
      <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        <InteractiveWorkflowCanvas
          onNavigateTab={onNavigateTab}
          isPipelineRunning={pipelineStatus === 'RUNNING'}
          onTriggerPipeline={onTriggerPipeline}
          theme={theme}
          language={language}
        />
      </div>

      {/* ============================================================== */}
      {/* INTEGRATED SLIDE-OVER OVERLAY MODAL (ON TOP OF CANVAS)         */}
      {/* ============================================================== */}
      {activeOverlay !== 'none' && (
        <div
          onClick={() => setActiveOverlay('none')}
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(10px)',
            zIndex: 60,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '24px',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          {/* Modal Container */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '1380px',
              width: '100%',
              maxHeight: '90vh',
              backgroundColor: isDark ? '#0b1120' : '#ffffff',
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.18)' : '#cbd5e1'}`,
              borderRadius: '16px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                height: '56px',
                padding: '0 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
                flexShrink: 0,
              }}
            >
              {/* Left Title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>
                  {activeOverlay === 'bento' ? '📊' : activeOverlay === 'medallion' ? '🏛️' : '🗄️'}
                </span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                    {activeOverlay === 'bento'
                      ? (language === 'vi' ? 'TỔNG QUAN QUY MÔ & DUNG LƯỢNG LƯU TRỮ' : 'LAKEHOUSE CAPACITY & METRICS BENTO')
                      : activeOverlay === 'medallion'
                      ? (language === 'vi' ? 'KIẾN TRÚC TIẾN TRÌNH MEDALLION (BRONZE • SILVER • GOLD • INFERENCE)' : 'MEDALLION PIPELINE ARCHITECTURE')
                      : (language === 'vi' ? 'LĂNG KÍNH LƯU TRỮ ĐA TẦNG & BỘ LẬP LỊCH TỰ HÀNH' : 'MULTI-TIER STORAGE LENS & AUTONOMOUS SCHEDULER')}
                  </div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {activeOverlay === 'bento'
                      ? (language === 'vi' ? 'Hạn mức 10GB Cloudflare R2 • 36,414 công trình • 2.22M công thức toán' : '10GB Cloudflare R2 Quota • 36,414 Works • 2.22M LaTeX Formulas')
                      : activeOverlay === 'medallion'
                      ? (language === 'vi' ? 'Quy trình chuẩn Enterprise từ thu thập thô đến phục vụ RAG học thuật' : 'Enterprise 4-stage flow from raw harvest to academic RAG')
                      : (language === 'vi' ? 'Cây thư mục R2, bảng Parquet nén Snappy 4.2x và điều khiển Daemon cào' : 'R2 object tree, Snappy 4.2x Parquets, and crawl daemon')}
                  </div>
                </div>
              </div>

              {/* Center Tab Switcher (Fast Switching within Modal) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0',
                  padding: '3px',
                  borderRadius: '8px',
                }}
              >
                {[
                  { id: 'bento' as const, label: language === 'vi' ? 'Bento Chỉ Số' : 'Bento Metrics' },
                  { id: 'medallion' as const, label: language === 'vi' ? 'Tiến Trình Medallion' : 'Medallion Flow' },
                  { id: 'storage' as const, label: language === 'vi' ? 'Lăng Kính Lưu Trữ' : 'Storage Lens' },
                ].map((tab) => {
                  const isCurrent = activeOverlay === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveOverlay(tab.id)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: isCurrent ? 800 : 600,
                        backgroundColor: isCurrent ? (isDark ? '#1e293b' : '#ffffff') : 'transparent',
                        color: isCurrent ? (isDark ? '#f8fafc' : '#0f172a') : 'var(--text-muted)',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: isCurrent ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Right Close Button */}
              <button
                type="button"
                onClick={() => setActiveOverlay('none')}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1'}`,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 700,
                  transition: 'all 0.15s ease',
                }}
                title={language === 'vi' ? 'Đóng (Phím Escape)' : 'Close (Escape)'}
              >
                ✕
              </button>
            </div>

            {/* Modal Content Body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px',
                backgroundColor: isDark ? '#0b1120' : '#ffffff',
              }}
            >
              {activeOverlay === 'bento' && <MetricsBento />}
              {activeOverlay === 'medallion' && <PipelineFlow />}
              {activeOverlay === 'storage' && <StorageInspector />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
