// Draws the chunks test questions are written from. Reproducible: order is sha256(seed + chunk id).
// Reads Mongo only. Run from backend_rag/:  node sample_chunks.cjs <old-eval-set.json> <out.json> [seed]
const { createRequire } = require('module');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const req = createRequire(path.join(process.cwd(), 'package.json'));
req('dotenv/config');
const { MongoClient } = req('mongodb');

// Final question counts per stratum; SPARE covers chunks that turn out to hold nothing askable.
const SECTION_TARGET = { other: 30, experiments: 20, methodology: 15, conclusion: 12, introduction: 10, abstract: 8, related_work: 5 };
const META_TARGET = { titled_recent: 77, titled_classic: 8, no_metadata: 15 };
const SPARE = 1.5;
const NOISE = /acknowledg|funding|references|bibliograph|author contribution|conflict of interest|competing interest|data availability|supplementary/i;

const sectionGroup = (t) =>
  t === 'discussion' ? 'conclusion' : t?.startsWith('abstract') ? 'abstract' : SECTION_TARGET[t] ? t : null;

function readable(text) {
  const words = text.split(/\s+/).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length / text.length;
  const latex = (text.match(/[\\${}^_]/g) ?? []).length / text.length;
  return words >= 90 && letters >= 0.72 && latex <= 0.03 && /[.!?]\s+[A-Z]/.test(text);
}

(async () => {
  const [oldPath, outPath, seed = 'rag-eval-v1'] = process.argv.slice(2);
  const old = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
  const paperOf = (id) => id.split(/_sec|_abs/)[0];
  const excluded = new Set([...old.positives, ...old.groundedness].map((x) => paperOf(x[0])));

  const mongo = new MongoClient(process.env.CORPUS_MONGO_URI);
  await mongo.connect();
  const db = mongo.db('rag_ts_corpus');
  const papers = new Map();
  for await (const p of db.collection('papers').find({}, { projection: { title: 1, year: 1, primary_category: 1 } })) papers.set(p._id, p);

  // Keeps the lowest hashes per (metadata, section) cell without loading a million texts.
  const cells = new Map();
  const cap = 400;
  const cursor = db.collection('paper_chunks').find({}, { projection: { paper_id: 1, section_type: 1, section_title: 1, word_count: 1 }, batchSize: 5000 });
  let seen = 0;
  for await (const c of cursor) {
    seen++;
    const section = sectionGroup(c.section_type);
    if (!section || (c.word_count ?? 0) < 90 || NOISE.test(c.section_title ?? '') || excluded.has(c.paper_id)) continue;
    const p = papers.get(c.paper_id);
    const meta = !p?.title ? 'no_metadata' : (p.year ?? 9999) < 2024 ? 'titled_classic' : 'titled_recent';
    const hash = crypto.createHash('sha256').update(seed + c._id).digest('hex');
    const key = `${meta}|${section}`;
    const list = cells.get(key) ?? [];
    list.push({ id: c._id, paper: c.paper_id, hash, meta, section, sectionTitle: c.section_title });
    if (list.length > cap * 2) { list.sort((a, b) => (a.hash < b.hash ? -1 : 1)); list.length = cap; }
    cells.set(key, list);
  }

  const out = [];
  const usedPapers = new Set();
  const total = Object.values(SECTION_TARGET).reduce((a, b) => a + b, 0);
  for (const [meta, metaN] of Object.entries(META_TARGET)) {
    for (const [section, secN] of Object.entries(SECTION_TARGET)) {
      const want = Math.max(1, Math.round((metaN * secN * SPARE) / total));
      const list = (cells.get(`${meta}|${section}`) ?? []).sort((a, b) => (a.hash < b.hash ? -1 : 1));
      let got = 0;
      for (let i = 0; i < list.length && got < want; i += 40) {
        const batch = list.slice(i, i + 40).filter((x) => !usedPapers.has(x.paper));
        const texts = new Map((await db.collection('paper_chunks').find({ _id: { $in: batch.map((b) => b.id) } }, { projection: { text: 1 } }).toArray()).map((d) => [d._id, d.text]));
        for (const b of batch) {
          const text = texts.get(b.id);
          if (got >= want || usedPapers.has(b.paper) || !text || !readable(text)) continue;
          const p = papers.get(b.paper);
          usedPapers.add(b.paper);
          out.push({ chunk_id: b.id, paper_id: b.paper, meta, section, section_title: b.sectionTitle, title: p?.title ?? null, year: p?.year ?? null, category: p?.primary_category ?? null, text });
          got++;
        }
      }
    }
  }
  fs.writeFileSync(outPath, JSON.stringify({ seed, chunks_seen: seen, excluded_papers: excluded.size, candidates: out }, null, 1));
  const count = (k) => out.reduce((m, x) => ({ ...m, [x[k]]: (m[x[k]] ?? 0) + 1 }), {});
  console.log({ seen, candidates: out.length, meta: count('meta'), section: count('section') });
  await mongo.close();
})().catch((e) => { console.error(e); process.exit(1); });
