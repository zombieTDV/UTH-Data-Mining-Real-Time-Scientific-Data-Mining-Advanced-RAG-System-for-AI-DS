// Runs the full pipeline, gates and LLM included, on the frozen test set. Resumable JSONL.
//   node run_answers.cjs --set S --out O --authority 1 [--bm25 index.sqlite] [--ids a,b,c]   (from backend_rag/)
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
const { addBm25 } = require('./bm25.cjs');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };

(async () => {
  let rows = fs.readFileSync(arg('set'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (arg('ids')) { const keep = new Set(arg('ids').split(',')); rows = rows.filter((r) => keep.has(r.id)); }
  const outPath = arg('out');
  const authority = arg('authority', '1') === '1';
  const done = new Set(fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const rag = app.get(RagService);
  if (arg('bm25')) addBm25(rag, arg('bm25'));
  for (const row of rows) {
    if (done.has(row.id)) continue;
    const body = { query: row.question, top_k: 5, nprobe: 2, use_authority_boost: authority, expand_query: false };
    for (let attempt = 1; ; attempt++) {
      try {
        const result = {};
        const t0 = performance.now();
        const ac = new AbortController();
        let chunks = [];
        for await (const ev of rag.run(body, undefined, ac.signal, result)) if (ev.type === 'retrieval') chunks = ev.grounded_chunks;
        const out = { id: row.id, ms: Math.round(performance.now() - t0), answer: result.answer, citations: result.citations, quality: result.quality ?? null, timings: result.timings, chunks: chunks.map((c) => ({ chunk_id: c.chunk_id, paper_id: c.paper_id, title: c.title, section_title: c.section_title, text: c.text, relevance_score: c.relevance_score })) };
        fs.appendFileSync(outPath, JSON.stringify(out) + '\n');
        console.error(row.id, `${out.ms}ms`, result.quality?.abstained ? 'ABSTAIN' : '');
        break;
      } catch (e) {
        if (!/llm unavailable|qdrant unavailable/i.test(String(e?.message)) || attempt >= 40) throw e;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
  await app.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
