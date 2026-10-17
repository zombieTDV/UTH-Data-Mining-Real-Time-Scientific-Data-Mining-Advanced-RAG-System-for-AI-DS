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

  // Donut geometry for sources
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
    cardSubtle: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
    border: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#475569',
    textMuted: isDark ? '#64748b' : '#94a3b8',
    trackBg: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        gap: '6px',
        overflow: 'hidden', // Strictly zero-scroll
      }}
    >
      {/* ---------------------------------------------------------------- */}
      {/* TOP COMPACT BANNER (Height: 28px)                                */}
      {/* ---------------------------------------------------------------- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '28px',
          padding: '0 10px',
          borderRadius: '5px',
          backgroundColor: isDark ? 'rgba(245, 158, 11, 0.10)' : '#fefce8',
          border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.3)' : '#fde047'}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: '3px',
              backgroundColor: '#f59e0b',
              color: '#000000',
            }}
          >
            [EDA-00] TẦNG 1: THU THẬP &amp; DỮ LIỆU THÔ
          </span>
          <span style={{ fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>
            NGUỒN DỮ LIỆU ĐA DẠNG (MULTI-SOURCE INGESTION) &amp; KIỂM TOÁN CHẤT LƯỢNG
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
            Quy mô Bronze: <strong style={{ color: '#f59e0b' }}>{totalCollected.toLocaleString()}</strong> bài báo
          </span>
          <span
            style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '3px',
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#d1fae5',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            ✓ BRONZE LAKEHOUSE
          </span>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 3-COLUMN ZERO-SCROLL COCKPIT GRID (Takes remaining height 100%) */}
      {/* ---------------------------------------------------------------- */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.05fr 1.35fr 1fr',
          gap: '6px',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* ============================================================== */}
        {/* COLUMN 1: NGUỒN CÀO & TIẾN TRÌNH THU THẬP (32% width)           */}
        {/* ============================================================== */}
        <div
          style={{
            backgroundColor: themeStyles.cardBg,
            borderRadius: '6px',
            border: `1px solid ${themeStyles.border}`,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>
              CƠ CẤU 3 NGUỒN CÀO (SOURCES)
            </h4>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
              3 KÊNH INGEST
            </span>
          </div>

          {/* Donut & Quick Selection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {/* SVG Donut */}
            <div style={{ width: '88px', height: '88px', flexShrink: 0, position: 'relative' }}>
              <svg viewBox="0 0 88 88" style={{ width: '100%', height: '100%' }}>
                {donutSlices.map((s) => (
                  <circle
                    key={s.name}
                    cx="44"
                    cy="44"
                    r="34"
                    fill="none"
                    stroke={s.color}
                    strokeWidth="12"
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
                <text x="44" y="52" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fontWeight="700" fill={themeStyles.textMuted}>
                  PAPERS
                </text>
              </svg>
            </div>

            {/* Source Mini-Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
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
                      padding: '4px 6px',
                      borderRadius: '4px',
                      backgroundColor: isSelected ? `${src.color}22` : themeStyles.cardSubtle,
                      border: `1px solid ${isSelected ? src.color : themeStyles.border}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: src.color }} />
                        <strong style={{ fontSize: '10px', color: themeStyles.textPrimary }}>{src.name}</strong>
                      </span>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: src.color }}>
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

          {/* Ingestion Growth Timeline (2020 - 2024 Stacked Mini-chart) */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: themeStyles.cardSubtle,
              borderRadius: '5px',
              padding: '6px 8px',
              border: `1px solid ${themeStyles.border}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textPrimary }}>
                TIẾN TRÌNH THU HOẠCH THEO NĂM (2020 - 2024)
              </span>
              <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#2563eb', fontWeight: 700 }}>
                Đỉnh 2024: 10,321 bài
              </span>
            </div>

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

                    {/* Stacked Bar */}
                    <div
                      style={{
                        width: '100%',
                        height: `${Math.max(10, heightPct * 0.8)}%`,
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

                    <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: themeStyles.textSecondary }}>
                      {item.year}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '2px', fontSize: '8px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '2px', backgroundColor: '#f59e0b' }} />
                <span>arXiv</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '2px', backgroundColor: '#3b82f6' }} />
                <span>OpenReview</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '2px', backgroundColor: '#10b981' }} />
                <span>CVF</span>
              </span>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUMN 2: KIỂM TOÁN CHẤT LƯỢNG & ĐỘ ĐẦY ĐỦ (40% width)          */}
        {/* ============================================================== */}
        <div
          style={{
            backgroundColor: themeStyles.cardBg,
            borderRadius: '6px',
            border: `1px solid ${themeStyles.border}`,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>
              KIỂM TOÁN DỮ LIỆU THIẾU &amp; TOÀN VẸN (MISSINGNESS AUDIT)
            </h4>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 800 }}>
              100% BẢO TOÀN TOÀN VĂN
            </span>
          </div>

          {/* 7 Fields Quality Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minHeight: 0, justifyContent: 'space-between' }}>
            {missingnessList.map((m) => {
              const presentPct = (m.present / totalCollected) * 100;
              const isPerfect = m.missing === 0;
              const isRestricted = m.field === 'review_score';

              return (
                <div
                  key={m.field}
                  style={{
                    padding: '3px 6px',
                    borderRadius: '4px',
                    backgroundColor: themeStyles.cardSubtle,
                    border: `1px solid ${themeStyles.border}`,
                    fontSize: '9.5px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 700, color: themeStyles.textPrimary }}>{m.display_name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: themeStyles.textMuted, fontSize: '8.5px' }}>
                        {m.present.toLocaleString()} / {totalCollected.toLocaleString()}
                      </span>
                      <span
                        style={{
                          fontWeight: 800,
                          color: isPerfect ? '#10b981' : isRestricted ? '#f59e0b' : '#3b82f6',
                        }}
                      >
                        {presentPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Completeness Bar */}
                  <div style={{ height: '3.5px', width: '100%', backgroundColor: themeStyles.trackBg, borderRadius: '2px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${presentPct}%`,
                        backgroundColor: isPerfect ? '#10b981' : isRestricted ? '#f59e0b' : '#3b82f6',
                        borderRadius: '2px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Imputation & Lakehouse Policy Box */}
          <div
            style={{
              padding: '5px 7px',
              borderRadius: '4px',
              backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : '#f0f9ff',
              border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.25)' : '#bae6fd'}`,
              fontSize: '9px',
              color: themeStyles.textSecondary,
              lineHeight: 1.3,
              flexShrink: 0,
            }}
          >
            <strong style={{ color: '#0284c7' }}>Chiến lược xử lý khuyết thiếu (§Bronze Ingest): </strong>
            Toàn văn Markdown và ID đạt 100% qua PDF Miner. Trường <em>review_score</em> chỉ có ở OpenReview (3,000 bài) nên không gán giá trị nhân tạo (imputation) để bảo toàn tính nguyên vẹn phân phối.
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUMN 3: CÔNG ĐOẠN TIỀN XỬ LÝ (BRONZE → SILVER) (28% width)   */}
        {/* ============================================================== */}
        <div
          style={{
            backgroundColor: themeStyles.cardBg,
            borderRadius: '6px',
            border: `1px solid ${themeStyles.border}`,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>
              TIỀN XỬ LÝ LÀM SẠCH (BRONZE → SILVER)
            </h4>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#7c3aed', fontWeight: 800 }}>
              4 CÔNG ĐOẠN
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minHeight: 0, justifyContent: 'space-between' }}>
            {cleaningSteps.map((st, idx) => (
              <div
                key={idx}
                style={{
                  padding: '5px 7px',
                  borderRadius: '4px',
                  backgroundColor: themeStyles.cardSubtle,
                  borderLeft: `3px solid ${st.color}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ minWidth: 0, paddingRight: '4px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: themeStyles.textPrimary, lineHeight: 1.2 }}>
                    {st.step}
                  </div>
                  <div style={{ fontSize: '8.5px', color: themeStyles.textMuted, marginTop: '2px', lineHeight: 1.15 }}>
                    {st.desc}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    padding: '2px 5px',
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
              padding: '4px 6px',
              borderRadius: '4px',
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#ecfdf5',
              border: `1px solid ${isDark ? 'rgba(16, 185, 129, 0.25)' : '#a7f3d0'}`,
              fontSize: '8.5px',
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
  );
};
