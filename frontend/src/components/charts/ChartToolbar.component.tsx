import type { FC, RefObject } from 'react';

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
  svgRef?: RefObject<SVGSVGElement | null>;
  filename?: string;
  csvData?: Array<Record<string, any>> | string;
  onShowToast?: (msg: string) => void;
  language?: 'en' | 'vi';
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
  svgRef,
  filename = 'scientific-chart',
  csvData,
  onShowToast,
  language = 'vi',
}) => {
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

  const handleDownloadSvg = () => {
    if (!svgRef?.current) return;
    try {
      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgRef.current);
      if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (!source.match(/^<svg[^>]+xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/)) {
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }
      const preface = '<?xml version="1.0" standalone="no"?>\r\n';
      const svgBlob = new Blob([preface, source], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = svgUrl;
      downloadLink.download = `${filename}.svg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(svgUrl);
      if (onShowToast) {
        onShowToast(
          language === 'vi'
            ? `Đã xuất đồ họa vector ${filename}.svg thành công!`
            : `Successfully exported vector graphic ${filename}.svg!`
        );
      }
    } catch {
      if (onShowToast) {
        onShowToast(
          language === 'vi' ? 'Không thể xuất file SVG.' : 'Failed to export SVG file.'
        );
      }
    }
  };

  const handleDownloadCsv = () => {
    if (!csvData) return;
    try {
      let csvContent = '';
      if (typeof csvData === 'string') {
        csvContent = csvData;
      } else if (Array.isArray(csvData) && csvData.length > 0) {
        const headers = Object.keys(csvData[0]);
        csvContent = [
          headers.join(','),
          ...csvData.map((row) =>
            headers
              .map((fieldName) => {
                const val = row[fieldName];
                if (typeof val === 'string' && val.includes(',')) {
                  return `"${val.replace(/"/g, '""')}"`;
                }
                return val ?? '';
              })
              .join(',')
          ),
        ].join('\n');
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (onShowToast) {
        onShowToast(
          language === 'vi'
            ? `Đã tải xuống dữ liệu nguồn ${filename}.csv!`
            : `Successfully downloaded source dataset ${filename}.csv!`
        );
      }
    } catch {
      if (onShowToast) {
        onShowToast(
          language === 'vi' ? 'Không thể xuất file CSV.' : 'Failed to export CSV file.'
        );
      }
    }
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
          title={
            language === 'vi'
              ? 'Cuộn chuột / Trackpad để phóng to • Kéo để di chuyển góc nhìn (Drag to Pan)'
              : 'Scroll / Trackpad to zoom • Drag to pan view'
          }
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
              title={
                language === 'vi'
                  ? 'Đặt lại góc nhìn và tỷ lệ ban đầu 100% (Reset Pan & Zoom)'
                  : 'Reset initial view and 100% scale (Reset Pan & Zoom)'
              }
            >
              ↺ Reset {zoomLevel !== undefined ? `(${Math.round(zoomLevel * 100)}%)` : ''}
            </button>
          )}
          {onZoomOut && (
            <button
              type="button"
              onClick={onZoomOut}
              style={btnStyle}
              title={language === 'vi' ? 'Thu nhỏ đồ thị (Zoom Out)' : 'Zoom out chart'}
            >
              -
            </button>
          )}
          {onZoomIn && (
            <button
              type="button"
              onClick={onZoomIn}
              style={btnStyle}
              title={language === 'vi' ? 'Phóng to đồ thị (Zoom In)' : 'Zoom in chart'}
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
          title={
            language === 'vi'
              ? 'Kính lúp soi cụm hạt dày đặc (2.5x)'
              : 'Dense cluster magnifier lens (2.5x)'
          }
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
          title={
            language === 'vi'
              ? 'Bật / tắt các đường chuẩn tham chiếu (Mean, Median, P90)'
              : 'Toggle reference baselines (Mean, Median, P90)'
          }
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
          title={
            language === 'vi'
              ? (isSidebarCollapsed ? 'Mở lại bảng chi tiết [ ► ]' : 'Thu gọn bảng chi tiết để mở rộng đồ thị 100% [ ◄ ]')
              : (isSidebarCollapsed ? 'Expand detail panel [ ► ]' : 'Collapse detail panel [ ◄ ]')
          }
        >
          <span>
            {language === 'vi'
              ? (isSidebarCollapsed ? '► Bảng' : '◄ Bảng')
              : (isSidebarCollapsed ? '► Panel' : '◄ Panel')}
          </span>
        </button>
      )}

      {/* Theater / Fullscreen Mode Toggle */}
      {(onToggleTheater || onToggleMaximize) && (
        <button
          type="button"
          onClick={onToggleTheater || onToggleMaximize}
          style={(isTheater || isMaximized) ? activeBtnStyle : btnStyle}
          title={
            language === 'vi'
              ? ((isTheater || isMaximized) ? 'Thu nhỏ về khung nhìn thường' : 'Phóng đại toàn màn hình 100% (Theater Mode)')
              : ((isTheater || isMaximized) ? 'Exit theater mode' : 'Expand full screen (Theater Mode)')
          }
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
            <span>
              {language === 'vi'
                ? ((isTheater || isMaximized) ? 'Thu Nhỏ' : 'Rạp Hát')
                : ((isTheater || isMaximized) ? 'Minimize' : 'Theater')}
            </span>
          </span>
        </button>
      )}

      {/* SVG Export */}
      {svgRef && (
        <button
          type="button"
          onClick={handleDownloadSvg}
          style={btnStyle}
          title={
            language === 'vi'
              ? 'Tải ảnh vector SVG chuẩn xuất bản học thuật'
              : 'Download publication-grade vector SVG'
          }
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span>SVG</span>
        </button>
      )}

      {/* CSV Export */}
      {csvData && (
        <button
          type="button"
          onClick={handleDownloadCsv}
          style={btnStyle}
          title={
            language === 'vi'
              ? 'Tải tập dữ liệu nguồn CSV'
              : 'Download source CSV dataset'
          }
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span>CSV</span>
        </button>
      )}
    </div>
  );
};
