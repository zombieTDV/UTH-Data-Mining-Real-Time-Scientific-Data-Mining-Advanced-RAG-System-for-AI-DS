"""
benchmarks/chunking_ab.py
-------------------------
A/B evaluation of chunking strategies on the same papers, same embedder (Nomic v1.5), same queries.

Variants
  A_old_fixed50   chunker at commit c50a651: 450-word fixed sliding window, fixed 50-word overlap
  B_new_pct15     current chunker: balanced windows, overlap = 15% of window, sentence-snapped, tail merge
  C_new_pct0      current chunker with overlap 0 (ablation: what does overlap itself buy)

Corpus: the 49 ground-truth papers of RAG_TS scientific_eval_v2 plus hard negatives (papers the production
collection ranks highest for each query) plus random papers, all re-chunked from the same Silver records.
Search is exact cosine in numpy, so nothing is written to Qdrant or MinIO (production data is read only).

Stages (each cached under --out):
  python -m benchmarks.chunking_ab build      # pick corpus, chunk 3 ways, embed (cache by text hash)
  python -m benchmarks.chunking_ab retrieve   # Recall@k / MRR / nDCG (paper level) + top-k contexts
  python -m benchmarks.chunking_ab judge      # DeepEval with DeepSeek: contextual P/R/relevancy,
                                              # faithfulness, answer relevancy, correctness (GEval)
  python -m benchmarks.chunking_ab report
"""

