// Draws chunks for Laya's training data, from papers the v1 test set never touched.
// Reads Mongo only. Run from backend_rag/:
//   node sample_chunks.cjs <old-eval-set.json> <qrels_chunks.json> <candidates.json> <out.json> <n> [seed]
const { createRequire } = require('module');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const req = createRequire(path.join(process.cwd(), 'package.json'));
req('dotenv/config');
const { MongoClient } = req('mongodb');

const NOISE = /acknowledg|funding|references|bibliograph|author contribution|conflict of interest|competing interest|data availability|supplementary/i;
const SECTION_SHARE = { other: 0.3, experiments: 0.2, methodology: 0.15, conclusion: 0.12, introduction: 0.1, abstract: 0.08, related_work: 0.05 };
const sectionGroup = (t) => (t === 'discussion' ? 'conclusion' : t?.startsWith('abstract') ? 'abstract' : SECTION_SHARE[t] ? t : null);
const readable = (text) => {
  const letters = (text.match(/\p{L}/gu) ?? []).length / text.length;
  const latex = (text.match(/[\\${}^_]/g) ?? []).length / text.length;
  return text.split(/\s+/).length >= 90 && letters >= 0.72 && latex <= 0.03 && /[.!?]\s+[A-Z]/.test(text);
};

(async () => {
  const [oldPath, qrelsPath, candPath, outPath, nArg, seed = 'laya-train-v1'] = process.argv.slice(2);
  const n = Number(nArg);
  const paperOf = (id) => id.split(/_sec|_abs/)[0];
  const old = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
  const excluded = new Set([...old.positives, ...old.groundedness].map((x) => paperOf(x[0])));
  for (const c of Object.values(JSON.parse(fs.readFileSync(qrelsPath, 'utf8')))) excluded.add(c.paper_id);
  for (const c of JSON.parse(fs.readFileSync(candPath, 'utf8')).candidates) excluded.add(c.paper_id);
  // Papers an earlier training round already drew from (EXCLUDE_CHUNKS=a.json,b.json), so a new round adds new papers.
  for (const f of (process.env.EXCLUDE_CHUNKS ?? '').split(',').filter(Boolean)) for (const c of JSON.parse(fs.readFileSync(f, 'utf8')).chunks) excluded.add(c.paper_id);

  const mongo = new MongoClient(process.env.CORPUS_MONGO_URI);
  await mongo.connect();
  const db = mongo.db('rag_ts_corpus');
  const titles = new Map();
  for await (const p of db.collection('papers').find({}, { projection: { title: 1 } })) titles.set(p._id, p.title ?? '');
  const cells = new Map();
  const cap = 3000;
  for await (const c of db.collection('paper_chunks').find({}, { projection: { paper_id: 1, section_type: 1, section_title: 1, word_count: 1 }, batchSize: 5000 })) {
    const section = sectionGroup(c.section_type);
    if (!section || (c.word_count ?? 0) < 90 || NOISE.test(c.section_title ?? '') || excluded.has(c.paper_id)) continue;
    const list = cells.get(section) ?? [];
    list.push({ id: c._id, paper: c.paper_id, section, sectionTitle: c.section_title ?? '', hash: crypto.createHash('sha256').update(seed + c._id).digest('hex') });
    if (list.length > cap * 2) { list.sort((a, b) => (a.hash < b.hash ? -1 : 1)); list.length = cap; }
    cells.set(section, list);
  }
  const out = [];
  const used = new Set();
  for (const [section, share] of Object.entries(SECTION_SHARE)) {
    const want = Math.round(n * share);
    const list = (cells.get(section) ?? []).sort((a, b) => (a.hash < b.hash ? -1 : 1));
    let got = 0;
    for (let i = 0; i < list.length && got < want; i += 100) {
      const batch = list.slice(i, i + 100).filter((x) => !used.has(x.paper));
      const texts = new Map((await db.collection('paper_chunks').find({ _id: { $in: batch.map((b) => b.id) } }, { projection: { text: 1 } }).toArray()).map((d) => [d._id, d.text]));
      for (const b of batch) {
        const text = texts.get(b.id);
        if (got >= want || used.has(b.paper) || !text || !readable(text)) continue;
        used.add(b.paper);
        // Whole papers go to one split, so dev never sees a paper the model trained on.
        const split = parseInt(crypto.createHash('sha256').update(`${seed}split${b.paper}`).digest('hex').slice(0, 8), 16) % 5 === 0 ? 'dev' : 'train';
        out.push({ chunk_id: b.id, paper_id: b.paper, split, section, title: titles.get(b.paper) ?? '', section_title: b.sectionTitle, text });
        got++;
      }
    }
  }
  fs.writeFileSync(outPath, JSON.stringify({ seed, excluded_papers: excluded.size, chunks: out }));
  console.log({ chunks: out.length, dev: out.filter((c) => c.split === 'dev').length, excluded: excluded.size });
  await mongo.close();
})().catch((e) => { console.error(e); process.exit(1); });
