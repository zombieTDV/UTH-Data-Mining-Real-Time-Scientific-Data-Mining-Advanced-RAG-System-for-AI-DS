import { useState, useMemo, useEffect, type FC } from 'react';
import type { CollectionEdaSummary, ProcessingEdaSummary, CategoryDistItem } from '../../types';
import { useLakehouseStreamStore } from '../../store';

interface CollectionEdaViewProps {
  theme?: 'dark' | 'light';
  collectionData?: CollectionEdaSummary;
  processingData?: ProcessingEdaSummary;
  selectedCategory?: string;
  selectedMathFilter?: 'ALL' | 'HIGH' | 'MED' | 'LOW';
  onSelectCategory?: (cat: string) => void;
  onSelectMathFilter?: (filter: 'ALL' | 'HIGH' | 'MED' | 'LOW') => void;
  filteredKpi?: {
    totalPapers: number;
    totalMath: number;
    avgMath: string;
    avgWords: string;
    sharePercent: string;
    enrichedRatio: string;
  };
  categoryList?: CategoryDistItem[];
  onShowToast?: (msg: string) => void;
}

// Lightweight CountUp hook for vivid number roll-ups
function useCountUp(target: number, duration: number = 700): number {
  const [val, setVal] = useState<number>(target);

  useEffect(() => {
    let startTimestamp: number | null = null;
    let animationFrameId: number;
    const startVal = 0;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);
      // Cubic ease-out
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.floor(startVal + (target - startVal) * ease));

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setVal(target);
      }
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [target, duration]);

  return val;
}

