# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Primary: TS. Trần Thế Vinh (lecturer, Data Mining course, UTH) grading the project, and classmates watching the presentation.
- Situation: a student presents in a classroom; slides are shown on a classroom projector and must be readable from the back of the room.

## Product Purpose

Real-Time Scientific Data Mining & Advanced RAG System: harvests scientific papers (arXiv, CVF, Semantic Scholar) into a MinIO lakehouse (Bronze → Silver → Gold), mines them (FP-Growth, clustering, Isolation Forest, trend velocity, co-authorship graph) and answers questions with cited RAG over Qdrant. Course deliverables include one HTML slide deck per course chapter that applies that chapter to the real system.

## Positioning

Every claim on a slide comes from the running system: artifact files in `gold/mining/`, the Silver/Qdrant stores, benchmark run ids. The decks show measured results, including weak ones, rather than describing techniques in the abstract.

## Operating Context

- Decks are single self-contained HTML files under `docs/` (chapter 3: `docs/presentation/preprocessing_slides.html`, chapter 4: `docs/presentation/processing_slides.html`), navigated with arrow keys and exportable to PDF.
- Course chapter structure comes from the lecturer's slides in `docs/references/lecture_slides/` (Chapter1, 2, 4).

## Capabilities and Constraints

- Content and numbers on a deck are fixed by the measured artifacts; redesigns change presentation only.
- No binding font, color, or chapter-to-chapter consistency constraint (confirmed 2026-11-04).

## Evidence on Hand

- Mining artifacts: `s3://uth-scientific-lakehouse/gold/mining/*.json` (run 2026-10-28, 368 s).
- RAG eval: TS benchmark run `bench-run-2026-10-28T19-40-11-edbb8`; chunking A/B benchmark in `logs/benchmarks/chunking_ab/` (in progress).
- No logo or brand assets supplied; do not fabricate them.

## Product Principles

1. Measured over described: show the number and where it came from.
2. Honest about weaknesses: low scores are presented with their cause and the fix.
3. One idea per slide, readable from the back of a classroom.
