// Temporary hybrid search for benchmarks: wraps RagService.search with SQLite FTS5 BM25, fused by RRF.
// The fused score replaces the similarity, so with authority off the next steps keep this order.
const STOP_WORDS = new Set('a an and are as at be by can did do does for from has have how in is it its of on or that the to was were what when where which who why will with'.split(' '));
const RRF_K = 60;

function addBm25(rag, dbPath, onSearch = () => {}) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const stmt = db.prepare('SELECT i.chunk_id, i.paper_id FROM fts JOIN ids i ON i.id = fts.rowid WHERE fts MATCH ? ORDER BY bm25(fts) LIMIT ?');
  const embed = rag.embedding.embedQuery.bind(rag.embedding);
  let lastText = '';
  rag.embedding.embedQuery = (text) => { lastText = text; return embed(text); };
  const search = rag.search.bind(rag);
  rag.search = async (vector, steps, body) => {
    const hits = await search(vector, steps, body);
    const tokens = [...new Set(lastText.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter((t) => !STOP_WORDS.has(t));
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
    onSearch(hits, refs);
    return [...fused.entries()].filter(([id]) => known.has(id)).sort((a, b) => b[1] - a[1]).map(([id, f]) => ({ ...known.get(id), score: f / best }));
  };
}

module.exports = { addBm25 };
