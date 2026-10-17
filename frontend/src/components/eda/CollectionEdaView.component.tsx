import { useState, useMemo, type FC } from 'react';
import type { CollectionEdaSummary, ProcessingEdaSummary } from '../../types';

interface CollectionEdaViewProps {
  theme?: 'dark' | 'light';
  collectionData?: CollectionEdaSummary;
  processingData?: ProcessingEdaSummary;
  onShowToast?: (msg: string) => void;
}

export const CollectionEdaView: FC<CollectionEdaViewProps> = ({
  theme = 'dark',
  collectionData,
  processingData,
  onShowToast,
}) => {
  const isDark = theme === 'dark';
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
    cardBg: isDark ? 'rgba(15, 23, 42, 0.75)' : '#ffffff',
    cardSubtle: isDark ? 'rgba(255, 255, 255, 0.035)' : '#f8fafc',
    border: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#475569',
    textMuted: isDark ? '#64748b' : '#94a3b8',
    trackBg: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0',
    highlightBg: isDark ? 'rgba(37, 99, 235, 0.22)' : 'rgba(37, 99, 235, 0.12)',
    highlightText: isDark ? '#93c5fd' : '#1d4ed8',
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
      {/* 3-COLUMN COCKPIT (AI OVERVIEW + DUAL CHARTS + AUDIT PIPELINE)  */}
      {/* ============================================================== */}
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
        {/* ============================================================== */}
        {/* COLUMN 1: GOOGLE AI OVERVIEW INSPIRED EXECUTIVE CARD (38%)     */}
        {/* ============================================================== */}
        <div
          style={{
            backgroundColor: themeStyles.cardBg,
            borderRadius: '8px',
            border: `1px solid ${themeStyles.border}`,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {/* AI Overview Header (Image 0 Style) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px', color: '#8b5cf6' }}>✦</span>
              <span style={{ fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary, letterSpacing: '-0.2px' }}>
                Thông tin tổng quan do AI tạo
              </span>
            </div>
            <span
              style={{
                fontSize: '8.5px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#dcfce7',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              ✓ Bronze Lakehouse Audit
            </span>
          </div>

          {/* Hero Synthesis Paragraph with Soft Blue Highlight Pills */}
          <div
            style={{
              fontSize: '11px',
              color: themeStyles.textSecondary,
              lineHeight: 1.5,
              padding: '6px 8px',
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
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              {totalCollected.toLocaleString()} bài báo toàn văn
            </span>{' '}
            được thu thập đa nguồn từ{' '}
            <span
              style={{
                backgroundColor: themeStyles.highlightBg,
                color: themeStyles.highlightText,
                padding: '1px 5px',
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
                padding: '1px 5px',
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
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              CVF (6.4%)
            </span>
            . 100% tài liệu đã được bóc tách toàn văn sang Markdown chuẩn tắc phục vụ kiến trúc RAG.
          </div>

          {/* Section 1: Đặc điểm chất lượng & Toàn vẹn (Image 0 Bullet Style) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h5 style={{ margin: 0, fontSize: '10.5px', fontWeight: 800, color: themeStyles.textPrimary }}>
              Đặc điểm chất lượng &amp; Toàn vẹn
            </h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '10px', color: themeStyles.textSecondary, lineHeight: 1.35 }}>
              <div>
                <strong style={{ color: themeStyles.textPrimary }}>• Độ đầy đủ cốt lõi: </strong>
                Bảo toàn 100.0% dữ liệu ở các trường Mã định danh, Tiêu đề, Toàn văn và Phân loại chuyên ngành.
              </div>
              <div>
                <strong style={{ color: themeStyles.textPrimary }}>• Ngoại lệ khuyết thiếu: </strong>
                Tóm tắt (99.8%) và Tác giả (99.5%) đạt tỷ lệ thu hoạch cao; riêng Điểm phản biện (*review score*) chỉ hiện diện ở OpenReview (3,000 bài).
              </div>
              <div>
                <strong style={{ color: themeStyles.textPrimary }}>• Tốc độ tăng trưởng: </strong>
                Sản lượng bài báo tăng trưởng +467% từ năm 2020 (1.8k bài) đến 2024 (10.3k bài), phản ánh sự bùng nổ nghiên cứu AI/DS.
              </div>
            </div>
          </div>

          {/* Section 2: Quy chuẩn xử lý & RAG Readiness (§Bronze Ingest) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h5 style={{ margin: 0, fontSize: '10.5px', fontWeight: 800, color: themeStyles.textPrimary }}>
              Quy chuẩn xử lý &amp; Khả năng sẵn sàng cho RAG
            </h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '10px', color: themeStyles.textSecondary, lineHeight: 1.35 }}>
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

          {/* Bottom Source Citation Badges (Image 0 Style) */}
          <div
            style={{
              marginTop: 'auto',
              paddingTop: '6px',
              borderTop: `1px solid ${themeStyles.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
              Kênh thu hoạch:
            </span>
            <span
              style={{
                fontSize: '8.5px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: themeStyles.cardSubtle,
                border: `1px solid ${themeStyles.border}`,
                color: '#f59e0b',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <span>arXiv OAI-PMH</span>
              <span style={{ opacity: 0.6 }}>↗</span>
            </span>
            <span
              style={{
                fontSize: '8.5px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: themeStyles.cardSubtle,
                border: `1px solid ${themeStyles.border}`,
                color: '#3b82f6',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <span>OpenReview REST</span>
              <span style={{ opacity: 0.6 }}>↗</span>
            </span>
            <span
              style={{
                fontSize: '8.5px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: themeStyles.cardSubtle,
                border: `1px solid ${themeStyles.border}`,
                color: '#10b981',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <span>CVF Scraper</span>
              <span style={{ opacity: 0.6 }}>↗</span>
            </span>
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUMN 2: DUAL CHARTS (DONUT SOURCES + STACKED TIMELINE) (32%) */}
        {/* ============================================================== */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Card A: Donut Chart - Cơ cấu nguồn cào */}
          <div
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              border: `1px solid ${themeStyles.border}`,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              flex: '1 1 45%',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: themeStyles.textPrimary }}>
                CƠ CẤU 3 NGUỒN CÀO (SOURCES)
              </span>
              <span style={{ fontSize: '8.5px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                3 KÊNH INGEST
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minHeight: 0 }}>
              {/* Thin-Ring SVG Donut */}
              <div style={{ width: '84px', height: '84px', flexShrink: 0, position: 'relative' }}>
                <svg viewBox="0 0 88 88" style={{ width: '100%', height: '100%' }}>
                  {donutSlices.map((s) => (
                    <circle
                      key={s.name}
                      cx="44"
                      cy="44"
                      r="34"
                      fill="none"
                      stroke={s.color}
                      strokeWidth="9"
                      strokeDasharray={s.dashArray}
                      strokeDashoffset={s.dashOffset}
                      style={{
                        cursor: 'pointer',
                        transition: 'opacity 0.2s ease',
                        opacity: selectedSource === 'ALL' || selectedSource === s.name ? 1 : 0.35,
                      }}
                      onClick={() => {
                        const next = selectedSource === s.name ? 'ALL' : s.name;
                        setSelectedSource(next);
                        onShowToast?.(`Đã lọc nguồn: ${next}`);
                      }}
                    />
                  ))}
                  <text x="44" y="42" textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fontWeight="900" fill={themeStyles.textPrimary}>
                    {(totalCollected / 1000).toFixed(1)}k
                  </text>
                  <text x="44" y="52" textAnchor="middle" fontSize="7.5" fontFamily="var(--font-mono)" fontWeight="700" fill={themeStyles.textMuted}>
                    BÀI BÁO
                  </text>
                </svg>
              </div>

              {/* Source Mini-Cards with Progress bar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
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
                        padding: '3px 6px',
                        borderRadius: '4px',
                        backgroundColor: isSelected ? `${src.color}22` : themeStyles.cardSubtle,
                        border: `1px solid ${isSelected ? src.color : themeStyles.border}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: src.color }} />
                          <strong style={{ fontSize: '9.5px', color: themeStyles.textPrimary }}>{src.name}</strong>
                        </span>
                        <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: src.color }}>
                          {src.count.toLocaleString()} ({src.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1px', fontSize: '8px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                        <span>{src.badge}</span>
                        <span>{src.harvest_mode}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Card B: Stacked Bar Chart - Tiến trình thu hoạch theo năm */}
          <div
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              border: `1px solid ${themeStyles.border}`,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              flex: '1 1 55%',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: themeStyles.textPrimary }}>
                TIẾN TRÌNH THU HOẠCH THEO NĂM (2020 - 2024)
              </span>
              <span style={{ fontSize: '8.5px', fontFamily: 'var(--font-mono)', color: '#2563eb', fontWeight: 700 }}>
                Đỉnh 2024: 10,321 bài
              </span>
            </div>

            {/* Stacked Bars */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', gap: '8px', paddingBottom: '2px' }}>
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
                      gap: '2px',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: themeStyles.textPrimary }}>
                      {(item.count / 1000).toFixed(1)}k
                    </span>

                    {/* Stacked Bar with rounded top */}
                    <div
                      style={{
                        width: '100%',
                        height: `${Math.max(10, heightPct * 0.78)}%`,
                        display: 'flex',
                        flexDirection: 'column-reverse',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        backgroundColor: themeStyles.trackBg,
                      }}
                    >
                      <div style={{ height: `${arxivPct}%`, backgroundColor: '#f59e0b' }} title={`arXiv: ${item.sources?.arXiv || 0}`} />
                      <div style={{ height: `${orPct}%`, backgroundColor: '#3b82f6' }} title={`OpenReview: ${item.sources?.OpenReview || 0}`} />
                      <div style={{ height: `${cvfPct}%`, backgroundColor: '#10b981' }} title={`CVF: ${item.sources?.CVF || 0}`} />
                    </div>

                    <span style={{ fontSize: '8.5px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: themeStyles.textSecondary }}>
                      {item.year}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Legend Chips */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '2px', fontSize: '8px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '2px', backgroundColor: '#f59e0b' }} />
                <span>arXiv</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '2px', backgroundColor: '#3b82f6' }} />
                <span>OpenReview</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '2px', backgroundColor: '#10b981' }} />
                <span>CVF</span>
              </span>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUMN 3: QUALITY AUDIT & CLEANING PIPELINE (30%)             */}
        {/* ============================================================== */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Card A: Missingness Audit */}
          <div
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              border: `1px solid ${themeStyles.border}`,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              flex: '1 1 52%',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: themeStyles.textPrimary }}>
                KIỂM TOÁN DỮ LIỆU THIẾU (AUDIT)
              </span>
              <span style={{ fontSize: '8.5px', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 800 }}>
                100% TOÀN VĂN
              </span>
            </div>

            {/* 7 Fields Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minHeight: 0, justifyContent: 'space-between' }}>
              {missingnessList.map((m) => {
                const presentPct = (m.present / totalCollected) * 100;
                const isPerfect = m.missing === 0;
                const isRestricted = m.field === 'review_score';

                return (
                  <div
                    key={m.field}
                    style={{
                      padding: '2px 5px',
                      borderRadius: '3px',
                      backgroundColor: themeStyles.cardSubtle,
                      border: `1px solid ${themeStyles.border}`,
                      fontSize: '8.5px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1px' }}>
                      <span style={{ fontWeight: 700, color: themeStyles.textPrimary }}>{m.display_name}</span>
                      <span
                        style={{
                          fontWeight: 800,
                          color: isPerfect ? '#10b981' : isRestricted ? '#f59e0b' : '#3b82f6',
                        }}
                      >
                        {presentPct.toFixed(1)}%
                      </span>
                    </div>

                    <div style={{ height: '3px', width: '100%', backgroundColor: themeStyles.trackBg, borderRadius: '2px', overflow: 'hidden' }}>
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
          </div>

          {/* Card B: Cleaning Steps & Canonical Schema */}
          <div
            style={{
              backgroundColor: themeStyles.cardBg,
              borderRadius: '8px',
              border: `1px solid ${themeStyles.border}`,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              flex: '1 1 48%',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: themeStyles.textPrimary }}>
                TIỀN XỬ LÝ LÀM SẠCH (BRONZE → SILVER)
              </span>
              <span style={{ fontSize: '8.5px', fontFamily: 'var(--font-mono)', color: '#7c3aed', fontWeight: 800 }}>
                4 CÔNG ĐOẠN
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minHeight: 0, justifyContent: 'space-between' }}>
              {cleaningSteps.map((st, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '3px 6px',
                    borderRadius: '4px',
                    backgroundColor: themeStyles.cardSubtle,
                    borderLeft: `3px solid ${st.color}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ minWidth: 0, paddingRight: '4px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, color: themeStyles.textPrimary, lineHeight: 1.2 }}>
                      {st.step}
                    </div>
                    <div style={{ fontSize: '8px', color: themeStyles.textMuted, marginTop: '1px', lineHeight: 1.15 }}>
                      {st.desc}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '8px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                      padding: '1px 4px',
                      borderRadius: '3px',
                      backgroundColor: `${st.color}15`,
                      color: st.color,
                      border: `1px solid ${st.color}35`,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {st.stat}
                  </span>
                </div>
              ))}
            </div>

            {/* Canonical Schema Pill Strip */}
            <div
              style={{
                padding: '3px 6px',
                borderRadius: '4px',
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#ecfdf5',
                border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : '#a7f3d0'}`,
                fontSize: '8px',
                fontFamily: 'var(--font-mono)',
                color: isDark ? '#34d399' : '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <span>✓ CANONICAL SCHEMA:</span>
              <strong>ID • TITLE • CLEAN_MD • LATEX • SECTIONS</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