import argparse
import asyncio
import hashlib
import json
import logging
import math
import os
import pickle
import random
import subprocess
import sys
import time
import types
from pathlib import Path
from typing import Any, Dict, List

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s")
log = logging.getLogger("chunking_ab")
for noisy in ("httpx", "openai", "deepeval_judge", "rag_metrics"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

DATASET = ROOT / "benchmarks/datasets/scientific_eval_v2.jsonl"
LEGACY_COMMIT = "c50a651"
MAX_WORDS = 450
VARIANTS = ["A_old_fixed50", "B_new_pct15", "C_new_pct0"]


def load_cases() -> List[Dict[str, Any]]:
    rows = [json.loads(l) for l in DATASET.read_text().splitlines() if l.strip()]
    return [r for r in rows if "query_id" in r]


def chunkers() -> Dict[str, Any]:
    from src.indexing.chunker import AcademicChunker

    src = subprocess.check_output(["git", "show", f"{LEGACY_COMMIT}:src/indexing/chunker.py"], cwd=ROOT, text=True)
    legacy = types.ModuleType("legacy_chunker")
    exec(compile(src, "legacy_chunker.py", "exec"), legacy.__dict__)
    return {
        "A_old_fixed50": legacy.AcademicChunker(max_chunk_words=MAX_WORDS, overlap_words=50),
        "B_new_pct15": AcademicChunker(max_chunk_words=MAX_WORDS, overlap_ratio=0.15),
        "C_new_pct0": AcademicChunker(max_chunk_words=MAX_WORDS, overlap_ratio=0.0, min_overlap_words=0, max_overlap_words=0),
    }


# ---------------------------------------------------------------- build
def build(out: Path, n_total: int, hard_per_query: int) -> None:
    from src.indexing.embedder import NomicEmbedder
    from src.indexing.qdrant_manager import QdrantManager
    from src.storage.lakehouse_io import LakehouseIO

    cases = load_cases()
    gt = {p for c in cases for p in c.get("relevant_paper_ids", [])}
    emb = NomicEmbedder()

    corpus_file = out / "corpus.json"
    if corpus_file.exists():
        corpus = json.loads(corpus_file.read_text())
    else:
        # hard negatives: what the production collection actually ranks near each query (read only)
        q = QdrantManager()
        hard: List[str] = []
        for c in cases:
            vec = emb.embed_query(c["query"])
            r = q._session.post(f"{q.url}/collections/{q.collection_name}/points/search",
                                json={"vector": vec, "limit": 200, "with_payload": ["paper_id"]}, timeout=60)
            r.raise_for_status()
            seen = []
            for hit in r.json()["result"]:
                pid = str(hit["payload"]["paper_id"])
                if pid not in seen and pid not in gt:
                    seen.append(pid)
            hard += seen[:hard_per_query]
        corpus = {"gt": sorted(gt), "hard": sorted(set(hard) - gt)}
        corpus_file.write_text(json.dumps(corpus))
    log.info("corpus: %d ground-truth + %d hard-negative papers (random fill to %d)", len(corpus["gt"]), len(corpus["hard"]), n_total)

    papers_file = out / "papers.pkl"
    if papers_file.exists():
        papers = pickle.loads(papers_file.read_bytes())
    else:
        want = set(corpus["gt"]) | set(corpus["hard"])
        io = LakehouseIO()
        keys = [k for k in io.list_keys("silver/papers/") if k.endswith(".parquet")]
        rnd = random.Random(42)
        papers: Dict[str, Dict[str, Any]] = {}
        pool: List[Dict[str, Any]] = []
        seen_n = 0
        n_random = max(0, n_total - len(want))
        for k in keys:
            df = io.read_parquet(k)
            if "total_words" in df:
                df = df.sort_values("total_words")
            for rec in df.drop_duplicates("paper_id", keep="last").to_dict("records"):
                pid = str(rec["paper_id"])
                if pid in want:
                    papers[pid] = rec
                    continue
                seen_n += 1  # reservoir sample of random fill papers
                if len(pool) < n_random:
                    pool.append(rec)
                elif rnd.random() < n_random / seen_n:
                    pool[rnd.randrange(n_random)] = rec
            del df
        for rec in pool:
            papers.setdefault(str(rec["paper_id"]), rec)
        missing = sorted(set(corpus["gt"]) - set(papers))
        if missing:
            log.warning("ground-truth papers missing from Silver: %s", missing)
        papers_file.write_bytes(pickle.dumps(papers))
    log.info("papers loaded: %d", len(papers))

    cache_file = out / "emb_cache.pkl"
    cache: Dict[str, np.ndarray] = pickle.loads(cache_file.read_bytes()) if cache_file.exists() else {}
    for name, ch in chunkers().items():
        vfile = out / f"index_{name}.pkl"
        if vfile.exists():
            continue
        chunks = [c for rec in papers.values() for c in ch.chunk_paper(rec)]
        keys_ = [hashlib.sha1(c["context_text"].encode()).hexdigest() for c in chunks]
        todo = sorted({k: c["context_text"] for k, c in zip(keys_, chunks) if k not in cache}.items(), key=lambda kv: len(kv[1]))
        log.info("%s: %d chunks, %d to embed (%d cached)", name, len(chunks), len(todo), len(chunks) - len(todo))
        t0 = time.time()
        for i in range(0, len(todo), 256):
            part = todo[i:i + 256]
            for (k, _), v in zip(part, emb.embed_documents([t for _, t in part])):
                cache[k] = np.asarray(v, dtype=np.float32)
            done = i + len(part)
            rate = done / max(1e-6, time.time() - t0)
            log.info("  %s embedded %d/%d (%.1f/s, ETA %.0f min)", name, done, len(todo), rate, (len(todo) - done) / rate / 60)
            if (i // 256) % 10 == 9:
                cache_file.write_bytes(pickle.dumps(cache))
        cache_file.write_bytes(pickle.dumps(cache))
        meta = [{k: c.get(k) for k in ("chunk_id", "paper_id", "section_title", "text", "word_count")} for c in chunks]
        vfile.write_bytes(pickle.dumps({"meta": meta, "vecs": np.stack([cache[k] for k in keys_])}))
    qfile = out / "queries.pkl"
    if not qfile.exists():
        qfile.write_bytes(pickle.dumps({c["query_id"]: np.asarray(emb.embed_query(c["query"]), dtype=np.float32) for c in cases}))


# ---------------------------------------------------------------- retrieve
def _dcg(rels: List[float]) -> float:
    return sum((2 ** r - 1) / math.log2(i + 2) for i, r in enumerate(rels))


def retrieve(out: Path, top_k: int) -> None:
    cases = [c for c in load_cases() if c.get("answerable")]
    qv = pickle.loads((out / "queries.pkl").read_bytes())
    for name in VARIANTS:
        idx = pickle.loads((out / f"index_{name}.pkl").read_bytes())
        meta, vecs = idx["meta"], idx["vecs"]
        rows = []
        for c in cases:
            scores = vecs @ qv[c["query_id"]]
            order = np.argsort(-scores)[:200]
            papers_ranked: List[str] = []
            for j in order:
                pid = str(meta[j]["paper_id"])
                if pid not in papers_ranked:
                    papers_ranked.append(pid)
            grades = c.get("paper_relevance_grades") or {p: 3 for p in c["relevant_paper_ids"]}
            rel = set(c["relevant_paper_ids"])
            first = next((i + 1 for i, p in enumerate(papers_ranked[:10]) if p in rel), None)
            ideal = sorted(grades.values(), reverse=True)[:10]
            ctx = [meta[j] for j in order[:top_k]]
            rows.append({
                "query_id": c["query_id"],
                **{f"recall@{k}": float(any(p in rel for p in papers_ranked[:k])) for k in (1, 3, 5, 10)},
                "mrr@10": 1.0 / first if first else 0.0,
                "ndcg@10": _dcg([grades.get(p, 0) for p in papers_ranked[:10]]) / _dcg(ideal),
                "chunk_hit@5": float(any(str(m["paper_id"]) in rel for m in ctx)),
                "distinct_papers@5": len({str(m["paper_id"]) for m in ctx}),
                "ctx_words@5": sum(int(m["word_count"] or 0) for m in ctx),
                "contexts": [{"chunk_id": m["chunk_id"], "paper_id": str(m["paper_id"]), "text": m["text"]} for m in ctx],
            })
        (out / f"retrieval_{name}.json").write_text(json.dumps(rows, ensure_ascii=False))
        wc = [int(m["word_count"] or 0) for m in meta]
        summ = {k: round(float(np.mean([r[k] for r in rows])), 4) for k in rows[0] if k not in ("query_id", "contexts")}
        summ.update(n_chunks=len(meta), chunk_words_median=int(np.median(wc)), chunk_words_p10=int(np.percentile(wc, 10)))
        (out / f"retrieval_{name}.summary.json").write_text(json.dumps(summ))
        log.info("%s %s", name, summ)


# ---------------------------------------------------------------- judge
ANSWER_PROMPT = """You answer questions about scientific papers using ONLY the excerpts below.
Cite every claim as [Paper: <paper_id>]. If the excerpts do not contain the answer, say so.

Question: {q}

Excerpts:
{ctx}

Answer in 2-5 sentences."""


def judge(out: Path, concurrency: int, only: List[str]) -> None:
    from dotenv import dotenv_values

    os.environ.setdefault("DEEPSEEK_API_KEY", dotenv_values(ROOT / ".env").get("DEEP_EVAL_API") or "")
    os.environ.setdefault("DEEPEVAL_TELEMETRY_OPT_OUT", "YES")
    from deepeval.metrics import (AnswerRelevancyMetric, ContextualPrecisionMetric, ContextualRecallMetric,
                                  ContextualRelevancyMetric, FaithfulnessMetric, GEval)
    from deepeval.test_case import LLMTestCase, LLMTestCaseParams
    from benchmarks.judges.custom_judge import get_judge_llm

    judge_llm = get_judge_llm("deepseek")
    cases = {c["query_id"]: c for c in load_cases() if c.get("answerable") and c.get("reference_answer")}
    sem = None  # created inside the running loop (py3.9 binds primitives to the loop at creation)

    def metrics():
        return {
            "contextual_precision": ContextualPrecisionMetric(model=judge_llm, async_mode=True, include_reason=False),
            "contextual_recall": ContextualRecallMetric(model=judge_llm, async_mode=True, include_reason=False),
            "contextual_relevancy": ContextualRelevancyMetric(model=judge_llm, async_mode=True, include_reason=False),
            "faithfulness": FaithfulnessMetric(model=judge_llm, async_mode=True, include_reason=False),
            "answer_relevancy": AnswerRelevancyMetric(model=judge_llm, async_mode=True, include_reason=False),
            "correctness": GEval(
                name="Correctness", model=judge_llm, async_mode=True,
                criteria="Judge whether the actual output is factually consistent with the expected output and covers its key points.",
                evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT]),
        }

    async def one(name: str, r: Dict[str, Any]) -> Dict[str, Any]:
        c = cases[r["query_id"]]
        ctx = [f"[Paper: {x['paper_id']}] {x['text']}" for x in r["contexts"]]
        async with sem:
            for attempt in range(6):  # 429s: DeepSeek caps concurrency by account balance
                try:
                    answer = await judge_llm.a_generate(ANSWER_PROMPT.format(q=c["query"], ctx="\n\n".join(ctx)))
                    break
                except Exception as e:
                    if attempt == 5:
                        raise
                    await asyncio.sleep(5 * (attempt + 1))
            tc = LLMTestCase(input=c["query"], actual_output=answer, expected_output=c["reference_answer"], retrieval_context=ctx)
            res: Dict[str, Any] = {"query_id": r["query_id"], "answer": answer}
            for mname, m in metrics().items():
                for attempt in range(5):
                    try:
                        await m.a_measure(tc, _show_indicator=False)
                        res[mname] = m.score
                        break
                    except Exception as e:  # judge JSON hiccups: retry, then record as missing
                        if attempt == 4:
                            res[mname] = None
                            log.warning("%s %s %s failed: %s", name, r["query_id"], mname, str(e)[:120])
                        else:
                            await asyncio.sleep(5 * (attempt + 1))
        return res

    async def run():
        nonlocal sem
        sem = asyncio.Semaphore(concurrency)
        for name in only or VARIANTS:
            f = out / f"judge_{name}.json"
            if f.exists():
                log.info("%s already judged", name)
                continue
            rows = [r for r in json.loads((out / f"retrieval_{name}.json").read_text()) if r["query_id"] in cases]
            t0 = time.time()
            res = await asyncio.gather(*[one(name, r) for r in rows])
            f.write_text(json.dumps(res, ensure_ascii=False))
            log.info("%s judged %d cases in %.0fs", name, len(res), time.time() - t0)

    asyncio.run(run())


# ---------------------------------------------------------------- report
def report(out: Path) -> None:
    keys_r = ["recall@1", "recall@3", "recall@5", "recall@10", "mrr@10", "ndcg@10", "chunk_hit@5", "distinct_papers@5", "ctx_words@5"]
    keys_j = ["contextual_precision", "contextual_recall", "contextual_relevancy", "faithfulness", "answer_relevancy", "correctness"]
    summary: Dict[str, Dict[str, Any]] = {}
    for name in VARIANTS:
        s = json.loads((out / f"retrieval_{name}.summary.json").read_text())
        jf = out / f"judge_{name}.json"
        if jf.exists():
            j = json.loads(jf.read_text())
            for k in keys_j:
                vals = [x[k] for x in j if x.get(k) is not None]
                s[k] = round(float(np.mean(vals)), 4) if vals else None
                s[k + "_n"] = len(vals)
        summary[name] = s
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    cols = ["n_chunks", "chunk_words_median", "chunk_words_p10"] + keys_r + keys_j
    lines = ["| metric | " + " | ".join(VARIANTS) + " |", "|---|" + "---|" * len(VARIANTS)]
    for k in cols:
        lines.append(f"| {k} | " + " | ".join(str(summary[v].get(k, "")) for v in VARIANTS) + " |")
    md = "\n".join(lines)
    (out / "report.md").write_text(md + "\n")
    print(md)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("stage", choices=["build", "retrieve", "judge", "report", "all"])
    ap.add_argument("--out", default=str(ROOT / "logs/benchmarks/chunking_ab"))
    ap.add_argument("--papers", type=int, default=1000, help="corpus size (ground truth + hard negatives + random fill)")
    ap.add_argument("--hard-per-query", type=int, default=10)
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--only", nargs="*", default=[])
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    if a.stage in ("build", "all"):
        build(out, a.papers, a.hard_per_query)
    if a.stage in ("retrieve", "all"):
        retrieve(out, a.top_k)
    if a.stage in ("judge", "all"):
        judge(out, a.concurrency, a.only)
    if a.stage in ("report", "all"):
        report(out)


if __name__ == "__main__":
    main()
