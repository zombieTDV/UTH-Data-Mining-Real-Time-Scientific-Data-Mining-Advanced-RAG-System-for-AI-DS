#!/bin/zsh
# Ranks the frozen test set under each retrieval configuration, one at a time. Resumable.
#   zsh benchmarks/rag_eval/run_modes.sh   (from the repo root)
set -e
REPO=$PWD; B=$REPO/benchmarks/rag_eval; L=$REPO/logs/benchmarks/rag_eval; SET=$B/data/test_set_v1.jsonl
BM25=$REPO/logs/benchmarks/laya_vs_best/bm25.sqlite
LAYA_FT_DIR=${LAYA_FT_DIR:-$HOME/Project/RAG_TS/model/laya_ft_seed0}
cd ~/Project/RAG_TS/backend_rag
LAYA_MODEL_DIR= node $B/run_retrieval.cjs --set $SET --out $L/rank_vector.jsonl --authority 0
LAYA_MODEL_DIR= node $B/run_retrieval.cjs --set $SET --out $L/rank_hybrid.jsonl --authority 0 --bm25 $BM25
node $B/run_retrieval.cjs --set $SET --out $L/rank_laya.jsonl --authority 0
node $B/run_retrieval.cjs --set $SET --out $L/rank_laya_hybrid.jsonl --authority 0 --bm25 $BM25
node $B/run_retrieval.cjs --set $SET --out $L/rank_prod.jsonl --authority 1
# Fine-tuned Laya (Colab, seed 0). Installed beside production, never over model/laya.
if [ -d "$LAYA_FT_DIR" ]; then
  LAYA_MODEL_DIR=$LAYA_FT_DIR node $B/run_retrieval.cjs --set $SET --out $L/rank_laya_ft.jsonl --authority 0
  LAYA_MODEL_DIR=$LAYA_FT_DIR node $B/run_retrieval.cjs --set $SET --out $L/rank_laya_ft_hybrid.jsonl --authority 0 --bm25 $BM25
fi
# Round 2: 1 epoch full fine-tune on the larger data.
LAYA_FT1_DIR=${LAYA_FT1_DIR:-$HOME/Project/RAG_TS/model/laya_ft_20261108-2053_seed0}
if [ -d "$LAYA_FT1_DIR" ]; then
  LAYA_MODEL_DIR=$LAYA_FT1_DIR node $B/run_retrieval.cjs --set $SET --out $L/rank_laya_ft1.jsonl --authority 0
  LAYA_MODEL_DIR=$LAYA_FT1_DIR node $B/run_retrieval.cjs --set $SET --out $L/rank_laya_ft1_hybrid.jsonl --authority 0 --bm25 $BM25
fi
