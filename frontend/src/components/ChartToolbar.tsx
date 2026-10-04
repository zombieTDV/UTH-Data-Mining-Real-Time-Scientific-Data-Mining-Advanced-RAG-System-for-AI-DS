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
      if (onShowToast) onShowToast(`Đã xuất đồ họa vector ${filename}.svg thành công!`);
    } catch {
      if (onShowToast) onShowToast('Không thể xuất file SVG.');
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
      if (onShowToast) onShowToast(`Đã tải xuống dữ liệu nguồn ${filename}.csv!`);
    } catch {
      if (onShowToast) onShowToast('Không thể xuất file CSV.');
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
      {onZoomIn && onZoomOut && (
        <div
          style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
          title="Cuộn chuột / Trackpad để phóng to • Kéo để di chuyển góc nhìn (Drag to Pan)"
        >
          <button
            type="button"
            onClick={onZoomOut}
            style={btnStyle}
            title="Thu nhỏ đồ thị (Zoom Out)"
          >
            -
          </button>
          {zoomLevel !== undefined && onResetZoom && (
            <button
              type="button"
              onClick={onResetZoom}
              style={{
                ...btnStyle,
                padding: '2px 6px',
                fontSize: '10px',
                fontWeight: 700,
                color: (hasPannedOrZoomed || zoomLevel !== 1) ? (isDark ? '#38bdf8' : '#2563eb') : btnStyle.color,
                backgroundColor: (hasPannedOrZoomed || zoomLevel !== 1) ? (isDark ? 'rgba(56, 189, 248, 0.16)' : '#e0f2fe') : btnStyle.backgroundColor,
                borderColor: (hasPannedOrZoomed || zoomLevel !== 1) ? (isDark ? 'rgba(56, 189, 248, 0.4)' : '#93c5fd') : btnStyle.borderColor,
              }}
              title="Đặt lại góc nhìn và tỷ lệ ban đầu 100% (Reset Pan & Zoom)"
            >
              ↺ {Math.round(zoomLevel * 100)}%
            </button>
          )}
          <button
            type="button"
            onClick={onZoomIn}
            style={btnStyle}
            title="Phóng to đồ thị (Zoom In)"
          >
            +
          </button>
        </div>
      )}

      {/* Lens / Magnifier Tool */}
      {onToggleLens && (
        <button
          type="button"
          onClick={onToggleLens}
          style={isLensActive ? activeBtnStyle : btnStyle}
          title="Kính lúp soi cụm hạt dày đặc (2.5x)"
        >
          <span>🔍</span>
          <span>Lens</span>
        </button>
      )}

      {/* Statistical Baselines Toggle */}
      {onToggleBaselines && (
        <button
          type="button"
          onClick={onToggleBaselines}
          style={showBaselines ? activeBtnStyle : btnStyle}
          title="Bật / tắt các đường chuẩn tham chiếu (Mean, Median, P90)"
        >
          <span>📈</span>
          <span>Baselines</span>
        </button>
      )}

      {/* Sidebar Collapse Toggle */}
      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          style={isSidebarCollapsed ? activeBtnStyle : btnStyle}
          title={isSidebarCollapsed ? 'Mở lại bảng chi tiết [ ► ]' : 'Thu gọn bảng chi tiết để mở rộng đồ thị 100% [ ◄ ]'}
        >
          <span>{isSidebarCollapsed ? '► Bảng' : '◄ Bảng'}</span>
        </button>
      )}

      {/* Theater / Fullscreen Mode Toggle */}
      {(onToggleTheater || onToggleMaximize) && (
        <button
          type="button"
          onClick={onToggleTheater || onToggleMaximize}
          style={(isTheater || isMaximized) ? activeBtnStyle : btnStyle}
          title={(isTheater || isMaximized) ? 'Thu nhỏ về khung nhìn thường' : 'Phóng đại toàn màn hình 100% (Theater Mode)'}
        >
          <span>{(isTheater || isMaximized) ? '⤡ Thu Nhỏ' : '⛶ Rạp Hát'}</span>
        </button>
      )}

      {/* SVG Export */}
      {svgRef && (
        <button
          type="button"
          onClick={handleDownloadSvg}
          style={btnStyle}
          title="Tải ảnh vector SVG chuẩn xuất bản học thuật"
        >
          <span>📷</span>
          <span>SVG</span>
        </button>
      )}

      {/* CSV Export */}
      {csvData && (
        <button
          type="button"
          onClick={handleDownloadCsv}
          style={btnStyle}
          title="Tải tập dữ liệu nguồn CSV"
        >
          <span>📊</span>
          <span>CSV</span>
        </button>
      )}
    </div>
  );
};
