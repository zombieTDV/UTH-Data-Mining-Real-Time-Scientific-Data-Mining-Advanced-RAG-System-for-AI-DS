"""Run: .venv/bin/python -m pytest benchmarks/rag_eval/test_metrics.py"""
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from metrics import auroc, bootstrap_ci, hit_at, mrr_at, ndcg_at, paired_permutation_p, precision_at, recall_at

R = ["a", "b", "c", "d"]


def test_hit_and_recall_respect_the_cutoff():
    assert hit_at(R, {"c"}, 2) == 0 and hit_at(R, {"c"}, 3) == 1
    assert recall_at(R, {"a", "d"}, 2) == 0.5 and recall_at(R, {"a", "d"}, 4) == 1


def test_recall_with_no_known_relevant_is_zero():
    assert recall_at(R, set(), 5) == 0


def test_precision_divides_by_k_not_by_list_length():
    assert precision_at(["a"], {"a"}, 5) == 0.2


def test_mrr_uses_first_relevant_only():
    assert mrr_at(R, {"b", "c"}, 4) == 0.5 and mrr_at(R, {"z"}, 4) == 0


def test_ndcg_is_one_for_ideal_order_and_lower_when_swapped():
    grades = {"a": 2, "b": 1}
    assert ndcg_at(["a", "b"], grades, 2) == pytest.approx(1)
    swapped = (1 + 3 / math.log2(3)) / (3 + 1 / math.log2(3))
    assert ndcg_at(["b", "a"], grades, 2) == pytest.approx(swapped)


def test_ndcg_counts_judged_relevant_chunks_outside_the_ranking_in_the_ideal():
    assert ndcg_at(["x"], {"a": 2}, 5) == 0


def test_bootstrap_ci_contains_the_mean():
    lo, hi = bootstrap_ci([0, 1] * 50)
    assert lo < 0.5 < hi


def test_permutation_identical_is_one_and_clear_gap_is_small():
    assert paired_permutation_p([1, 0], [1, 0]) == 1
    assert paired_permutation_p([1] * 30, [0] * 30) < 0.001


def test_auroc_extremes_and_ties():
    assert auroc([2, 3], [0, 1]) == 1 and auroc([0], [1]) == 0 and auroc([1], [1]) == 0.5
