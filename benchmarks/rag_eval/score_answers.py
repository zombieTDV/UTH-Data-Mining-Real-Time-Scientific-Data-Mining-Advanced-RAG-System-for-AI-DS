"""Scores full-pipeline answers against key claims with DeepSeek V4.1 Flash, plus DeepEval's faithfulness
and answer relevancy. Resumable; stops itself at --budget-usd.

.venv/bin/python benchmarks/rag_eval/score_answers.py --answers A.jsonl --out S.jsonl --summary
"""
import argparse, collections, json, re, sys, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "laya_vs_best"))
sys.path.insert(0, str(Path(__file__).parent))
from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric  # noqa: E402
from deepeval.test_case import LLMTestCase  # noqa: E402
from judge import Judge, NO_CONTEXT, Usage  # noqa: E402
from metrics import bootstrap_ci  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CLASSIFY = """A search assistant answered a question using scientific papers.

Question: {q}
Reply: {a}

Classify the reply:
"refused" = it says the literature does not contain the answer and gives no substantive answer.
"partial" = it says the exact answer is missing but offers related information.
"answered" = it presents an answer.
Reply with JSON only: {{"label": "refused"}}"""
CLAIMS = """Judge each required fact against an answer. Facts may be worded differently, and numbers must match.

Question: {q}
Answer: {a}
Required facts (JSON list): {claims}

For each fact give "stated" if the answer states it, "contradicted" if it states something incompatible, else "missing".
Reply with JSON only: {{"verdicts": ["stated"]}} with one verdict per fact, in order."""
CITATION = re.compile(r"\[Paper:\s*([^\]]+)\]")


def ask(judge, prompt):
    for attempt in range(3):
        try:
            return json.loads(judge.generate(prompt))
        except Exception as e:
            last = e
    raise last


def score(row, ans, judge):
    answer = (ans.get("answer") or "").strip()
    out = {"id": row["id"], "kind": row["kind"], "query_type": row["query_type"], "ms": ans["ms"], "abstained_by_gate": bool((ans.get("quality") or {}).get("abstained"))}
    out["reply"] = "refused" if answer == NO_CONTEXT or not answer else ask(judge, CLASSIFY.format(q=row["question"], a=answer))["label"]
    context = {c["paper_id"] for c in ans["chunks"]}
    cited = {c.strip() for m in CITATION.findall(answer) for c in m.split(",")}
    out["citations_total"], out["citations_valid"] = len(cited), len(cited & context)
    if row["kind"] == "positive":
        out["context_has_gold"] = any(c["chunk_id"] == row["gold_chunk"] for c in ans["chunks"])
        out["context_has_gold_paper"] = row["gold_paper"] in context
        out["cited_gold_paper"] = row["gold_paper"] in cited
        if out["reply"] != "refused":
            verdicts = ask(judge, CLAIMS.format(q=row["question"], a=answer, claims=json.dumps(row["key_claims"], ensure_ascii=False)))["verdicts"]
            out["verdicts"] = verdicts
            out["claim_recall"] = sum(v == "stated" for v in verdicts) / len(row["key_claims"])
            out["contradicted"] = "contradicted" in verdicts
        else:
            out["claim_recall"], out["contradicted"] = 0.0, False
        out["fully_correct"] = out["claim_recall"] == 1 and not out["contradicted"]
    if out["reply"] != "refused" and ans["chunks"]:
        case = LLMTestCase(input=row["question"], actual_output=answer, retrieval_context=[c["text"] for c in ans["chunks"]])
        for name, m in (("faithfulness", FaithfulnessMetric(threshold=0.7, model=judge, async_mode=False, include_reason=False)), ("answer_relevancy", AnswerRelevancyMetric(threshold=0.7, model=judge, async_mode=False, include_reason=False))):
            try:
                out[name] = float(m.measure(case, _show_indicator=False))
            except Exception as e:
                out[f"{name}_error"] = str(e)[:150]
    return out


def mean_ci(values):
    if not values:
        return None
    lo, hi = bootstrap_ci(values)
    return {"n": len(values), "mean": round(sum(values) / len(values), 3), "ci95": [round(lo, 3), round(hi, 3)]}


def summarize(scored):
    pos = [s for s in scored if s["kind"] == "positive"]
    neg = [s for s in scored if s["kind"] == "negative"]
    flag = lambda rows, f: [float(f(s)) for s in rows]
    answered = [s for s in scored if s["reply"] != "refused"]
    ms = sorted(s["ms"] for s in scored)
    summary = {
        "questions": len(scored),
        "answerable": {
            "fully_correct": mean_ci(flag(pos, lambda s: s["fully_correct"])),
            "claim_recall": mean_ci([s["claim_recall"] for s in pos]),
            "contradicted": mean_ci(flag(pos, lambda s: s["contradicted"])),
            "false_refusal": mean_ci(flag(pos, lambda s: s["reply"] == "refused")),
            "partial_reply": mean_ci(flag(pos, lambda s: s["reply"] == "partial")),
            "gold_paper_in_context": mean_ci(flag(pos, lambda s: s["context_has_gold_paper"])),
        },
        "unanswerable": {
            "correct_refusal": mean_ci(flag(neg, lambda s: s["reply"] == "refused")),
            "by_stratum": {t: f"{sum(s['reply'] == 'refused' for s in neg if s['query_type'] == t)}/{sum(s['query_type'] == t for s in neg)}" for t in sorted({s["query_type"] for s in neg})},
            "answered": [s["id"] for s in neg if s["reply"] == "answered"],
        },
        "answer_quality": {k: mean_ci([s[k] for s in answered if k in s]) for k in ("faithfulness", "answer_relevancy")},
        "citations": {"valid": sum(s["citations_valid"] for s in scored), "total": sum(s["citations_total"] for s in scored)},
        "latency_ms": {"p50": ms[len(ms) // 2], "p95": ms[int(len(ms) * 0.95)]} if ms else None,
        "metric_errors": sum(any(k.endswith("_error") for k in s) for s in scored),
    }
    if pos and neg:
        tp = sum(s["reply"] != "refused" for s in pos)
        fp = sum(s["reply"] != "refused" for s in neg)
        fn = len(pos) - tp
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        summary["answer_decision"] = {"precision": round(precision, 3), "recall": round(recall, 3), "f1": round(2 * precision * recall / (precision + recall), 3) if precision + recall else 0}
    return summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--answers", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--budget-usd", type=float, default=1.5)
    args = ap.parse_args()
    rows = {r["id"]: r for r in map(json.loads, (ROOT / "benchmarks/rag_eval/data/test_set_v1.jsonl").read_text().splitlines())}
    answers = [json.loads(l) for l in Path(args.answers).read_text().splitlines()]
    out = Path(args.out)
    done = {json.loads(l)["id"] for l in out.read_text().splitlines()} if out.exists() else set()
    usage = Usage(args.budget_usd)
    judge = Judge(usage)
    lock = threading.Lock()

    def work(ans):
        if usage.over or ans["id"] in done:
            return
        s = score(rows[ans["id"]], ans, judge)
        with lock, out.open("a") as fh:
            fh.write(json.dumps(s, ensure_ascii=False) + "\n")

    with ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(work, answers))
    usage.refresh()
    scored = [json.loads(l) for l in out.read_text().splitlines()]
    print(json.dumps(summarize(scored), ensure_ascii=False, indent=1))
    print(json.dumps({"scored": len(scored), "calls": usage.calls, "tokens_in": usage.tokens_in, "tokens_out": usage.tokens_out, "spent_usd": usage.spent("USD"), "stopped_by_budget": usage.over}))


if __name__ == "__main__":
    main()
