import type { FC } from 'react';
import { useTranslation } from '../../hooks';

export interface ChartToolbarProps {
  theme?: 'dark' | 'light';
  title?: string;
  zoomLevel?: number;
  hasPannedOrZoomed?: boolean;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  showBaselines?: boolean;
  onToggleBaselines?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  isTheater?: boolean;
  onToggleTheater?: () => void;
  isLensActive?: boolean;
  onToggleLens?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onShowToast?: (msg: string) => void;
}

export const ChartToolbar: FC<ChartToolbarProps> = ({
  theme = 'dark',
  zoomLevel,
  hasPannedOrZoomed,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  showBaselines,
  onToggleBaselines,
  isMaximized,
  onToggleMaximize,
  isTheater,
  onToggleTheater,
  isLensActive,
  onToggleLens,
  isSidebarCollapsed,
  onToggleSidebar,
}) => {
  const { language } = useTranslation();
  const isVi = language === 'vi';
  const isDark = theme === 'dark';

  const btnStyle = {
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : '#f8fafc',
    color: isDark ? '#94a3b8' : '#475569',
    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1'}`,
    borderRadius: '4px',
    padding: '2px 7px',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    lineHeight: '1.2',
    transition: 'all 0.15s ease',
  };

  const activeBtnStyle = {
    ...btnStyle,
    backgroundColor: isDark ? 'rgba(37, 99, 235, 0.25)' : '#eff6ff',
    color: isDark ? '#38bdf8' : '#2563eb',
    borderColor: isDark ? 'rgba(56, 189, 248, 0.5)' : '#93c5fd',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      {/* Zoom & Pan Controls */}
      {(onZoomIn || onZoomOut || onResetZoom) && (
        <div
          style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
          title={isVi ? 'Cuộn chuột / Trackpad để phóng to • Kéo để di chuyển góc nhìn (Drag to Pan)' : 'Scroll / Trackpad to zoom • Drag to pan'}
        >
          {onResetZoom && (
            <button
              type="button"
              onClick={onResetZoom}
              style={{
                ...btnStyle,
                padding: '2px 7px',
                fontSize: '10px',
                fontWeight: 700,
                color: (hasPannedOrZoomed || (zoomLevel !== undefined && zoomLevel !== 1)) ? (isDark ? '#38bdf8' : '#2563eb') : btnStyle.color,
                backgroundColor: (hasPannedOrZoomed || (zoomLevel !== undefined && zoomLevel !== 1)) ? (isDark ? 'rgba(56, 189, 248, 0.16)' : '#e0f2fe') : btnStyle.backgroundColor,
                border: (hasPannedOrZoomed || (zoomLevel !== undefined && zoomLevel !== 1)) ? `1px solid ${isDark ? 'rgba(56, 189, 248, 0.4)' : '#93c5fd'}` : btnStyle.border,
              }}
              title={isVi ? 'Đặt lại góc nhìn và tỷ lệ ban đầu 100% (Reset Pan & Zoom)' : 'Reset pan and scale to 100%'}
            >
              ↺ Reset {zoomLevel !== undefined ? `(${Math.round(zoomLevel * 100)}%)` : ''}
            </button>
          )}
          {onZoomOut && (
            <button
              type="button"
              onClick={onZoomOut}
              style={btnStyle}
              title={isVi ? 'Thu nhỏ đồ thị (Zoom Out)' : 'Zoom out'}
            >
              -
            </button>
          )}
          {onZoomIn && (
            <button
              type="button"
              onClick={onZoomIn}
              style={btnStyle}
              title={isVi ? 'Phóng to đồ thị (Zoom In)' : 'Zoom in'}
            >
              +
            </button>
          )}
        </div>
      )}

      {/* Lens / Magnifier Tool */}
      {onToggleLens && (
        <button
          type="button"
          onClick={onToggleLens}
          style={isLensActive ? activeBtnStyle : btnStyle}
          title={isVi ? 'Kính lúp soi cụm hạt dày đặc (2.5x)' : 'Magnifying lens for dense clusters (2.5x)'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Lens</span>
        </button>
      )}

      {/* Statistical Baselines Toggle */}
      {onToggleBaselines && (
        <button
          type="button"
          onClick={onToggleBaselines}
          style={showBaselines ? activeBtnStyle : btnStyle}
          title={isVi ? 'Bật / tắt các đường chuẩn tham chiếu (Mean, Median, P90)' : 'Toggle statistical baselines (Mean, Median, P90)'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
          <span>Baselines</span>
        </button>
      )}

      {/* Sidebar Collapse Toggle */}
      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          style={isSidebarCollapsed ? activeBtnStyle : btnStyle}
          title={isSidebarCollapsed
            ? (isVi ? 'Mở lại bảng chi tiết [ ► ]' : 'Expand inspector panel [ ► ]')
            : (isVi ? 'Thu gọn bảng chi tiết để mở rộng đồ thị 100% [ ◄ ]' : 'Collapse panel to expand chart to 100% [ ◄ ]')}
        >
          <span>{isSidebarCollapsed ? (isVi ? '► Bảng' : '► Panel') : (isVi ? '◄ Bảng' : '◄ Panel')}</span>
        </button>
      )}

      {/* Theater / Fullscreen Mode Toggle */}
      {(onToggleTheater || onToggleMaximize) && (
        <button
          type="button"
          onClick={onToggleTheater || onToggleMaximize}
          style={(isTheater || isMaximized) ? activeBtnStyle : btnStyle}
          title={(isTheater || isMaximized)
            ? (isVi ? 'Thu nhỏ về khung nhìn thường' : 'Exit fullscreen / theater')
            : (isVi ? 'Phóng đại toàn màn hình 100% (Theater Mode)' : 'Expand to full screen (Theater Mode)')}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {(isTheater || isMaximized) ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
            <span>{(isTheater || isMaximized) ? (isVi ? 'Thu Nhỏ' : 'Exit') : (isVi ? 'Rạp Hát' : 'Theater')}</span>
          </span>
        </button>
      )}
    </div>
  );
};
