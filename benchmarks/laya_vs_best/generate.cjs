// Runs the real RAG_TS RagService in-process (no HTTP, so no rate limit) over the 200-question set.
// Run from backend_rag/ so .env and relative model paths resolve. Output is JSONL and resumable.
//   LAYA_MODEL_DIR= node generate.cjs --set S --out O --mode sweep                 retrieval only, many configs
//   node generate.cjs --set S --out O --mode retrieval --nprobe 2 --authority 1 --expand 0
//   node generate.cjs --set S --out O --mode answer    --nprobe 2 --authority 1 --expand 0 [--limit N] [--bm25 index.sqlite]
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const cwd = process.cwd();
const req = createRequire(path.join(cwd, 'package.json'));
req('dotenv/config');
req('reflect-metadata');
const { NestFactory } = req('@nestjs/core');
const { AppModule } = req(path.join(cwd, 'dist/app.module.js'));
const { RagService } = req(path.join(cwd, 'dist/modules/rag/rag.service.js'));

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const set = JSON.parse(fs.readFileSync(arg('set'), 'utf8'));
const outPath = arg('out');
const mode = arg('mode', 'answer');
const limit = Number(arg('limit', 0));

const paperOf = (id) => id.split(/_sec|_abs/)[0];
const items = [
  ...set.positives.map(([gold, q], i) => ({ id: `pos-${i}`, kind: 'positive', q, gold })),
  ...set.negatives.map((q, i) => ({ id: `neg-${i}`, kind: 'negative', q, gold: null })),
  ...set.groundedness.map(([gold, q, yes], i) => ({ id: `gr-${i}`, kind: 'groundedness', q, gold, reference: yes })),
];

const metricsFor = (chunks, gold) => {
  const ids = chunks.map((c) => c.chunk_id);
  const rank = ids.indexOf(gold) + 1;
  const paperRank = chunks.map((c) => c.paper_id).indexOf(paperOf(gold)) + 1;
  return { rank, paperRank };
};

async function runOne(rag, item, cfg, stopAtRetrieval) {
  const ac = new AbortController();
  const result = {};
  const t0 = performance.now();
  const body = { query: item.q, top_k: cfg.top_k, nprobe: cfg.nprobe, use_authority_boost: cfg.authority, expand_query: cfg.expand };
  let chunks = [];
  for await (const ev of rag.run(body, undefined, ac.signal, result)) {
    if (ev.type === 'retrieval') {
      chunks = ev.grounded_chunks;
      if (stopAtRetrieval) break;
    }
  }
  return { chunks, result, ms: Math.round(performance.now() - t0) };
}

