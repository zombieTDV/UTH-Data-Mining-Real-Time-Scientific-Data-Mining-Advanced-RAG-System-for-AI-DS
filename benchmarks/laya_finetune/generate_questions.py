"""Writes one answerable and two unanswerable questions per chunk with DeepSeek V4.1 Flash.

A row is kept only if its quote is verbatim in the chunk. Resumable; stops itself at --budget-usd.
.venv/bin/python benchmarks/laya_finetune/generate_questions.py --chunks C.json --out Q.jsonl [--limit N]
"""
import argparse, json, re, sys, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "laya_vs_best"))
from judge import MODEL, Usage, api_key  # noqa: E402
from openai import OpenAI  # noqa: E402

PROMPT = """Below is a passage from a scientific paper. Write three search questions a researcher could ask.

Paper title: {title}
Section: {section}
Passage:
{text}

Rules for all questions:
- Each must stand alone: name the specific method, model, dataset or study, and never say "this paper" or "the passage".
- Use your own words as far as possible, not phrases copied from the passage.

"answerable": the passage states the answer directly. Prefer a specific fact, number, comparison, mechanism or reason.
"quote": the shortest span copied exactly from the passage that contains that answer.
"missing_detail": about the same method or study, on a closely related point, but the passage does NOT contain the answer.
"fabricated": the same kind of question as "answerable", but about an invented method or model name that does not exist. Make the name plausible and unusual.
"fabricated_name": that invented name.

Reply with JSON only: {{"answerable": "", "quote": "", "missing_detail": "", "fabricated": "", "fabricated_name": ""}}"""
norm = lambda s: re.sub(r"\s+", " ", s).strip().lower()
GENERIC = re.compile(r"\b(this|the) (paper|passage|study|work|article|section)\b", re.I)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chunks", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--budget-usd", type=float, default=0.25)
    args = ap.parse_args()
    chunks = json.load(open(args.chunks))["chunks"]
    if args.limit:
        chunks = chunks[:: max(1, len(chunks) // args.limit)][: args.limit]
    out = Path(args.out)
    done = {json.loads(l)["chunk_id"] for l in out.read_text().splitlines()} if out.exists() else set()
    usage = Usage(args.budget_usd)
    client = OpenAI(api_key=api_key(), base_url="https://api.deepseek.com/v1", timeout=120.0)
    lock = threading.Lock()
    stats = {"kept": 0, "bad_quote": 0, "not_standalone": 0, "failed": 0}

    def work(c):
        if usage.over or c["chunk_id"] in done:
            return
        prompt = PROMPT.format(title=c["title"] or "unknown", section=c["section_title"], text=c["text"])
        for attempt in range(3):
            try:
                r = client.chat.completions.create(model=MODEL, messages=[{"role": "user", "content": prompt}], temperature=0.3, max_tokens=4000, reasoning_effort="low", response_format={"type": "json_object"})
                usage.add(r.usage)
                q = json.loads(r.choices[0].message.content)
                fields = [q["answerable"], q["quote"], q["missing_detail"], q["fabricated"], q["fabricated_name"]]
                if not all(isinstance(f, str) and f.strip() for f in fields):
                    raise ValueError("empty field")
                break
            except Exception:
                q = None
        with lock:
            if q is None:
                stats["failed"] += 1
                return
            if norm(q["quote"]) not in norm(c["text"]):
                stats["bad_quote"] += 1
                return
            if any(GENERIC.search(q[k]) for k in ("answerable", "missing_detail", "fabricated")) or norm(q["fabricated_name"]) not in norm(q["fabricated"]):
                stats["not_standalone"] += 1
                return
            stats["kept"] += 1
            if stats["kept"] % 25 == 0:  # The budget guard reads this balance, so it must stay current.
                usage.refresh()
            with out.open("a") as fh:
                fh.write(json.dumps(dict(chunk_id=c["chunk_id"], paper_id=c["paper_id"], split=c["split"], **{k: q[k] for k in ("answerable", "quote", "missing_detail", "fabricated", "fabricated_name")}), ensure_ascii=False) + "\n")

    with ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(work, chunks))
    usage.refresh()
    print(json.dumps({**stats, "calls": usage.calls, "tokens_in": usage.tokens_in, "tokens_out": usage.tokens_out, "spent_usd": usage.spent("USD"), "stopped_by_budget": usage.over}))


if __name__ == "__main__":
    main()
