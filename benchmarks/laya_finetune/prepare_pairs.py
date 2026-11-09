"""Step between question generation and judging. Writes logs/.../retrieval_set.jsonl, then, once ranks exist, pairs to judge.

.venv/bin/python benchmarks/laya_finetune/prepare_pairs.py retrieval
.venv/bin/python benchmarks/laya_finetune/prepare_pairs.py pairs
"""
import json, os, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
W = Path(os.environ.get("LAYA_FT_WORK", ROOT / "logs/benchmarks/laya_finetune"))
N_RETRIEVED = int(os.environ.get("N_RETRIEVED", 3))  # Confusable chunks the search engine really returns, per question.
questions = [json.loads(l) for l in (W / "questions.jsonl").read_text().splitlines()]
paper_of = lambda c: c.split("_sec")[0].split("_abs")[0]

if sys.argv[1] == "retrieval":
    (W / "retrieval_set.jsonl").write_text("".join(json.dumps(dict(id=q["chunk_id"], question=q["answerable"])) + "\n" for q in questions))
    print(len(questions))
else:
    test_papers = {c["paper_id"] for c in json.load(open(ROOT / "logs/benchmarks/rag_eval/qrels_chunks.json")).values()}
    ranks = {r["id"]: r for r in map(json.loads, (W / "retrieval.jsonl").read_text().splitlines())}
    db = sqlite3.connect(f"file:{ROOT}/logs/benchmarks/laya_vs_best/bm25.sqlite?mode=ro", uri=True)
    pairs, chunks, real_names = [], set(), 0
    kept = []
    for q in questions:
        name = q["fabricated_name"].replace('"', " ")
        # A "fabricated" name that exists in the corpus would make the False label wrong.
        hits = db.execute("select count(*) from fts where fts match ?", (f'"{name}"',)).fetchone()[0]
        q["fabricated_ok"] = hits == 0
        real_names += hits > 0
        rank = ranks.get(q["chunk_id"])
        retrieved = [c for c in (rank["ranked"] if rank else []) if c != q["chunk_id"] and paper_of(c) not in test_papers][:N_RETRIEVED]
        q["retrieved"] = retrieved
        kept.append(q)
        chunks.update([q["chunk_id"], *retrieved])
        pairs.append(dict(qid=q["chunk_id"] + "|missing", question=q["missing_detail"], chunk_id=q["chunk_id"]))
        pairs += [dict(qid=q["chunk_id"] + "|answerable", question=q["answerable"], chunk_id=c) for c in retrieved]
    (W / "questions_checked.jsonl").write_text("".join(json.dumps(q, ensure_ascii=False) + "\n" for q in kept))
    (W / "pairs.jsonl").write_text("".join(json.dumps(p) + "\n" for p in pairs))
    (W / "chunks_req.json").write_text(json.dumps(dict(chunks=sorted(chunks))))
    print(json.dumps({"questions": len(kept), "pairs": len(pairs), "fabricated_names_found_in_corpus": real_names}))