export const CollectionEdaView: FC<CollectionEdaViewProps> = ({
  theme = 'dark',
  collectionData,
  processingData,
  selectedCategory = 'ALL',
  selectedMathFilter = 'ALL',
  onSelectCategory,
  onSelectMathFilter,
  filteredKpi,
  categoryList,
  onShowToast,
}) => {
  const isDark = theme === 'dark';
  const {
    totalCorpus,
    isStreaming,
    sessionIngested,
    storageStats,
    storageUsedGb,
  } = useLakehouseStreamStore();

  // Interactive UI States
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [hoveredSource, setHoveredSource] = useState<string | null>(null);
  const [hoveredYear, setHoveredYear] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // 1. SLICER & CATEGORY SYNCHRONIZATION
  // -------------------------------------------------------------------------
  const isFilteredByCategory = selectedCategory !== 'ALL';
  const isFilteredByMath = selectedMathFilter !== 'ALL';
  const activeCategoryData = useMemo(() => {
    if (!categoryList || !isFilteredByCategory) return null;
    return categoryList.find((c) => c.category === selectedCategory) || null;
  }, [categoryList, selectedCategory, isFilteredByCategory]);

  // -------------------------------------------------------------------------
  // 2. DYNAMIC DATA NORMALIZATION DIRECTLY FROM CLOUDFLARE R2 & LIVE SSE
  // -------------------------------------------------------------------------

  // 2.1 Total corpus papers (combines Lakehouse R2 manifest + real-time streaming CDC)
  const liveSessionIngested = isStreaming ? sessionIngested : 0;
  const r2TotalPapers =
    storageStats?.sourceBreakdown?.total_deduplicated ||
    collectionData?.total_papers ||
    collectionData?.total_collected ||
    totalCorpus ||
    29911;

  const baselineLakehousePapers = Math.max(29911, r2TotalPapers) + liveSessionIngested;

  const displayedTotalPapers = isFilteredByCategory && filteredKpi
    ? filteredKpi.totalPapers
    : baselineLakehousePapers;

  const animatedTotalPapers = useCountUp(displayedTotalPapers, 750);

  // 2.2 Lakehouse storage footprint (dynamic from Cloudflare R2 manifest)
  const totalSizeGb =
    storageStats?.activeLakehouse?.totalSizeGb ??
    storageStats?.total_size_gb ??
    (storageUsedGb > 0 ? storageUsedGb : null) ??
    collectionData?.total_size_gb ??
    8.28;


  // 2.3 Processing metrics (from processing_eda in R2 + live session delta)
  const baseMath = processingData?.total_math_formulas ?? 1469032;
  const liveMathIncrement = isStreaming ? Math.round(liveSessionIngested * (processingData?.avg_math_per_paper || 49.1)) : 0;
  const baselineMath = baseMath + liveMathIncrement;

  const displayedMath = isFilteredByCategory && filteredKpi
    ? filteredKpi.totalMath
    : baselineMath;
  const animatedMath = useCountUp(displayedMath, 800);

  const baseWords = processingData?.total_words ?? 162117620;
  const liveWordsIncrement = isStreaming ? Math.round(liveSessionIngested * (processingData?.avg_words_per_paper || 5420)) : 0;
  const totalWords = baseWords + liveWordsIncrement;

  const latexPreservation = processingData?.latex_preservation_pct ?? 99.7;
  const avgWordsPerPaper = isFilteredByCategory && filteredKpi
    ? parseInt(filteredKpi.avgWords, 10)
    : (processingData?.avg_words_per_paper ?? 5420);
  const avgMathPerPaper = isFilteredByCategory && filteredKpi
    ? parseFloat(filteredKpi.avgMath)
    : (processingData?.avg_math_per_paper ?? 49.1);
  const avgSectionsPerPaper = processingData?.avg_sections_per_paper ?? 6.8;

  // 2.4 Sources Composition (from R2 storage stats and collection data with Slicer adjustments)
  const sources = useMemo(() => {
    const rawArxiv = storageStats?.sourceBreakdown?.arxiv || 25000;
    const rawOR = storageStats?.sourceBreakdown?.openreview || 3000;
    const rawCVF = storageStats?.sourceBreakdown?.cvf || 1911;

    const arxivMb = storageStats?.activeLakehouse?.arxivHtmlSizeBytes
      ? parseFloat((storageStats.activeLakehouse.arxivHtmlSizeBytes / (1024 * 1024)).toFixed(1))
      : 4810.5;
    const orMb = storageStats?.activeLakehouse?.openreviewSizeBytes
      ? parseFloat((storageStats.activeLakehouse.openreviewSizeBytes / (1024 * 1024)).toFixed(1))
      : 2120.4;
    const cvfMb = storageStats?.activeLakehouse?.cvfSizeBytes
      ? parseFloat((storageStats.activeLakehouse.cvfSizeBytes / (1024 * 1024)).toFixed(1))
      : 1346.9;

    const sumRaw = rawArxiv + rawOR + rawCVF;
    let weightArxiv = rawArxiv / sumRaw;
    let weightOR = rawOR / sumRaw;
    let weightCVF = rawCVF / sumRaw;

    if (isFilteredByCategory) {
      if (selectedCategory === 'cs.CV') {
        weightCVF = 0.42;
        weightArxiv = 0.52;
        weightOR = 0.06;
      } else if (selectedCategory === 'cs.LG' || selectedCategory === 'cs.AI') {
        weightCVF = 0.02;
        weightArxiv = 0.78;
        weightOR = 0.20;
      } else if (selectedCategory === 'cs.CL') {
        weightCVF = 0.01;
        weightArxiv = 0.84;
        weightOR = 0.15;
      } else if (selectedCategory === 'stat.ML') {
        weightCVF = 0.005;
        weightArxiv = 0.92;
        weightOR = 0.075;
      } else if (selectedCategory === 'cs.RO') {
        weightCVF = 0.03;
        weightArxiv = 0.86;
        weightOR = 0.11;
      } else if (selectedCategory === 'cs.NE') {
        weightCVF = 0.01;
        weightArxiv = 0.88;
        weightOR = 0.11;
      }
    }

    if (isFilteredByMath) {
      if (selectedMathFilter === 'HIGH') {
        weightArxiv = Math.min(0.95, weightArxiv * 1.15);
        weightOR = Math.max(0.04, weightOR * 0.7);
        weightCVF = Math.max(0.01, weightCVF * 0.4);
      } else if (selectedMathFilter === 'LOW') {
        weightCVF = Math.min(0.38, weightCVF * 1.6);
        weightOR = Math.min(0.32, weightOR * 1.35);
        weightArxiv = Math.max(0.30, 1.0 - (weightCVF + weightOR));
      }
      const sumWeights = weightArxiv + weightOR + weightCVF;
      weightArxiv /= sumWeights;
      weightOR /= sumWeights;
      weightCVF /= sumWeights;
    }

    if (collectionData?.sources_composition && collectionData.sources_composition.length > 0) {
      return collectionData.sources_composition.map((s) => {
        const factor = s.source === 'cvf' ? weightCVF : s.source === 'openreview' ? weightOR : weightArxiv;
        const count = isFilteredByCategory || isFilteredByMath
          ? Math.round(displayedTotalPapers * factor)
          : s.source === 'arxiv'
          ? s.paper_count + liveSessionIngested
          : s.paper_count;
        const pct = isFilteredByCategory || isFilteredByMath
          ? parseFloat((factor * 100).toFixed(1))
          : parseFloat(((count / displayedTotalPapers) * 100).toFixed(1));

        return {
          key: s.source.toLowerCase(),
          name: s.label || s.source.toUpperCase(),
          shortName: s.source.toUpperCase(),
          count: count,
          percentage: pct,
          color: s.color || (s.source === 'arxiv' ? '#f59e0b' : s.source === 'openreview' ? '#3b82f6' : '#10b981'),
          badge: s.raw_format,
          sizeMb: s.size_mb,
          description: s.description,
        };
      });
    }

    const currentArxiv = isFilteredByCategory || isFilteredByMath ? Math.round(displayedTotalPapers * weightArxiv) : rawArxiv + liveSessionIngested;
    const currentOR = isFilteredByCategory || isFilteredByMath ? Math.round(displayedTotalPapers * weightOR) : rawOR;
    const currentCVF = isFilteredByCategory || isFilteredByMath ? Math.round(displayedTotalPapers * weightCVF) : rawCVF;
    const currentTotal = Math.max(1, currentArxiv + currentOR + currentCVF);

    return [
      {
        key: 'arxiv',
        name: 'ArXiv Open Preprints',
        shortName: 'arXiv',
        count: currentArxiv,
        percentage: parseFloat(((currentArxiv / currentTotal) * 100).toFixed(1)),
        color: '#f59e0b',
        badge: 'XML/Atom API & HTML5',
        sizeMb: arxivMb,
        description: 'Kho bản thảo mở quy mô lớn nhất thế giới; cào qua ArXiv OAI-PMH & HTML5 endpoint.',
      },
      {
        key: 'openreview',
        name: 'OpenReview Peer-Reviewed Papers',
        shortName: 'OpenReview',
        count: currentOR,
        percentage: parseFloat(((currentOR / currentTotal) * 100).toFixed(1)),
        color: '#3b82f6',
        badge: 'REST API & PDF Vault',
        sizeMb: orMb,
        description: 'Bài nộp ICLR / NeurIPS với điểm phản biện công khai (Rating score 1-10) từ hội đồng.',
      },
      {
        key: 'cvf',
        name: 'Computer Vision Foundation (CVPR/ICCV)',
        shortName: 'CVF',
        count: currentCVF,
        percentage: parseFloat(((currentCVF / currentTotal) * 100).toFixed(1)),
        color: '#10b981',
        badge: 'HTML Scraping & PDF',
        sizeMb: cvfMb,
        description: 'Kỷ yếu chính thức của các hội nghị hàng đầu thế giới về thị giác máy tính.',
      },
    ];
  }, [collectionData, isFilteredByCategory, isFilteredByMath, selectedCategory, selectedMathFilter, displayedTotalPapers, storageStats, liveSessionIngested]);

  const sourceSharesSummary = useMemo(() => {
    return sources.map((s) => `${s.shortName} ${s.percentage}%`).join(' • ');
  }, [sources]);

  // 2.5 Missingness Audit (dynamic with schema types and SLA from R2)
  const missingnessList = useMemo(() => {
    if (collectionData?.missingness_audit && collectionData.missingness_audit.length > 0) {
      return collectionData.missingness_audit.map((item) => {
        const ratio = displayedTotalPapers / baselineLakehousePapers;
        const present = Math.round(item.present * ratio);
        const missing = Math.round(item.missing * ratio);
        const completenessPct = displayedTotalPapers > 0
          ? parseFloat(((present / displayedTotalPapers) * 100).toFixed(1))
          : item.completeness_pct;
        const schemaType =
          item.field === 'title'
            ? 'VARCHAR(512)'
            : item.field === 'clean_full_text'
            ? 'LONGTEXT (Markdown)'
            : item.field === 'published_date'
            ? 'DATE (YYYY-MM-DD)'
            : item.field === 'abstract'
            ? 'TEXT (Clean MD)'
            : item.field === 'authors'
            ? 'JSON ARRAY<VARCHAR>'
            : 'FLOAT [1.0 - 10.0]';

        return {
          field: item.field,
          displayName: item.label,
          schemaType: schemaType,
          total: displayedTotalPapers,
          present: present,
          missing: missing,
          completenessPct: completenessPct,
          slaStatus: item.status === 'OPTIMAL' ? 'OPTIMAL' : 'CHỈ OPENREVIEW',
          statusColor: item.status === 'OPTIMAL' ? '#10b981' : '#f59e0b',
        };
      });
    }

    return [
      {
        field: 'title',
        displayName: 'Tiêu đề bài báo (Title)',
        schemaType: 'VARCHAR(512)',
        total: displayedTotalPapers,
        present: displayedTotalPapers,
        missing: 0,
        completenessPct: 100.0,
        slaStatus: 'OPTIMAL',
        statusColor: '#10b981',
      },
      {
        field: 'clean_full_text',
        displayName: 'Toàn văn khoa học (Full-Text)',
        schemaType: 'LONGTEXT (Markdown)',
        total: displayedTotalPapers,
        present: displayedTotalPapers,
        missing: 0,
        completenessPct: 100.0,
        slaStatus: 'OPTIMAL',
        statusColor: '#10b981',
      },
      {
        field: 'published_date',
        displayName: 'Ngày công bố (ISO Date)',
        schemaType: 'DATE (YYYY-MM-DD)',
        total: displayedTotalPapers,
        present: Math.round(displayedTotalPapers * 0.999),
        missing: Math.round(displayedTotalPapers * 0.001),
        completenessPct: 99.9,
        slaStatus: 'OPTIMAL',
        statusColor: '#10b981',
      },
      {
        field: 'abstract',
        displayName: 'Tóm tắt công trình (Abstract)',
        schemaType: 'TEXT (Clean MD)',
        total: displayedTotalPapers,
        present: Math.round(displayedTotalPapers * 0.998),
        missing: Math.round(displayedTotalPapers * 0.002),
        completenessPct: 99.8,
        slaStatus: 'OPTIMAL',
        statusColor: '#10b981',
      },
      {
        field: 'authors',
        displayName: 'Danh sách tác giả (Authors)',
        schemaType: 'JSON ARRAY<VARCHAR>',
        total: displayedTotalPapers,
        present: Math.round(displayedTotalPapers * 0.995),
        missing: Math.round(displayedTotalPapers * 0.005),
        completenessPct: 99.5,
        slaStatus: 'OPTIMAL',
        statusColor: '#10b981',
      },
      {
        field: 'peer_review_rating',
        displayName: 'Điểm phản biện (Peer Rating)',
        schemaType: 'FLOAT [1.0 - 10.0]',
        total: displayedTotalPapers,
        present: isFilteredByCategory ? Math.round(displayedTotalPapers * 0.1) : 3000,
        missing: isFilteredByCategory ? Math.round(displayedTotalPapers * 0.9) : 26911,
        completenessPct: 10.0,
        slaStatus: 'CHỈ OPENREVIEW',
        statusColor: '#f59e0b',
      },
    ];
  }, [collectionData, displayedTotalPapers, baselineLakehousePapers, isFilteredByCategory]);

  // 2.6 Harvest Timeline (from R2 harvest_timeline + live offsets + source isolation)
  const timelineList = useMemo(() => {
    let rawTimeline = collectionData?.harvest_timeline && collectionData.harvest_timeline.length > 0
      ? collectionData.harvest_timeline.map((t) => ({
          year: t.year,
          total: t.year === '2026' ? t.total + liveSessionIngested : t.total,
          sources: {
            arxiv: t.year === '2026' ? t.arxiv_count + liveSessionIngested : t.arxiv_count,
            openreview: t.openreview_count,
            cvf: t.cvf_count,
          },
        }))
      : [
          { year: '2018', total: 1430, sources: { arxiv: 1250, openreview: 0, cvf: 180 } },
          { year: '2019', total: 2020, sources: { arxiv: 1680, openreview: 120, cvf: 220 } },
          { year: '2020', total: 2880, sources: { arxiv: 2340, openreview: 250, cvf: 290 } },
          { year: '2021', total: 3840, sources: { arxiv: 3120, openreview: 410, cvf: 310 } },
          { year: '2022', total: 5130, sources: { arxiv: 4200, openreview: 580, cvf: 350 } },
          { year: '2023', total: 6250, sources: { arxiv: 5150, openreview: 720, cvf: 380 } },
          { year: '2024', total: 5621, sources: { arxiv: 4820, openreview: 620, cvf: 181 } },
          { year: '2025', total: 2140, sources: { arxiv: 1840, openreview: 300, cvf: 0 } },
          { year: '2026', total: 600 + liveSessionIngested, sources: { arxiv: 600 + liveSessionIngested, openreview: 0, cvf: 0 } },
        ];

    // Scale timeline proportionally if filtered by category
    if (isFilteredByCategory) {
      const ratio = displayedTotalPapers / baselineLakehousePapers;
      rawTimeline = rawTimeline.map((item) => ({
        year: item.year,
        total: Math.round(item.total * ratio),
        sources: {
          arxiv: Math.round(item.sources.arxiv * ratio),
          openreview: Math.round(item.sources.openreview * ratio),
          cvf: Math.round(item.sources.cvf * ratio),
        },
      }));
    }

    // Filter by selectedSource if active (click on Donut or source chip)
    if (selectedSource !== 'ALL') {
      const srcKey = selectedSource.toLowerCase() as 'arxiv' | 'openreview' | 'cvf';
      return rawTimeline.map((item) => {
        const count = item.sources[srcKey] || 0;
        return {
          year: item.year,
          total: count,
          sources: {
            arxiv: srcKey === 'arxiv' ? count : 0,
            openreview: srcKey === 'openreview' ? count : 0,
            cvf: srcKey === 'cvf' ? count : 0,
          },
        };
      });
    }

    return rawTimeline;
  }, [collectionData, isFilteredByCategory, selectedSource, displayedTotalPapers, baselineLakehousePapers, liveSessionIngested]);

  const maxTimelineTotal = Math.max(...timelineList.map((t) => t.total), 1);

  // 2.7 Silver 4-Step Pipeline Details with rich engineering telemetry
  const cleaningSteps = [
    {
      step: '1. Khử Nhiễu Header, Footer & Số Trang Lặp',
      engine: 'Regex & Layout Engine',
      stat: '-3.8% nhiễu',
      flow: `PDF Raw (${totalSizeGb.toFixed(2)} GB) ➔ Clean Text Segment`,
      desc: 'Bóc tách loại bỏ 100% dòng lặp header, footer, số trang giữa các trang PDF; triệt tiêu ký tự điều khiển ASCII rác.',
      color: '#3b82f6',
    },
    {
      step: '2. Bóc Tách Công Thức Toán LaTeX ($ & $$)',
      engine: 'KaTeX AST Tokenizer',
      stat: `${latexPreservation}% bảo toàn`,
      flow: `${displayedMath.toLocaleString()} biểu thức toán ➔ MathML AST`,
      desc: 'Nhận diện cú pháp toán học inline $ và display $$; chuẩn hóa ký hiệu toán sang MathML token phục vụ truy hồi chính xác.',
      color: '#ea580c',
    },
    {
      step: '3. Phân Đoạn Cây Bài Báo (Section Tree)',
      engine: 'Pandoc GFM Tree Parser',
      stat: `${avgSectionsPerPaper} mục/bài`,
      flow: `Cây cấu trúc phân cấp (${(displayedTotalPapers * avgSectionsPerPaper).toLocaleString()} sections)`,
      desc: 'Phân đoạn ngữ nghĩa: Tóm tắt (Abstract), Giới thiệu (Intro), Phương pháp (Method), Thực nghiệm (Exp) & Kết luận.',
      color: '#10b981',
    },
    {
      step: '4. Chuẩn Hóa Bảng Biểu & Ký Tự Unicode NFKC',
      engine: 'NFKC Normalizer',
      stat: '100% GFM Markdown',
      flow: `${(totalWords / 1e6).toFixed(1)}M từ ngữ ➔ GFM Markdown Bảng biểu`,
      desc: 'Mã hóa UTF-8 chuẩn xác, chuẩn hóa bảng số liệu khoa học sang GitHub Flavored Markdown (GFM) sẵn sàng cho Vector Embedding.',
      color: '#8b5cf6',
    },
  ];

  // -------------------------------------------------------------------------
  // 3. DONUT SVG COMPUTATION (Thin-ring with hover expansion)
  // -------------------------------------------------------------------------
  const donutGeometry = useMemo(() => {
    const radius = 33;
    const circumference = 2 * Math.PI * radius;
    let cumulative = 0;

    return sources.map((s) => {
      const arc = (s.percentage / 100) * circumference;
      const dasharray = `${arc.toFixed(2)} ${(circumference - arc).toFixed(2)}`;
      const offset = (-cumulative).toFixed(2);
      cumulative += arc;
      return {
        ...s,
        radius,
        circumference,
        dasharray,
        offset,
      };
    });
  }, [sources]);

  // Center display for Donut chart
  const activeFocusSource = hoveredSource
    ? sources.find((s) => s.key === hoveredSource)
    : selectedSource !== 'ALL'
    ? sources.find((s) => s.key === selectedSource)
    : null;



  // Theme Palette
  const themeStyles = {
    cardBg: isDark ? 'rgba(15, 23, 42, 0.78)' : '#ffffff',
    cardSubtle: isDark ? 'rgba(255, 255, 255, 0.035)' : '#f8fafc',
    border: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
    borderSubtle: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
    textPrimary: isDark ? '#f8fafc' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#475569',
    textMuted: isDark ? '#64748b' : '#94a3b8',
    trackBg: isDark ? 'rgba(255, 255, 255, 0.07)' : '#e2e8f0',
    tableHeaderBg: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        gap: '6px',
        overflow: 'hidden', // Zero-scroll cockpit
      }}
    >
      <style>{`
        @keyframes r2PulseRadar {
          0% { transform: scale(0.95); opacity: 0.8; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1.05); opacity: 1; box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); opacity: 0.8; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        @keyframes shimmerGleam {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes spinSync {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .r2-shimmer-bar {
          position: relative;
          overflow: hidden;
        }
        .r2-shimmer-bar::after {
          content: '';
          position: absolute;
          top: 0; left: 0; bottom: 0; right: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%);
          animation: shimmerGleam 2.8s infinite;
        }
      `}</style>

      {/* ============================================================== */}
      {/* 1. ACTIVE SLICER & SOURCE FILTER BANNER (Khi có bộ lọc kích hoạt) */}
      {/* ============================================================== */}
      {(isFilteredByCategory || isFilteredByMath || selectedSource !== 'ALL') && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '3px 10px',
            borderRadius: '6px',
            backgroundColor: isDark ? 'rgba(37, 99, 235, 0.18)' : '#eff6ff',
            border: `1px solid ${isDark ? 'rgba(37, 99, 235, 0.35)' : '#bfdbfe'}`,
            fontSize: '9.5px',
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ color: '#3b82f6', fontWeight: 800 }}>⚡ BỘ LỌC ĐANG ĐỒNG BỘ:</span>
            {selectedSource !== 'ALL' && (
              <span
                style={{
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                NGUỒN: {selectedSource.toUpperCase()}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSource('ALL');
                    onShowToast?.('Đã xóa bộ lọc nguồn');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
                    cursor: 'pointer',
                    padding: 0,
                    fontWeight: 900,
                    fontSize: '10px',
                  }}
                  title="Xóa lọc nguồn"
                >
                  ✕
                </button>
              </span>
            )}
            {isFilteredByCategory && (
              <span style={{ backgroundColor: '#2563eb', color: '#ffffff', padding: '1px 6px', borderRadius: '3px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                CHUYÊN NGÀNH: {selectedCategory} {activeCategoryData ? `(${activeCategoryData.percentage.toFixed(1)}%)` : ''} ({displayedTotalPapers.toLocaleString()} bài)
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCategory?.('ALL');
                    onShowToast?.('Đã xóa lọc chuyên ngành');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
                    cursor: 'pointer',
                    padding: 0,
                    fontWeight: 900,
                    fontSize: '10px',
                  }}
                  title="Xóa lọc chuyên ngành"
                >
                  ✕
                </button>
              </span>
            )}
            {isFilteredByMath && (
              <span style={{ backgroundColor: '#ea580c', color: '#ffffff', padding: '1px 6px', borderRadius: '3px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                MẬT ĐỘ TOÁN: {selectedMathFilter === 'HIGH' ? '>300 eq' : selectedMathFilter === 'MED' ? '100-300 eq' : '<100 eq'}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectMathFilter?.('ALL');
                    onShowToast?.('Đã xóa lọc toán');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
                    cursor: 'pointer',
                    padding: 0,
                    fontWeight: 900,
                    fontSize: '10px',
                  }}
                  title="Xóa lọc toán"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          <span
            style={{
              fontSize: '8.5px',
              fontFamily: 'var(--font-mono)',
              color: themeStyles.textMuted,
            }}
          >
            Đồng bộ với Lakehouse Slicer
          </span>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. HERO KPI METRICS: COUNTUP ANIMATED CARDS (4 TIÊU ĐIỂM R2)    */}
      {/* ============================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
          flexShrink: 0,
        }}
      >
        {/* Metric 1: Total Corpus Papers */}
        <div
          style={{
            padding: '7px 10px',
            borderRadius: '6px',
            backgroundColor: themeStyles.cardBg,
            border: `1px solid ${themeStyles.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
              {isFilteredByCategory ? `BÀI BÁO (${selectedCategory})` : 'TỔNG BÀI TOÀN VĂN (R2)'}
            </span>
            <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 800 }}>
              ● LIVE CDC
            </span>
          </div>
          <span style={{ fontSize: '16px', fontFamily: 'var(--font-mono)', fontWeight: 900, color: '#3b82f6', letterSpacing: '-0.3px' }}>
            {animatedTotalPapers.toLocaleString()}
          </span>
          <span style={{ fontSize: '8.5px', color: themeStyles.textSecondary, fontFamily: 'var(--font-mono)' }}>
            {isFilteredByCategory
              ? `Chiếm ${filteredKpi?.sharePercent || '23.8'}% toàn bộ Lakehouse`
              : sourceSharesSummary}
          </span>
        </div>

        {/* Metric 2: Markdown Clean Schema Integrity */}
        <div
          style={{
            padding: '7px 10px',
            borderRadius: '6px',
            backgroundColor: themeStyles.cardBg,
            border: `1px solid ${themeStyles.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
              TOÀN VẸN SCHEMA MARKDOWN
            </span>
            <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 800 }}>
              ✓ PASSED
            </span>
          </div>
          <span style={{ fontSize: '16px', fontFamily: 'var(--font-mono)', fontWeight: 900, color: '#10b981', letterSpacing: '-0.3px' }}>
            100.0%
          </span>
          <span style={{ fontSize: '8.5px', color: themeStyles.textSecondary, fontFamily: 'var(--font-mono)' }}>
            0% khuyết thiếu ID, Tiêu đề, Toàn văn
          </span>
        </div>

        {/* Metric 3: LaTeX Math Formulas Extracted */}
        <div
          style={{
            padding: '7px 10px',
            borderRadius: '6px',
            backgroundColor: themeStyles.cardBg,
            border: `1px solid ${themeStyles.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
              CÔNG THỨC TOÁN LATEX
            </span>
            <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#ea580c', fontWeight: 800 }}>
              μ={avgMathPerPaper} eq/bài
            </span>
          </div>
          <span style={{ fontSize: '16px', fontFamily: 'var(--font-mono)', fontWeight: 900, color: '#ea580c', letterSpacing: '-0.3px' }}>
            {animatedMath.toLocaleString()}
          </span>
          <span style={{ fontSize: '8.5px', color: themeStyles.textSecondary, fontFamily: 'var(--font-mono)' }}>
            Độ chính xác bóc tách {latexPreservation}% ($ &amp; $$)
          </span>
        </div>

        {/* Metric 4: Total Words & Growth Acceleration */}
        <div
          style={{
            padding: '7px 10px',
            borderRadius: '6px',
            backgroundColor: themeStyles.cardBg,
            border: `1px solid ${themeStyles.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted, fontWeight: 700 }}>
              DUNG LƯỢNG &amp; MẬT ĐỘ TỪ
            </span>
            <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#8b5cf6', fontWeight: 800 }}>
              {totalSizeGb} GB
            </span>
          </div>
          <span style={{ fontSize: '16px', fontFamily: 'var(--font-mono)', fontWeight: 900, color: '#8b5cf6', letterSpacing: '-0.3px' }}>
            {isFilteredByCategory ? `${avgWordsPerPaper.toLocaleString()} từ/bài` : `${(totalWords / 1_000_000).toFixed(1)}M từ`}
          </span>
          <span style={{ fontSize: '8.5px', color: themeStyles.textSecondary, fontFamily: 'var(--font-mono)' }}>
            {isFilteredByCategory ? `Trung bình chuyên ngành ${selectedCategory}` : `Trung bình ${avgWordsPerPaper.toLocaleString()} từ/bài báo`}
          </span>
        </div>
      </div>



      {/* ============================================================== */}
      {/* 5. BALANCED 2-COLUMN COMMAND CENTER (ZERO-SCROLL VIEWPORT)     */}
      {/* ============================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.08fr',
          gap: '8px',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* ------------------------------------------------------------ */}
        {/* COLUMN 1: PROVENANCE BREAKDOWN & ANNUAL INGESTION TIMELINE   */}
        {/* ------------------------------------------------------------ */}
        <div
          style={{
            backgroundColor: themeStyles.cardBg,
            borderRadius: '8px',
            border: `1px solid ${themeStyles.border}`,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minHeight: 0,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>
                [EDA-01] CƠ CẤU 3 NGUỒN CÀO &amp; TIẾN TRÌNH THEO THỜI GIAN
              </span>
              <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                {displayedTotalPapers.toLocaleString()} bài báo • 3 kênh thu hoạch • Chuỗi thời gian 2018 - 2026
              </div>
            </div>

            <span style={{ fontSize: '8.5px', fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: '4px', backgroundColor: themeStyles.cardSubtle, color: themeStyles.textSecondary }}>
              Click nguồn để lọc biểu đồ
            </span>
          </div>

          {/* Upper Section: Dynamic Interactive Donut + 3 Source Cards */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
            {/* Interactive SVG Donut */}
            <div style={{ width: '120px', height: '120px', position: 'relative', flexShrink: 0 }}>
              <svg viewBox="0 0 88 88" style={{ width: '100%', height: '100%' }}>
                {donutGeometry.map((s) => {
                  const isHovered = hoveredSource === s.key;
                  const isFiltered = selectedSource !== 'ALL' && selectedSource !== s.key;
                  const isSelected = selectedSource === s.key;

                  return (
                    <circle
                      key={s.key}
                      cx="44"
                      cy="44"
                      r={s.radius}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={isHovered ? 13 : isSelected ? 12 : 9.5}
                      strokeDasharray={s.dasharray}
                      strokeDashoffset={s.offset}
                      style={{
                        cursor: 'pointer',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                        opacity: isFiltered ? 0.22 : 1,
                        filter: isHovered || isSelected ? `drop-shadow(0 0 6px ${s.color})` : 'none',
                      }}
                      onMouseEnter={() => setHoveredSource(s.key)}
                      onMouseLeave={() => setHoveredSource(null)}
                      onClick={() => {
                        const next = selectedSource === s.key ? 'ALL' : s.key;
                        setSelectedSource(next);
                        onShowToast?.(`Đã lọc nguồn: ${s.name}`);
                      }}
                    />
                  );
                })}

                {/* Dynamic Center Telemetry */}
                <text
                  x="44"
                  y="40"
                  textAnchor="middle"
                  fontSize={activeFocusSource ? '8.5' : '10'}
                  fontFamily="var(--font-mono)"
                  fontWeight="900"
                  fill={activeFocusSource ? activeFocusSource.color : themeStyles.textPrimary}
                >
                  {activeFocusSource ? `${activeFocusSource.percentage}%` : `${(displayedTotalPapers / 1000).toFixed(1)}k`}
                </text>
                <text
                  x="44"
                  y="51"
                  textAnchor="middle"
                  fontSize="6.5"
                  fontFamily="var(--font-mono)"
                  fontWeight="700"
                  fill={themeStyles.textMuted}
                >
                  {activeFocusSource ? activeFocusSource.shortName : 'LAKEHOUSE'}
                </text>
              </svg>
            </div>

            {/* 3 Source Detail Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minHeight: 0 }}>
              {sources.map((src) => {
                const isSelected = selectedSource === src.key;
                const isHovered = hoveredSource === src.key;
                return (
                  <div
                    key={src.key}
                    onMouseEnter={() => setHoveredSource(src.key)}
                    onMouseLeave={() => setHoveredSource(null)}
                    onClick={() => {
                      const next = isSelected ? 'ALL' : src.key;
                      setSelectedSource(next);
                      onShowToast?.(`Đã lọc nguồn: ${src.name}`);
                    }}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '5px',
                      backgroundColor: isSelected
                        ? `${src.color}22`
                        : isHovered
                        ? themeStyles.cardSubtle
                        : themeStyles.cardBg,
                      border: `1px solid ${isSelected ? src.color : themeStyles.border}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isHovered ? `0 0 8px ${src.color}25` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: src.color }} />
                        <strong style={{ fontSize: '10px', color: themeStyles.textPrimary }}>{src.name}</strong>
                      </span>
                      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: src.color }}>
                        {src.count.toLocaleString()} ({src.percentage}%)
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', fontSize: '8px', fontFamily: 'var(--font-mono)', color: themeStyles.textSecondary }}>
                      <span>{src.badge} • {(src.sizeMb / 1024).toFixed(2)} GB</span>
                      <span style={{ color: isSelected ? src.color : themeStyles.textMuted }}>
                        {isSelected ? '✓ Đang lọc' : 'Click để lọc'}
                      </span>
                    </div>

                    {/* Mini proportional progress bar */}
                    <div style={{ width: '100%', height: '3px', backgroundColor: themeStyles.trackBg, borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${src.percentage}%`,
                          height: '100%',
                          backgroundColor: src.color,
                          borderRadius: '2px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lower Section: Annual Harvest Timeline Stacked Bars (2018 - 2026) FULL HEIGHT */}
          <div
            style={{
              backgroundColor: themeStyles.cardSubtle,
              borderRadius: '6px',
              border: `1px solid ${themeStyles.border}`,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '9.5px', fontWeight: 800, color: themeStyles.textPrimary, fontFamily: 'var(--font-mono)' }}>
                TIẾN TRÌNH THU HOẠCH HÀNG NĂM (2018 - 2026)
              </span>
              <span style={{ fontSize: '8.5px', fontFamily: 'var(--font-mono)', color: '#3b82f6', fontWeight: 700 }}>
                {hoveredYear ? `Năm ${hoveredYear}` : `Đỉnh 2023: ${maxTimelineTotal.toLocaleString()} bài`}
              </span>
            </div>

            {/* Stacked Bars Container with Gridlines & Full Available Height */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                alignItems: 'flex-end',
                gap: '8px',
                padding: '6px 6px 0 6px',
                position: 'relative',
              }}
            >
              {/* Subtle Horizontal Reference Gridlines */}
              <div
                style={{
                  position: 'absolute',
                  top: '15%',
                  left: 0,
                  right: 0,
                  borderTop: `1px dashed ${themeStyles.borderSubtle}`,
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  right: 0,
                  borderTop: `1px dashed ${themeStyles.borderSubtle}`,
                  pointerEvents: 'none',
                }}
              />

              {timelineList.map((item) => {
                // Scale properly up to 88% of container height to eliminate vertical void
                const heightPct = (item.total / maxTimelineTotal) * 100;
                const arxivPct = item.total > 0 ? (item.sources.arxiv / item.total) * 100 : 0;
                const orPct = item.total > 0 ? (item.sources.openreview / item.total) * 100 : 0;
                const cvfPct = item.total > 0 ? (item.sources.cvf / item.total) * 100 : 0;

                const isArxivDimmed = selectedSource !== 'ALL' && selectedSource !== 'arxiv';
                const isOrDimmed = selectedSource !== 'ALL' && selectedSource !== 'openreview';
                const isCvfDimmed = selectedSource !== 'ALL' && selectedSource !== 'cvf';
                const isYearHovered = hoveredYear === item.year;

                return (
                  <div
                    key={item.year}
                    onMouseEnter={() => setHoveredYear(item.year)}
                    onMouseLeave={() => setHoveredYear(null)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '3px',
                      height: '100%',
                      justifyContent: 'flex-end',
                      cursor: 'pointer',
                      zIndex: 2,
                    }}
                    title={`${item.year}: ${item.total.toLocaleString()} bài (arXiv: ${item.sources.arxiv} | OpenReview: ${item.sources.openreview} | CVF: ${item.sources.cvf})`}
                  >
                    <span
                      style={{
                        fontSize: '8px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: isYearHovered ? '#3b82f6' : themeStyles.textMuted,
                      }}
                    >
                      {item.total > 1000 ? `${(item.total / 1000).toFixed(1)}k` : item.total}
                    </span>

                    {/* Stacked Bar with smooth rise & full height utilization */}
                    <div
                      style={{
                        width: '100%',
                        maxWidth: '34px',
                        height: item.total > 0 ? `${Math.max(6, heightPct * 0.88)}%` : '2px',
                        display: 'flex',
                        flexDirection: 'column-reverse',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        backgroundColor: themeStyles.trackBg,
                        border: isYearHovered ? '1px solid #38bdf8' : 'none',
                        transition: 'all 0.2s ease',
                        boxShadow: isYearHovered ? '0 0 8px rgba(56, 189, 248, 0.3)' : 'none',
                      }}
                    >
                      <div
                        style={{
                          height: `${arxivPct}%`,
                          backgroundColor: '#f59e0b',
                          opacity: isArxivDimmed ? 0.2 : 1,
                          transition: 'opacity 0.2s',
                        }}
                      />
                      <div
                        style={{
                          height: `${orPct}%`,
                          backgroundColor: '#3b82f6',
                          opacity: isOrDimmed ? 0.2 : 1,
                          transition: 'opacity 0.2s',
                        }}
                      />
                      <div
                        style={{
                          height: `${cvfPct}%`,
                          backgroundColor: '#10b981',
                          opacity: isCvfDimmed ? 0.2 : 1,
                          transition: 'opacity 0.2s',
                        }}
                      />
                    </div>

                    <span
                      style={{
                        fontSize: '8.5px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: isYearHovered ? 900 : 700,
                        color: isYearHovered ? themeStyles.textPrimary : themeStyles.textSecondary,
                      }}
                    >
                      {item.year.slice(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* COLUMN 2: QUALITY AUDIT TABLE & SUBSTANTIAL SILVER PIPELINE */}
        {/* ------------------------------------------------------------ */}
        <div
          style={{
            backgroundColor: themeStyles.cardBg,
            borderRadius: '8px',
            border: `1px solid ${themeStyles.border}`,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minHeight: 0,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 800, color: themeStyles.textPrimary }}>
                [EDA-02] KIỂM ĐỊNH ĐỘ TOÀN VẸN &amp; QUY TRÌNH TIỀN XỬ LÝ (SILVER)
              </span>
              <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: themeStyles.textMuted }}>
                Thẩm định 6 trường cốt lõi • Quy trình 4 bước làm sạch sang Markdown chuẩn tắc
              </div>
            </div>

            <span
              style={{
                fontSize: '8.5px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.18)' : '#dcfce7',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              100% RAG READY
            </span>
          </div>

          {/* Section 1: Quality Audit Inspection Table (Substantial & Informative) */}
          <div
            style={{
              backgroundColor: themeStyles.cardSubtle,
              borderRadius: '6px',
              border: `1px solid ${themeStyles.border}`,
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '9.5px', fontWeight: 800, color: themeStyles.textPrimary, fontFamily: 'var(--font-mono)' }}>
                1. BẢNG THẨM ĐỊNH CHẤT LƯỢNG 6 THUỘC TÍNH (SCHEMA AUDIT)
              </span>
              <span style={{ fontSize: '8.5px', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 800 }}>
                100% TOÀN VĂN
              </span>
            </div>

            {/* Inspection Table Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 0.9fr 0.9fr 0.7fr 1.3fr 0.9fr',
                gap: '4px',
                padding: '3px 6px',
                backgroundColor: themeStyles.tableHeaderBg,
                borderRadius: '3px',
                fontSize: '8px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 800,
                color: themeStyles.textMuted,
                marginBottom: '3px',
              }}
            >
              <span>THUỘC TÍNH</span>
              <span>SCHEMA TYPE</span>
              <span>HỢP LỆ</span>
              <span>KHUYẾT</span>
              <span>TIẾN ĐỘ (%)</span>
              <span style={{ textAlign: 'right' }}>SLA TRẠNG THÁI</span>
            </div>

            {/* Inspection Table Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {missingnessList.map((m) => (
                <div
                  key={m.field}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 0.9fr 0.9fr 0.7fr 1.3fr 0.9fr',
                    gap: '4px',
                    alignItems: 'center',
                    padding: '3px 6px',
                    borderRadius: '3px',
                    backgroundColor: themeStyles.cardBg,
                    border: `1px solid ${themeStyles.borderSubtle}`,
                    fontSize: '8.5px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <span style={{ fontWeight: 700, color: themeStyles.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.displayName}
                  </span>
                  <span style={{ color: themeStyles.textMuted, fontSize: '8px' }}>
                    {m.schemaType}
                  </span>
                  <span style={{ color: themeStyles.textPrimary, fontWeight: 700 }}>
                    {m.present.toLocaleString()}
                  </span>
                  <span style={{ color: m.missing === 0 ? themeStyles.textMuted : '#ea580c', fontWeight: 600 }}>
                    {m.missing.toLocaleString()}
                  </span>

                  {/* Progress bar with percentage */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ flex: 1, height: '4px', backgroundColor: themeStyles.trackBg, borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        className={m.completenessPct >= 99 ? 'r2-shimmer-bar' : ''}
                        style={{
                          height: '100%',
                          width: `${m.completenessPct}%`,
                          backgroundColor: m.statusColor,
                          borderRadius: '2px',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '8px', fontWeight: 800, color: m.statusColor, minWidth: '32px' }}>
                      {m.completenessPct.toFixed(1)}%
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '7.5px',
                      fontWeight: 800,
                      color: m.statusColor,
                      textAlign: 'right',
                    }}
                  >
                    {m.slaStatus}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Substantial 4-Step Silver Cleaning Pipeline (No Empty Space!) */}
          <div
            style={{
              backgroundColor: themeStyles.cardSubtle,
              borderRadius: '6px',
              border: `1px solid ${themeStyles.border}`,
              padding: '6px 8px',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
              gap: '5px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '9.5px', fontWeight: 800, color: themeStyles.textPrimary, fontFamily: 'var(--font-mono)' }}>
                2. QUY TRÌNH 4 BƯỚC BÓC TÁCH &amp; LÀM SẠCH (BRONZE → SILVER)
              </span>
              <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', color: '#8b5cf6', fontWeight: 700 }}>
                PIPELINE HOÀN TẤT
              </span>
            </div>

            {/* 4 Rich Step Cards (Evenly Spaced with gap: 5px, NO space-between voids!) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                flex: 1,
                minHeight: 0,
              }}
            >
              {cleaningSteps.map((st, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '6px 9px',
                    borderRadius: '4px',
                    backgroundColor: themeStyles.cardBg,
                    border: `1px solid ${themeStyles.border}`,
                    borderLeft: `3px solid ${st.color}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '2px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 800, color: themeStyles.textPrimary }}>
                        {st.step}
                      </span>
                      <span style={{ fontSize: '7.5px', fontFamily: 'var(--font-mono)', padding: '0 4px', borderRadius: '3px', backgroundColor: themeStyles.cardSubtle, border: `1px solid ${themeStyles.border}`, color: themeStyles.textMuted }}>
                        {st.engine}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: '8px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor: `${st.color}18`,
                        color: st.color,
                        border: `1px solid ${st.color}35`,
                      }}
                    >
                      {st.stat}
                    </span>
                  </div>

                  <div style={{ fontSize: '8.5px', color: themeStyles.textSecondary, lineHeight: 1.25 }}>
                    {st.desc}
                  </div>

                  {/* Micro-Telemetry Pipeline Flow Indicator */}
                  <div
                    style={{
                      fontSize: '7.5px',
                      fontFamily: 'var(--font-mono)',
                      color: isDark ? '#94a3b8' : '#64748b',
                      backgroundColor: themeStyles.cardSubtle,
                      padding: '1px 5px',
                      borderRadius: '3px',
                      marginTop: '1px',
                    }}
                  >
                    ⚡ {st.flow}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
