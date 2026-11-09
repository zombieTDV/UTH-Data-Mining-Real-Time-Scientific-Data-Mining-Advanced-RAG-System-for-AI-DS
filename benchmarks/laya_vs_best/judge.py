"""Scores the answers from generate.cjs with DeepEval, using DeepSeek V4.1 Flash as the judge.

Results are appended per question, so a stopped run resumes without paying twice. The run stops by
itself once the account's real USD balance has dropped by --budget-usd.

    .venv/bin/python benchmarks/laya_vs_best/judge.py --in answers_laya.jsonl --out scores_laya.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

os.environ.setdefault("DEEPEVAL_TELEMETRY_OPT_OUT", "YES")
os.environ.setdefault("ERROR_REPORTING", "NO")

from deepeval.metrics import AnswerRelevancyMetric, ContextualRelevancyMetric, FaithfulnessMetric, GEval
from deepeval.models.base_model import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from openai import OpenAI

ROOT = Path(__file__).resolve().parents[2]
MODEL = "deepseek-flash"  # DeepSeek-V4.1-Flash; never Pro.
NO_CONTEXT = "The provided literature does not contain sufficient details regarding this question."


def api_key() -> str:
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("DEEP_EVAL_API="):
            return line.split("=", 1)[1].strip().strip("\"'")
    sys.exit("DEEP_EVAL_API is missing from .env")


def balances() -> dict:
    """The account's real balance per currency; DeepSeek may spend the granted CNY before the USD."""
    req = urllib.request.Request(
        "https://api.deepseek.com/user/balance", headers={"Authorization": f"Bearer {api_key()}"}
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        infos = json.load(r)["balance_infos"]
    return {i["currency"]: float(i["total_balance"]) for i in infos}


class Usage:
    def __init__(self, budget: float):
        self.lock = threading.Lock()
        self.tokens_in = self.tokens_out = self.tokens_cached = self.calls = 0
        self.budget = budget
        self.start = balances()
        self.now = dict(self.start)

    def add(self, u) -> None:
        with self.lock:
            self.calls += 1
            self.tokens_in += u.prompt_tokens
            self.tokens_out += u.completion_tokens
            self.tokens_cached += getattr(u, "prompt_cache_hit_tokens", 0) or 0

    def refresh(self) -> None:
        try:
            self.now = balances()
        except Exception as e:  # A failed check must not lose scored work; the next one retries.
            print(f"balance check failed: {e}", flush=True)

    def spent(self, currency: str) -> float:
        return round(self.start.get(currency, 0) - self.now.get(currency, 0), 4)

    def estimated(self) -> float:
        # The balance API lags by minutes, which let a run overshoot its cap once. Token counts do not lag.
        # Rates fitted on a measured run (2.19M in + 0.44M out = $0.47, out priced 4x in); cache hits ignored, so it errs high.
        return self.tokens_in * 0.119e-6 + self.tokens_out * 0.476e-6

    @property
    def over(self) -> bool:
        # DeepSeek spends the granted CNY first, so both count. 7 CNY/USD is only a rough guard rate.
        return max(self.spent("USD") + self.spent("CNY") / 7, self.estimated()) >= self.budget


class Judge(DeepEvalBaseLLM):
    def __init__(self, usage: Usage):
        self.usage = usage
        self.client = OpenAI(api_key=api_key(), base_url="https://api.deepseek.com/v1", timeout=120.0)
        super().__init__(model_name=MODEL)

    def load_model(self):
        return self.client

    def get_model_name(self) -> str:
        return MODEL

    def generate(self, prompt: str) -> str:
        r = self.client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=16000,  # Reasoning counts against this; at 4096 it used all of it and left no reply.
            reasoning_effort="low",
            response_format={"type": "json_object"},
        )
        self.usage.add(r.usage)
        # Scientific text often holds LaTeX. Escapes are consumed in pairs so a valid `\\\\(` stays valid
        # and only a lone backslash gets doubled.
        return re.sub(
            r'\\(["\\/bfnrtu]?)',
            lambda m: m.group(0) if m.group(1) else "\\\\",
            r.choices[0].message.content or "",
        )

    async def a_generate(self, prompt: str) -> str:
        return self.generate(prompt)


def refusal_metric(judge: Judge) -> GEval:
    return GEval(
        name="Correct Refusal",
        criteria=(
            "The question cannot be answered from this collection of AI and machine-learning papers: "
            "it is off-topic or asks about something that does not exist. The actual output should "
            "say that the literature does not contain the answer. Score high if it clearly declines. "
            "Score low if it presents an answer, even a hedged one, as coming from the literature."
        ),
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
        threshold=0.5,
        async_mode=False,
    )


