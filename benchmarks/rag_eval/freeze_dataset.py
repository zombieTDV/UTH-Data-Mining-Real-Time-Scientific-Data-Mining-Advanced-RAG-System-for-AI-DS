"""Picks the final negatives from those that passed the corpus check and freezes the test set.

Selection is by sha256(seed + id), so no question was kept because of how a system handled it.
.venv/bin/python benchmarks/rag_eval/freeze_dataset.py --grades logs/benchmarks/rag_eval/neg_grades.jsonl
"""
import argparse, collections, hashlib, json
from pathlib import Path

HERE = Path(__file__).parent
SEED = "rag-eval-v1"
TARGET = {"off_topic": 10, "fabricated": 12, "absent_fact": 12, "missing_detail": 16}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grades", required=True, nargs="+")
    args = ap.parse_args()
    positives = [json.loads(l) for l in (HERE / "data/positives.jsonl").read_text().splitlines()]
    cands = [json.loads(l) for l in (HERE / "data/negative_candidates.jsonl").read_text().splitlines()]
    grades = collections.defaultdict(list)
    old_ids = {r["id"]: r["source_candidate"] for r in map(json.loads, (HERE / "data/test_set_v1.jsonl").read_text().splitlines()) if r["kind"] == "negative"} if (HERE / "data/test_set_v1.jsonl").exists() else {}
    for path in args.grades:
        for g in map(json.loads, Path(path).read_text().splitlines()):
            # Later checks are keyed by frozen ids (neg-*) and earlier ones by candidate ids.
            grades[old_ids.get(g["qid"], g["qid"])].append(g["grade"])
    h = lambda s: hashlib.sha256((SEED + s).encode()).hexdigest()
    negatives, rejected, used_papers = [], [], set()
    for stratum, want in TARGET.items():
        kept = 0
        for c in sorted((c for c in cands if c["stratum"] == stratum), key=lambda c: h(c["id"])):
            if not grades[c["id"]]:
                raise SystemExit(f"{c['id']} was never checked")
            if 2 in grades[c["id"]]:
                rejected.append(c["question"])
                continue
            if kept == want or c["named_paper"] in used_papers:
                continue
            if c["named_paper"]:
                used_papers.add(c["named_paper"])
            kept += 1
            negatives.append(dict(id=f"neg-{len(negatives):03d}", kind="negative", query_type=stratum, question=c["question"], source_candidate=c["id"], anchor=c["anchor"], named_paper=c["named_paper"], chunks_checked=len(grades[c["id"]])))
        if kept != want:
            raise SystemExit(f"{stratum}: only {kept} of {want}")
    if len(positives) != 100 or len(negatives) != 50:
        raise SystemExit("wrong size")
    text = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in positives + negatives)
    path = HERE / "data/test_set_v1.jsonl"
    path.write_text(text)
    count = lambda rows: dict(collections.Counter(r["query_type"] for r in rows))
    manifest = dict(version="v1", seed=SEED, sha256=hashlib.sha256(text.encode()).hexdigest(), positives=count(positives), negatives=count(negatives), rejected_negatives=rejected, paper_meta=dict(collections.Counter(r["paper_meta"] for r in positives)), author="Claude Opus 5.5, reading each chunk", relevance_judge="deepseek-flash")
    (HERE / "data/test_set_v1.manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    print(json.dumps(manifest, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
