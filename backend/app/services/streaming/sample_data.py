from typing import List, Tuple

SamplePaper = Tuple[str, str, int, int]

SAMPLE_PAPERS: List[SamplePaper] = [
    ("Scalable State Space Models for Long-Context Mathematical Reasoning", "cs.AI", 24, 18),
    ("Direct Preference Alignment over Latent Diffusion Trajectories", "cs.LG", 18, 14),
    ("FlashAttention-3: Fast and Accurate Attention with FP8 Tensor Cores", "cs.CV", 32, 16),
    ("Gated Sparse Autoencoders for Interpretable Knowledge Representation", "cs.CL", 12, 12),
    ("Consistent Vector Quantization in High-Dimensional Manifolds", "stat.ML", 48, 15),
    ("Zero-Shot Mathematical Theorem Proving with Hybrid Tree Search", "cs.AI", 56, 20),
    ("Self-Distillation via Contrastive Gradient Descent", "cs.LG", 14, 12),
    ("Diffusion-Based Monocular Depth Estimation with Geometric Priors", "cs.CV", 22, 16),
    ("Retrieval-Augmented Diffusion for Scientific Literature Summarization", "cs.IR", 16, 14),
    ("Asynchronous Decentralized Optimization over Dynamic Communication Graphs", "stat.ML", 38, 18),
]


def get_sample_paper(index: int) -> SamplePaper:
    return SAMPLE_PAPERS[index % len(SAMPLE_PAPERS)]


def get_sample_count() -> int:
    return len(SAMPLE_PAPERS)
