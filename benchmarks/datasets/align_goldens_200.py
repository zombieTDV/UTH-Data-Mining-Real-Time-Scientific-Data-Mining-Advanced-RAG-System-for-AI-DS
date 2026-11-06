"""
benchmarks/datasets/align_goldens_200.py
---------------------------------------
Replaces the unindexed queries in rag_goldens_200.json (in Batch 101-120 and sample 150)
with verified landmark AI/LLM papers that 100% exist in Qdrant.
"""

import json
from pathlib import Path

DATASET_PATH = Path("benchmarks/datasets/rag_goldens_200.json")

REPLACEMENTS = {
    "gold-102": {
        "id": "gold-102",
        "category": "cs.LG",
        "query": "How does DeepSeek-V3 implement auxiliary-loss-free load balancing across Mixture-of-Experts (MoE) routers?",
        "expected_output": "DeepSeek-V3 introduces an auxiliary-loss-free load balancing strategy by adding dynamic bias terms to affinity scores, avoiding performance degradation from traditional auxiliary loss constraints while keeping expert workloads balanced.",
        "expected_context_keywords": ["DeepSeek-V3", "auxiliary-loss-free", "load balancing", "MoE router", "expert affinity"],
        "relevant_paper_ids": ["2412.19437"],
    },
    "gold-109": {
        "id": "gold-109",
        "category": "cs.LG",
        "query": "How does FlashAttention-2 improve parallelism and FLOP throughput over the original FlashAttention?",
        "expected_output": "FlashAttention-2 improves throughput by parallelizing across the sequence length dimension in the forward pass and reducing non-matmul floating point operations, achieving up to 73% of theoretical peak FLOPs.",
        "expected_context_keywords": ["FlashAttention-2", "parallelism", "sequence length", "forward pass", "FLOP throughput"],
        "relevant_paper_ids": ["2307.08691"],
    },
    "gold-110": {
        "id": "gold-110",
        "category": "cs.LG",
        "query": "What work partitioning scheme does FlashAttention-2 employ within each thread block to minimize shared memory communication?",
        "expected_output": "FlashAttention-2 partitions the Q and K/V blocks across warps so that each warp computes attention for a slice of the query without requiring inter-warp communication through shared memory.",
        "expected_context_keywords": ["FlashAttention-2", "thread block", "warps", "shared memory", "work partitioning"],
        "relevant_paper_ids": ["2307.08691"],
    },
    "gold-113": {
        "id": "gold-113",
        "category": "cs.CL",
        "query": "How does Mistral 7B utilize Sliding Window Attention (SWA) to handle long sequence inference efficiently?",
        "expected_output": "Mistral 7B employs Sliding Window Attention with a window size of 4,096 tokens, allowing hidden states to theoretically access context up to 131k tokens across multiple layers while keeping KV cache memory bounded.",
        "expected_context_keywords": ["Mistral 7B", "Sliding Window Attention", "SWA", "KV cache", "rolling buffer"],
        "relevant_paper_ids": ["2310.06825"],
    },
    "gold-114": {
        "id": "gold-114",
        "category": "cs.CL",
        "query": "What rolling buffer cache mechanism does Mistral 7B introduce to limit cache memory footprint during autoregressive generation?",
        "expected_output": "Mistral 7B uses a rolling buffer cache of fixed size W that overwrites past keys and values modulo W at each timestep, maintaining constant memory overhead regardless of sequence length.",
        "expected_context_keywords": ["Mistral 7B", "rolling buffer cache", "fixed size", "modulo", "memory footprint"],
        "relevant_paper_ids": ["2310.06825"],
    },
    "gold-116": {
        "id": "gold-116",
        "category": "cs.LG",
        "query": "How does Low-Rank Adaptation (LoRA) freeze pre-trained model weights while parameterizing weight updates with low-rank matrices?",
        "expected_output": "LoRA freezes pre-trained weight matrices W0 and decomposes the weight update into two low-rank matrices B and A such that Delta W = B * A, drastically reducing the number of trainable parameters.",
        "expected_context_keywords": ["LoRA", "low-rank", "rank r", "trainable parameters", "weight decomposition"],
        "relevant_paper_ids": ["2106.09685"],
    },
    "gold-117": {
        "id": "gold-117",
        "category": "cs.LG",
        "query": "Why does LoRA introduce zero additional inference latency when deployed in production?",
        "expected_output": "LoRA introduces zero inference latency because the trained low-rank matrices B * A can be explicitly folded directly into the original weight matrix W = W0 + B * A upon deployment without architectural modification.",
        "expected_context_keywords": ["LoRA", "inference latency", "weight folding", "deployment", "zero latency"],
        "relevant_paper_ids": ["2106.09685"],
    },
    "gold-118": {
        "id": "gold-118",
        "category": "cs.AI",
        "query": "How does the Tree of Thoughts (ToT) framework generalize chain-of-thought prompting for deliberate problem solving?",
        "expected_output": "Tree of Thoughts generalizes chain-of-thought by structuring problem solving as a search over a tree of intermediate thoughts, allowing language models to explore multiple reasoning paths and evaluate choices using search algorithms like BFS or DFS.",
        "expected_context_keywords": ["Tree of Thoughts", "ToT", "tree search", "BFS", "DFS", "deliberate reasoning"],
        "relevant_paper_ids": ["2305.10601"],
    },
    "gold-119": {
        "id": "gold-119",
        "category": "cs.AI",
        "query": "How does Tree of Thoughts allow a language model to self-evaluate thought candidates and backtrack when encountering dead ends?",
        "expected_output": "Tree of Thoughts prompts the model to self-evaluate candidate thoughts using deliberate heuristic scores, enabling search algorithms to prune unpromising branches and backtrack to find optimal solutions.",
        "expected_context_keywords": ["Tree of Thoughts", "self-evaluate", "backtracking", "pruning", "heuristic"],
        "relevant_paper_ids": ["2305.10601"],
    },
    "gold-120": {
        "id": "gold-120",
        "category": "cs.AI",
        "query": "How does ReAct combine reasoning traces and task-specific actions to improve language model performance on interactive tasks?",
        "expected_output": "ReAct interleaves reasoning thoughts ('Thought') with domain-specific actions ('Action') and external environment observations ('Observation'), allowing language models to dynamically adjust reasoning based on feedback.",
        "expected_context_keywords": ["ReAct", "reasoning traces", "actions", "observations", "interleaving"],
        "relevant_paper_ids": ["2210.03629"],
    },
    "gold-150": {
        "id": "gold-150",
        "category": "cs.CL",
        "query": "What is the core difference between the RAG-Sequence and RAG-Token models in retrieval-augmented generation?",
        "expected_output": "RAG-Sequence uses the same retrieved document to generate the complete target sequence, whereas RAG-Token can draw on different retrieved documents for each generated token.",
        "expected_context_keywords": ["RAG-Sequence", "RAG-Token", "retrieval-augmented generation", "document retrieval", "generation"],
        "relevant_paper_ids": ["2005.11401"],
    },
}

def main():
    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        goldens = json.load(f)

    updated_count = 0
    for idx, item in enumerate(goldens):
        gid = item.get("id")
        if gid in REPLACEMENTS:
            goldens[idx] = REPLACEMENTS[gid]
            updated_count += 1
            print(f"Updated {gid} -> {REPLACEMENTS[gid]['query'][:60]}... (Paper: {REPLACEMENTS[gid]['relevant_paper_ids']})")

    with open(DATASET_PATH, "w", encoding="utf-8") as f:
        json.dump(goldens, f, indent=2, ensure_ascii=False)

    print(f"\nSuccessfully updated {updated_count} questions in {DATASET_PATH.name}!")

if __name__ == "__main__":
    main()
