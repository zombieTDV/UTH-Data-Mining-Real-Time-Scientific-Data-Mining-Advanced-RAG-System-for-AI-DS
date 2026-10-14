import duckdb, os
from pathlib import Path
conn = duckdb.connect()

pids_by_source = {
    'arxiv': set(),
    'doi': set(),
    'cvf': set(),
    'openreview': set(),
    'zenodo': set(),
}

# 1. Tier 1 landmarks (3,000 papers: cvf, arxiv, openreview)
t1 = 'data/silver/tier1/landmark_papers.parquet'
if os.path.exists(t1):
    res = conn.execute(f'SELECT paper_id, source FROM "{t1}"').fetchall()
    for pid, s in res:
        s = str(s).lower()
        if s in pids_by_source:
            pids_by_source[s].add(str(pid))
        else:
            pids_by_source.setdefault(s, set()).add(str(pid))

# 2. Tier 2 harvest (fulltext_papers*.parquet)
t2_files = list(Path('data/silver/tier2').glob('fulltext_papers*.parquet'))
if t2_files:
    posix_files = [f.as_posix() for f in t2_files]
    res = conn.execute(f'SELECT paper_id, source FROM read_parquet({posix_files})').fetchall()
    for pid, s in res:
        s = str(s).lower()
        if s in pids_by_source:
            pids_by_source[s].add(str(pid))
        else:
            pids_by_source.setdefault(s, set()).add(str(pid))

# 3. Deep Chunks (Nature, IEEE, Springer, PLOS) -> DOI
chk = 'data/silver/chunks.parquet'
if os.path.exists(chk):
    res = conn.execute(f'SELECT DISTINCT paper_id FROM "{chk}"').fetchall()
    for (pid,) in res:
        pids_by_source['doi'].add(str(pid))

print("=== REAL FULLTEXT PAPERS BY SOURCE ===")
all_pids = set()
for s, pids in pids_by_source.items():
    print(f"  • {s.upper()}: {len(pids):,} papers")
    all_pids.update(pids)

print(f"\nTOTAL DEDUPLICATED GENUINE FULLTEXT PAPERS: {len(all_pids):,}")
