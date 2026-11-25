#!/bin/zsh
# Round 2 of Laya training data, against overfitting: more retrieved pairs per round-1 question (ranks 4-5)
# and new chunks from papers neither round 1 nor the test set touched. Resumable. From the repo root:
#   zsh benchmarks/laya_finetune/build_data_v2.sh
set -e
R=$PWD; P=$R/benchmarks/laya_finetune; W1=$R/logs/benchmarks/laya_finetune; W2=$W1/v2
PY=$R/.venv/bin/python; BM25=$R/logs/benchmarks/laya_vs_best/bm25.sqlite
mkdir -p $W2
export N_RETRIEVED=5
# Round-1 files stay as they were trained on, for comparison.
[ -f $W1/train_r1.jsonl ] || cp $W1/train.jsonl $W1/train_r1.jsonl
[ -f $W1/dev_r1.jsonl ] || cp $W1/dev.jsonl $W1/dev_r1.jsonl

echo "== A. round-1 questions: retrieved ranks 4-5"
LAYA_FT_WORK=$W1 $PY $P/prepare_pairs.py pairs
(cd ~/Project/RAG_TS/backend_rag && node $R/benchmarks/rag_eval/fetch_chunks.cjs $W1/chunks_req.json $W1/pair_chunks.json)
$PY $R/benchmarks/rag_eval/judge_relevance.py --pairs $W1/pairs.jsonl --chunks $W1/pair_chunks.json --out $W1/grades.jsonl --budget-usd 0.24
LAYA_FT_WORK=$W1 $PY $P/assemble.py
mv $W1/train.jsonl $W2/r1_train.jsonl; mv $W1/dev.jsonl $W2/r1_dev.jsonl

echo "== B. new chunks"
[ -f $W2/chunks.json ] || (cd ~/Project/RAG_TS/backend_rag && EXCLUDE_CHUNKS=$W1/chunks.json node $P/sample_chunks.cjs $R/benchmarks/datasets/laya-eval-set-200.json $R/logs/benchmarks/rag_eval/qrels_chunks.json $R/benchmarks/rag_eval/data/candidates.json $W2/chunks.json 240 laya-train-v2)
$PY $P/generate_questions.py --chunks $W2/chunks.json --out $W2/questions.jsonl --budget-usd 0.18
LAYA_FT_WORK=$W2 $PY $P/prepare_pairs.py retrieval
(cd ~/Project/RAG_TS/backend_rag && LAYA_MODEL_DIR= node $R/benchmarks/rag_eval/run_retrieval.cjs --set $W2/retrieval_set.jsonl --out $W2/retrieval.jsonl --authority 0 --bm25 $BM25)
LAYA_FT_WORK=$W2 $PY $P/prepare_pairs.py pairs
(cd ~/Project/RAG_TS/backend_rag && node $R/benchmarks/rag_eval/fetch_chunks.cjs $W2/chunks_req.json $W2/pair_chunks.json)
$PY $R/benchmarks/rag_eval/judge_relevance.py --pairs $W2/pairs.jsonl --chunks $W2/pair_chunks.json --out $W2/grades.jsonl --budget-usd 0.2
LAYA_FT_WORK=$W2 $PY $P/assemble.py

echo "== merge"
$PY - <<PYEOF
import collections, json
W1, W2 = "$W1", "$W2"
read = lambda p: [json.loads(l) for l in open(p)]
paper = lambda c: c.split("_sec")[0].split("_abs")[0]
for split in ("train", "dev"):
    rows = read(f"{W2}/r1_{split}.jsonl") + read(f"{W2}/{split}.jsonl")
    open(f"{W1}/{split}.jsonl", "w").write("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
    print(split, len(rows), dict(collections.Counter(r["kind"] for r in rows)), "true share", round(sum(r["expected"]["relevant"] for r in rows) / len(rows), 3))
src = {s: {paper(r["group"].split("|")[0]) for r in read(f"{W1}/{s}.jsonl")} for s in ("train", "dev")}
print("source papers shared by train and dev:", len(src["train"] & src["dev"]))
PYEOF
