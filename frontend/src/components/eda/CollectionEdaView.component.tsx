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
    { name: 'arXiv', count: 25000, percentage: 83.58, color: '#f59e0b', badge: 'OAI-PMH API', harvest_mode: 'Automated Batch XML Ingestion' },
    { name: 'OpenReview', count: 3000, percentage: 10.03, color: '#3b82f6', badge: 'REST v2 API', harvest_mode: 'Conference Peer-Review Crawl' },
    { name: 'CVF', count: 1911, percentage: 6.39, color: '#10b981', badge: 'HTML Scraping', harvest_mode: 'Open Access Web Scraper' },
  ];

  const sources = collectionData?.sources || fallbackSources;
  const totalCollected = collectionData?.total_collected || 29911;

  const fallbackMissingness = [
    { field: 'paper_id', display_name: 'Mã định danh (Paper ID)', present: 29911, missing: 0, pct_missing: 0.0, status: 'HOÀN HẢO', color: '#10b981' },
    { field: 'title', display_name: 'Tiêu đề bài báo (Title)', present: 29911, missing: 0, pct_missing: 0.0, status: 'HOÀN HẢO', color: '#10b981' },
    { field: 'full_text', display_name: 'Toàn văn Markdown (Full-Text)', present: 29911, missing: 0, pct_missing: 0.0, status: 'HOÀN HẢO', color: '#10b981' },
    { field: 'categories', display_name: 'Phân loại chuyên ngành (Taxonomy)', present: 29911, missing: 0, pct_missing: 0.0, status: 'HOÀN HẢO', color: '#10b981' },
    { field: 'abstract', display_name: 'Tóm tắt bài báo (Abstract)', present: 29851, missing: 60, pct_missing: 0.2, status: 'TỐT (0.2% trống)', color: '#10b981' },
    { field: 'authors', display_name: 'Danh sách tác giả (Authors)', present: 29762, missing: 149, pct_missing: 0.5, status: 'TỐT (0.5% trống)', color: '#10b981' },
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
        stat: st.reduction_pct ? `-${st.reduction_pct}% raw noise` : st.extraction_accuracy ? `${st.extraction_accuracy}% accuracy` : st.coverage_pct ? `${st.coverage_pct}% coverage` : st.status,
        desc: idx === 0 ? 'Loại bỏ dòng rác lặp lại giữa các trang trong PDF' : idx === 1 ? 'Phát hiện toàn bộ phương trình inline và display equations' : idx === 2 ? 'Chia thành Abstract, Intro, Method, Exp, Conclusion' : 'Khử control chars, chuẩn hóa ASCII và cấu trúc bảng',
        color: colors[idx % colors.length],
      }));
    }
    return [
      {
        step: '1. Khử nhiễu Header, Footer & Đánh số trang',
        stat: '-3.8% raw noise',
        desc: 'Loại bỏ dòng rác lặp lại giữa các trang trong PDF',
        color: '#3b82f6',
      },
      {
        step: '2. Tách xuất Công thức Toán LaTeX ($ & $$)',
        stat: '98.4% syntax accuracy',
        desc: 'Phát hiện toàn bộ phương trình inline và display equations',
        color: '#ea580c',
      },
      {
        step: '3. Phân đoạn Cấu trúc Bài báo (Section Tree)',
        stat: '99.2% layout coverage',
        desc: 'Chia thành: Abstract, Intro, Related Work, Method, Exp, Conclusion',
        color: '#10b981',
      },
      {
        step: '4. Chuẩn hóa Bảng biểu Markdown & Ký tự Unicode',
        stat: '1.5% size optimization',
        desc: 'Khử control chars, chuẩn hóa ASCII và cấu trúc bảng phục vụ Chunking',
        color: '#7c3aed',
      },
    ];
  }, [processingData]);

  // Donut geometry for sources
  const donutSlices = useMemo(() => {
    const circumference = 2 * Math.PI * 40;
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
        gap: '8px',
        overflowY: 'auto',
        paddingRight: '2px',
      }}
    >
      {/* ---------------------------------------------------------------- */}
      {/* TOP BANNER: ARCHITECTURE IDENTIFIER & PROTOCOL MAPPING           */}
      {/* ---------------------------------------------------------------- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          borderRadius: '6px',
          backgroundColor: isDark ? 'rgba(245, 158, 11, 0.10)' : '#fefce8',
          border: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.3)' : '#fde047'}`,
          flexShrink: 0,
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: '#f59e0b',
              color: '#000000',
            }}
          >
            [EDA-00] TẦNG 1: THU THẬP &amp; DỮ LIỆU THÔ
          </span>
          <span style={{ fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary }}>
            NGUỒN DỮ LIỆU ĐA DẠNG (MULTI-SOURCE INGESTION) &amp; KIỂM TOÁN CHẤT LƯỢNG
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
            Quy mô thu thập: <strong style={{ color: '#f59e0b' }}>{totalCollected.toLocaleString()}</strong> bài báo
          </span>
          <span
            style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '3px',
              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#d1fae5',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            ✓ BRONZE LAKEHOUSE VALIDATED
          </span>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* ROW 1: 2 COLUMNS (SOURCES DONUT + MISSINGNESS AUDIT MATRIX)       */}
      {/* ---------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: '8px', flexShrink: 0, minHeight: '260px' }}>
        {/* Card 1: Three Ingestion Sources Breakdown */}
        <div
          style={{
            backgroundColor: themeStyles.cardBg,
            borderRadius: '6px',
            border: `1px solid ${themeStyles.border}`,
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary }}>
              CƠ CẤU NGUỒN DỮ LIỆU (SOURCES BREAKDOWN)
            </h4>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
              3 KÊNH THU THẬP
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
            {/* SVG Donut */}
            <div style={{ width: '130px', height: '130px', flexShrink: 0, position: 'relative' }}>
              <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                {donutSlices.map((s) => (
                  <circle
                    key={s.name}
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke={s.color}
                    strokeWidth="15"
                    strokeDasharray={s.dashArray}
                    strokeDashoffset={s.dashOffset}
                    style={{
                      cursor: 'pointer',
                      transition: 'stroke-width 0.2s ease',
                      opacity: selectedSource === 'ALL' || selectedSource === s.name ? 1 : 0.35,
                    }}
                    onClick={() => {
                      const next = selectedSource === s.name ? 'ALL' : s.name;
                      setSelectedSource(next);
                      onShowToast?.(`Đã lọc nguồn: ${next}`);
                    }}
                  />
                ))}
                <text x="50" y="47" textAnchor="middle" fontSize="13" fontFamily="var(--font-mono)" fontWeight="900" fill={themeStyles.textPrimary}>
                  {(totalCollected / 1000).toFixed(1)}k
                </text>
                <text x="50" y="60" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fontWeight="700" fill={themeStyles.textMuted}>
                  PAPERS
                </text>
              </svg>
            </div>

            {/* Source Details List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
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
                      padding: '6px 8px',
                      borderRadius: '5px',
                      backgroundColor: isSelected ? `${src.color}22` : themeStyles.cardSubtle,
                      border: `1px solid ${isSelected ? src.color : themeStyles.border}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: src.color }} />
                        <strong style={{ fontSize: '11px', color: themeStyles.textPrimary }}>{src.name}</strong>
                      </span>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: src.color }}>
                        {src.count.toLocaleString()} ({src.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px', fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                      <span>{src.badge}</span>
                      <span>{src.harvest_mode}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: '8px', fontSize: '10px', color: themeStyles.textSecondary, lineHeight: 1.35 }}>
            <strong>Đặc điểm: </strong>
            {collectionData?.collection_notes ||
              'arXiv chiếm ưu thế (83.6%) cung cấp phổ đa dạng về Computer Science. OpenReview cung cấp điểm đánh giá thực nghiệm (peer ratings) từ ICLR/NeurIPS. CVF bổ sung chuyên sâu các bài báo thị giác máy tính CVPR/ICCV.'}
          </div>
        </div>

        {/* Card 2: Field Completeness & Missingness Matrix */}
        <div
          style={{
            backgroundColor: themeStyles.cardBg,
            borderRadius: '6px',
            border: `1px solid ${themeStyles.border}`,
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary }}>
              KIỂM TOÁN DỮ LIỆU THIẾU &amp; TOÀN VẸN (MISSINGNESS AUDIT)
            </h4>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 700 }}>
              100% BẢO TOÀN TOÀN VĂN
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, overflowY: 'auto' }}>
            {missingnessList.map((m) => {
              const presentPct = ((m.present / totalCollected) * 100);
              const isPerfect = m.missing === 0;
              const isRestricted = m.field === 'review_score';

              return (
                <div
                  key={m.field}
                  style={{
                    padding: '4px 8px',
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
                      <span style={{ color: themeStyles.textMuted }}>
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
                  <div style={{ height: '4px', width: '100%', backgroundColor: themeStyles.trackBg, borderRadius: '2px', overflow: 'hidden' }}>
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

          <div
            style={{
              marginTop: '6px',
              padding: '5px 8px',
              borderRadius: '4px',
              backgroundColor: isDark ? 'rgba(56, 189, 248, 0.08)' : '#f0f9ff',
              border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.25)' : '#bae6fd'}`,
              fontSize: '10px',
              color: themeStyles.textSecondary,
              lineHeight: 1.3,
            }}
          >
            <strong style={{ color: '#0284c7' }}>Chiến lược xử lý khuyết thiếu (§Bronze Ingest): </strong>
            Toàn văn Markdown và ID đạt 100% nhờ công nghệ PDF-to-Markdown mining tự động. Trường <em>review_score</em> chỉ xuất hiện ở OpenReview (3,000 bài) nên không gán giá trị nhân tạo (imputation) để bảo toàn tính nguyên vẹn phân phối.
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* ROW 2: 2 COLUMNS (GROWTH TIMELINE + CLEANING PROCESSING METRICS) */}
      {/* ---------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', flex: 1, minHeight: '220px' }}>
        {/* Card 3: Timeline Ingestion Volume (2020 -> 2024) */}
        <div
          style={{
            backgroundColor: themeStyles.cardBg,
            borderRadius: '6px',
            border: `1px solid ${themeStyles.border}`,
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary }}>
              TĂNG TRƯỞNG LƯỢNG THU THẬP THEO NĂM (2020 - 2024)
            </h4>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#2563eb', fontWeight: 700 }}>
              ĐỈNH 2024: 10,321 BÀI
            </span>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '12px', paddingBottom: '6px' }}>
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
                  <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: themeStyles.textPrimary }}>
                    {item.count.toLocaleString()}
                  </span>

                  {/* Stacked Bar */}
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(12, heightPct * 0.85)}%`,
                      display: 'flex',
                      flexDirection: 'column-reverse',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      backgroundColor: themeStyles.trackBg,
                    }}
                  >
                    <div style={{ height: `${arxivPct}%`, backgroundColor: '#f59e0b' }} title={`arXiv: ${item.sources?.arXiv || 0}`} />
                    <div style={{ height: `${orPct}%`, backgroundColor: '#3b82f6' }} title={`OpenReview: ${item.sources?.OpenReview || 0}`} />
                    <div style={{ height: `${cvfPct}%`, backgroundColor: '#10b981' }} title={`CVF: ${item.sources?.CVF || 0}`} />
                  </div>

                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: themeStyles.textSecondary }}>
                    {item.year}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginTop: '4px', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#f59e0b' }} />
              <span>arXiv</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#3b82f6' }} />
              <span>OpenReview</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#10b981' }} />
              <span>CVF</span>
            </span>
          </div>
        </div>

        {/* Card 4: Preprocessing & Cleaning Milestones */}
        <div
          style={{
            backgroundColor: themeStyles.cardBg,
            borderRadius: '6px',
            border: `1px solid ${themeStyles.border}`,
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: themeStyles.textPrimary }}>
              CÁC BƯỚC TIỀN XỬ LÝ LÀM SẠCH (BRONZE → SILVER)
            </h4>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: '#7c3aed', fontWeight: 800 }}>
              4 CÔNG ĐOẠN MINING
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, justifyContent: 'space-around' }}>
            {cleaningSteps.map((st, idx) => (
              <div
                key={idx}
                style={{
                  padding: '6px 8px',
                  borderRadius: '4px',
                  backgroundColor: themeStyles.cardSubtle,
                  borderLeft: `3px solid ${st.color}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: themeStyles.textPrimary }}>
                    {st.step}
                  </div>
                  <div style={{ fontSize: '9px', color: themeStyles.textMuted, marginTop: '2px' }}>
                    {st.desc}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '3px',
                    backgroundColor: `${st.color}15`,
                    color: st.color,
                    border: `1px solid ${st.color}35`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {st.stat}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
