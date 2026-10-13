import duckdb, os
conn = duckdb.connect()

for p in [
    'data/silver/cvf/cvpr2024.parquet',
    'data/silver/openreview/openreview_all.parquet',
    'data/silver/tier2/near_past_papers.parquet',
    'data/silver/tier1/landmark_papers.parquet'
]:
    if os.path.exists(p):
        cnt = conn.execute(f'SELECT count(*) FROM "{p}"').fetchone()[0]
        cols = [c[0] for c in conn.execute(f'DESCRIBE SELECT * FROM "{p}"').fetchall()]
        has_sections = "clean_full_text" in cols or "sections" in cols or "sections_json" in cols
        print(f'{p}: {cnt:,} rows | has_sections={has_sections} | sample cols: {cols[:5]}')
    else:
        print(f'{p}: NOT FOUND')
