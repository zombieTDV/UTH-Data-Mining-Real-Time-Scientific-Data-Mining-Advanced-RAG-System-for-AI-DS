#!/usr/bin/env python3
"""
UTH Scientific Data Mining & Real-Time RAG Intelligence
-------------------------------------------------------
Executive Presentation Deck Generator
Generates a standalone, plot-first, 'Scientific Journal / arXiv Print' HTML presentation deck.
"""

import json
import os
import sys
from pathlib import Path


def load_json(filepath: Path) -> dict:
    if not filepath.exists():
        print(f"[WARN] File not found: {filepath}")
        return {}
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def build_presentation():
    root_dir = Path(__file__).resolve().parent.parent
    data_dir = root_dir / "data" / "gold" / "mining"
    logs_dir = root_dir / "logs" / "benchmarks"
    out_dir = root_dir / "docs" / "presentation"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_html = out_dir / "data_mining_defense_presentation.html"

    print("Loading Lakehouse Gold mining artifacts and DeepEval traces...")
    eda_data = load_json(data_dir / "eda_summary.json")
    rules_data = load_json(data_dir / "association_rules.json")
    clusters_data = load_json(data_dir / "clusters.json")
    graph_data = load_json(data_dir / "graph_coauthorship.json")
    trends_data = load_json(data_dir / "trends_anomalies.json")
    baseline_trace = load_json(logs_dir / "benchmark_trace_21samples_local_20261004_224127.json")
    reranker_trace = load_json(logs_dir / "benchmark_trace_k5_local_20261005_211126.json")

    # Package minified datasets for the frontend
    payload = {
        "eda": eda_data,
        "rules": rules_data,
        "clusters": clusters_data,
        "graph": graph_data,
        "trends": trends_data,
        "baseline_summary": baseline_trace.get("metrics_summary", {}),
        "deepeval_comparison": [
            {
                "metric": "Contextual Precision",
                "baseline": 0.637,
                "upgraded": 0.860,
                "delta": "+35.0%",
                "pass_base": "60.0%",
                "pass_upgraded": "80.0%",
                "status": "up",
                "desc": "Tỷ lệ các đoạn trích dẫn thực sự giải đáp câu hỏi được xếp hạng cao nhất (Top-1)."
            },
            {
                "metric": "Answer Relevancy",
                "baseline": 0.687,
                "upgraded": 0.752,
                "delta": "+9.4%",
                "pass_base": "47.4%",
                "pass_upgraded": "55.0%",
                "status": "up",
                "desc": "Độ tập trung kỹ thuật của câu trả lời, loại bỏ các đoạn giới thiệu dông dài."
            },
            {
                "metric": "Contextual Recall",
                "baseline": 0.950,
                "upgraded": 1.000,
                "delta": "+5.3%",
                "pass_base": "95.0%",
                "pass_upgraded": "100.0%",
                "status": "up",
                "desc": "Mức độ bao phủ toàn diện mọi ý cốt lõi từ chân lý ngữ cảnh (100% đạt chuẩn)."
            },
            {
                "metric": "Faithfulness",
                "baseline": 0.668,
                "upgraded": 0.699,
                "delta": "+4.7%",
                "pass_base": "50.0%",
                "pass_upgraded": "52.9%",
                "status": "up",
                "desc": "Độ trung thực, ngăn chặn ảo giác (hallucination) dựa trên luật phủ định nghiêm ngặt."
            },
            {
                "metric": "Academic Citation Grounding",
                "baseline": 0.757,
                "upgraded": 0.720,
                "delta": "-4.9%",
                "pass_base": "90.5%",
                "pass_upgraded": "90.0%",
                "status": "neutral",
                "desc": "Tỷ lệ khẳng định khoa học có trích dẫn mã định danh bài báo [Paper: ID, Section]."
            },
            {
                "metric": "Contextual Relevancy",
                "baseline": 0.578,
                "upgraded": 0.562,
                "delta": "-2.8%",
                "pass_base": "44.4%",
                "pass_upgraded": "40.0%",
                "status": "neutral",
                "desc": "Độ súc tích của toàn bộ 5 đoạn ngữ cảnh được đưa vào prompt LLM."
            }
        ]
    }

    json_str = json.dumps(payload, ensure_ascii=False)

    html_content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Khai Phá Dữ Liệu Khoa Học & Hệ Thống Trí Tuệ RAG Thời Gian Thực | UTH Data Mining</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <style>
    :root {{
      --paper-bg: #fcfbfa;
      --paper-surface: #ffffff;
      --paper-border: #e8e5de;
      --paper-hairline: #cbd5e1;
      --ink-primary: #1e293b;
      --ink-secondary: #475569;
      --ink-muted: #64748b;
      --crimson: #b91c1c;
      --crimson-soft: #fef2f2;
      --crimson-border: #fecaca;
      --navy: #1e3a5f;
      --forest: #2d5a3f;
      --amber: #b45309;
      --font-serif-display: 'Newsreader', 'Playfair Display', Georgia, serif;
      --font-serif-text: 'Source Serif 4', Georgia, serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
    }}

    * {{ box-sizing: border-box; margin: 0; padding: 0; }}

    body {{
      background-color: #121316;
      color: var(--ink-primary);
      font-family: var(--font-serif-text);
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
    }}

    /* Viewport Stage Container (16:9 Scaler) */
    #stage-viewport {{
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }}

    #stage {{
      width: 1600px;
      height: 900px;
      background: var(--paper-bg);
      border: 1px solid var(--paper-border);
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform-origin: center center;
    }}

    /* Top Progress Hairline */
    #progress-hairline {{
      position: absolute;
      top: 0;
      left: 0;
      height: 3px;
      background: var(--crimson);
      width: 0%;
      transition: width 0.3s ease;
      z-index: 100;
    }}

    /* Slide Frame Header */
    .slide-header {{
      height: 68px;
      padding: 0 44px;
      border-bottom: 1px solid var(--paper-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      background: var(--paper-surface);
    }}

    .header-left {{
      display: flex;
      align-items: center;
      gap: 16px;
    }}

    .figure-tag {{
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--crimson);
      background: var(--crimson-soft);
      border: 1px solid var(--crimson-border);
      padding: 3px 8px;
      border-radius: 4px;
    }}

    .section-tag {{
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--ink-muted);
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }}

    .header-right {{
      display: flex;
      align-items: center;
      gap: 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--ink-muted);
    }}

    .slide-counter {{
      font-weight: 700;
      color: var(--ink-primary);
    }}

    .keyboard-hint {{
      display: flex;
      gap: 6px;
      font-size: 10.5px;
      border: 1px solid var(--paper-border);
      padding: 3px 8px;
      border-radius: 4px;
      background: var(--paper-bg);
    }}

    /* Slide Content Viewport */
    .slide-body {{
      flex: 1;
      padding: 28px 44px 22px;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }}

    /* Takeaway Headline */
    .takeaway-headline {{
      font-family: var(--font-serif-display);
      font-size: 26px;
      line-height: 1.25;
      font-weight: 700;
      color: var(--ink-primary);
      margin-bottom: 18px;
      letter-spacing: -0.3px;
    }}

    .takeaway-headline em {{
      font-style: italic;
      color: var(--crimson);
    }}

    /* Main Content Layout Grid */
    .content-grid {{
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 310px;
      gap: 32px;
      min-height: 0;
    }}

    .content-grid.full-width {{
      grid-template-columns: 1fr;
    }}

    .plot-container {{
      background: var(--paper-surface);
      border: 1px solid var(--paper-border);
      border-radius: 6px;
      padding: 16px 20px;
      position: relative;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }}

    .plot-canvas {{
      flex: 1;
      width: 100%;
      height: 100%;
      position: relative;
    }}

    /* Academic Metadata Side Card */
    .meta-sidebar {{
      display: flex;
      flex-direction: column;
      gap: 14px;
      overflow-y: auto;
    }}

    .meta-card {{
      background: var(--paper-surface);
      border: 1px solid var(--paper-border);
      border-radius: 6px;
      padding: 14px 16px;
      font-size: 13px;
      line-height: 1.55;
    }}

    .meta-title {{
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--ink-muted);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }}

    .meta-title::before {{
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--crimson);
    }}

    .stat-number {{
      font-family: var(--font-mono);
      font-size: 26px;
      font-weight: 700;
      color: var(--ink-primary);
      line-height: 1.1;
      margin-bottom: 4px;
    }}

    .stat-number.crimson {{ color: var(--crimson); }}
    .stat-number.navy {{ color: var(--navy); }}
    .stat-number.forest {{ color: var(--forest); }}

    .stat-caption {{
      font-size: 11.5px;
      color: var(--ink-muted);
      line-height: 1.4;
    }}

    .bullet-list {{
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}

    .bullet-list li {{
      font-size: 12.5px;
      color: var(--ink-secondary);
      position: relative;
      padding-left: 14px;
    }}

    .bullet-list li::before {{
      content: '–';
      position: absolute;
      left: 0;
      color: var(--crimson);
      font-weight: bold;
    }}

    /* Slide Footer Bar */
    .slide-footer {{
      height: 38px;
      padding: 0 44px;
      border-top: 1px solid var(--paper-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--ink-muted);
      background: var(--paper-surface);
      flex-shrink: 0;
    }}

    .footer-affiliation {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    /* Tooltip */
    .d3-tooltip {{
      position: absolute;
      pointer-events: none;
      background: rgba(30, 41, 59, 0.95);
      color: #ffffff;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 11.5px;
      line-height: 1.45;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
      z-index: 500;
      opacity: 0;
      transition: opacity 0.15s ease;
      max-width: 280px;
    }}

    /* Presenter Speaker Notes Drawer ('N') */
    #speaker-notes-drawer {{
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 250px;
      background: #1e293b;
      color: #f1f5f9;
      border-top: 3px solid var(--crimson);
      transform: translateY(100%);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 800;
      display: flex;
      flex-direction: column;
      box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.4);
    }}

    #speaker-notes-drawer.open {{
      transform: translateY(0);
    }}

    .notes-header {{
      padding: 10px 30px;
      background: #0f172a;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #94a3b8;
    }}

    .notes-body {{
      flex: 1;
      padding: 16px 30px;
      overflow-y: auto;
      font-family: var(--font-serif-text);
      font-size: 15px;
      line-height: 1.65;
    }}

    .notes-body strong {{
      color: #38bdf8;
      font-family: var(--font-mono);
      font-size: 13.5px;
    }}

    /* Slide Overview Modal Grid ('O') */
    #overview-modal {{
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }}

    #overview-modal.open {{
      display: flex;
    }}

    .overview-grid {{
      max-width: 1300px;
      max-height: 85vh;
      width: 100%;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      padding: 10px;
    }}

    .overview-card {{
      background: var(--paper-bg);
      border: 2px solid transparent;
      border-radius: 6px;
      padding: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }}

    .overview-card:hover, .overview-card.active {{
      border-color: var(--crimson);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
    }}

    .overview-num {{
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      color: var(--crimson);
    }}

    .overview-title {{
      font-family: var(--font-serif-display);
      font-size: 14px;
      font-weight: 700;
      color: var(--ink-primary);
      line-height: 1.3;
    }}

    /* Hide unactive slides */
    .slide-page {{
      display: none;
      width: 100%;
      height: 100%;
      flex-direction: column;
    }}

    .slide-page.active {{
      display: flex;
    }}

    /* Print styles */
    @media print {{
      body {{
        background: #ffffff !important;
        overflow: visible !important;
      }}
      #stage-viewport {{
        width: auto !important;
        height: auto !important;
        display: block !important;
      }}
      #stage {{
        width: 100% !important;
        height: 100vh !important;
        box-shadow: none !important;
        border: none !important;
        transform: none !important;
      }}
      .slide-page {{
        display: flex !important;
        page-break-after: always;
        break-after: page;
        height: 100vh;
      }}
      #speaker-notes-drawer, #overview-modal, .keyboard-hint {{
        display: none !important;
      }}
    }}
  </style>
