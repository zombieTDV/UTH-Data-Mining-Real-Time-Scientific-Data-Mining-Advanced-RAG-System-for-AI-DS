"""Grades (question, chunk) pairs with DeepSeek V4.1 Flash. Resumable; stops itself at --budget-usd.

    grade 2: the passage states the answer to the question
    grade 1: on the same topic or paper, but does not give the answer
    grade 0: unrelated

.venv/bin/python benchmarks/rag_eval/judge_relevance.py --pairs pairs.jsonl --chunks chunks.json --out grades.jsonl
"""
import argparse, json, sys, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "laya_vs_best"))
from judge import MODEL, Usage, api_key  # noqa: E402
from openai import OpenAI  # noqa: E402

PROMPT = """You are a strict relevance assessor for a scientific search engine.

Question: {q}

Passage from the paper "{title}", section "{section}":
{text}

Grade the passage:
2 = the passage itself states the answer to this exact question, about the same entity the question names.
1 = same topic or same paper, but it does not state the answer.
0 = unrelated.

A passage about a different model or paper with a similar name is not grade 2. Do not use outside knowledge.
Reply with JSON only: {{"grade": 0, "evidence": "shortest verbatim span that supports grade 2, else empty"}}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", required=True)
    ap.add_argument("--chunks", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--budget-usd", type=float, default=0.8)
    args = ap.parse_args()
    chunks = json.load(open(args.chunks))
    out = Path(args.out)
    done = set()
    if out.exists():
        done = {(g["qid"], g["chunk_id"]) for g in map(json.loads, out.read_text().splitlines())}
    pairs = [p for p in map(json.loads, Path(args.pairs).read_text().splitlines()) if (p["qid"], p["chunk_id"]) not in done]
    usage = Usage(args.budget_usd)
    client = OpenAI(api_key=api_key(), base_url="https://api.deepseek.com/v1", timeout=120.0)
    lock = threading.Lock()
    finished = [0]

    def grade(p):
        if usage.over:
            return
        c = chunks.get(p["chunk_id"])
        if c is None:
            return
        prompt = PROMPT.format(q=p["question"], title=c["title"] or "unknown", section=c["section"], text=c["text"])
        for attempt in range(3):
            try:
                r = client.chat.completions.create(model=MODEL, messages=[{"role": "user", "content": prompt}], temperature=0.0, max_tokens=4000, reasoning_effort="low", response_format={"type": "json_object"})
                usage.add(r.usage)
                parsed = json.loads(r.choices[0].message.content)
                g = int(parsed["grade"])
                if g not in (0, 1, 2):
                    raise ValueError(g)
                row = {"qid": p["qid"], "chunk_id": p["chunk_id"], "grade": g, "evidence": parsed.get("evidence", "")}
                with lock, out.open("a") as fh:
                    fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                    finished[0] += 1
                    if finished[0] % 200 == 0:
                        usage.refresh()
                        print(finished[0], "of", len(pairs), "spent_usd", usage.spent("USD"), flush=True)
                return
            except Exception as e:
                last = e
        print("failed", p["qid"], p["chunk_id"], str(last)[:120], flush=True)

    with ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(grade, pairs))
    usage.refresh()
    print(json.dumps({"graded": finished[0], "of": len(pairs), "calls": usage.calls, "tokens_in": usage.tokens_in, "tokens_out": usage.tokens_out, "spent_usd": usage.spent("USD"), "stopped_by_budget": usage.over}))


if __name__ == "__main__":
    main()
