// Ranks every question with the real RagService and stops before the evidence gate and the LLM, so
// retrieval quality is measured apart from abstention. Run from backend_rag/; resumable JSONL.
//   node run_retrieval.cjs --set questions.jsonl --out O.jsonl --authority 0 [--bm25 index.sqlite]
// Laya is on unless LAYA_MODEL_DIR is empty in the environment.
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
const { fuseRanks } = req(path.join(cwd, 'dist/modules/rag/pipeline/ranking.js'));
const { addBm25 } = require('./bm25.cjs');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DEPTH = 20;
const TOP_K = 5; // Production's default, which also sets the size of the pool Laya reranks.
const STOP = Symbol('captured');
let cap = {};

function capture(rag) {
  const rerank = rag.mining.rerank.bind(rag.mining);
  rag.mining.rerank = (hits, boost) => {
    const ranked = rerank(hits, boost);
    cap.ranked = ranked;
    return ranked;
  };
  if (!rag.judge?.enabled) return;
  const relevance = rag.judge.relevance.bind(rag.judge);
  rag.judge.relevance = async (q, pool) => {
    const scores = await relevance(q, pool);
    if (scores) { cap.pool = pool; cap.scores = scores; }
    throw STOP;
  };
}

(async () => {
  const rows = fs.readFileSync(arg('set'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const outPath = arg('out');
  const authority = arg('authority', '0') === '1';
  const done = new Set(fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const rag = app.get(RagService);
  if (arg('bm25')) addBm25(rag, arg('bm25'), (hits, refs) => {
    cap.vector = hits.map((h) => h.chunk_id).slice(0, DEPTH);
    cap.bm25 = refs.map((r) => r.chunk_id).slice(0, DEPTH);
  });
  capture(rag);
  console.error(JSON.stringify({ laya: !!rag.judge?.enabled, bm25: !!arg('bm25'), authority, todo: rows.length - done.size }));
  for (const row of rows) {
    if (done.has(row.id)) continue;
    cap = {};
    const body = { query: row.question, top_k: TOP_K, nprobe: 2, use_authority_boost: authority, expand_query: false };
    const t0 = performance.now();
    for (let attempt = 1; ; attempt++) {
      try {
        const ac = new AbortController();
        for await (const ev of rag.run(body, undefined, ac.signal, {})) if (ev.type === 'retrieval') break;
        break;
      } catch (e) {
        if (e === STOP) break;
        if (!/qdrant unavailable/i.test(String(e?.message)) || attempt >= 20) throw e;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    const ranked = cap.ranked ?? [];
    let ids = ranked.map((c) => c.chunk_id);
    let scores = null;
    if (cap.pool) {
      const fused = fuseRanks(cap.pool, cap.scores);
      const head = fused.map((c) => c.chunk_id);
      ids = [...head, ...ids.filter((id) => !head.includes(id))];
      scores = Object.fromEntries(fused.map((c) => [c.chunk_id, c.relevance_score]));
    }
    const out = { id: row.id, ms: Math.round(performance.now() - t0), ranked: ids.slice(0, DEPTH), papers: Object.fromEntries(ranked.map((c) => [c.chunk_id, c.paper_id])), scores, vector: cap.vector ?? null, bm25: cap.bm25 ?? null };
    fs.appendFileSync(outPath, JSON.stringify(out) + '\n');
    console.error(row.id, `${out.ms}ms`);
  }
  await app.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