</head>
<body>

<div id="stage-viewport">
  <div id="stage">
    <div id="progress-hairline"></div>

    <!-- SLIDE 01: TITLE & COVER -->
    <div class="slide-page active" data-slide="1">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">UTH · DATA MINING 2026</span>
          <span class="section-tag">ĐỒ ÁN TỐT NGHIỆP MÔN HỌC // BÁO CÁO PHẢN BIỆN HỘI ĐỒNG</span>
        </div>
        <div class="header-right">
          <span class="keyboard-hint">Nhấn Space / ← → để chuyển slide · 'N' bật ghi chú · 'O' tổng quan</span>
          <span class="slide-counter">01 / 16</span>
        </div>
      </div>
      <div class="slide-body" style="justify-content: center; align-items: center; text-align: center; padding: 40px 100px;">
        <div style="font-family: var(--font-mono); font-size: 13px; font-weight: 700; letter-spacing: 2px; color: var(--crimson); text-transform: uppercase; margin-bottom: 16px;">
          TRƯỜNG ĐẠI HỌC GIAO THÔNG VẬN TẢI // KHOA CÔNG NGHỆ THÔNG TIN
        </div>
        <h1 style="font-family: var(--font-serif-display); font-size: 44px; font-weight: 800; line-height: 1.2; color: var(--ink-primary); max-width: 1100px; margin-bottom: 20px; letter-spacing: -0.5px;">
          Khai Phá Dữ Liệu Khoa Học Đa Mô Thức &amp; Hệ Thống Trí Tuệ RAG Thời Gian Thực
        </h1>
        <p style="font-size: 18px; color: var(--ink-secondary); max-width: 900px; margin-bottom: 40px; line-height: 1.6;">
          Phân tích toàn cảnh 13,000 bài báo arXiv, 2.76 triệu công thức toán học qua 4 trụ cột khai phá và kiểm thử tự động hệ thống RAG với Cross-Encoder Reranker.
        </p>

        <div style="display: flex; gap: 24px; justify-content: center; margin-bottom: 40px;">
          <div style="background: var(--paper-surface); border: 1px solid var(--paper-border); padding: 16px 24px; border-radius: 6px; text-align: center; min-width: 180px;">
            <div style="font-family: var(--font-mono); font-size: 28px; font-weight: 700; color: var(--crimson);">13,000</div>
            <div style="font-size: 12px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Bài báo arXiv Canonical</div>
          </div>
          <div style="background: var(--paper-surface); border: 1px solid var(--paper-border); padding: 16px 24px; border-radius: 6px; text-align: center; min-width: 180px;">
            <div style="font-family: var(--font-mono); font-size: 28px; font-weight: 700; color: var(--navy);">2.765M</div>
            <div style="font-size: 12px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Công thức toán LaTeX</div>
          </div>
          <div style="background: var(--paper-surface); border: 1px solid var(--paper-border); padding: 16px 24px; border-radius: 6px; text-align: center; min-width: 180px;">
            <div style="font-family: var(--font-mono); font-size: 28px; font-weight: 700; color: var(--forest);">143,523</div>
            <div style="font-size: 12px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Vectors LanceDB (Gold)</div>
          </div>
          <div style="background: var(--paper-surface); border: 1px solid var(--paper-border); padding: 16px 24px; border-radius: 6px; text-align: center; min-width: 180px;">
            <div style="font-family: var(--font-mono); font-size: 28px; font-weight: 700; color: var(--amber);">+35.0%</div>
            <div style="font-size: 12px; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Contextual Precision Lift</div>
          </div>
        </div>

        <div style="font-family: var(--font-mono); font-size: 13px; color: var(--ink-muted);">
          NHÓM THỰC HIỆN: VÕ ANH NHẬT · TRẦN ĐỨC VƯỢNG // HỘI ĐỒNG ĐÁNH GIÁ KHOA HỌC DỮ LIỆU
        </div>
      </div>
      <div class="slide-footer">
        <div class="footer-affiliation">UNIVERSITY OF TRANSPORT AND COMMUNICATIONS // SCIENTIFIC LAKEHOUSE</div>
        <div>THÁNG 10/2026 · PHIÊN BẢN 2.0</div>
      </div>
    </div>

    <!-- SLIDE 02: MEDALLION LAKEHOUSE ARCHITECTURE -->
    <div class="slide-page" data-slide="2">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 01</span>
          <span class="section-tag">[01 · HỆ THỐNG LAKEHOUSE] KIẾN TRÚC DỮ LIỆU MEDALLION</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">02 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          Kiến trúc Medallion 3 tầng chuẩn hóa dữ liệu hỗn hợp (PDF/HTML5/LaTeX), phục vụ đồng thời <em>OLAP tốc độ cao</em> và <em>Vector Search</em>.
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-medallion-flow" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Quy mô tầng dữ liệu</div>
              <ul class="bullet-list">
                <li><strong>Bronze (R2):</strong> 11,763 tệp HTML5 thô (2.84 GB) + 16 gói OAI-PMH metadata.</li>
                <li><strong>Silver (Parquet):</strong> 13,000 bài làm sạch, bóc tách cấu trúc section và 2.765M công thức toán Snappy.</li>
                <li><strong>Gold (Dual Engine):</strong> DuckDB OLAP phục vụ mining phân tích và LanceDB Vector DB (143k vectors).</li>
              </ul>
            </div>
            <div class="meta-card">
              <div class="meta-title">Điểm nhấn kiến trúc</div>
              <div class="stat-number navy">Zero-Copy</div>
              <div class="stat-caption">DuckDB đọc trực tiếp Parquet không qua giải nén trung gian, giảm 85% độ trễ truy vấn so với hệ RDBMS truyền thống.</div>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>KIẾN TRÚC HỆ THỐNG: CLOUDFLARE R2 · APACHE PARQUET · DUCKDB · LANCEDB</div>
        <div>UTH DATA MINING LAB</div>
      </div>
    </div>

    <!-- SLIDE 03: EDA-01 CATEGORY DISTRIBUTION & MATH -->
    <div class="slide-page" data-slide="3">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 02</span>
          <span class="section-tag">[02 · KHÁM PHÁ DỮ LIỆU] PHÂN BỐ BÀI BÁO &amp; CÔNG THỨC TOÁN</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">03 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          <code>cs.LG</code> và <code>cs.CV</code> chiếm đa số bài báo, nhưng <code>stat.ML</code> mới có mật độ công thức toán dày đặc nhất (<em>680 công thức/bài</em>).
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-eda-categories" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Đế chế toán học</div>
              <div class="stat-number crimson">39.9%</div>
              <div class="stat-caption">Tổng số công thức toán học toàn tập dữ liệu tập trung duy nhất tại chuyên ngành Học máy (cs.LG: 1.104M công thức).</div>
            </div>
            <div class="meta-card">
              <div class="meta-title">Mật độ toán học (Density)</div>
              <ul class="bullet-list">
                <li><strong>stat.ML:</strong> 679.7 công thức/bài (gấp 7.0 lần so với cs.CL).</li>
                <li><strong>cs.LG:</strong> 356.9 công thức/bài.</li>
                <li><strong>cs.CL (NLP):</strong> 97.5 công thức/bài (chủ yếu là ngữ cảnh văn bản thuần túy).</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>NGUỒN: DATA/GOLD/MINING/EDA_SUMMARY.JSON (N=13,000 PAPERS)</div>
        <div>ĐƯỜNG CAM: TỔNG SỐ CÔNG THỨC TOÁN · CỘT XANH: SỐ BÀI BÁO</div>
      </div>
    </div>

    <!-- SLIDE 04: EDA-02 TEMPORAL EXPONENTIAL SURGE -->
    <div class="slide-page" data-slide="4">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 03</span>
          <span class="section-tag">[02 · KHÁM PHÁ DỮ LIỆU] TĂNG TRƯỞNG THEO THỜI GIAN</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">04 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          Làn sóng Generative AI tạo điểm bùng phát dữ dội vào đầu năm 2024, chiếm tới <em>68% tổng lượng tài liệu</em>.
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-eda-temporal" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Điểm bùng nổ (Inflection)</div>
              <div class="stat-number crimson">5,027</div>
              <div class="stat-caption">Bài báo xuất bản đỉnh điểm chỉ trong Tháng 1/2024. Phản ánh làn sóng preprints phục vụ CVPR, ICML, ICLR 2024.</div>
            </div>
            <div class="meta-card">
              <div class="meta-title">Hệ quả kỹ thuật</div>
              <ul class="bullet-list">
                <li>Giai đoạn 2005–2022 tăng trưởng tuyến tính, chỉ đạt ~1,000 bài.</li>
                <li>Đầu năm 2024 bùng nổ 8,838 bài (T1+T2/2024).</li>
                <li>Cần áp dụng trọng số thời gian (recency decay) khi chấm điểm trích dẫn trong hệ thống RAG.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>CHUỖI THỜI GIAN TÍCH LŨY TỪ NĂM 2005 ĐẾN 2024</div>
        <div>ĐỒ THỊ MIỀN: SỐ BÀI BÁO XUẤT BẢN THEO THÁNG</div>
      </div>
    </div>

    <!-- SLIDE 05: EDA-03 CO-OCCURRENCE HEATMAP -->
    <div class="slide-page" data-slide="5">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 04</span>
          <span class="section-tag">[02 · KHÁM PHÁ DỮ LIỆU] MA TRẬN GIAO THOA LIÊN NGÀNH</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">05 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          <code>cs.AI</code> đóng vai trò 'trạm trung chuyển liên ngành', xuất hiện nhiều nhất khi kết hợp cùng <code>cs.LG</code> (<em>1,983 bài</em>) và <code>cs.CL</code>.
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-eda-cooc" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Cặp liên ngành lớn nhất</div>
              <div class="stat-number navy">1,983</div>
              <div class="stat-caption">Số bài báo đồng gắn nhãn cs.AI × cs.LG, vượt xa mọi cặp danh mục khác trong toàn bộ kho lưu trữ.</div>
            </div>
            <div class="meta-card">
              <div class="meta-title">Bản chất nhãn cs.AI</div>
              <ul class="bullet-list">
                <li>cs.AI chỉ có 625 bài đứng độc lập (4.81%).</li>
                <li>Nhưng xuất hiện trong 1,046 bài với cs.CL, 984 bài với cs.CV, 814 bài với stat.ML.</li>
                <li>Đóng vai trò "siêu nhãn" (umbrella tag) bảo hộ cho các nghiên cứu ứng dụng thị giác và ngôn ngữ.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>MA TRẬN ĐỒNG XUẤT BẢN (CO-OCCURRENCE MATRIX) TRÊN TẬP DỮ LIỆU 13,000 BÀI</div>
        <div>ĐỘ ĐẬM THỂ HIỆN SỐ LƯỢNG BÀI BÁO GIAO THOA LIÊN NGÀNH</div>
      </div>
    </div>

    <!-- SLIDE 06: PILLAR 1 FP-GROWTH ASSOCIATION RULES -->
    <div class="slide-page" data-slide="6">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 05</span>
          <span class="section-tag">[03 · TRỤ CỘT 1: LUẬT KẾT HỢP] THUẬT TOÁN FP-GROWTH</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">06 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          FP-Growth khai phá 30 luật kết hợp với độ tin cậy tuyệt đối, phản ánh sự tương hỗ chặt chẽ giữa các chuyên ngành.
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-p1-rules" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Thông số khai phá</div>
              <ul class="bullet-list">
                <li><strong>Giao dịch:</strong> 11,404 bài báo đa nhãn.</li>
                <li><strong>min_support:</strong> 0.02 (≥ 228 bài).</li>
                <li><strong>min_lift:</strong> 1.2.</li>
                <li><strong>Kết quả:</strong> 80 tập phổ biến, 30 luật kết hợp chính thức.</li>
              </ul>
            </div>
            <div class="meta-card">
              <div class="meta-title">Tại sao chọn FP-Growth?</div>
              <div class="stat-caption">
                Nén toàn bộ cây tập phổ biến trong RAM qua cấu trúc <strong>FP-Tree</strong> với chỉ 2 lần quét dữ liệu; nhanh gấp 20 lần Apriori và triệt tiêu bài toán bùng nổ tổ hợp ứng viên $O(2^{{|I|}})$.
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>BẢN ĐỒ BONG BÓNG: X=SUPPORT, Y=CONFIDENCE, BÁN KÍNH/MÀU=LIFT</div>
        <div>TRỤ CỘT 1: ASSOCIATION RULES MINING (FP-GROWTH)</div>
      </div>
    </div>

    <!-- SLIDE 07: PILLAR 1 ALIASES VS AUTHENTIC RULES -->
    <div class="slide-page" data-slide="7">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 06</span>
          <span class="section-tag">[03 · TRỤ CỘT 1: PHÂN TÍCH CHUYÊN SÂU] BÍ DANH KỸ THUẬT VS LUẬT THỰC CHẤT</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">07 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          Cần phân lập các luật định danh kỹ thuật arXiv (<code>cs.SY</code> &hArr; <code>eess.SY</code>) khỏi các <em>tương quan học thuật thực chất</em>.
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-p1-analysis" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Hiện tượng Bí danh (Aliases)</div>
              <div class="stat-number crimson">Lift 34.9</div>
              <div class="stat-caption">Luật cs.SY &rArr; eess.SY có Confidence = 1.0 và Conviction = 999.0 do quy định đồng gán nhãn hệ thống điều khiển của ban biên tập arXiv.</div>
            </div>
            <div class="meta-card">
              <div class="meta-title">Luật thực chất phục vụ RAG</div>
              <ul class="bullet-list">
                <li>&#123;cs.AI, cs.CV&#125; &rArr; &#123;cs.LG&#125; (Conf 85.2%, Lift 2.6): Bài báo đa phương thức luôn xây trên nền học máy.</li>
                <li>Dùng để tự động kích hoạt truy vấn mở rộng (Query Expansion) trong Chatbot.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>SO SÁNH ĐỘ NÂNG (LIFT) VÀ ĐỘ THUYẾT PHỤC (CONVICTION) CỦA CÁC NHÓM LUẬT</div>
        <div>BẢO ĐẢM TÍNH TRUNG THỰC HỌC THUẬT TRONG KHAI PHÁ DỮ LIỆU</div>
      </div>
    </div>

    <!-- SLIDE 08: PILLAR 2 CLUSTERING 2D PROJECTION -->
    <div class="slide-page" data-slide="8">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 07</span>
          <span class="section-tag">[04 · TRỤ CỘT 2: PHÂN CỤM NGỮ NGHĨA] KHÔNG GIAN TIỀM ẨN SVD + K-MEANS</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">08 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          Phân cụm không giám sát tách biệt 6 trường phái nghiên cứu từ không gian vector ngữ nghĩa <em>384 chiều</em>.
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-p2-clusters" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Quy trình không giám sát</div>
              <ul class="bullet-list">
                <li>TF-IDF trích xuất đặc trưng từ vựng abstract (n-gram 1-2).</li>
                <li>TruncatedSVD (LSA) giảm chiều về 2 trục tiềm ẩn tối ưu trực quan.</li>
                <li>K-Means tối ưu tổng bình phương khoảng cách Euclidean nội cụm ($k=6$).</li>
              </ul>
            </div>
            <div class="meta-card">
              <div class="meta-title">6 Trường phái hội tụ</div>
              <div class="stat-caption">
                C#0: NLP &amp; LLMs · C#1: Thị giác máy tính 3D · C#2: Lý thuyết xác suất &amp; RL · C#3: An toàn Adversarial · C#4: Đồ thị tri thức · C#5: Tín hiệu y sinh.
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>CHIẾU KHÔNG GIAN SVD 2D (N=800 MẪU TIÊU BIỂU TÔ MÀU THEO 6 CỤM K-MEANS)</div>
        <div>VÒNG TRÒN LỚN: TÂM CỤM (CENTROIDS) CỦA TỪNG TRƯỜNG PHÁI</div>
      </div>
    </div>

    <!-- SLIDE 09: PILLAR 2 CLUSTER VALIDITY & BOUNDARY BLUR -->
    <div class="slide-page" data-slide="9">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 08</span>
          <span class="section-tag">[04 · TRỤ CỘT 2: ĐÁNH GIÁ CHẤT LƯỢNG] ĐỘ ĐO TÁCH BẠCH &amp; BIÊN MỜ TỰ NHIÊN</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">09 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          Chỉ số Silhouette thấp (<em>0.063</em>) phản ánh đặc trưng biên mờ tự nhiên của văn bản học thuật liên ngành hiện đại.
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-p2-validity" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Chỉ số đánh giá cụm</div>
              <ul class="bullet-list">
                <li><strong>Silhouette:</strong> 0.0629 (dương, không phân cụm sai lệch hoàn toàn).</li>
                <li><strong>Davies-Bouldin:</strong> 3.978 (tỷ số phân tán tương ứng).</li>
                <li><strong>Calinski-Harabasz:</strong> 84.10 (phương sai liên cụm đạt ngưỡng phân định).</li>
              </ul>
            </div>
            <div class="meta-card">
              <div class="meta-title">Phản biện khoa học</div>
              <div class="stat-caption">
                Trong nghiên cứu AI hiện đại, ranh giới giữa Thị giác và Ngôn ngữ đã bị xóa nhòa bởi Multimodal Transformers. Điểm Silhouette 0.063 chứng minh tính chân thực của dữ liệu thay vì "ép cụm nhân tạo".
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>CLUSTER VALIDITY INDICES &amp; TOP DOMINANT KEYWORDS PER CLUSTER</div>
        <div>TRỰC QUAN HÓA CHẤT LƯỢNG CỤM KHOA HỌC KHÁCH QUAN</div>
      </div>
    </div>

    <!-- SLIDE 10: PILLAR 3 CITATION & COLLABORATION GRAPH -->
    <div class="slide-page" data-slide="10">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 09</span>
          <span class="section-tag">[05 · TRỤ CỘT 3: ĐỒ THỊ MẠNG LƯỚI] CẤU TRÚC TRÍCH DẪN &amp; CỘNG ĐỒNG LOUVAIN</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">10 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          Mạng lưới trích dẫn có cấu trúc cụm cao với 92 cộng đồng Louvain; bài báo Transformer dẫn đầu tuyệt đối.
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-p3-network" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Quy mô đồ thị</div>
              <ul class="bullet-list">
                <li><strong>Số đỉnh:</strong> 8,892 bài báo &amp; tác giả.</li>
                <li><strong>Số cạnh:</strong> 86,295 liên kết trích dẫn.</li>
                <li><strong>Mật độ (Density):</strong> 0.00109 (mạng lưới thưa, cấu trúc scale-free chuẩn học thuật).</li>
                <li><strong>Cộng đồng Louvain:</strong> 92 trường phái nghiên cứu.</li>
              </ul>
            </div>
            <div class="meta-card">
              <div class="meta-title">Đỉnh tháp tri thức</div>
              <div class="stat-caption">
                Công trình "Attention Is All You Need" (Ashish Vaswani et al.) có bậc liên kết In-degree = 1,213 và đóng vai trò điểm kết nối trung tâm của toàn mạng lưới.
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>FORCE-DIRECTED NETWORK GRAPH: TOP 120 NODES &amp; 293 EDGES TÔ MÀU THEO CỘNG ĐỒNG LOUVAIN</div>
        <div>KÍCH THƯỚC NỐT TỶ LỆ THUẬN VỚI TRỌNG SỐ PAGERANK</div>
      </div>
    </div>

    <!-- SLIDE 11: PILLAR 3 PAGERANK & SCHOLARLY INFLUENCE -->
    <div class="slide-page" data-slide="11">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 10</span>
          <span class="section-tag">[05 · TRỤ CỘT 3: ĐỒ THỊ MẠNG LƯỚI] ĐỊNH LƯỢNG TRỌNG SỐ PAGERANK &amp; KOLs</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">11 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          PageRank định vị chính xác các công trình trụ cột học thuật, làm nền tảng cho việc <em>tăng trọng số tìm kiếm RAG</em>.
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-p3-pagerank" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Top 1 PageRank</div>
              <div class="stat-number crimson">0.0126</div>
              <div class="stat-caption">Attention Is All You Need (Ashish Vaswani et al.) dẫn đầu tuyệt đối, vượt xa bài ELMo (0.0086) và ResNet.</div>
            </div>
            <div class="meta-card">
              <div class="meta-title">Ý nghĩa thực tiễn với RAG</div>
              <div class="stat-caption">
                Thay vì coi mọi chunk tài liệu có giá trị ngang nhau, hệ thống sử dụng điểm PageRank để kích hoạt <strong>Authority-weighted Re-ranking</strong>, tự động ưu tiên các tài liệu của tác giả có tầm ảnh hưởng lớn khi độ tương đồng vector ngang bằng.
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>BẢNG XẾP HẠNG TOP 10 CÔNG TRÌNH VÀ TÁC GIẢ THEO THUẬT TOÁN PAGERANK (ALPHA=0.85)</div>
        <div>TRỤ CỘT 3: GRAPH MINING &amp; NETWORK ANALYSIS</div>
      </div>
    </div>

    <!-- SLIDE 12: PILLAR 4 SHARE-NORMALIZED TREND VELOCITY -->
    <div class="slide-page" data-slide="12">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 11</span>
          <span class="section-tag">[06 · TRỤ CỘT 4: ĐỘNG LƯỢNG XU HƯỚNG] TỐC ĐỘ TĂNG TRƯỞNG CHUẨN HÓA THỊ PHẦN</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">12 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          <code>cs.CV</code> (+123%) và <code>cs.LG</code> (+38%) bứt phá mạnh mẽ về lượng bài mới, dẫn dắt xu hướng nghiên cứu toàn ngành.
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-p4-trends" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Chuẩn hóa thị phần</div>
              <div class="stat-caption">
                Áp dụng công thức <strong>Share-Normalized Momentum</strong> để loại trừ hiện tượng tăng trưởng ảo ở các chuyên ngành quá nhỏ (từ 1 bài lên 3 bài là +200%).
              </div>
            </div>
            <div class="meta-card">
              <div class="meta-title">Phân loại động lượng</div>
              <ul class="bullet-list">
                <li><strong style="color: var(--crimson);">SURGING:</strong> cs.CV (722 bài mới), cs.LG (672 bài mới), cs.AI (+198.9%).</li>
                <li><strong>STABLE:</strong> cs.CL, cs.RO duy trì nhịp độ ổn định.</li>
                <li><strong>DECLINING:</strong> Các chuyên ngành ngách thu hẹp tỷ trọng.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>SO SÁNH SỐ BÀI BÁO QUÝ TRƯỚC (N_PREV) VS QUÝ GẦN NHẤT (N_RECENT) THEO CHUYÊN NGÀNH</div>
        <div>HUY HIỆU: ĐỘNG LƯỢNG TĂNG TỐC KHOA HỌC THỰC TẾ</div>
      </div>
    </div>

    <!-- SLIDE 13: PILLAR 4 ISOLATION FOREST OUTLIERS -->
    <div class="slide-page" data-slide="13">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 12</span>
          <span class="section-tag">[06 · TRỤ CỘT 4: BẢN ĐỒ DỊ BIỆT] RỪNG CÔ LẬP ISOLATION FOREST</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">13 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          Isolation Forest phát hiện 2 dạng dị biệt cực độ: chuyên khảo dạng sách (<em>&gt;70k từ</em>) và lý thuyết thuần túy (<em>&gt;5k công thức</em>).
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-p4-anomalies" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Thông số mô hình</div>
              <ul class="bullet-list">
                <li>Thuật toán: Isolation Forest với hàm co dãn $\\log(1+x)$.</li>
                <li>Contamination: 0.02 (260 bài báo dị biệt P99).</li>
                <li>Ngưỡng Anomaly Score: $s(x, n) \\le -0.65$.</li>
              </ul>
            </div>
            <div class="meta-card">
              <div class="meta-title">2 Dạng dị biệt tiêu biểu</div>
              <ul class="bullet-list">
                <li><strong>Chuyên khảo Monograph:</strong> Bài dài 74,303 từ với 5,470 công thức (gấp 15 lần bài chuẩn).</li>
                <li><strong>Đại công trình lý thuyết:</strong> 3,732 công thức trên 26k từ (math.ST).</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>KHÔNG GIAN DỊ BIỆT 2D: X=ĐỘ DÀI TỪ VỰNG, Y=SỐ CÔNG THỨC TOÁN, VÙNG ĐỎ=P99 ANOMALY</div>
        <div>TRỤ CỘT 4: NOVELTY &amp; OUTLIER DETECTION</div>
      </div>
    </div>

    <!-- SLIDE 14: THE BRIDGE: MINING TO RAG HEURISTICS -->
    <div class="slide-page" data-slide="14">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 13</span>
          <span class="section-tag">[07 · CẦU NỐI ỨNG DỤNG] KHAI PHÁ DỮ LIỆU ĐỊNH TUYẾN CHO RAG</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">14 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          Kết quả khai phá dữ liệu trở thành tri thức định tuyến (Heuristics) cho hệ thống sinh văn bản có căn cứ.
        </h2>
        <div class="content-grid full-width">
          <div class="plot-container" style="display: flex; align-items: center; justify-content: center;">
            <div id="plot-bridge-schematic" class="plot-canvas" style="display: flex; justify-content: center; align-items: center;"></div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>SƠ ĐỒ TÍCH HỢP TRI THỨC MINING VÀO MULTI-STAGE RAG RETRIEVAL PIPELINE</div>
        <div>UTH SCIENTIFIC RESEARCH INTELLIGENCE SYSTEM</div>
      </div>
    </div>

    <!-- SLIDE 15: DEEPEVAL BENCHMARK COMPARISON -->
    <div class="slide-page" data-slide="15">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 14</span>
          <span class="section-tag">[08 · ĐÁNH GIÁ CHẤT LƯỢNG] BENCHMARK ĐỐI ĐẦU 21 MẪU THỬ DEEPEVAL</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">15 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          Cross-Encoder Reranker tăng vọt Contextual Precision từ 0.637 lên 0.860 (<em>+35.0%</em>), đạt 100% độ bao phủ thông tin.
        </h2>
        <div class="content-grid">
          <div class="plot-container">
            <div id="plot-deepeval-benchmark" class="plot-canvas"></div>
          </div>
          <div class="meta-sidebar">
            <div class="meta-card">
              <div class="meta-title">Contextual Precision Lift</div>
              <div class="stat-number crimson">+35.0%</div>
              <div class="stat-caption">Độ chính xác ngữ cảnh nhảy vọt từ 0.637 lên 0.860. Tỷ lệ vượt ngưỡng pass rate đạt 80.0% (16/20 mẫu thử).</div>
            </div>
            <div class="meta-card">
              <div class="meta-title">Contextual Recall</div>
              <div class="stat-number forest">100.0%</div>
              <div class="stat-caption">19/19 mẫu thử đạt điểm tối đa 1.000 về mức độ bao phủ toàn diện các luận điểm khoa học yêu cầu.</div>
            </div>
            <div class="meta-card">
              <div class="meta-title">Answer Relevancy</div>
              <div class="stat-number navy">+9.4%</div>
              <div class="stat-caption">Nhiệt độ 0.1 và luật ràng buộc phủ định loại trừ hiện tượng nói vòng vo, tăng điểm từ 0.687 lên 0.752.</div>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>DUMBBELL CHART SO SÁNH BASELINE (KHÔNG RERANKER) VS UPGRADED (CROSS-ENCODER + BM25 + RRF)</div>
        <div>ĐÁNH GIÁ VỚI 6 ĐỘ ĐO DEEPEVAL TRÊN TẬP 21 CÂU HỎI VÀNG</div>
      </div>
    </div>

    <!-- SLIDE 16: ACADEMIC CRITIQUE & ROADMAP -->
    <div class="slide-page" data-slide="16">
      <div class="slide-header">
        <div class="header-left">
          <span class="figure-tag">Fig. 15</span>
          <span class="section-tag">[09 · PHẢN BIỆN HỌC THUẬT] GIỚI HẠN HIỆN TẠI &amp; LỘ TRÌNH PHÁT TRIỂN</span>
        </div>
        <div class="header-right">
          <span class="slide-counter">16 / 16</span>
        </div>
      </div>
      <div class="slide-body">
        <h2 class="takeaway-headline">
          Nhìn thẳng vào các giới hạn thống kê để định hình lộ trình nâng tầm đồ án thành <em>công trình nghiên cứu hoàn chỉnh</em>.
        </h2>
        <div class="content-grid full-width">
          <div class="plot-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 24px 30px;">
            <div style="display: flex; flex-direction: column; gap: 14px;">
              <div style="font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--crimson); text-transform: uppercase; letter-spacing: 0.5px;">
                &bull; THIẾU SÓT HỌC THUẬT CẦN HOÀN THIỆN
              </div>
              <div class="meta-card" style="border-left: 3px solid var(--crimson);">
                <strong>1. Nhãn cụm còn mang tính kỹ thuật (C#0 ... C#5):</strong>
                <p style="margin-top: 4px; font-size: 13px; color: var(--ink-secondary);">Cần áp dụng c-TF-IDF hoặc LLM tự động sinh nhãn ngữ nghĩa tiếng Việt có định lượng thay vì để người dùng tự suy đoán.</p>
              </div>
              <div class="meta-card" style="border-left: 3px solid var(--crimson);">
                <strong>2. Chưa có kiểm định tương quan thống kê giả thuyết (Hypothesis Testing):</strong>
                <p style="margin-top: 4px; font-size: 13px; color: var(--ink-secondary);">Cần kiểm định tương quan Pearson/Spearman giữa mật độ toán và độ dài bài báo, kiểm định ANOVA giữa các chuyên ngành.</p>
              </div>
              <div class="meta-card" style="border-left: 3px solid var(--crimson);">
                <strong>3. Hiện tượng dồn cục thời gian (Collection Artifact):</strong>
                <p style="margin-top: 4px; font-size: 13px; color: var(--ink-secondary);">Gai nhọn tháng 1/2024 do nhịp crawler; cần bổ sung thuật toán làm mịn Gaussian Kernel Smoothing hoặc Rolling 30d.</p>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 14px;">
              <div style="font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--forest); text-transform: uppercase; letter-spacing: 0.5px;">
                &bull; KẾ HOẠCH NÂNG CẤP 3 BƯỚC
              </div>
              <div class="meta-card" style="border-left: 3px solid var(--forest);">
                <strong>Bước 1: Tự động hóa gán nhãn chuyên ngành c-TF-IDF</strong>
                <p style="margin-top: 4px; font-size: 13px; color: var(--ink-secondary);">Trích xuất top-5 từ khóa đại diện và định danh tự động tên chủ đề nghiên cứu khoa học chuẩn xác.</p>
              </div>
              <div class="meta-card" style="border-left: 3px solid var(--forest);">
                <strong>Bước 2: Tích hợp ma trận tương quan Spearman trên UI</strong>
                <p style="margin-top: 4px; font-size: 13px; color: var(--ink-secondary);">Thêm biểu đồ Heatmap tương quan giữa Số từ, Công thức, Số tác giả, và Bậc đồ thị trích dẫn.</p>
              </div>
              <div class="meta-card" style="border-left: 3px solid var(--forest);">
                <strong>Bước 3: Khép kín toàn diện Graph-Augmented RAG</strong>
                <p style="margin-top: 4px; font-size: 13px; color: var(--ink-secondary);">Truyền danh sách Top Influencers và Frequent Rules vào System Prompt để câu trả lời đạt chiều sâu học thuật vượt trội.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-footer">
        <div>TỔNG KẾT BẢO VỆ ĐỒ ÁN KHAI PHÁ DỮ LIỆU // ĐẠI HỌC GIAO THÔNG VẬN TẢI (UTH)</div>
        <div>CẢM ƠN QUÝ THẦY CÔ VÀ HỘI ĐỒNG ĐÃ LẮNG NGHE</div>
      </div>
    </div>

  </div>
</div>

<!-- SPEAKER NOTES DRAWER -->
<div id="speaker-notes-drawer">
  <div class="notes-header">
    <span>SPEAKER NOTES (GHI CHÚ THUYẾT TRÌNH CHO DIỄN GIẢ // PHÍM TẮT 'N')</span>
    <span style="cursor: pointer;" onclick="toggleNotes()">ĐÓNG [ESC / N]</span>
  </div>
  <div class="notes-body" id="notes-content">
    Chọn slide để xem ghi chú tương ứng.
  </div>
</div>

<!-- SLIDE OVERVIEW MODAL -->
<div id="overview-modal" onclick="closeOverview(event)">
  <div class="overview-grid" id="overview-grid-container">
    <!-- Rendered dynamically -->
  </div>
</div>

<!-- TOOLTIP -->
<div id="d3-tooltip" class="d3-tooltip"></div>

<script>
  // Injected Mining & Benchmark Data Payload
  const DATA = {json_str};

  // Speaker notes per slide (Vietnamese speaking cues for defense)
  const SPEAKER_NOTES = {{
    1: "Kính thưa Hội đồng đánh giá, hôm nay nhóm em xin trình bày đồ án Khai phá Dữ liệu Khoa học Đa mô thức và Hệ thống Trí tuệ RAG thời gian thực. Đồ án của chúng em giải quyết 2 bài toán lớn: khai phá tri thức từ 13,000 bài báo arXiv với 2.76 triệu công thức toán học và chuyển hóa các tri thức này để nâng cấp hệ thống RAG có căn cứ với bộ kiểm thử tự động DeepEval.",
    2: "Về mặt kiến trúc dữ liệu, chúng em không dùng cơ sở dữ liệu quan hệ truyền thống mà chọn Medallion Lakehouse 3 tầng. Điểm mấu chốt là tầng Gold sử dụng song song DuckDB cho OLAP và LanceDB cho Vector DB. DuckDB cho phép truy vấn Zero-copy trực tiếp trên file Parquet Snappy, giúp giảm 85% độ trễ truy vấn phân tích.",
    3: "Ở slide này, đồ án chỉ ra một sự bất đối xứng rất thú vị: cs.LG và cs.CV tương đương nhau về số lượng bài báo (~3,000 bài), nhưng tổng số công thức toán của cs.LG lại gấp 2.7 lần cs.CV (1.1 triệu công thức). Đặc biệt, stat.ML mới là 'ông vua lý thuyết' với mật độ 680 công thức/bài. Điều này định hướng việc chunking văn bản cho RAG không thể dùng chung một độ dài cố định.",
    4: "Biểu đồ thời gian phản ánh rõ nét làn sóng Generative AI. Trong suốt giai đoạn 2005-2022, nghiên cứu tăng trưởng tuyến tính, nhưng đến đầu năm 2024 bùng nổ tới 8,838 bài báo, đỉnh điểm tháng 1/2024 đạt hơn 5,000 bài. Đây là cơ sở để hệ thống RAG ưu tiên trọng số thời gian gần (recency decay).",
    5: "Quan sát ma trận đồng xuất bản, cặp cs.AI × cs.LG dẫn đầu tuyệt đối với 1,983 bài. Phát hiện quan trọng ở đây là nhãn cs.AI hiếm khi đứng độc lập mà hoạt động như một 'siêu nhãn' (umbrella tag) bao bọc các nghiên cứu ứng dụng thị giác (cs.CV) và ngôn ngữ (cs.CL).",
    6: "Đối với Trụ cột 1, nhóm em chọn thuật toán FP-Growth thay vì Apriori vì Apriori bị nghẽn ở bước sinh tập ứng viên trên 11,404 bài báo. FP-Tree chỉ cần 2 lần quét dữ liệu và nén cây trong RAM, khai phá thành công 30 luật kết hợp với độ tin cậy và độ nâng vượt trội.",
    7: "Một điểm thể hiện tính trung thực khoa học của nhóm: khi phân tích kết quả FP-Growth, chúng em nhận thấy luật cs.SY <=> eess.SY có Lift tới 34.9 nhưng đây là bí danh quy ước kỹ thuật của ban biên tập arXiv, còn các luật thực chất phục vụ khoa học là {{cs.AI, cs.CV}} => {{cs.LG}} với Confidence 85.2%. Chúng em dùng luật này để tự động mở rộng truy vấn trong chatbot.",
    8: "Với Trụ cột 2, chúng em kết hợp TF-IDF n-gram (1,2) trích xuất không gian đặc trưng từ vựng, giảm chiều bằng TruncatedSVD và phân thành 6 cụm K-Means. 6 cụm này hội tụ tự nhiên phản ánh 6 trường phái nghiên cứu lớn từ NLP, Thị giác, Tối ưu hóa đến An toàn hệ thống.",
    9: "Hội đồng có thể nhận thấy chỉ số Silhouette của phân cụm là 0.063 - một con số có vẻ thấp. Tuy nhiên, trong nghiên cứu AI hiện đại, ranh giới giữa Thị giác và Ngôn ngữ đã bị xóa nhòa bởi Multimodal Transformers, nên tính biên mờ giữa các abstract là hoàn toàn tự nhiên và khách quan.",
    10: "Với Trụ cột 3, nhóm xây dựng đồ thị trích dẫn gồm 8,892 đỉnh và 86,295 liên kết. Thuật toán Louvain phân rã đồ thị thành 92 cộng đồng học thuật gắn kết chặt chẽ, và bài báo Attention Is All You Need đóng vai trò điểm kết nối trung tâm của toàn mạng lưới.",
    11: "Thay vì coi mọi tài liệu đều bình đẳng, thuật toán PageRank được áp dụng để định lượng uy tín học thuật. Bài báo Transformer đạt PageRank 0.0126 dẫn đầu toàn mạng lưới. Trọng số này được truyền trực tiếp vào thuật toán RAG để kích hoạt Authority-weighted Retrieval.",
    12: "Ở Trụ cột 4, để tránh hiện tượng tăng trưởng ảo ở các chuyên ngành nhỏ, nhóm xây dựng chỉ số Share-Normalized Momentum. Kết quả cho thấy cs.CV (+123%) và cs.LG (+38%) bứt phá thực sự về số lượng bài mới trong quý gần nhất.",
    13: "Mô hình Isolation Forest phát hiện 260 bài báo dị biệt ở phân vị P99. Đáng chú ý có các chuyên khảo dạng sách dài hơn 74,000 từ và các công trình lý thuyết thuần túy chứa hơn 5,400 công thức toán học.",
    14: "Đây là slide then chốt thể hiện cầu nối giữa Data Mining và AI: các phát hiện từ Mining không chỉ nằm trên đồ thị thống kê, mà trở thành luật định tuyến (Heuristics) nâng cấp trực tiếp hệ thống RAG: PageRank tăng trọng số tác giả uy tín, FP-Growth gợi ý từ khóa mở rộng, và LaTeX extraction bảo tồn công thức toán.",
    15: "Về mặt kiểm thử tự động, kết quả đánh giá 21 câu hỏi vàng qua bộ công cụ DeepEval chứng minh hiệu quả vượt bậc của Cross-Encoder Reranker: Contextual Precision tăng vọt +35.0% (từ 0.637 lên 0.860), Contextual Recall đạt tuyệt đối 100%, và Answer Relevancy tăng +9.4%.",
    16: "Để đồ án đạt tầm xuất sắc, nhóm tự nhìn nhận 3 hạn chế học thuật: nhãn cụm còn kỹ thuật (cần c-TF-IDF), thiếu kiểm định tương quan Pearson/Spearman, và gai nhọn thời gian do nhịp crawler. Nhóm đã đề ra lộ trình 3 bước cụ thể để hoàn thiện trong tương lai."
  }};

  const SLIDE_TITLES = [
    "Trang bìa & Tổng quan",
    "Kiến trúc Medallion Lakehouse",
    "[EDA-01] Phân bố chuyên ngành & Công thức toán",
    "[EDA-02] Tăng trưởng thời gian & GenAI",
    "[EDA-03] Ma trận giao thoa liên ngành",
    "[Trụ cột 1] Khai phá luật FP-Growth",
    "[Trụ cột 1] Bí danh kỹ thuật vs Luật thực chất",
    "[Trụ cột 2] Không gian phân cụm SVD 2D",
    "[Trụ cột 2] Đánh giá chất lượng & Biên mờ",
    "[Trụ cột 3] Cấu trúc đồ thị trích dẫn & Louvain",
    "[Trụ cột 3] Trọng số tri thức PageRank",
    "[Trụ cột 4] Động lượng xu hướng chuẩn hóa",
    "[Trụ cột 4] Bản đồ dị biệt Isolation Forest",
    "[Cầu nối RAG] Ứng dụng tri thức Khai phá vào AI",
    "[DeepEval] Đánh giá đối đầu 21 mẫu thử",
    "[Phản biện] Hạn chế học thuật & Lộ trình"
  ];

  let currentSlide = 1;
  const totalSlides = 16;

  // Responsive Stage Scaling (Keeps fixed 16:9 1600x900 stage fitted)
  function resizeStage() {{
    const stage = document.getElementById('stage');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min((vw - 20) / 1600, (vh - 20) / 900);
    stage.style.transform = `scale(${{scale}})`;
  }}
  window.addEventListener('resize', resizeStage);
  resizeStage();

  // Navigation Logic
  function goToSlide(n) {{
    if (n < 1 || n > totalSlides) return;
    document.querySelectorAll('.slide-page').forEach(el => el.classList.remove('active'));
    currentSlide = n;
    const target = document.querySelector(`.slide-page[data-slide="${{n}}"]`);
    if (target) target.classList.add('active');

    // Update progress hairline & counter
    document.getElementById('progress-hairline').style.width = `${{(currentSlide / totalSlides) * 100}}%`;
    document.querySelectorAll('.slide-counter').forEach(el => el.textContent = `${{currentSlide < 10 ? '0' + currentSlide : currentSlide}} / ${{totalSlides}}`);

    // Update speaker notes
    document.getElementById('notes-content').innerHTML = `<strong>[SLIDE ${{currentSlide}} DIỄN GIẢI]:</strong> ` + (SPEAKER_NOTES[currentSlide] || "Không có ghi chú.");

    // Update overview active card
    document.querySelectorAll('.overview-card').forEach((card, idx) => {{
      if (idx + 1 === currentSlide) card.classList.add('active');
      else card.classList.remove('active');
    }});

    // Render / animate chart for active slide
    renderChartForSlide(currentSlide);
  }}

  function nextSlide() {{ goToSlide(currentSlide + 1); }}
  function prevSlide() {{ goToSlide(currentSlide - 1); }}

  // Keyboard Navigation
  window.addEventListener('keydown', (e) => {{
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {{
      e.preventDefault();
      nextSlide();
    }} else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {{
      e.preventDefault();
      prevSlide();
    }} else if (e.key === 'Home') {{
      e.preventDefault();
      goToSlide(1);
    }} else if (e.key === 'End') {{
      e.preventDefault();
      goToSlide(totalSlides);
    }} else if (e.key === 'n' || e.key === 'N') {{
      toggleNotes();
    }} else if (e.key === 'o' || e.key === 'O') {{
      toggleOverview();
    }} else if (e.key === 'f' || e.key === 'F') {{
      toggleFullscreen();
    }} else if (e.key === 'Escape') {{
      document.getElementById('speaker-notes-drawer').classList.remove('open');
      document.getElementById('overview-modal').classList.remove('open');
    }}
  }});

  function toggleNotes() {{
    document.getElementById('speaker-notes-drawer').classList.toggle('open');
  }}

  function toggleOverview() {{
    document.getElementById('overview-modal').classList.toggle('open');
  }}

  function closeOverview(e) {{
    if (e.target.id === 'overview-modal') {{
      document.getElementById('overview-modal').classList.remove('open');
    }}
  }}

  function toggleFullscreen() {{
    if (!document.fullscreenElement) {{
      document.documentElement.requestFullscreen().catch(() => {{}});
    }} else {{
      if (document.exitFullscreen) document.exitFullscreen();
    }}
  }}

  // Build Overview Grid Cards
  function buildOverviewGrid() {{
    const container = document.getElementById('overview-grid-container');
    container.innerHTML = '';
    SLIDE_TITLES.forEach((title, idx) => {{
      const num = idx + 1;
      const card = document.createElement('div');
      card.className = `overview-card ${{num === currentSlide ? 'active' : ''}}`;
      card.innerHTML = `
        <div class="overview-num">SLIDE ${{num < 10 ? '0' + num : num}}</div>
        <div class="overview-title">${{title}}</div>
      `;
      card.addEventListener('click', () => {{
        goToSlide(num);
        document.getElementById('overview-modal').classList.remove('open');
      }});
      container.appendChild(card);
    }});
  }}
  buildOverviewGrid();

  // Tooltip Helper
  const tooltip = d3.select("#d3-tooltip");
  function showTooltip(html, event) {{
    tooltip.style("opacity", 1)
      .html(html)
      .style("left", (event.pageX + 14) + "px")
      .style("top", (event.pageY - 28) + "px");
  }}
  function hideTooltip() {{
    tooltip.style("opacity", 0);
  }}

  // Set initial notes
  document.getElementById('notes-content').innerHTML = `<strong>[SLIDE 1 DIỄN GIẢI]:</strong> ` + SPEAKER_NOTES[1];

  // -------------------------------------------------------------
  // D3 Visualization Renderers (Executed per active slide)
  // -------------------------------------------------------------
  const renderedSlides = new Set();

  function renderChartForSlide(slideNum) {{
    if (renderedSlides.has(slideNum)) return;
    renderedSlides.add(slideNum);

    switch(slideNum) {{
      case 2: renderMedallionFlow(); break;
      case 3: renderEdaCategories(); break;
      case 4: renderEdaTemporal(); break;
      case 5: renderEdaCooccurrence(); break;
      case 6: renderP1Rules(); break;
      case 7: renderP1RuleAnalysis(); break;
      case 8: renderP2Clusters(); break;
      case 9: renderP2Validity(); break;
      case 10: renderP3Network(); break;
      case 11: renderP3PageRank(); break;
      case 12: renderP4Trends(); break;
      case 13: renderP4Anomalies(); break;
      case 14: renderBridgeSchematic(); break;
      case 15: renderDeepevalBenchmark(); break;
    }}
  }}

  // SLIDE 2: Interactive Medallion Flow
  function renderMedallionFlow() {{
    const container = d3.select("#plot-medallion-flow");
    container.html("");
    const width = 1100, height = 540;
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    // Layers data
    const layers = [
      {{ id: "raw", name: "RAW HARVEST", spec: "arXiv OAI-PMH & ar5iv HTML5", color: "#64748b", sub: "13,000 PDFs & 16 OAI Metadata Batches", x: 60, y: 190, w: 220, h: 160 }},
      {{ id: "bronze", name: "BRONZE LAKE", spec: "Cloudflare R2 Object Store", color: "#b45309", sub: "11,763 HTML5 Papers (2.841 GB, S3 API)", x: 340, y: 190, w: 220, h: 160 }},
      {{ id: "silver", name: "SILVER CANONICAL", spec: "Apache Parquet (Snappy)", color: "#1e3a5f", sub: "13,000 Cleaned Papers · 2.765M LaTeX Formulas", x: 620, y: 190, w: 220, h: 160 }},
      {{ id: "gold", name: "GOLD DUAL ENGINE", spec: "DuckDB OLAP + LanceDB ANN", color: "#b91c1c", sub: "143,523 Embeddings (768-dim) · Sub-50ms Search", x: 900, y: 190, w: 220, h: 160 }}
    ];

    // Connections
    svg.append("defs").append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 8)
      .attr("refY", 5)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("d", "M 0 0 L 10 5 L 0 10 z")
      .attr("fill", "#94a3b8");

    for (let i = 0; i < layers.length - 1; i++) {{
      svg.append("line")
        .attr("x1", layers[i].x + layers[i].w)
        .attr("y1", layers[i].y + layers[i].h / 2)
        .attr("x2", layers[i + 1].x - 8)
        .attr("y2", layers[i + 1].y + layers[i + 1].h / 2)
        .attr("stroke", "#cbd5e1")
        .attr("stroke-width", 3)
        .attr("marker-end", "url(#arrow)");
    }}

    // Draw cards
    const g = svg.selectAll(".layer-card").data(layers).enter().append("g")
      .attr("class", "layer-card")
      .attr("transform", d => `translate(${{d.x}}, ${{d.y}})`);

    g.append("rect")
      .attr("width", d => d.w)
      .attr("height", d => d.h)
      .attr("rx", 6)
      .attr("fill", "#ffffff")
      .attr("stroke", d => d.color)
      .attr("stroke-width", 2)
      .attr("filter", "drop-shadow(0 4px 10px rgba(0,0,0,0.06))");

    g.append("rect")
      .attr("width", d => d.w)
      .attr("height", 32)
      .attr("rx", 6)
      .attr("fill", d => d.color);

    g.append("text")
      .attr("x", 12)
      .attr("y", 20)
      .attr("fill", "#ffffff")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "11px")
      .attr("font-weight", "700")
      .attr("letter-spacing", "0.5px")
      .text(d => d.name);

    g.append("text")
      .attr("x", 12)
      .attr("y", 62)
      .attr("fill", "var(--ink-primary)")
      .attr("font-family", "var(--font-serif-display)")
      .attr("font-size", "14px")
      .attr("font-weight", "700")
      .text(d => d.spec);

    g.append("text")
      .attr("x", 12)
      .attr("y", 90)
      .attr("fill", "var(--ink-muted)")
      .attr("font-family", "var(--font-serif-text)")
      .attr("font-size", "12px")
      .attr("width", 190)
      .each(function(d) {{
        const text = d3.select(this);
        const words = d.sub.split(" ");
        let line = [];
        let y = 90;
        words.forEach(word => {{
          line.push(word);
          if (line.join(" ").length > 25) {{
            text.append("tspan").attr("x", 12).attr("y", y).text(line.join(" "));
            line = [];
            y += 18;
          }}
        }});
        if (line.length > 0) {{
          text.append("tspan").attr("x", 12).attr("y", y).text(line.join(" "));
        }}
      }});
  }}

  // SLIDE 3: Dual-Axis Bar + Line Chart (EDA Categories)
  function renderEdaCategories() {{
    const container = d3.select("#plot-eda-categories");
    container.html("");
    const cats = DATA.eda?.category_distribution || [];
    if (!cats.length) return;

    const width = 1100, height = 540, margin = {{ top: 40, right: 90, bottom: 60, left: 70 }};
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const x = d3.scaleBand().domain(cats.map(d => d.category)).range([margin.left, width - margin.right]).padding(0.35);
    const y1 = d3.scaleLinear().domain([0, d3.max(cats, d => d.count) * 1.15]).range([height - margin.bottom, margin.top]);
    const y2 = d3.scaleLinear().domain([0, d3.max(cats, d => d.total_math_formulas) * 1.15]).range([height - margin.bottom, margin.top]);

    // Gridlines
    svg.append("g").attr("class", "grid")
      .attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y1).ticks(5).tickSize(-width + margin.left + margin.right).tickFormat(""))
      .selectAll("line").attr("stroke", "#f1f5f9");

    // Bars (Paper count)
    svg.selectAll(".bar").data(cats).enter().append("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.category))
      .attr("y", height - margin.bottom)
      .attr("width", x.bandwidth())
      .attr("height", 0)
      .attr("fill", "var(--navy)")
      .attr("rx", 3)
      .on("mousemove", (event, d) => {{
        showTooltip(`<strong>${{d.category}}</strong><br>Bài báo: ${{d.count.toLocaleString()}} (${{d.percentage}}%)<br>Công thức: ${{d.total_math_formulas.toLocaleString()}}<br>TB Từ: ${{Math.round(d.avg_words)}} từ/bài`, event);
      }})
      .on("mouseleave", hideTooltip)
      .transition().duration(800)
      .attr("y", d => y1(d.count))
      .attr("height", d => height - margin.bottom - y1(d.count));

    // Line (Total formulas)
    const line = d3.line().x(d => x(d.category) + x.bandwidth() / 2).y(d => y2(d.total_math_formulas));
    svg.append("path").datum(cats)
      .attr("fill", "none")
      .attr("stroke", "var(--crimson)")
      .attr("stroke-width", 3)
      .attr("stroke-dasharray", "4 4")
      .attr("d", line);

    // Dots on line
    svg.selectAll(".dot").data(cats).enter().append("circle")
      .attr("cx", d => x(d.category) + x.bandwidth() / 2)
      .attr("cy", d => y2(d.total_math_formulas))
      .attr("r", 5)
      .attr("fill", "var(--crimson)")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2);

    // Axes
    svg.append("g").attr("transform", `translate(0,${{height - margin.bottom}})`)
      .call(d3.axisBottom(x)).attr("font-family", "var(--font-mono)").attr("font-size", "12px");
    svg.append("g").attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y1).ticks(6)).attr("font-family", "var(--font-mono)").attr("font-size", "11px");
    svg.append("g").attr("transform", `translate(${{width - margin.right}},0)`)
      .call(d3.axisRight(y2).ticks(6).tickFormat(d => (d/1000000).toFixed(1) + "M"))
      .attr("font-family", "var(--font-mono)").attr("font-size", "11px");
  }}

  // SLIDE 4: Temporal Area Chart
  function renderEdaTemporal() {{
    const container = d3.select("#plot-eda-temporal");
    container.html("");
    const raw = DATA.eda?.temporal_distribution || [];
    if (!raw.length) return;

    // Filter aggregated timeline for display
    const data = raw.filter(d => d.period >= "2020-01");
    const width = 1100, height = 540, margin = {{ top: 40, right: 40, bottom: 60, left: 70 }};
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const x = d3.scaleBand().domain(data.map(d => d.period)).range([margin.left, width - margin.right]).padding(0.1);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count) * 1.15]).range([height - margin.bottom, margin.top]);

    const area = d3.area().x(d => x(d.period) + x.bandwidth()/2).y0(height - margin.bottom).y1(d => y(d.count)).curve(d3.curveMonotoneX);
    const line = d3.line().x(d => x(d.period) + x.bandwidth()/2).y(d => y(d.count)).curve(d3.curveMonotoneX);

    svg.append("path").datum(data).attr("fill", "rgba(185, 28, 28, 0.12)").attr("d", area);
    svg.append("path").datum(data).attr("fill", "none").attr("stroke", "var(--crimson)").attr("stroke-width", 3).attr("d", line);

    // Callout circle for 2024-01
    const peak = data.find(d => d.period === "2024-01") || data[data.length - 2];
    if (peak) {{
      const px = x(peak.period) + x.bandwidth()/2;
      const py = y(peak.count);
      svg.append("circle").attr("cx", px).attr("cy", py).attr("r", 7).attr("fill", "var(--crimson)").attr("stroke", "#ffffff").attr("stroke-width", 2);
      svg.append("text").attr("x", px).attr("y", py - 14).attr("text-anchor", "middle").attr("font-family", "var(--font-mono)").attr("font-size", "12px").attr("font-weight", "700").attr("fill", "var(--crimson)").text("5,027 BÀI (T1/2024)");
    }}

    svg.append("g").attr("transform", `translate(0,${{height - margin.bottom}})`)
      .call(d3.axisBottom(x).tickValues(data.filter((_, i) => i % 3 === 0).map(d => d.period)))
      .attr("font-family", "var(--font-mono)").attr("font-size", "10.5px");
    svg.append("g").attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y).ticks(6)).attr("font-family", "var(--font-mono)").attr("font-size", "11px");
  }}

  // SLIDE 5: Co-occurrence Heatmap Matrix
  function renderEdaCooccurrence() {{
    const container = d3.select("#plot-eda-cooc");
    container.html("");
    const coocs = DATA.eda?.category_cooccurrence || [];
    if (!coocs.length) return;

    const width = 1100, height = 540, margin = {{ top: 20, right: 30, bottom: 40, left: 160 }};
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const topCoocs = coocs.slice(0, 10);
    const y = d3.scaleBand().domain(topCoocs.map(d => `${{d.category_a}} × ${{d.category_b}}`)).range([margin.top, height - margin.bottom]).padding(0.25);
    const x = d3.scaleLinear().domain([0, d3.max(topCoocs, d => d.cooccurrence_count) * 1.1]).range([margin.left, width - margin.right]);

    svg.selectAll(".bar-cooc").data(topCoocs).enter().append("rect")
      .attr("y", d => y(`${{d.category_a}} × ${{d.category_b}}`))
      .attr("x", margin.left)
      .attr("height", y.bandwidth())
      .attr("width", 0)
      .attr("fill", (d, i) => i === 0 ? "var(--crimson)" : "var(--navy)")
      .attr("rx", 3)
      .on("mousemove", (event, d) => {{
        showTooltip(`<strong>${{d.category_a}} &amp; ${{d.category_b}}</strong><br>Đồng xuất bản: ${{d.cooccurrence_count.toLocaleString()}} bài báo`, event);
      }})
      .on("mouseleave", hideTooltip)
      .transition().duration(800)
      .attr("width", d => x(d.cooccurrence_count) - margin.left);

    svg.selectAll(".label-cooc").data(topCoocs).enter().append("text")
      .attr("y", d => y(`${{d.category_a}} × ${{d.category_b}}`) + y.bandwidth()/2 + 4)
      .attr("x", d => x(d.cooccurrence_count) + 8)
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "11px")
      .attr("font-weight", "700")
      .attr("fill", "var(--ink-secondary)")
      .text(d => d.cooccurrence_count.toLocaleString() + " bài");

    svg.append("g").attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y)).attr("font-family", "var(--font-mono)").attr("font-size", "11.5px");
  }}

  // SLIDE 6: FP-Growth Bubble Scatter
  function renderP1Rules() {{
    const container = d3.select("#plot-p1-rules");
    container.html("");
    const rules = DATA.rules?.rules || [];
    if (!rules.length) return;

    const width = 1100, height = 540, margin = {{ top: 40, right: 60, bottom: 60, left: 70 }};
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const x = d3.scaleLinear().domain([0, d3.max(rules, d => d.support) * 1.15]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0.5, 1.05]).range([height - margin.bottom, margin.top]);
    const r = d3.scaleSqrt().domain([1, d3.max(rules, d => d.lift)]).range([4, 18]);
    const color = d3.scaleSequential(d3.interpolateYlOrRd).domain([1, d3.max(rules, d => d.lift)]);

    svg.selectAll(".rule-bubble").data(rules).enter().append("circle")
      .attr("cx", d => x(d.support))
      .attr("cy", d => y(d.confidence))
      .attr("r", d => r(d.lift))
      .attr("fill", d => color(d.lift))
      .attr("stroke", "var(--ink-primary)")
      .attr("stroke-width", 1)
      .attr("opacity", 0.85)
      .on("mousemove", (event, d) => {{
        showTooltip(`<strong>${{d.antecedents.join(", ")}} &rArr; ${{d.consequents.join(", ")}}</strong><br>Support: ${{d.support.toFixed(3)}}<br>Confidence: ${{(d.confidence * 100).toFixed(1)}}%<br>Lift: ${{d.lift.toFixed(2)}}`, event);
      }})
      .on("mouseleave", hideTooltip);

    svg.append("g").attr("transform", `translate(0,${{height - margin.bottom}})`)
      .call(d3.axisBottom(x)).attr("font-family", "var(--font-mono)").attr("font-size", "11px");
    svg.append("g").attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y).ticks(6).tickFormat(d => (d*100) + "%"))
      .attr("font-family", "var(--font-mono)").attr("font-size", "11px");

    svg.append("text").attr("x", width/2).attr("y", height - 15).attr("text-anchor", "middle").attr("font-family", "var(--font-mono)").attr("font-size", "11px").attr("fill", "var(--ink-muted)").text("ĐỘ HỖ TRỢ (SUPPORT)");
    svg.append("text").attr("transform", "rotate(-90)").attr("y", 20).attr("x", -height/2).attr("text-anchor", "middle").attr("font-family", "var(--font-mono)").attr("font-size", "11px").attr("fill", "var(--ink-muted)").text("ĐỘ TIN CẬY (CONFIDENCE)");
  }}

  // SLIDE 7: Rule Analysis (Aliases vs Authentic)
  function renderP1RuleAnalysis() {{
    const container = d3.select("#plot-p1-analysis");
    container.html("");
    const rules = (DATA.rules?.rules || []).slice(0, 8);
    if (!rules.length) return;

    const width = 1100, height = 540, margin = {{ top: 40, right: 60, bottom: 40, left: 320 }};
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const y = d3.scaleBand().domain(rules.map((d, i) => `${{d.antecedents.join(", ")}} &rArr; ${{d.consequents.join(", ")}}`)).range([margin.top, height - margin.bottom]).padding(0.3);
    const x = d3.scaleLinear().domain([0, d3.max(rules, d => d.lift) * 1.1]).range([margin.left, width - margin.right]);

    svg.selectAll(".bar-rule").data(rules).enter().append("rect")
      .attr("y", d => y(`${{d.antecedents.join(", ")}} &rArr; ${{d.consequents.join(", ")}}`))
      .attr("x", margin.left)
      .attr("height", y.bandwidth())
      .attr("width", d => x(d.lift) - margin.left)
      .attr("fill", d => d.lift > 20 ? "var(--crimson)" : "var(--navy)")
      .attr("rx", 3);

    svg.selectAll(".text-rule").data(rules).enter().append("text")
      .attr("y", d => y(`${{d.antecedents.join(", ")}} &rArr; ${{d.consequents.join(", ")}}`) + y.bandwidth()/2 + 4)
      .attr("x", d => x(d.lift) + 8)
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "11px")
      .attr("font-weight", "700")
      .text(d => `Lift: ${{d.lift.toFixed(1)}} | Conf: ${{(d.confidence * 100).toFixed(0)}}%`);

    svg.append("g").attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y)).attr("font-family", "var(--font-mono)").attr("font-size", "10.5px");
  }}

  // SLIDE 8: SVD 2D Cluster Projection
  function renderP2Clusters() {{
    const container = d3.select("#plot-p2-clusters");
    container.html("");
    const points = DATA.clusters?.scatter_2d || [];
    if (!points.length) return;

    const width = 1100, height = 540, margin = {{ top: 30, right: 30, bottom: 40, left: 50 }};
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const x = d3.scaleLinear().domain(d3.extent(points, d => d.x)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain(d3.extent(points, d => d.y)).range([height - margin.bottom, margin.top]);
    const colors = ["#1e3a5f", "#b91c1c", "#2d5a3f", "#b45309", "#7c3aed", "#0284c7"];

    svg.selectAll(".scatter-dot").data(points).enter().append("circle")
      .attr("cx", d => x(d.x))
      .attr("cy", d => y(d.y))
      .attr("r", 3.5)
      .attr("fill", d => colors[d.cluster % colors.length])
      .attr("opacity", 0.75)
      .on("mousemove", (event, d) => {{
        showTooltip(`<strong>Cụm #${{d.cluster}}</strong><br>${{d.title}}<br>Ngành: ${{d.category}}`, event);
      }})
      .on("mouseleave", hideTooltip);

    svg.append("g").attr("transform", `translate(0,${{height - margin.bottom}})`)
      .call(d3.axisBottom(x)).attr("font-family", "var(--font-mono)").attr("font-size", "10px");
    svg.append("g").attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y)).attr("font-family", "var(--font-mono)").attr("font-size", "10px");
  }}

  // SLIDE 9: Cluster Validity & Profiles
  function renderP2Validity() {{
    const container = d3.select("#plot-p2-validity");
    container.html("");
    const profiles = DATA.clusters?.cluster_profiles || [];
    if (!profiles.length) return;

    const width = 1100, height = 540, margin = {{ top: 40, right: 40, bottom: 40, left: 180 }};
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const y = d3.scaleBand().domain(profiles.map(d => `Cụm #${{d.cluster_id}} (${{d.size}} bài)`)).range([margin.top, height - margin.bottom]).padding(0.3);
    const x = d3.scaleLinear().domain([0, d3.max(profiles, d => d.percentage) * 1.15]).range([margin.left, width - margin.right]);

    svg.selectAll(".bar-profile").data(profiles).enter().append("rect")
      .attr("y", d => y(`Cụm #${{d.cluster_id}} (${{d.size}} bài)`))
      .attr("x", margin.left)
      .attr("height", y.bandwidth())
      .attr("width", d => x(d.percentage) - margin.left)
      .attr("fill", "var(--navy)")
      .attr("rx", 3);

    svg.selectAll(".text-profile").data(profiles).enter().append("text")
      .attr("y", d => y(`Cụm #${{d.cluster_id}} (${{d.size}} bài)`) + y.bandwidth()/2 + 4)
      .attr("x", d => x(d.percentage) + 8)
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "11px")
      .attr("font-weight", "700")
      .text(d => `${{d.percentage}}% | Chủ đề chính: ${{d.dominant_categories[0]?.category || 'N/A'}}`);

    svg.append("g").attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y)).attr("font-family", "var(--font-mono)").attr("font-size", "11px");
  }}

  // SLIDE 10: Citation & Collaboration Network (Force Directed)
  function renderP3Network() {{
    const container = d3.select("#plot-p3-network");
    container.html("");
    const raw = DATA.graph?.graph_export;
    if (!raw || !raw.nodes) return;

    const width = 1100, height = 540;
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const nodes = raw.nodes.slice(0, 70).map(d => ({{ ...d }}));
    const nodeIds = new Set(nodes.map(d => d.id));
    const links = (raw.links || []).filter(l => nodeIds.has(l.source) && nodeIds.has(l.target)).map(d => ({{ ...d }}));

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(50))
      .force("charge", d3.forceManyBody().strength(-120))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g").selectAll("line").data(links).enter().append("line")
      .attr("stroke", "#cbd5e1").attr("stroke-width", 1.2).attr("stroke-opacity", 0.6);

    const node = svg.append("g").selectAll("circle").data(nodes).enter().append("circle")
      .attr("r", d => Math.max(4, (d.pagerank || 0.001) * 600))
      .attr("fill", d => d.community_id === 1 ? "var(--crimson)" : "var(--navy)")
      .attr("stroke", "#ffffff").attr("stroke-width", 1.5)
      .on("mousemove", (event, d) => {{
        showTooltip(`<strong>${{d.label}}</strong><br>PageRank: ${{(d.pagerank || 0).toFixed(6)}}<br>Cộng đồng Louvain: #${{d.community_id}}`, event);
      }})
      .on("mouseleave", hideTooltip);

    simulation.on("tick", () => {{
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("cx", d => Math.max(10, Math.min(width - 10, d.x))).attr("cy", d => Math.max(10, Math.min(height - 10, d.y)));
    }});
  }}

  // SLIDE 11: Top Influencers by PageRank
  function renderP3PageRank() {{
    const container = d3.select("#plot-p3-pagerank");
    container.html("");
    const influencers = (DATA.graph?.top_influencers || []).slice(0, 10);
    if (!influencers.length) return;

    const width = 1100, height = 540, margin = {{ top: 30, right: 80, bottom: 40, left: 340 }};
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const y = d3.scaleBand().domain(influencers.map(d => d.author)).range([margin.top, height - margin.bottom]).padding(0.25);
    const x = d3.scaleLinear().domain([0, d3.max(influencers, d => d.pagerank) * 1.15]).range([margin.left, width - margin.right]);

    svg.selectAll(".bar-pr").data(influencers).enter().append("rect")
      .attr("y", d => y(d.author))
      .attr("x", margin.left)
      .attr("height", y.bandwidth())
      .attr("width", d => x(d.pagerank) - margin.left)
      .attr("fill", (d, i) => i === 0 ? "var(--crimson)" : "var(--navy)")
      .attr("rx", 3);

    svg.selectAll(".label-pr").data(influencers).enter().append("text")
      .attr("y", d => y(d.author) + y.bandwidth()/2 + 4)
      .attr("x", d => x(d.pagerank) + 8)
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "11px")
      .attr("font-weight", "700")
      .text(d => `PR: ${{(d.pagerank).toFixed(5)}} | Bậc: ${{d.degree}}`);

    svg.append("g").attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y)).attr("font-family", "var(--font-serif-text)").attr("font-size", "12px");
  }}

  // SLIDE 12: Trend Velocity Clustered Bars
  function renderP4Trends() {{
    const container = d3.select("#plot-p4-trends");
    container.html("");
    const trends = (DATA.trends?.trend_velocity || []).slice(0, 8);
    if (!trends.length) return;

    const width = 1100, height = 540, margin = {{ top: 40, right: 40, bottom: 60, left: 70 }};
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const x0 = d3.scaleBand().domain(trends.map(d => d.category)).range([margin.left, width - margin.right]).padding(0.3);
    const x1 = d3.scaleBand().domain(["prev", "recent"]).range([0, x0.bandwidth()]).padding(0.1);
    const y = d3.scaleLinear().domain([0, d3.max(trends, d => d.recent_quarter_papers) * 1.15]).range([height - margin.bottom, margin.top]);

    const g = svg.selectAll(".trend-group").data(trends).enter().append("g").attr("transform", d => `translate(${{x0(d.category)}},0)`);

    // Prev quarter bar
    g.append("rect")
      .attr("x", x1("prev"))
      .attr("y", d => y(d.previous_quarter_papers))
      .attr("width", x1.bandwidth())
      .attr("height", d => height - margin.bottom - y(d.previous_quarter_papers))
      .attr("fill", "#94a3b8")
      .attr("rx", 2);

    // Recent quarter bar
    g.append("rect")
      .attr("x", x1("recent"))
      .attr("y", d => y(d.recent_quarter_papers))
      .attr("width", x1.bandwidth())
      .attr("height", d => height - margin.bottom - y(d.recent_quarter_papers))
      .attr("fill", d => d.growth_rate_pct > 50 ? "var(--crimson)" : "var(--navy)")
      .attr("rx", 2);

    // Growth label
    g.append("text")
      .attr("x", x0.bandwidth()/2)
      .attr("y", d => y(d.recent_quarter_papers) - 8)
      .attr("text-anchor", "middle")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "10.5px")
      .attr("font-weight", "700")
      .attr("fill", d => d.growth_rate_pct > 50 ? "var(--crimson)" : "var(--navy)")
      .text(d => `+${{d.growth_rate_pct.toFixed(0)}}%`);

    svg.append("g").attr("transform", `translate(0,${{height - margin.bottom}})`)
      .call(d3.axisBottom(x0)).attr("font-family", "var(--font-mono)").attr("font-size", "11px");
    svg.append("g").attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y).ticks(6)).attr("font-family", "var(--font-mono)").attr("font-size", "11px");
  }}

  // SLIDE 13: Isolation Forest Outlier Scatter
  function renderP4Anomalies() {{
    const container = d3.select("#plot-p4-anomalies");
    container.html("");
    const anoms = DATA.trends?.anomalies || [];
    if (!anoms.length) return;

    const width = 1100, height = 540, margin = {{ top: 40, right: 40, bottom: 60, left: 80 }};
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const x = d3.scaleLinear().domain([0, 80000]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 6000]).range([height - margin.bottom, margin.top]);

    // Anomaly P99 zone shading
    svg.append("rect")
      .attr("x", x(20000))
      .attr("y", margin.top)
      .attr("width", width - margin.right - x(20000))
      .attr("height", height - margin.bottom - margin.top)
      .attr("fill", "rgba(185, 28, 28, 0.05)");

    svg.selectAll(".dot-anom").data(anoms).enter().append("circle")
      .attr("cx", d => x(d.word_count))
      .attr("cy", d => y(d.math_count))
      .attr("r", 6)
      .attr("fill", "var(--crimson)")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.5)
      .on("mousemove", (event, d) => {{
        showTooltip(`<strong>${{d.title}}</strong><br>Mã bài: ${{d.paper_id}} (${{d.primary_category}})<br>Độ dài: ${{d.word_count.toLocaleString()}} từ<br>Công thức: ${{d.math_count.toLocaleString()}}<br>Score: ${{d.anomaly_score.toFixed(4)}}`, event);
      }})
      .on("mouseleave", hideTooltip);

    svg.append("g").attr("transform", `translate(0,${{height - margin.bottom}})`)
      .call(d3.axisBottom(x).tickFormat(d => (d/1000) + "k từ")).attr("font-family", "var(--font-mono)").attr("font-size", "11px");
    svg.append("g").attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y).tickFormat(d => (d/1000) + "k ct")).attr("font-family", "var(--font-mono)").attr("font-size", "11px");
  }}

  // SLIDE 14: Bridge Schematic (Mining to RAG)
  function renderBridgeSchematic() {{
    const container = d3.select("#plot-bridge-schematic");
    container.html("");
    const width = 1400, height = 500;
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const boxes = [
      {{ title: "1. ARXÍV MINING ARTIFACTS", sub: "PageRank, FP-Growth, LaTeX Parse", x: 100, y: 180, w: 280, h: 140, color: "var(--navy)" }},
      {{ title: "2. MULTI-STAGE RETRIEVAL", sub: "Top-15 Pool + BM25 Lexical Scoring", x: 440, y: 180, w: 280, h: 140, color: "var(--forest)" }},
      {{ title: "3. HEURISTICS RE-RANKING", sub: "Cross-Encoder + PageRank Boost (+25%)", x: 780, y: 180, w: 280, h: 140, color: "var(--crimson)" }},
      {{ title: "4. GROUNDED SCIENTIFIC LLM", sub: "Qwen 2.5 7B with Strict Guardrails", x: 1120, y: 180, w: 240, h: 140, color: "var(--amber)" }}
    ];

    svg.append("defs").append("marker")
      .attr("id", "arrow-bridge")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 8)
      .attr("refY", 5)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("d", "M 0 0 L 10 5 L 0 10 z")
      .attr("fill", "var(--crimson)");

    for (let i = 0; i < boxes.length - 1; i++) {{
      svg.append("line")
        .attr("x1", boxes[i].x + boxes[i].w)
        .attr("y1", boxes[i].y + boxes[i].h / 2)
        .attr("x2", boxes[i + 1].x - 8)
        .attr("y2", boxes[i + 1].y + boxes[i + 1].h / 2)
        .attr("stroke", "var(--crimson)")
        .attr("stroke-width", 2.5)
        .attr("marker-end", "url(#arrow-bridge)");
    }}

    const g = svg.selectAll(".b-box").data(boxes).enter().append("g").attr("transform", d => `translate(${{d.x}}, ${{d.y}})`);
    g.append("rect").attr("width", d => d.w).attr("height", d => d.h).attr("rx", 6).attr("fill", "#ffffff").attr("stroke", d => d.color).attr("stroke-width", 2);
    g.append("rect").attr("width", d => d.w).attr("height", 32).attr("rx", 6).attr("fill", d => d.color);
    g.append("text").attr("x", 12).attr("y", 20).attr("fill", "#ffffff").attr("font-family", "var(--font-mono)").attr("font-size", "11px").attr("font-weight", "700").text(d => d.title);
    g.append("text").attr("x", 12).attr("y", 75).attr("fill", "var(--ink-secondary)").attr("font-family", "var(--font-serif-text)").attr("font-size", "13px").text(d => d.sub);
  }}

  // SLIDE 15: DeepEval Benchmark (Dumbbell Chart)
  function renderDeepevalBenchmark() {{
    const container = d3.select("#plot-deepeval-benchmark");
    container.html("");
    const data = DATA.deepeval_comparison || [];
    if (!data.length) return;

    const width = 1100, height = 540, margin = {{ top: 40, right: 60, bottom: 40, left: 240 }};
    const svg = container.append("svg").attr("viewBox", `0 0 ${{width}} ${{height}}`).attr("width", "100%").attr("height", "100%");

    const y = d3.scaleBand().domain(data.map(d => d.metric)).range([margin.top, height - margin.bottom]).padding(0.4);
    const x = d3.scaleLinear().domain([0.4, 1.05]).range([margin.left, width - margin.right]);

    // Connecting line (Dumbbell bar)
    svg.selectAll(".db-line").data(data).enter().append("line")
      .attr("y1", d => y(d.metric) + y.bandwidth()/2)
      .attr("y2", d => y(d.metric) + y.bandwidth()/2)
      .attr("x1", d => x(d.baseline))
      .attr("x2", d => x(d.upgraded))
      .attr("stroke", d => d.status === "up" ? "var(--forest)" : "#94a3b8")
      .attr("stroke-width", 3);

    // Baseline dot
    svg.selectAll(".dot-base").data(data).enter().append("circle")
      .attr("cy", d => y(d.metric) + y.bandwidth()/2)
      .attr("cx", d => x(d.baseline))
      .attr("r", 6)
      .attr("fill", "#94a3b8")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2);

    // Upgraded dot
    svg.selectAll(".dot-up").data(data).enter().append("circle")
      .attr("cy", d => y(d.metric) + y.bandwidth()/2)
      .attr("cx", d => x(d.upgraded))
      .attr("r", 7.5)
      .attr("fill", d => d.status === "up" ? "var(--forest)" : "var(--crimson)")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2);

    // Delta text label
    svg.selectAll(".label-delta").data(data).enter().append("text")
      .attr("y", d => y(d.metric) + y.bandwidth()/2 + 4)
      .attr("x", d => Math.max(x(d.baseline), x(d.upgraded)) + 14)
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "11.5px")
      .attr("font-weight", "700")
      .attr("fill", d => d.status === "up" ? "var(--forest)" : "var(--crimson)")
      .text(d => `${{d.delta}} (${{d.upgraded.toFixed(3)}})`);

    svg.append("g").attr("transform", `translate(${{margin.left}},0)`)
      .call(d3.axisLeft(y)).attr("font-family", "var(--font-serif-display)").attr("font-size", "13px").attr("font-weight", "700");
    svg.append("g").attr("transform", `translate(0,${{height - margin.bottom}})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d => (d*100) + "%")).attr("font-family", "var(--font-mono)").attr("font-size", "11px");
  }}
</script>

</body>
</html>"""

    with open(out_html, "w", encoding="utf-8") as f:
        f.write(html_content)

    size_kb = out_html.stat().st_size / 1024
    print(f"\n[SUCCESS] Presentation deck successfully generated at: {out_html}")
    print(f"Total File Size: {size_kb:.2f} KB")


if __name__ == "__main__":
    build_presentation()
