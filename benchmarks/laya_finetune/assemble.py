"""Builds train.jsonl and dev.jsonl in the exact form production gives Laya.

Labels: answerable+source chunk True; missing-detail+source chunk False unless the judge says it answers;
fabricated+source chunk False; retrieved chunks True at grade 2, else False.
.venv/bin/python benchmarks/laya_finetune/assemble.py
"""
import collections, hashlib, json, os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
W = Path(os.environ.get("LAYA_FT_WORK", ROOT / "logs/benchmarks/laya_finetune"))
# Must stay identical to RELEVANCE_QUESTION in RAG_TS backend_rag/src/engines/judge/judge.service.ts.
RELEVANCE = "Does the passage directly answer the question? True only if the passage states the answer. False if it merely shares words or the topic without answering."
QUESTIONS = {"relevant": {"type": "noul", "instructions": RELEVANCE}}
chunks = json.load(open(W / "pair_chunks.json"))
grades = {(g["qid"], g["chunk_id"]): g["grade"] for g in map(json.loads, (W / "grades.jsonl").read_text().splitlines())}


def passage(c):  # Same as passageOf in judge.service.ts.
    head = " — ".join(x for x in (c["title"], c["section"]) if x)
    return f"{head}\n{c['text']}" if head else c["text"]


def row(group, kind, question, chunk_id, label):
    return dict(state=dict(question=question, passage=passage(chunks[chunk_id])), questions=QUESTIONS, expected=dict(relevant=label), group=group, kind=kind, chunk_id=chunk_id)


out = dict(train=[], dev=[])
stats = collections.Counter()
for q in map(json.loads, (W / "questions_checked.jsonl").read_text().splitlines()):
    cid, rows = q["chunk_id"], []
    rows.append(row(cid, "answerable", q["answerable"], cid, True))
    g = grades.get((cid + "|missing", cid))
    if g is None:
        stats["missing_unjudged_dropped"] += 1
    elif g == 2:
        stats["missing_actually_answered_dropped"] += 1  # The generator was wrong, so drop rather than relabel.
    else:
        rows.append(row(cid + "|missing", "missing_detail", q["missing_detail"], cid, False))
    if q["fabricated_ok"]:
        rows.append(row(cid + "|fabricated", "fabricated", q["fabricated"], cid, False))
    else:
        stats["fabricated_name_exists_dropped"] += 1
    for c in q["retrieved"]:
        g = grades.get((cid + "|answerable", c))
        if g is None or c not in chunks:
            stats["retrieved_unjudged_dropped"] += 1
            continue
        rows.append(row(cid, "retrieved_relevant" if g == 2 else "retrieved_irrelevant", q["answerable"], c, g == 2))
    out[q["split"]] += rows
for split, rows in out.items():
    rows.sort(key=lambda r: hashlib.sha256(json.dumps([r["group"], r["chunk_id"]]).encode()).hexdigest())
    (W / f"{split}.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
    print(split, len(rows), dict(collections.Counter(r["kind"] for r in rows)), "true share", round(sum(r["expected"]["relevant"] for r in rows) / len(rows), 3))
print(dict(stats))
