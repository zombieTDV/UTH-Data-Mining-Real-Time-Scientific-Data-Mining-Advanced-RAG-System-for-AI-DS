"""Pools the top 10 of every retrieval mode plus the author's gold chunk: TREC-style pooling.

.venv/bin/python benchmarks/rag_eval/build_qrels.py   (writes pairs and a chunk request into logs/)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
L = ROOT / "logs/benchmarks/rag_eval"
DEPTH = 10
MODES = [m for m in ["vector", "hybrid", "laya", "laya_hybrid", "prod", "laya_ft", "laya_ft_hybrid", "laya_ft1", "laya_ft1_hybrid"] if (L / f"rank_{m}.jsonl").exists()]
rows = [json.loads(l) for l in (ROOT / "benchmarks/rag_eval/data/test_set_v1.jsonl").read_text().splitlines()]
pool = {r["id"]: {r["gold_chunk"]} if r["kind"] == "positive" else set() for r in rows}
for m in MODES:
    for line in (L / f"rank_{m}.jsonl").read_text().splitlines():
        x = json.loads(line)
        pool[x["id"]].update(x["ranked"][:DEPTH])
        if x["bm25"]:
            pool[x["id"]].update(x["bm25"][:DEPTH])
        if x["vector"]:
            pool[x["id"]].update(x["vector"][:DEPTH])
question = {r["id"]: r["question"] for r in rows}
pairs = [dict(qid=q, question=question[q], chunk_id=c) for q, ids in pool.items() for c in sorted(ids)]
(L / "qrels_pairs.jsonl").write_text("".join(json.dumps(p) + "\n" for p in pairs))
(L / "qrels_req.json").write_text(json.dumps(dict(chunks=sorted({p["chunk_id"] for p in pairs}))))
print(len(pairs), "pairs over", len(pool), "questions")
