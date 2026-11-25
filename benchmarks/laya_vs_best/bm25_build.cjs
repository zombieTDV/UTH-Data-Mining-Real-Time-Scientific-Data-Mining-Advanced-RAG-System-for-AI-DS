// Builds a temporary BM25 index (SQLite FTS5) of rag_ts_corpus. Reads Mongo only; writes one file.
// Run from backend_rag/ so .env and the mongodb package resolve:  node bm25_build.cjs <out.sqlite>
const { createRequire } = require('module');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const req = createRequire(path.join(process.cwd(), 'package.json'));
req('dotenv/config');
const { MongoClient } = req('mongodb');

(async () => {
  const out = process.argv[2];
  fs.rmSync(out, { force: true });
  const db = new DatabaseSync(out);
  db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
    CREATE TABLE ids(id INTEGER PRIMARY KEY, chunk_id TEXT, paper_id TEXT);
    CREATE VIRTUAL TABLE fts USING fts5(body, tokenize='porter unicode61', content='');`);
  const addId = db.prepare('INSERT INTO ids(id, chunk_id, paper_id) VALUES (?, ?, ?)');
  const addFts = db.prepare('INSERT INTO fts(rowid, body) VALUES (?, ?)');

  const mongo = new MongoClient(process.env.CORPUS_MONGO_URI);
  await mongo.connect();
  const corpus = mongo.db('rag_ts_corpus');
  const titles = new Map();
  for await (const p of corpus.collection('papers').find({}, { projection: { title: 1 } })) titles.set(p._id, p.title ?? '');

  let n = 0;
  const t0 = Date.now();
  db.exec('BEGIN');
  const cursor = corpus.collection('paper_chunks').find({}, { projection: { paper_id: 1, section_title: 1, text: 1 }, batchSize: 5000 });
  for await (const c of cursor) {
    n++;
    addId.run(n, c._id, c.paper_id);
    addFts.run(n, `${titles.get(c.paper_id) ?? ''}\n${c.section_title ?? ''}\n${c.text ?? ''}`);
    if (n % 50000 === 0) {
      db.exec('COMMIT; BEGIN');
      console.error(n, `${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }
  db.exec('COMMIT');
  db.exec("INSERT INTO fts(fts) VALUES('optimize')");
  db.close();
  await mongo.close();
  console.error('done', n, `${Math.round((Date.now() - t0) / 1000)}s`, `${(fs.statSync(out).size / 1e9).toFixed(2)} GB`);
})().catch((e) => { console.error(e); process.exit(1); });
