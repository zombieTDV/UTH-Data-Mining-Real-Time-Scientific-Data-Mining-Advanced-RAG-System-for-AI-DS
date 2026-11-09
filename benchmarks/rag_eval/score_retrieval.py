"""Scores every retrieval mode against the pooled qrels, with CIs and paired tests.

.venv/bin/python benchmarks/rag_eval/score_retrieval.py
"""
import collections, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from metrics import auroc, bootstrap_ci, hit_at, mrr_at, ndcg_at, paired_permutation_p, precision_at, recall_at

ROOT = Path(__file__).resolve().parents[2]
L = ROOT / "logs/benchmarks/rag_eval"
MODES = {"vector": "Vector", "hybrid": "Vector + BM25", "laya": "Laya", "laya_hybrid": "Laya + BM25", "prod": "Laya + authority (production)", "laya_ft": "Laya fine-tuned", "laya_ft_hybrid": "Laya fine-tuned + BM25", "laya_ft1": "Laya fine-tuned 1 epoch, round-2 data", "laya_ft1_hybrid": "Laya fine-tuned 1 epoch + BM25"}
MODES = {m: v for m, v in MODES.items() if (L / f"rank_{m}.jsonl").exists()}
BASELINE = "vector"
THRESHOLD = 0.6  # LAYA_EVIDENCE_THRESHOLD in production. Reported, never tuned on this test set.


def load_grades():
    grades = collections.defaultdict(dict)
    for g in map(json.loads, (L / "qrels.jsonl").read_text().splitlines()):
        grades[g["qid"]][g["chunk_id"]] = g["grade"]
    return grades


def per_question(rank, row, grades):
    ranked = rank["ranked"]
    g = dict(grades[row["id"]])
    g[row["gold_chunk"]] = 2  # Authored from this chunk, with the quote verified verbatim.
    rel = {c for c, v in g.items() if v == 2}
    paper_of = lambda c: rank["papers"].get(c) or c.split("_sec")[0].split("_abs")[0]
    papers = [paper_of(c) for c in ranked]
    return {
        "hit@1": hit_at(ranked, rel, 1), "hit@5": hit_at(ranked, rel, 5), "hit@10": hit_at(ranked, rel, 10),
        "recall@5": recall_at(ranked, rel, 5), "recall@10": recall_at(ranked, rel, 10),
        "mrr@10": mrr_at(ranked, rel, 10), "ndcg@10": ndcg_at(ranked, g, 10),
        "precision@5": precision_at(ranked, rel, 5),
        "gold_chunk@5": hit_at(ranked, {row["gold_chunk"]}, 5),
        "paper@5": float(row["gold_paper"] in papers[:5]),
    }


