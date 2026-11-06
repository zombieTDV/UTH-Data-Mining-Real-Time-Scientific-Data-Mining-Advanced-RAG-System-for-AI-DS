"""Balanced, percent-overlap, sentence-snapped window splitting in AcademicChunker.split_words."""
import random

import pytest

from src.indexing.chunker import AcademicChunker


def _text(n_words: int, seed: int = 0) -> list:
    rnd = random.Random(seed)
    words = []
    while len(words) < n_words:
        sent = [f"w{len(words) + i}" for i in range(rnd.randint(8, 25))]
        sent[-1] += "."
        words += sent
    return words[:n_words]


def _overlap(a, b):
    for k in range(min(len(a), len(b)), 0, -1):
        if a[-k:] == b[:k]:
            return k
    return 0


@pytest.mark.unit
@pytest.mark.parametrize("n_words", [451, 470, 600, 900, 1333, 5000])
def test_windows_cover_fit_and_balance(n_words):
    ch = AcademicChunker(max_chunk_words=450)
    words = _text(n_words, seed=n_words)
    wins = ch.split_words(words)
    assert len(wins) >= 2
    assert all(len(w) <= 450 for w in wins)
    assert wins[0][0] == words[0] and wins[-1][-1] == words[-1]
    # every word covered, in order
    seen = []
    for w in wins:
        k = _overlap(seen, w) if seen else 0
        assert k >= ch.min_overlap_words or not seen
        seen += w[k:]
    assert seen == words
    # balanced: no tiny tail
    assert min(len(w) for w in wins) >= 0.4 * 450


@pytest.mark.unit
def test_no_near_duplicate_tail_for_just_over_limit():
    ch = AcademicChunker(max_chunk_words=450)
    wins = ch.split_words(_text(470))
    assert len(wins) == 2
    assert abs(len(wins[0]) - len(wins[1])) <= 60  # old fixed window gave 450 + a 70-word tail (50 of them duplicate)


@pytest.mark.unit
def test_overlap_is_percent_of_window():
    ch = AcademicChunker(max_chunk_words=450, overlap_ratio=0.15)
    wins = ch.split_words(_text(2000, seed=3))
    for a, b in zip(wins, wins[1:]):
        k = _overlap(a, b)
        assert ch.min_overlap_words <= k <= ch.max_overlap_words + 15  # +tolerance from sentence snapping


@pytest.mark.unit
def test_windows_start_at_sentence_boundaries():
    ch = AcademicChunker(max_chunk_words=450)
    words = _text(1500, seed=7)
    for w in ch.split_words(words)[1:]:
        i = words.index(w[0])
        assert words[i - 1].endswith(".")


@pytest.mark.unit
def test_short_section_untouched():
    ch = AcademicChunker(max_chunk_words=450)
    words = _text(300)
    assert ch.split_words(words) == [words]
