"""Source adapters for the conference ingestion pipeline.

Strategies:
    openalex     -> primary API for all 4 venues (KDD/ICML/ICLR/NeurIPS)
    openreview   -> primary API for ICLR (extra coverage)
    html         -> fallback scrape (KDD, ICML, NeurIPS)

Modules:
    base                  # abstract BaseSourceAdapter
    openalex_adapter      # OpenAlex API (per venue)
    openreview_adapter    # OpenReview API (ICLR)
    html_base             # HTML scrape base class
    kdd_adapter           # KDD HTML fallback
    icml_adapter          # ICML HTML fallback (PMLR)
    neurips_adapter       # NeurIPS HTML fallback (papers.nips.cc)
"""