def main():
    rows = [json.loads(l) for l in (ROOT / "benchmarks/rag_eval/data/test_set_v1.jsonl").read_text().splitlines()]
    pos = [r for r in rows if r["kind"] == "positive"]
    grades = load_grades()
    # Quality of the labels themselves.
    agree = [grades[r["id"]].get(r["gold_chunk"]) for r in pos]
    n_rel = [sum(v == 2 for v in grades[r["id"]].values()) for r in pos]
    report = {"questions": len(pos), "judge_agrees_with_author": sum(a == 2 for a in agree), "judge_grades_of_gold": dict(collections.Counter(map(str, agree))), "relevant_chunks_per_question": {"mean": round(sum(n_rel) / len(n_rel), 2), "max": max(n_rel)}, "modes": {}, "strata": {}, "comparisons": {}, "evidence": {}}
    scores, ranks = {}, {}
    for m in MODES:
        ranks[m] = {x["id"]: x for x in map(json.loads, (L / f"rank_{m}.jsonl").read_text().splitlines())}
        scores[m] = {r["id"]: per_question(ranks[m][r["id"]], r, grades) for r in pos}
        report["modes"][m] = {}
        for metric in next(iter(scores[m].values())):
            vals = [scores[m][r["id"]][metric] for r in pos]
            lo, hi = bootstrap_ci(vals)
            report["modes"][m][metric] = {"mean": round(sum(vals) / len(vals), 3), "ci95": [round(lo, 3), round(hi, 3)]}
        report["modes"][m]["ms_mean"] = round(sum(x["ms"] for x in ranks[m].values()) / len(ranks[m]))
    for metric in ("hit@5", "mrr@10", "ndcg@10", "recall@10"):
        for a, b in [(a, b) for a, b in [("laya", "vector"), ("hybrid", "vector"), ("laya_hybrid", "laya"), ("laya_hybrid", "vector"), ("prod", "laya"), ("laya_ft", "laya"), ("laya_ft_hybrid", "laya_hybrid"), ("laya_ft_hybrid", "hybrid"), ("laya_ft1", "laya"), ("laya_ft1_hybrid", "laya_hybrid"), ("laya_ft1_hybrid", "laya_ft_hybrid")] if a in MODES and b in MODES]:
            va = [scores[a][r["id"]][metric] for r in pos]
            vb = [scores[b][r["id"]][metric] for r in pos]
            report["comparisons"][f"{a} vs {b}: {metric}"] = {"diff": round((sum(va) - sum(vb)) / len(va), 3), "p": round(paired_permutation_p(va, vb), 4)}
    for field in ("query_type", "paper_meta", "section"):
        for value in sorted({r[field] for r in pos}):
            subset = [r for r in pos if r[field] == value]
            report["strata"][f"{field}={value}"] = {"n": len(subset), **{m: {k: round(sum(scores[m][r["id"]][k] for r in subset) / len(subset), 3) for k in ("hit@5", "mrr@10", "paper@5")} for m in MODES}}
    # The evidence gate, judged offline: can Laya's best top-5 score tell answerable from unanswerable?
    neg = [r for r in rows if r["kind"] == "negative"]
    for m in [m for m in ("laya", "laya_hybrid", "prod", "laya_ft", "laya_ft_hybrid", "laya_ft1", "laya_ft1_hybrid") if m in MODES]:
        best = lambda r: max(ranks[m][r["id"]]["scores"].get(c, 0) for c in ranks[m][r["id"]]["ranked"][:5])
        p, n = [best(r) for r in pos], [best(r) for r in neg]
        report["evidence"][m] = {"auroc": round(auroc(p, n), 3), "answerable_kept": sum(v >= THRESHOLD for v in p), "unanswerable_stopped": sum(v < THRESHOLD for v in n), "by_stratum_stopped": {s: f"{sum(best(r) < THRESHOLD for r in neg if r['query_type'] == s)}/{sum(r['query_type'] == s for r in neg)}" for s in sorted({r['query_type'] for r in neg})}}
    (L / "report_retrieval.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(json.dumps({k: report[k] for k in ("questions", "judge_agrees_with_author", "judge_grades_of_gold", "relevant_chunks_per_question", "evidence")}, ensure_ascii=False))
    print("mode".ljust(14), *[k.rjust(16) for k in ("hit@1", "hit@5", "recall@10", "mrr@10", "ndcg@10", "precision@5", "gold_chunk@5", "paper@5")], "ms")
    for m in MODES:
        s = report["modes"][m]
        print(m.ljust(14), *[f"{s[k]['mean']:.3f} [{s[k]['ci95'][0]:.2f},{s[k]['ci95'][1]:.2f}]".rjust(16) for k in ("hit@1", "hit@5", "recall@10", "mrr@10", "ndcg@10", "precision@5", "gold_chunk@5", "paper@5")], s["ms_mean"])
    for k, v in report["comparisons"].items():
        print(k.ljust(38), f"{v['diff']:+.3f}  p={v['p']}")
    for k, v in report["strata"].items():
        print(k.ljust(30), v["n"], *[f"{m}:{v[m]['hit@5']:.2f}/{v[m]['paper@5']:.2f}" for m in MODES])


if __name__ == "__main__":
    main()
