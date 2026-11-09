#!/bin/zsh
# Whole data pipeline, resumable. From the repo root: zsh benchmarks/laya_finetune/build_data.sh
set -e
R=$PWD; P=$R/benchmarks/laya_finetune; W=$R/logs/benchmarks/laya_finetune
.venv/bin/python $P/generate_questions.py --chunks $W/chunks.json --out $W/questions.jsonl --budget-usd 0.32
.venv/bin/python $P/prepare_pairs.py retrieval
(cd ~/Project/RAG_TS/backend_rag && LAYA_MODEL_DIR= node $R/benchmarks/rag_eval/run_retrieval.cjs --set $W/retrieval_set.jsonl --out $W/retrieval.jsonl --authority 0 --bm25 $R/logs/benchmarks/laya_vs_best/bm25.sqlite)
.venv/bin/python $P/prepare_pairs.py pairs
(cd ~/Project/RAG_TS/backend_rag && node $R/benchmarks/rag_eval/fetch_chunks.cjs $W/chunks_req.json $W/pair_chunks.json)
.venv/bin/python $R/benchmarks/rag_eval/judge_relevance.py --pairs $W/pairs.jsonl --chunks $W/pair_chunks.json --out $W/grades.jsonl --budget-usd 0.5
.venv/bin/python $P/assemble.py
