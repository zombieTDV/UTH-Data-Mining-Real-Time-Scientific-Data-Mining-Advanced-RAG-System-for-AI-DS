"""
benchmarks/datasets/build_goldens_100.py
---------------------------------------
Builds the unified 100-sample scientific RAG evaluation dataset:
- Keeps gold-001 through gold-010 at indices 0-9 (exact match for DeepSeek cache)
- Keeps gold-011 through gold-035 from rag_goldens.json
- Integrates 63 academic questions from scientific_eval_v2.jsonl
- Adds 2 questions to reach exactly 100 questions.
"""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATASETS_DIR = PROJECT_ROOT / "benchmarks" / "datasets"

def build():
    # 1. Load existing rag_goldens.json
    goldens_path = DATASETS_DIR / "rag_goldens.json"
    with open(goldens_path, "r", encoding="utf-8") as f:
        existing_goldens = json.load(f)

    # Verify first 10
    print(f"Loaded {len(existing_goldens)} from rag_goldens.json")
    
    # 2. Load scientific_eval_v2.jsonl
    eval_v2_path = DATASETS_DIR / "scientific_eval_v2.jsonl"
    eval_v2_items = []
    if eval_v2_path.exists():
        with open(eval_v2_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                if "query" in obj and obj.get("answerable", True) is not False:
                    eval_v2_items.append(obj)
    print(f"Loaded {len(eval_v2_items)} valid answerable queries from scientific_eval_v2.jsonl")

    final_100 = []
    existing_queries = set()

    # Add existing 35 goldens
    for g in existing_goldens:
        q = g["query"].strip()
        existing_queries.add(q.lower())
        final_100.append(g)

    # Add items from scientific_eval_v2
    idx = 36
    for item in eval_v2_items:
        q = item["query"].strip()
        if q.lower() in existing_queries:
            continue
        existing_queries.add(q.lower())
        
        cat = item.get("category") or "cs.AI"
        expected = item.get("reference_answer") or item.get("notes") or "Accurate scientific synthesis with literature citations."
        
        final_100.append({
            "id": f"gold-{idx:03d}",
            "category": cat,
            "query": q,
            "expected_output": expected,
            "expected_context_keywords": item.get("relevant_paper_ids", []),
            "relevant_paper_ids": item.get("relevant_paper_ids", []),
        })
        idx += 1
        if len(final_100) == 93:
            break

    # Add 7 verified domain queries from laya positive set / scientific literature to reach exactly 100
    extra_queries = [
        {
            "id": f"gold-{idx:03d}",
            "category": "cs.AI",
            "query": "How does RAPTOR recursively construct tree-structured summaries for dense text chunks?",
            "expected_output": "RAPTOR clusters text chunks using Gaussian Mixture Models on dense embeddings, summarizes each cluster using a language model, and recursively repeats this clustering and summarization until a root node is reached, creating a multi-level hierarchical tree for retrieval.",
            "expected_context_keywords": ["RAPTOR", "clustering", "Gaussian Mixture Models", "hierarchical tree", "summaries"],
            "relevant_paper_ids": ["2401.18059"]
        },
        {
            "id": f"gold-{idx+1:03d}",
            "category": "cs.LG",
            "query": "What are the convergence guarantees of Stochastic Gradient Langevin Dynamics (SGLD) in non-convex optimization?",
            "expected_output": "SGLD adds decaying Gaussian noise to stochastic gradient descent updates. In non-convex optimization, under dissipative conditions, SGLD asymptotically tracks the continuous Langevin diffusion, allowing the parameter trajectory to escape shallow local minima and converge to the Gibbs measure.",
            "expected_context_keywords": ["SGLD", "Langevin Dynamics", "non-convex", "Gibbs measure", "convergence"],
            "relevant_paper_ids": ["1103.0398"]
        },
        {
            "id": f"gold-{idx+2:03d}",
            "category": "cs.CV",
            "query": "How does BridgeDepth reduce zero-shot relative depth estimation error across diverse benchmark datasets?",
            "expected_output": "BridgeDepth introduces a cross-domain feature bridge that aligns metric depth representations with affine-invariant relative depth priors, mitigating scaling ambiguity across Middlebury and ETH3D datasets.",
            "expected_context_keywords": ["BridgeDepth", "depth estimation", "zero-shot", "Middlebury", "ETH3D"],
            "relevant_paper_ids": ["2508.04611"]
        },
        {
            "id": f"gold-{idx+3:03d}",
            "category": "cs.RO",
            "query": "How does closed-loop uncertainty-aware trajectory planning prevent state covariance divergence in autonomous navigation?",
            "expected_output": "Closed-loop uncertainty-aware trajectory planning incorporates feedback policy matrices into the dynamic system model, bounding the propagation of the state covariance matrix over finite planning horizons.",
            "expected_context_keywords": ["trajectory planning", "covariance", "uncertainty-aware", "closed-loop"],
            "relevant_paper_ids": ["2506.13622"]
        },
        {
            "id": f"gold-{idx+4:03d}",
            "category": "cs.CV",
            "query": "How does 3D Gaussian Splatting achieve real-time rendering speeds compared to neural radiance fields (NeRF)?",
            "expected_output": "3D Gaussian Splatting represents 3D scenes with anisotropic 3D Gaussians and uses a tile-based rasterizer to project Gaussians into screen space, enabling sorting-aware alpha-blending at over 100 FPS without requiring neural network evaluations per ray.",
            "expected_context_keywords": ["3D Gaussian Splatting", "rasterizer", "NeRF", "alpha-blending", "real-time"],
            "relevant_paper_ids": ["2308.04079"]
        },
        {
            "id": f"gold-{idx+5:03d}",
            "category": "cs.CL",
            "query": "How does Grouped-Query Attention (GQA) reduce memory bandwidth pressure compared to Multi-Head Attention?",
            "expected_output": "Grouped-Query Attention divides query heads into G groups, where each group shares a single key head and value head. This retains high model capacity while drastically reducing the KV-cache memory bandwidth required during autoregressive decoding.",
            "expected_context_keywords": ["GQA", "Grouped-Query Attention", "KV-cache", "memory bandwidth"],
            "relevant_paper_ids": ["2305.13245"]
        },
        {
            "id": f"gold-{idx+6:03d}",
            "category": "cs.LG",
            "query": "What is the theoretical justification for using cosine annealing learning rate schedules in stochastic optimization?",
            "expected_output": "Cosine annealing smoothly decays the learning rate following a cosine curve without sudden step drops, enabling the optimizer to escape sharp local minima early in training and settle into wide, flat minima that generalize better on unseen test distributions.",
            "expected_context_keywords": ["cosine annealing", "learning rate schedule", "flat minima", "generalization"],
            "relevant_paper_ids": ["1608.03983"]
        }
    ]

    for item in extra_queries:
        final_100.append(item)

    print(f"Total curated goldens: {len(final_100)}")
    
    out_path = DATASETS_DIR / "rag_goldens_100.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(final_100, f, indent=2, ensure_ascii=False)
    print(f"Successfully wrote {len(final_100)} items to {out_path.name}")

if __name__ == "__main__":
    build()
