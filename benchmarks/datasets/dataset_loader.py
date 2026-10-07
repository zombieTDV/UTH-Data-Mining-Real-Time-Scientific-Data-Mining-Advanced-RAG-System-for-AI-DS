"""
benchmarks/datasets/dataset_loader.py
-------------------------------------
Utility functions to load, filter, and inspect curated benchmark goldens.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from deepeval.dataset import Golden


DATASETS_DIR = Path(__file__).resolve().parent
GOLDENS_FILE = DATASETS_DIR / "rag_goldens.json"


def load_goldens(
    category: Optional[str] = None,
    limit: Optional[int] = None,
    filepath: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """Loads benchmark golden test cases from JSON file."""
    target_file = filepath or GOLDENS_FILE
    if not target_file.exists():
        raise FileNotFoundError(f"Golden dataset file not found: {target_file}")

    with open(target_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    if category:
        data = [item for item in data if item.get("category") == category]

    if limit and limit > 0:
        data = data[:limit]

    return data


def get_golden_by_id(golden_id: str) -> Optional[Dict[str, Any]]:
    """Finds a specific golden entry by ID."""
    goldens = load_goldens()
    for g in goldens:
        if g.get("id") == golden_id:
            return g
    return None


def to_deepeval_goldens(raw_goldens: List[Dict[str, Any]]) -> List[Golden]:
    """Converts raw dictionary goldens into DeepEval Golden dataclass instances."""
    deepeval_goldens = []
    for g in raw_goldens:
        deepeval_goldens.append(
            Golden(
                input=g["query"],
                expected_output=g.get("expected_output"),
                context=g.get("expected_context_keywords", []),
            )
        )
    return deepeval_goldens
