import React, { useState } from 'react';

export interface LatexPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  latexCode: string;
  filename?: string;
  language?: 'vi' | 'en';
  theme?: 'dark' | 'light';
}

export const LatexPreviewModal: React.FC<LatexPreviewModalProps> = ({
  isOpen,
  onClose,
  title,
  latexCode,
  filename = 'uth-mining-table.tex',
  language = 'vi',
  theme = 'dark',
}) => {
  const [copied, setCopied] = useState(false);
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(latexCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([latexCode], { type: 'text/x-tex;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename.endsWith('.tex') ? filename : `${filename}.tex`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const lineCount = latexCode.split('\n').length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '760px',
          maxHeight: '88vh',
          backgroundColor: isDark ? '#0f172a' : '#ffffff',
          color: isDark ? '#f8fafc' : '#0f172a',
          borderRadius: '12px',
          border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : '#e2e8f0'}`,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(234, 88, 12, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ea580c',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>{title}</div>
              <div
                style={{
                  fontSize: '11px',
                  color: isDark ? '#94a3b8' : '#64748b',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {filename} &bull; {lineCount} {language === 'vi' ? 'dòng mã LaTeX' : 'lines of LaTeX'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: copied ? '#10b981' : '#ea580c',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              title={language === 'vi' ? 'Sao chép vào Clipboard' : 'Copy to Clipboard'}
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
              <span>
                {copied
                  ? language === 'vi'
                    ? 'Đã chép!'
                    : 'Copied!'
                  : language === 'vi'
                  ? 'Sao chép'
                  : 'Copy'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
                color: isDark ? '#f8fafc' : '#334155',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1'}`,
                cursor: 'pointer',
              }}
              title={language === 'vi' ? 'Tải tệp mã .tex về máy' : 'Download .tex file'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{language === 'vi' ? 'Tải .tex' : 'Download'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                color: isDark ? '#94a3b8' : '#64748b',
                border: 'none',
                cursor: 'pointer',
              }}
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px',
            backgroundColor: isDark ? '#020617' : '#f1f5f9',
          }}
        >
          <pre
            style={{
              margin: 0,
              fontFamily: 'var(--font-mono, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace)',
              fontSize: '12px',
              lineHeight: 1.6,
              color: isDark ? '#38bdf8' : '#0369a1',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {latexCode}
          </pre>
        </div>

        {/* Footer Note */}
        <div
          style={{
            padding: '10px 20px',
            borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
            fontSize: '11px',
            color: isDark ? '#64748b' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: isDark ? '#0f172a' : '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span>
              {language === 'vi'
                ? 'Định dạng chuẩn IEEE / ACM \\usepackage{booktabs}'
                : 'Formatted for IEEE / ACM papers with \\usepackage{booktabs}'}
            </span>
          </div>
          <span>
            {language === 'vi' ? 'Nhấn ESC hoặc nhấp bên ngoài để đóng' : 'Press ESC or click outside to dismiss'}
          </span>
        </div>
      </div>
    </div>
  );
};
