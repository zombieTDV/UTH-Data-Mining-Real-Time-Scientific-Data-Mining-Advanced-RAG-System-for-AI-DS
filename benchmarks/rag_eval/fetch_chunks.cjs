// Fetches title, section and text for chunk ids, or for every chunk of the given papers. Reads Mongo only.
//   node fetch_chunks.cjs <request.json {chunks:[], papers:[]}> <out.json>   (run from backend_rag/)
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const req = createRequire(path.join(process.cwd(), 'package.json'));
req('dotenv/config');
const { MongoClient } = req('mongodb');
(async () => {
  const { chunks = [], papers = [] } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const mongo = new MongoClient(process.env.CORPUS_MONGO_URI);
  await mongo.connect();
  const db = mongo.db('rag_ts_corpus');
  const docs = await db.collection('paper_chunks').find({ $or: [{ _id: { $in: chunks } }, { paper_id: { $in: papers } }] }, { projection: { paper_id: 1, section_title: 1, text: 1 } }).toArray();
  const ids = [...new Set(docs.map((d) => d.paper_id))];
  const titles = new Map((await db.collection('papers').find({ _id: { $in: ids } }, { projection: { title: 1 } }).toArray()).map((p) => [p._id, p.title ?? '']));
  const out = Object.fromEntries(docs.map((d) => [d._id, { paper_id: d.paper_id, title: titles.get(d.paper_id) ?? '', section: d.section_title ?? '', text: d.text }]));
  fs.writeFileSync(process.argv[3], JSON.stringify(out));
  console.log(`${docs.length} chunks from ${ids.length} papers`);
  await mongo.close();
})().catch((e) => { console.error(e); process.exit(1); });
