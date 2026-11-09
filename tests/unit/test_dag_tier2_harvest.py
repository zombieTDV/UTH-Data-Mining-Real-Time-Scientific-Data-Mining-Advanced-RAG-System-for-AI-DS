import sys
from pathlib import Path
from collections import Counter
from datetime import date
from unittest.mock import MagicMock, patch
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DAGS_DIR = PROJECT_ROOT / "dags"
if str(DAGS_DIR) not in sys.path:
    sys.path.insert(0, str(DAGS_DIR))

# Mock airflow modules if not installed in local virtual environment
for mod in ["airflow", "airflow.models", "airflow.operators.python", "airflow.timetables.trigger"]:
    if mod not in sys.modules:
        sys.modules[mod] = MagicMock()

from dags.dag_tier2_near_past_harvest import (
    FLOOR,
    GROUPS,
    Harvest,
    _clean,
    _fill_level,
    _group_of,
    _withdrawn,
)


# ==============================================================================
# Helper Functions Tests
# ==============================================================================

@pytest.mark.unit
def test_clean_html_entities_and_whitespace():
    raw = "  Deep &amp; Fast   Learning&#39;s New Frontier \n\t  "
    cleaned = _clean(raw)
    assert cleaned == "Deep & Fast Learning's New Frontier"


@pytest.mark.unit
def test_withdrawn_paper_detection():
    assert _withdrawn(abstract="This paper has been withdrawn by authors.", comment="") is True
    assert _withdrawn(abstract="Abstract text.", comment="Paper withdrawn due to error in Theorem 2") is True
    assert _withdrawn(abstract="Novel diffusion architecture.", comment="Accepted at NeurIPS 2024") is False


@pytest.mark.unit
def test_group_of_mapping():
    assert _group_of(["cs.CV", "cs.AI"]) == "CV"
    assert _group_of(["cs.CL"]) == "NLP"
    assert _group_of(["stat.ML", "cs.LG"]) == "ML"
    assert _group_of(["cs.AI"]) == "AI"
    assert _group_of(["cs.RO"]) == "Robotics"
    assert _group_of(["cs.IR"]) == "IR"
    assert _group_of(["cs.SD"]) == "Speech"
    assert _group_of(["physics.flu-dyn"]) is None


# ==============================================================================
# Water-Filling Algorithm Tests
# ==============================================================================

@pytest.mark.unit
def test_fill_level_exact_leveling():
    # A=10, B=20, C=30. Room = 30.
    # Emptiest A is filled to 20 (cost 10). A=20, B=20. Remaining room = 20.
    # A and B are filled to 30 (cost 10 + 10 = 20). Remaining room = 0.
    # Level reaches exactly 30.
    counts = {"A": 10, "B": 20, "C": 30}
    assert _fill_level(counts, room=30) == 30


@pytest.mark.unit
def test_fill_level_partial_step():
    # A=5, B=15. Room = 6.
    # A fills towards 15. With room=6, A reaches 5 + 6 = 11.
    counts = {"A": 5, "B": 15}
    assert _fill_level(counts, room=6) == 11


@pytest.mark.unit
def test_fill_level_zero_room():
    counts = {"A": 10, "B": 20}
    assert _fill_level(counts, room=0) == 10


# ==============================================================================
# Commit 5702e469: Harvest Bookkeeping & Topic Mix Invariants
# ==============================================================================

@pytest.fixture
def mock_harvest_dependencies():
    with patch("dags.dag_tier2_near_past_harvest.known_paper_ids", return_value={"known_001"}), \
         patch("dags.dag_tier2_near_past_harvest.budget_papers_left", return_value=100), \
         patch("dags.dag_tier2_near_past_harvest._tier2_mix", return_value=(
             Counter({"CV": 50, "NLP": 10, "ML": 20, "AI": 20, "Robotics": 5, "IR": 5, "Speech": 5}),
             Counter({"arxiv": 100, "cvf": 15})
         )), \
         patch("dags.dag_tier2_near_past_harvest.emit"), \
         patch("dags.dag_tier2_near_past_harvest.wait_for_queue_room"), \
         patch("dags.dag_tier2_near_past_harvest.publish_paper", return_value=True):
        yield


@pytest.mark.unit
def test_harvest_initialization_and_level_calculation(mock_harvest_dependencies):
    h = Harvest("Test Run", sources=["arxiv", "cvf"], max_papers=50)
    assert h.room == 50
    assert not h.full
    assert h.level["group"] >= 5
    assert h.level["source"] >= 15


@pytest.mark.unit
def test_harvest_publish_deduplication(mock_harvest_dependencies):
    h = Harvest("Test Run", sources=["arxiv"], max_papers=10)
    paper = {
        "paper_id": "known_001",
        "title": "Already Collected Paper",
        "abstract": "Abstract",
        "source": "arxiv",
    }
    published = h.publish(paper, group="CV")
    assert published is True
    assert h.skipped == 1
    assert h.queued == 0


@pytest.mark.unit
def test_harvest_publish_budget_exhaustion(mock_harvest_dependencies):
    h = Harvest("Test Run", sources=["arxiv"], max_papers=2)
    p1 = {"paper_id": "new_1", "abstract": "Abs 1", "source": "arxiv"}
    p2 = {"paper_id": "new_2", "abstract": "Abs 2", "source": "arxiv"}
    p3 = {"paper_id": "new_3", "abstract": "Abs 3", "source": "arxiv"}

    # Mock high left capacity so over_mix doesn't block
    h.left = MagicMock(return_value=10)

    assert h.publish(p1, group="NLP") is True
    assert h.publish(p2, group="NLP") is True
    assert h.full is True

    # Third paper must be rejected due to full budget
    assert h.publish(p3, group="NLP") is False
    assert h.queued == 2