// Temporary hybrid search: wraps RagService.search with SQLite FTS5 BM25, fused by RRF. The fused
// score replaces the similarity, so with authority off the next steps keep this order.
const STOP = new Set('a an and are as at be by can did do does for from has have how in is it its of on or that the to was were what when where which who why will with'.split(' '));
const RRF_K = 60;
let trace = null;
function addBm25(rag, dbPath) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const stmt = db.prepare('SELECT i.chunk_id, i.paper_id FROM fts JOIN ids i ON i.id = fts.rowid WHERE fts MATCH ? ORDER BY bm25(fts) LIMIT ?');
  const embed = rag.embedding.embedQuery.bind(rag.embedding);
  let lastText = '';
  rag.embedding.embedQuery = (text) => { lastText = text; return embed(text); };
  const search = rag.search.bind(rag);
  rag.search = async (vector, steps, body) => {
    const hits = await search(vector, steps, body);
    const tokens = [...new Set(lastText.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter((t) => !STOP.has(t));
    const refs = tokens.length ? stmt.all(tokens.map((t) => `"${t}"`).join(' OR '), hits.length || 40) : [];
    const known = new Map(hits.map((h) => [h.chunk_id, h]));
    const missing = refs.filter((r) => !known.has(r.chunk_id)).map((r) => ({ chunk_id: r.chunk_id, paper_id: r.paper_id }));
    const contents = await rag.vectors.corpus.hydrate(missing);
    for (const r of missing) {
      const chunk = rag.vectors.mapOrWarn({ ...r, ...contents.get(r.chunk_id) }, r.chunk_id);
      if (chunk) known.set(r.chunk_id, { ...chunk, score: 0 });
    }
    const fused = new Map();
    hits.forEach((h, i) => fused.set(h.chunk_id, 1 / (RRF_K + i + 1)));
    refs.forEach((r, i) => fused.set(r.chunk_id, (fused.get(r.chunk_id) ?? 0) + 1 / (RRF_K + i + 1)));
    const best = 2 / (RRF_K + 1);
    const out = [...fused.entries()].filter(([id]) => known.has(id)).sort((a, b) => b[1] - a[1]).map(([id, f]) => ({ ...known.get(id), score: f / best }));
    if (trace && !trace.vector) {
      trace.vector = hits.map((h) => h.chunk_id);
      trace.bm25 = refs.map((r) => r.chunk_id);
      trace.hybrid = out.map((h) => h.chunk_id);
    }
    return out;
  };
}

// The LLM loads in the background after boot and answers 503 until then; Qdrant has a 3 s deadline
// that a busy machine can miss. Both pass with time, and neither should cost a question.
async function runWithRetry(rag, item, cfg, stopAtRetrieval) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runOne(rag, item, cfg, stopAtRetrieval);
    } catch (e) {
      const transient = /llm unavailable|qdrant unavailable/.test(String(e?.message));
      if (!transient || attempt >= 40) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const rag = app.get(RagService);
  if (arg('bm25')) addBm25(rag, arg('bm25'));
  const gradable = items.filter((i) => i.gold);

  if (mode === 'sweep') {
    const rows = [];
    for (const nprobe of [1, 2, 3, 4, 6]) for (const authority of [true, false]) for (const expand of [false, true]) {
      const cfg = { top_k: 5, nprobe, authority, expand };
      const ranks = [];
      for (const it of gradable) {
        const { chunks } = await runOne(rag, it, cfg, true);
        ranks.push({ id: it.id, gold: it.gold, ...metricsFor(chunks, it.gold) });
      }
      rows.push({ ...cfg, ranks });
      console.error(JSON.stringify({ nprobe, authority, expand, hit5: ranks.filter((r) => r.rank).length, paperHit5: ranks.filter((r) => r.paperRank).length }));
      fs.writeFileSync(outPath, JSON.stringify(rows));
    }
  } else {
    const cfg = { top_k: 5, nprobe: Number(arg('nprobe', 2)), authority: arg('authority', '1') === '1', expand: arg('expand', '0') === '1' };
    const done = new Set(fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
    const pool = mode === 'retrieval' ? gradable : items;
    // Spread kinds evenly so --limit pilots see every kind of question.
    // --every 2 keeps each kind's share of the set and spans both its older and newer questions.
    const every = Number(arg('every', 0));
    const sampled = every ? pool.filter((i) => Number(i.id.split('-')[1]) % every === 0) : pool;
    const ordered = limit ? [...sampled].sort((a, b) => (a.id.split('-')[1] - b.id.split('-')[1])).slice(0, limit) : sampled;
    for (const it of ordered) {
      if (done.has(it.id)) continue;
      try {
        trace = {};
        const { chunks, result, ms } = await runWithRetry(rag, it, cfg, mode === 'retrieval');
        const row = { ...it, ms, cfg, chunks: chunks.map((c) => ({ chunk_id: c.chunk_id, paper_id: c.paper_id, title: c.title, section_title: c.section_title, text: c.text, relevance_score: c.relevance_score })) };
        if (it.gold) Object.assign(row, metricsFor(chunks, it.gold));
        if (trace.vector) {
          const at = (list, id) => list.indexOf(id) + 1;
          row.sources = chunks.map((c) => (trace.vector.includes(c.chunk_id) ? 'vector' : '') + (trace.bm25.includes(c.chunk_id) ? '+bm25' : ''));
          if (it.gold) row.goldRanks = { vector: at(trace.vector, it.gold), bm25: at(trace.bm25, it.gold), hybrid: at(trace.hybrid, it.gold) };
        }
        if (mode === 'answer') Object.assign(row, { answer: result.answer, quality: result.quality ?? null, timings: result.timings, citations: result.citations, refined: result.quality?.refined_query ?? null });
        fs.appendFileSync(outPath, JSON.stringify(row) + '\n');
        console.error(it.id, `${ms}ms`, row.quality?.abstained ? 'ABSTAIN' : '');
      } catch (e) {
        fs.appendFileSync(`${outPath}.errors`, JSON.stringify({ id: it.id, error: String(e?.message ?? e) }) + '\n');
        console.error(it.id, 'ERROR', e?.message ?? e);
      }
    }
  }
  await app.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