def correctness_metric(judge: Judge) -> GEval:
    return GEval(
        name="Answer Correctness",
        criteria=(
            "Compare the actual output with the expected output. Score high if it states the same "
            "key facts and numbers, and low if it contradicts them, omits them, or declines to answer."
        ),
        evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],
        model=judge,
        threshold=0.5,
        async_mode=False,
    )


def score_row(row: dict, judge: Judge, only: set | None = None) -> dict:
    answer = (row.get("answer") or "").strip()
    is_abstained = answer == NO_CONTEXT
    context = [c["text"] for c in row.get("chunks", [])]
    out = {"id": row["id"], "kind": row["kind"], "abstained": is_abstained, "metrics": {}, "errors": {}}

    if row["kind"] == "negative":
        if is_abstained:  # The pipeline's fixed refusal needs no judge.
            out["metrics"]["Correct Refusal"] = 1.0
            return out
        metrics = [refusal_metric(judge)]
    elif is_abstained or not answer:
        # Nothing to judge: the metrics below are undefined on a fixed refusal with no context.
        return out
    else:
        metrics = [
            FaithfulnessMetric(threshold=0.7, model=judge, async_mode=False, include_reason=False),
            AnswerRelevancyMetric(threshold=0.7, model=judge, async_mode=False, include_reason=False),
            ContextualRelevancyMetric(threshold=0.5, model=judge, async_mode=False, include_reason=False),
        ]
        if row.get("reference"):
            metrics.append(correctness_metric(judge))

    case = LLMTestCase(
        input=row["q"],
        actual_output=answer,
        retrieval_context=context or None,
        expected_output=row.get("reference"),
    )
    for m in metrics:
        name = getattr(m, "name", None) or m.__name__
        if only is not None and name not in only:
            continue
        for attempt in range(3):
            try:
                out["metrics"][name] = float(m.measure(case, _show_indicator=False))
                out["errors"].pop(name, None)
                break
            except Exception as e:  # A malformed judge reply: retry, then record it as unscored.
                out["errors"][name] = str(e)[:200]
                time.sleep(2 * (attempt + 1))
    return out


def retry_errors(rows: list, out: Path, judge: Judge, usage: Usage, workers: int) -> None:
    by_id = {r["id"]: r for r in rows}
    scored = [json.loads(line) for line in out.read_text().splitlines() if line.strip()]

    def redo(s: dict) -> None:
        fresh = score_row(by_id[s["id"]], judge, only=set(s["errors"]))
        s["metrics"].update(fresh["metrics"])
        s["errors"] = {k: v for k, v in fresh["errors"].items() if k in s["errors"]}

    with ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(redo, [s for s in scored if s["errors"]]))
    out.write_text("".join(json.dumps(s, ensure_ascii=False) + "\n" for s in scored))
    usage.refresh()
    print(json.dumps({
        "still_failed": sum(len(s["errors"]) for s in scored), "calls": usage.calls, "tokens_in": usage.tokens_in,
        "tokens_out": usage.tokens_out, "spent_usd": usage.spent("USD"), "spent_cny": usage.spent("CNY"),
    }))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--retry-errors", action="store_true", help="Rescore only the metrics that failed in --out")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--budget-usd", type=float, default=3.5, help="Stop once the USD balance has dropped this much")
    args = ap.parse_args()

    out = Path(args.out)
    done = {json.loads(line)["id"] for line in out.read_text().splitlines() if line.strip()} if out.exists() else set()
    rows = [json.loads(line) for line in Path(args.inp).read_text().splitlines() if line.strip()]
    todo = [r for r in rows if r["id"] not in done]
    if args.limit:
        todo = todo[: args.limit]

    usage = Usage(args.budget_usd)
    judge = Judge(usage)
    if args.retry_errors:
        retry_errors(rows, out, judge, usage, args.workers)
        return
    lock = threading.Lock()
    finished = 0

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {}
        for r in todo:
            futures[pool.submit(lambda row=r: None if usage.over else score_row(row, judge))] = r
        for f in as_completed(futures):
            res = f.result()
            if res is None:
                continue
            with lock, out.open("a") as fh:
                fh.write(json.dumps(res, ensure_ascii=False) + "\n")
            finished += 1
            if finished % 10 == 0 or finished == len(todo):
                usage.refresh()
                print(f"{finished}/{len(todo)} calls={usage.calls} in={usage.tokens_in} out={usage.tokens_out} spent_usd={usage.spent('USD')} spent_cny={usage.spent('CNY')}", flush=True)

    usage.refresh()
    print(json.dumps({
        "scored": finished, "of": len(todo), "calls": usage.calls, "tokens_in": usage.tokens_in,
        "tokens_cached": usage.tokens_cached, "tokens_out": usage.tokens_out,
        "spent_usd": usage.spent("USD"), "spent_cny": usage.spent("CNY"), "stopped_by_budget": usage.over,
    }))


if __name__ == "__main__":
    main()
