"""OpenAlex V2 namespace package - V1 still lives in src/ingestion/openalex.py.

The V2 subpackage is intentionally isolated so the running V1 collector
is not broken by shadowing the file with a directory of the same name.
"""

from src.ingestion.openalex_v2.scope import OpenAlexScope

__all__ = ["OpenAlexScope"]
