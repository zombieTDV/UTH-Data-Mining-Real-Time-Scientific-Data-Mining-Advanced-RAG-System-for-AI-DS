"""Rank metrics and paired statistics. Pure functions, so they can be tested without any service."""
import math
import numpy as np


def hit_at(ranked, relevant, k):
    return float(any(c in relevant for c in ranked[:k]))


def recall_at(ranked, relevant, k):
    return sum(c in relevant for c in ranked[:k]) / len(relevant) if relevant else 0.0


def precision_at(ranked, relevant, k):
    return sum(c in relevant for c in ranked[:k]) / k


def mrr_at(ranked, relevant, k):
    for i, c in enumerate(ranked[:k]):
        if c in relevant:
            return 1 / (i + 1)
    return 0.0


def ndcg_at(ranked, grades, k):
    """Graded nDCG with gain 2^grade - 1; `grades` maps chunk id to 0, 1 or 2."""
    dcg = sum((2 ** grades.get(c, 0) - 1) / math.log2(i + 2) for i, c in enumerate(ranked[:k]))
    best = sorted(grades.values(), reverse=True)[:k]
    idcg = sum((2 ** g - 1) / math.log2(i + 2) for i, g in enumerate(best))
    return dcg / idcg if idcg else 0.0


def bootstrap_ci(values, n=10000, seed=7):
    """Percentile 95% CI of the mean, resampling questions."""
    a = np.asarray(values, dtype=float)
    idx = np.random.default_rng(seed).integers(0, len(a), (n, len(a)))
    lo, hi = np.percentile(a[idx].mean(axis=1), [2.5, 97.5])
    return float(lo), float(hi)


def paired_permutation_p(a, b, n=20000, seed=7):
    """Two-sided sign-flip test on per-question differences."""
    d = np.asarray(a, dtype=float) - np.asarray(b, dtype=float)
    if not np.any(d):
        return 1.0
    signs = np.random.default_rng(seed).choice([-1.0, 1.0], (n, len(d)))
    return float((np.sum(np.abs((signs * d).mean(axis=1)) >= abs(d.mean()) - 1e-12) + 1) / (n + 1))


def auroc(pos, neg):
    """Probability that an answerable question outscores an unanswerable one."""
    p, n = np.asarray(pos, dtype=float), np.asarray(neg, dtype=float)
    return float(((p[:, None] > n[None, :]).sum() + 0.5 * (p[:, None] == n[None, :]).sum()) / (len(p) * len(n)))
