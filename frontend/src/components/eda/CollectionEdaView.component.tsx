import { useState, useMemo, type FC } from 'react';
import type { CollectionEdaSummary, ProcessingEdaSummary } from '../../types';

interface CollectionEdaViewProps {
  theme?: 'dark' | 'light';
  collectionData?: CollectionEdaSummary;
  processingData?: ProcessingEdaSummary;
  onShowToast?: (msg: string) => void;
}

type CollectionCardId = 'ai_overview' | 'sources' | 'timeline' | 'missingness' | 'cleaning' | 'all_grid';

interface CardTabDef {
  id: CollectionCardId;
  label: string;
  icon: string;
  badge?: string;
}

export const CollectionEdaView: FC<CollectionEdaViewProps> = ({
  theme = 'dark',
  collectionData,
  processingData,
  onShowToast,
}) => {
  const isDark = theme === 'dark';
  const [activeCard, setActiveCard] = useState<CollectionCardId>('ai_overview');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');

  // Fallback defaults representing the 29,911 Lakehouse bronze corpus
  const fallbackSources = [
    { name: 'arXiv', count: 25000, percentage: 83.58, color: '#f59e0b', badge: 'OAI-PMH XML API', harvest_mode: 'Batch XML Ingest' },
    { name: 'OpenReview', count: 3000, percentage: 10.03, color: '#3b82f6', badge: 'REST v2 API', harvest_mode: 'Peer-Review Crawl' },
    { name: 'CVF', count: 1911, percentage: 6.39, color: '#10b981', badge: 'HTML Scraping', harvest_mode: 'Proceedings Scraper' },
  ];

  const sources = collectionData?.sources || fallbackSources;
  const totalCollected = collectionData?.total_collected || 29911;

  const fallbackMissingness = [
    { field: 'paper_id', display_name: 'Mã định danh (Paper ID)', present: 29911, missing: 0, pct_missing: 0.0, status: 'HOÀN HẢO', color: '#10b981' },
    { field: 'title', display_name: 'Tiêu đề bài báo (Title)', present: 29911, missing: 0, pct_missing: 0.0, status: 'HOÀN HẢO', color: '#10b981' },
    { field: 'full_text', display_name: 'Toàn văn Markdown (Full-Text)', present: 29911, missing: 0, pct_missing: 0.0, status: 'HOÀN HẢO', color: '#10b981' },
    { field: 'categories', display_name: 'Phân loại chuyên ngành (Taxonomy)', present: 29911, missing: 0, pct_missing: 0.0, status: 'HOÀN HẢO', color: '#10b981' },
    { field: 'abstract', display_name: 'Tóm tắt bài báo (Abstract)', present: 29851, missing: 60, pct_missing: 0.2, status: 'TỐT (99.8%)', color: '#10b981' },
    { field: 'authors', display_name: 'Danh sách tác giả (Authors)', present: 29762, missing: 149, pct_missing: 0.5, status: 'TỐT (99.5%)', color: '#10b981' },
    { field: 'review_score', display_name: 'Điểm phản biện (Review Score)', present: 3000, missing: 26911, pct_missing: 89.97, status: 'CHỈ OPENREVIEW', color: '#f59e0b' },
  ];

  const missingnessList = collectionData?.missingness || fallbackMissingness;

  const fallbackTimeline = [
    { year: '2020', count: 1820, sources: { arXiv: 1500, OpenReview: 200, CVF: 120 } },
    { year: '2021', count: 3410, sources: { arXiv: 2800, OpenReview: 410, CVF: 200 } },
    { year: '2022', count: 6240, sources: { arXiv: 5100, OpenReview: 740, CVF: 400 } },
    { year: '2023', count: 8120, sources: { arXiv: 6800, OpenReview: 820, CVF: 500 } },
    { year: '2024', count: 10321, sources: { arXiv: 8800, OpenReview: 830, CVF: 691 } },
  ];

  const timelineList = collectionData?.timeline || fallbackTimeline;

  const cleaningSteps = useMemo(() => {
    if (processingData?.cleaning_steps && processingData.cleaning_steps.length > 0) {
      const colors = ['#3b82f6', '#ea580c', '#10b981', '#7c3aed'];
      return processingData.cleaning_steps.map((st, idx) => ({
        step: `${idx + 1}. ${st.step}`,
        stat: st.reduction_pct ? `-${st.reduction_pct}% nhiễu` : st.extraction_accuracy ? `${st.extraction_accuracy}% chính xác` : st.coverage_pct ? `${st.coverage_pct}% cấu trúc` : st.status,
        desc: idx === 0 ? 'Khử header, footer, số trang lặp lại giữa các trang PDF' : idx === 1 ? 'Bóc tách công thức toán inline $ và display $$' : idx === 2 ? 'Phân đoạn: Abstract, Intro, Method, Exp, Conclusion' : 'Khử control chars, chuẩn hóa ASCII và bảng Markdown',
        color: colors[idx % colors.length],
      }));
    }
    return [
      {
        step: '1. Khử nhiễu Header, Footer & Đánh số trang',
        stat: '-3.8% nhiễu',
        desc: 'Khử header, footer, số trang lặp lại giữa các trang PDF',
        color: '#3b82f6',
      },
      {
        step: '2. Tách xuất Công thức Toán LaTeX ($ & $$)',
        stat: '98.4% chính xác',
        desc: 'Bóc tách công thức toán inline $ và display $$',
        color: '#ea580c',
      },
      {
        step: '3. Phân đoạn Cấu trúc Bài báo (Section Tree)',
        stat: '99.2% cấu trúc',
        desc: 'Phân đoạn: Abstract, Intro, Method, Exp, Conclusion',
        color: '#10b981',
      },
      {
        step: '4. Chuẩn hóa Bảng biểu Markdown & Ký tự Unicode',
        stat: '1.5% tối ưu',
        desc: 'Khử control chars, chuẩn hóa ASCII và bảng Markdown',
        color: '#7c3aed',
      },
    ];
  }, [processingData]);

  // Donut geometry for sources (Thin-ring aesthetic)
  const donutSlices = useMemo(() => {
    const circumference = 2 * Math.PI * 34;
    let cumulativeOffset = 0;
    return sources.map((s) => {
      const arcLength = (s.percentage / 100) * circumference;
      const dashArray = `${arcLength.toFixed(1)} ${(circumference - arcLength).toFixed(1)}`;
      const dashOffset = (-cumulativeOffset).toFixed(1);
      cumulativeOffset += arcLength;
      return {
        ...s,
        dashArray,
        dashOffset,
      };
    });
  }, [sources]);

  const maxTimelineCount = Math.max(...timelineList.map((t) => t.count), 1);

  const themeStyles = {
    cardBg: isDark ? 'rgba(15, 23, 42, 0.78)' : '#ffffff',
    cardSubtle: isDark ? 'rgba(255, 255, 255, 0.035)' : '#f8fafc',
    border: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#475569',
    textMuted: isDark ? '#64748b' : '#94a3b8',
    trackBg: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0',
    highlightBg: isDark ? 'rgba(37, 99, 235, 0.22)' : 'rgba(37, 99, 235, 0.12)',
    highlightText: isDark ? '#93c5fd' : '#1d4ed8',
  };

  const cardTabs: CardTabDef[] = [
    { id: 'ai_overview', label: '1. AI Overview', icon: '✦', badge: 'Tổng quan' },
    { id: 'sources', label: '2. Nguồn Cào', icon: '📊', badge: '3 Kênh' },
    { id: 'timeline', label: '3. Tiến Trình Năm', icon: '📈', badge: '2020-2024' },
    { id: 'missingness', label: '4. Kiểm Toán Dữ Liệu', icon: '🔍', badge: '100% MD' },
    { id: 'cleaning', label: '5. Tiền Xử Lý Silver', icon: '⚙️', badge: '4 Bước' },
    { id: 'all_grid', label: '6. Xem Toàn Cảnh', icon: '▦', badge: 'Grid' },
  ];

  const currentTabIdx = cardTabs.findIndex((c) => c.id === activeCard);

  const handlePrevCard = () => {
    const nextIdx = (currentTabIdx - 1 + cardTabs.length) % cardTabs.length;
    setActiveCard(cardTabs[nextIdx].id);
  };

  const handleNextCard = () => {
    const nextIdx = (currentTabIdx + 1) % cardTabs.length;
    setActiveCard(cardTabs[nextIdx].id);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        gap: '6px',
        overflow: 'hidden', // Strictly zero-scroll cockpit
      }}
    >
      {/* ============================================================== */}
      {/* CARD NAVIGATION BAR (TÁCH THÀNH CÁC CARD ĐỂ CHUYỂN QUA LẠI)      */}
      {/* ============================================================== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          borderRadius: '6px',
          backgroundColor: themeStyles.cardBg,
          border: `1px solid ${themeStyles.border}`,
          flexShrink: 0,
          gap: '6px',
          flexWrap: 'wrap',
        }}
      >
        {/* Segmented Card Selector Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textMuted, marginRight: '4px' }}>
            CHỌN THẺ PHÂN TÍCH:
          </span>
          {cardTabs.map((tab) => {
            const isSelected = activeCard === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCard(tab.id)}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: isSelected ? 800 : 500,
                  backgroundColor: isSelected
                    ? isDark
                      ? '#2563eb'
                      : '#dbeafe'
                    : 'transparent',
                  color: isSelected
                    ? isDark
                      ? '#ffffff'
                      : '#1e40af'
                    : themeStyles.textSecondary,
                  border: isSelected
                    ? '1px solid #3b82f6'
                    : `1px solid ${themeStyles.border}`,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    style={{
                      fontSize: '8px',
                      padding: '0 4px',
                      borderRadius: '3px',
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : themeStyles.cardSubtle,
                      opacity: 0.9,
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Prev / Next Quick Jump Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={handlePrevCard}
            style={{
              padding: '2px 7px',
              borderRadius: '3px',
              fontSize: '9.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              backgroundColor: themeStyles.cardSubtle,
              border: `1px solid ${themeStyles.border}`,
              color: themeStyles.textSecondary,
              cursor: 'pointer',
            }}
            title="Chuyển sang thẻ trước"
          >
            ‹ Trước
          </button>
          <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
            {currentTabIdx + 1}/{cardTabs.length}
          </span>
          <button
            type="button"
            onClick={handleNextCard}
            style={{
              padding: '2px 7px',
              borderRadius: '3px',
              fontSize: '9.5px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              backgroundColor: themeStyles.cardSubtle,
              border: `1px solid ${themeStyles.border}`,
              color: themeStyles.textSecondary,
              cursor: 'pointer',
            }}
            title="Chuyển sang thẻ tiếp theo"
          >
            Tiếp ›
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* ACTIVE CARD VIEWPORT (DEDICATED FULL-SPACE CONTENT)             */}
      {/* ============================================================== */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* ------------------------------------------------------------ */}
        {/* CARD 1: GOOGLE AI OVERVIEW INSPIRED EXECUTIVE SYNTHESIS      */}
        {/* ------------------------------------------------------------ */}
        {activeCard === 'ai_overview' && (
          <div
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              border: `1px solid ${themeStyles.border}`,
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              height: '100%',
              overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', color: '#8b5cf6' }}>✦</span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary }}>
                  Thông tin tổng quan do AI tạo (Executive AI Overview)
                </span>
              </div>
              <span
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#dcfce7',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                ✓ Bronze Lakehouse Audit Passed
              </span>
            </div>

            {/* Hero Synthesis Paragraph with Soft Blue Highlight Pills */}
            <div
              style={{
                fontSize: '12px',
                color: themeStyles.textSecondary,
                lineHeight: 1.6,
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: themeStyles.cardSubtle,
                border: `1px solid ${themeStyles.border}`,
              }}
            >
              Bộ dữ liệu nghiên cứu khoa học gồm{' '}
              <span
                style={{
                  backgroundColor: themeStyles.highlightBg,
                  color: themeStyles.highlightText,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontWeight: 700,
                }}
              >
                {totalCollected.toLocaleString()} bài báo toàn văn
              </span>{' '}
              được thu thập tự động từ 3 nguồn chính:{' '}
              <span
                style={{
                  backgroundColor: themeStyles.highlightBg,
                  color: themeStyles.highlightText,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontWeight: 700,
                }}
              >
                arXiv (83.6%)
              </span>
              ,{' '}
              <span
                style={{
                  backgroundColor: themeStyles.highlightBg,
                  color: themeStyles.highlightText,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontWeight: 700,
                }}
              >
                OpenReview (10.0%)
              </span>{' '}
              và{' '}
              <span
                style={{
                  backgroundColor: themeStyles.highlightBg,
                  color: themeStyles.highlightText,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontWeight: 700,
                }}
              >
                CVF (6.4%)
              </span>
              . Toàn bộ 100% tài liệu đã được bóc tách toàn văn sang Markdown chuẩn tắc phục vụ kiến trúc RAG.
            </div>

            {/* 2-Column Structured Deep-Dive (Image 0 Clean Bullet Style) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', flex: 1, minHeight: 0 }}>
              {/* Box A: Quality & Completeness */}
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: themeStyles.cardSubtle,
                  border: `1px solid ${themeStyles.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <h5 style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>
                  1. Đặc điểm chất lượng &amp; Toàn vẹn dữ liệu
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: themeStyles.textSecondary, lineHeight: 1.45 }}>
                  <div>
                    <strong style={{ color: themeStyles.textPrimary }}>• Độ đầy đủ cốt lõi: </strong>
                    Bảo toàn 100.0% dữ liệu ở các trường Mã định danh (Paper ID), Tiêu đề, Toàn văn và Phân loại chuyên ngành (Taxonomy).
                  </div>
                  <div>
                    <strong style={{ color: themeStyles.textPrimary }}>• Ngoại lệ khuyết thiếu: </strong>
                    Abstract (99.8%) và Authors (99.5%) đạt tỷ lệ thu hoạch cao; riêng Điểm phản biện (*review score*) chỉ hiện diện ở OpenReview (3,000 bài).
                  </div>
                  <div>
                    <strong style={{ color: themeStyles.textPrimary }}>• Tốc độ tăng trưởng: </strong>
                    Sản lượng bài báo tăng trưởng +467% từ năm 2020 (1.8k bài) đến 2024 (10.3k bài), phản ánh sự bùng nổ nghiên cứu AI/DS.
                  </div>
                </div>
              </div>

              {/* Box B: Processing & RAG Readiness */}
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: themeStyles.cardSubtle,
                  border: `1px solid ${themeStyles.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <h5 style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>
                  2. Quy chuẩn xử lý &amp; Khả năng sẵn sàng cho RAG
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', color: themeStyles.textSecondary, lineHeight: 1.45 }}>
                  <div>
                    <strong style={{ color: '#0284c7' }}>• Không nội suy nhân tạo: </strong>
                    Tuân thủ nguyên tắc không gán điểm đánh giá giả định cho bài arXiv/CVF nhằm tránh làm méo mó phân phối xác suất.
                  </div>
                  <div>
                    <strong style={{ color: '#ea580c' }}>• Bóc tách công thức toán LaTeX: </strong>
                    Khai phá thành công 2,832,609 biểu thức toán học ($ và $$) với độ chính xác cấu trúc 98.4%.
                  </div>
                  <div>
                    <strong style={{ color: '#10b981' }}>• Khử nhiễu cấu trúc bài báo: </strong>
                    Loại bỏ 3.8% nhiễu lặp header/footer/số trang và chuẩn hóa cây Section Tree đạt 99.2% độ bao phủ.
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Sources Bar */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: '6px',
                borderTop: `1px solid ${themeStyles.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                Kênh thu hoạch &amp; Giao thức API:
              </span>
              <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: '4px', backgroundColor: themeStyles.cardSubtle, border: `1px solid ${themeStyles.border}`, color: '#f59e0b' }}>
                arXiv OAI-PMH (XML Ingest) ↗
              </span>
              <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: '4px', backgroundColor: themeStyles.cardSubtle, border: `1px solid ${themeStyles.border}`, color: '#3b82f6' }}>
                OpenReview REST v2 (Peer-Review Crawl) ↗
              </span>
              <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: '4px', backgroundColor: themeStyles.cardSubtle, border: `1px solid ${themeStyles.border}`, color: '#10b981' }}>
                CVF Proceedings (HTML Scraper) ↗
              </span>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {/* CARD 2: CƠ CẤU 3 NGUỒN CÀO (SOURCES INGEST)                  */}
        {/* ------------------------------------------------------------ */}
        {activeCard === 'sources' && (
          <div
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              border: `1px solid ${themeStyles.border}`,
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary }}>
                  CƠ CẤU 3 NGUỒN CÀO (MULTI-SOURCE INGESTION BREAKDOWN)
                </span>
                <div style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, marginTop: '2px' }}>
                  Tổng cộng: {totalCollected.toLocaleString()} bài báo khoa học đã chuẩn hóa
                </div>
              </div>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: '4px', backgroundColor: themeStyles.cardSubtle, color: themeStyles.textSecondary }}>
                Click vào vành khuyên hoặc thẻ để lọc nguồn
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '16px', flex: 1, minHeight: 0, alignItems: 'center' }}>
              {/* Donut Chart */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 0 }}>
                <div style={{ width: '180px', height: '180px', position: 'relative' }}>
                  <svg viewBox="0 0 88 88" style={{ width: '100%', height: '100%' }}>
                    {donutSlices.map((s) => (
                      <circle
                        key={s.name}
                        cx="44"
                        cy="44"
                        r="34"
                        fill="none"
                        stroke={s.color}
                        strokeWidth="10"
                        strokeDasharray={s.dashArray}
                        strokeDashoffset={s.dashOffset}
                        style={{
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          opacity: selectedSource === 'ALL' || selectedSource === s.name ? 1 : 0.3,
                        }}
                        onClick={() => {
                          const next = selectedSource === s.name ? 'ALL' : s.name;
                          setSelectedSource(next);
                          onShowToast?.(`Đã lọc nguồn: ${next}`);
                        }}
                      />
                    ))}
                    <text x="44" y="41" textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fontWeight="900" fill={themeStyles.textPrimary}>
                      {(totalCollected / 1000).toFixed(1)}k
                    </text>
                    <text x="44" y="52" textAnchor="middle" fontSize="7.5" fontFamily="var(--font-mono)" fontWeight="700" fill={themeStyles.textMuted}>
                      BÀI BÁO
                    </text>
                  </svg>
                </div>
              </div>

              {/* 3 Source Detail Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sources.map((src) => {
                  const isSelected = selectedSource === src.name;
                  return (
                    <div
                      key={src.name}
                      onClick={() => {
                        const next = isSelected ? 'ALL' : src.name;
                        setSelectedSource(next);
                        onShowToast?.(`Đã lọc nguồn: ${next}`);
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        backgroundColor: isSelected ? `${src.color}22` : themeStyles.cardSubtle,
                        border: `1px solid ${isSelected ? src.color : themeStyles.border}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: src.color }} />
                          <strong style={{ fontSize: '12px', color: themeStyles.textPrimary }}>{src.name}</strong>
                          <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                            ({src.badge})
                          </span>
                        </span>
                        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: src.color }}>
                          {src.count.toLocaleString()} ({src.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                        <span>Chế độ: {src.harvest_mode}</span>
                        <span style={{ color: isSelected ? src.color : themeStyles.textMuted }}>
                          {isSelected ? '✓ Đang áp dụng lọc' : 'Click để lọc'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {/* CARD 3: TIẾN TRÌNH THU HOẠCH THEO NĂM (2020 - 2024)          */}
        {/* ------------------------------------------------------------ */}
        {activeCard === 'timeline' && (
          <div
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              border: `1px solid ${themeStyles.border}`,
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary }}>
                  TIẾN TRÌNH THU HOẠCH THEO NĂM (ANNUAL INGESTION GROWTH)
                </span>
                <div style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, marginTop: '2px' }}>
                  Giai đoạn 2020 - 2024 &bull; Tăng trưởng tổng thể +467%
                </div>
              </div>
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: '#2563eb', fontWeight: 700 }}>
                Đỉnh kỷ lục 2024: 10,321 bài
              </span>
            </div>

            {/* Main Bar Chart */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', gap: '16px', padding: '10px 20px 4px 20px' }}>
              {timelineList.map((item) => {
                const heightPct = (item.count / maxTimelineCount) * 100;
                const arxivPct = item.sources?.arXiv ? (item.sources.arXiv / item.count) * 100 : 80;
                const orPct = item.sources?.OpenReview ? (item.sources.OpenReview / item.count) * 100 : 12;
                const cvfPct = item.sources?.CVF ? (item.sources.CVF / item.count) * 100 : 8;

                return (
                  <div
                    key={item.year}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textPrimary }}>
                      {item.count.toLocaleString()}
                    </span>

                    {/* Stacked Bar with rounded top */}
                    <div
                      style={{
                        width: '100%',
                        maxWidth: '72px',
                        height: `${Math.max(12, heightPct * 0.85)}%`,
                        display: 'flex',
                        flexDirection: 'column-reverse',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        backgroundColor: themeStyles.trackBg,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      }}
                    >
                      <div style={{ height: `${arxivPct}%`, backgroundColor: '#f59e0b' }} title={`arXiv: ${item.sources?.arXiv || 0}`} />
                      <div style={{ height: `${orPct}%`, backgroundColor: '#3b82f6' }} title={`OpenReview: ${item.sources?.OpenReview || 0}`} />
                      <div style={{ height: `${cvfPct}%`, backgroundColor: '#10b981' }} title={`CVF: ${item.sources?.CVF || 0}`} />
                    </div>

                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textPrimary }}>
                      {item.year}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Legend Chips */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: '4px', fontSize: '9.5px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#f59e0b' }} />
                <span>arXiv (Tiền ấn phẩm)</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#3b82f6' }} />
                <span>OpenReview (Có điểm phản biện)</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#10b981' }} />
                <span>CVF (Hội nghị thị giác máy tính)</span>
              </span>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {/* CARD 4: KIỂM TOÁN DỮ LIỆU THIẾU & TOÀN VẸN (MISSINGNESS)     */}
        {/* ------------------------------------------------------------ */}
        {activeCard === 'missingness' && (
          <div
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              border: `1px solid ${themeStyles.border}`,
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              height: '100%',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary }}>
                  KIỂM TOÁN DỮ LIỆU THIẾU &amp; TOÀN VẸN (MISSINGNESS AUDIT)
                </span>
                <div style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, marginTop: '2px' }}>
                  Kiểm định chất lượng 7 trường thuộc tính cốt lõi của Lakehouse Bronze Corpus
                </div>
              </div>
              <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 800 }}>
                100% BẢO TOÀN TOÀN VĂN
              </span>
            </div>

            {/* 7 Fields Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: 0 }}>
              {missingnessList.map((m) => {
                const presentPct = (m.present / totalCollected) * 100;
                const isPerfect = m.missing === 0;
                const isRestricted = m.field === 'review_score';

                return (
                  <div
                    key={m.field}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '4px',
                      backgroundColor: themeStyles.cardSubtle,
                      border: `1px solid ${themeStyles.border}`,
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                      <span style={{ fontWeight: 700, color: themeStyles.textPrimary }}>{m.display_name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: themeStyles.textMuted, fontSize: '9px' }}>
                          {m.present.toLocaleString()} / {totalCollected.toLocaleString()}
                        </span>
                        <span
                          style={{
                            fontWeight: 800,
                            color: isPerfect ? '#10b981' : isRestricted ? '#f59e0b' : '#3b82f6',
                          }}
                        >
                          {presentPct.toFixed(1)}% {isPerfect ? '✓' : ''}
                        </span>
                      </div>
                    </div>

                    <div style={{ height: '4px', width: '100%', backgroundColor: themeStyles.trackBg, borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${presentPct}%`,
                          backgroundColor: isPerfect ? '#10b981' : isRestricted ? '#f59e0b' : '#3b82f6',
                          borderRadius: '2px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Lakehouse Policy Callout */}
            <div
              style={{
                padding: '6px 10px',
                borderRadius: '5px',
                backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : '#f0f9ff',
                border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.25)' : '#bae6fd'}`,
                fontSize: '9.5px',
                color: themeStyles.textSecondary,
                lineHeight: 1.4,
              }}
            >
              <strong style={{ color: '#0284c7' }}>Chiến lược xử lý khuyết thiếu (§Bronze Ingest): </strong>
              Toàn văn Markdown và ID đạt 100% qua PDF Miner. Trường <em>review_score</em> chỉ có ở OpenReview (3,000 bài) nên tuyệt đối không gán giá trị nhân tạo (imputation) để bảo toàn tính nguyên vẹn phân phối xác suất.
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {/* CARD 5: TIỀN XỬ LÝ LÀM SẠCH (BRONZE → SILVER)                */}
        {/* ------------------------------------------------------------ */}
        {activeCard === 'cleaning' && (
          <div
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              border: `1px solid ${themeStyles.border}`,
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              height: '100%',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: themeStyles.textPrimary }}>
                  QUY TRÌNH TIỀN XỬ LÝ LÀM SẠCH (BRONZE → SILVER PIPELINE)
                </span>
                <div style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, marginTop: '2px' }}>
                  4 công đoạn chuyển đổi dữ liệu thô sang cấu trúc dữ liệu sạch sẵn sàng cho Vector Embedding
                </div>
              </div>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#7c3aed', fontWeight: 800 }}>
                4 CÔNG ĐOẠN HOÀN TẤT
              </span>
            </div>

            {/* 4 Steps in Spacious Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', flex: 1, minHeight: 0 }}>
              {cleaningSteps.map((st, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: themeStyles.cardSubtle,
                    borderLeft: `4px solid ${st.color}`,
                    border: `1px solid ${themeStyles.border}`,
                    borderLeftColor: st.color,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>
                        {st.step}
                      </span>
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: '3px',
                          backgroundColor: `${st.color}18`,
                          color: st.color,
                          border: `1px solid ${st.color}35`,
                        }}
                      >
                        {st.stat}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: themeStyles.textSecondary, lineHeight: 1.4 }}>
                      {st.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Canonical Schema Pill Strip */}
            <div
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#ecfdf5',
                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : '#a7f3d0'}`,
                fontSize: '9.5px',
                fontFamily: 'var(--font-mono)',
                color: isDark ? '#34d399' : '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>✓ CANONICAL SILVER LAKEHOUSE SCHEMA:</span>
              <strong>ID • TITLE • CLEAN_MD • LATEX • SECTIONS</strong>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------ */}
        {/* CARD 6: TOÀN CẢNH TỔNG HỢP (SPLIT GRID DASHBOARD)           */}
        {/* ------------------------------------------------------------ */}
        {activeCard === 'all_grid' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr 1fr',
              gap: '8px',
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {/* Col 1: AI Overview Mini */}
            <div
              style={{
                backgroundColor: themeStyles.cardBg,
                borderRadius: '8px',
                border: `1px solid ${themeStyles.border}`,
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                minHeight: 0,
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px', color: '#8b5cf6' }}>✦</span>
                <span style={{ fontSize: '10.5px', fontWeight: 800, color: themeStyles.textPrimary }}>
                  Thông tin tổng quan AI
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '10px', color: themeStyles.textSecondary, lineHeight: 1.4 }}>
                Tập dữ liệu gồm <strong>{totalCollected.toLocaleString()} bài báo toàn văn</strong> (arXiv 83.6%, OpenReview 10.0%, CVF 6.4%). Bảo toàn 100% ID, Title, Markdown và Taxonomy.
              </p>
              <div style={{ fontSize: '9.5px', color: themeStyles.textMuted, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div>• Abstract đạt 99.8%, Authors đạt 99.5%.</div>
                <div>• 2,832,609 công thức toán LaTeX (98.4%).</div>
                <div>• Khử 3.8% nhiễu PDF sang tầng Silver.</div>
              </div>
            </div>

            {/* Col 2: Sources & Timeline Mini */}
            <div
              style={{
                backgroundColor: themeStyles.cardBg,
                borderRadius: '8px',
                border: `1px solid ${themeStyles.border}`,
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: themeStyles.textPrimary }}>
                Cơ cấu nguồn &amp; Tiến trình
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minHeight: 0 }}>
                {sources.map((s) => (
                  <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: s.color, fontWeight: 700 }}>● {s.name}</span>
                    <span>{s.count.toLocaleString()} ({s.percentage.toFixed(1)}%)</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '8.5px', fontFamily: 'var(--font-mono)', color: '#2563eb', fontWeight: 700 }}>
                Đỉnh 2024: 10,321 bài
              </div>
            </div>

            {/* Col 3: Quality & Cleaning Mini */}
            <div
              style={{
                backgroundColor: themeStyles.cardBg,
                borderRadius: '8px',
                border: `1px solid ${themeStyles.border}`,
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: themeStyles.textPrimary }}>
                Kiểm toán &amp; Làm sạch
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
                <div style={{ color: '#10b981', fontWeight: 700 }}>✓ 100% ID, Title, Markdown, Taxonomy</div>
                <div style={{ color: themeStyles.textSecondary }}>Abstract: 99.8% &bull; Authors: 99.5%</div>
                <div style={{ color: '#f59e0b' }}>Review Score: 10.0% (Chỉ OpenReview)</div>
                <div style={{ color: '#7c3aed', marginTop: '4px' }}>4 công đoạn làm sạch hoàn tất</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
