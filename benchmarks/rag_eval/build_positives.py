"""Compiles authored positives into positives.jsonl and refuses anything it cannot verify in the corpus chunk."""
import collections, json, re, sys
from pathlib import Path
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from authored_positives import POSITIVES

STOP = set("a an and are as at be by can did do does for from has have how in is it its of on or that the to was were what when where which who why will with this these those than into over under between during their there about both each not no yes only all any but they then while".split())
tok = lambda s: {w for w in re.findall(r"[a-z0-9][a-z0-9\-\.]*[a-z0-9]|[a-z0-9]", s.lower()) if w not in STOP}
norm = lambda s: re.sub(r"\s+", " ", s).strip().lower()
cands = json.load(open(HERE / "data/candidates.json"))["candidates"]
rows, errors, seen = [], [], set()
for i, (idx, kind, q, answer, claims, quote, anchor) in enumerate(POSITIVES):
    c = cands[idx]
    if idx in seen: errors.append(f"#{idx}: chunk used twice")
    seen.add(idx)
    if norm(quote) not in norm(c["text"]): errors.append(f"#{idx}: quote not in chunk: {quote[:70]}")
    if anchor and norm(anchor) not in norm(q): errors.append(f"#{idx}: anchor missing from question: {anchor}")
    if anchor and norm(anchor) not in norm((c["title"] or "") + " " + c["text"]): errors.append(f"#{idx}: anchor not in the paper chunk: {anchor}")
    if kind == "topical" and anchor: errors.append(f"#{idx}: topical must not have an anchor")
    if kind != "topical" and not anchor: errors.append(f"#{idx}: {kind} needs an anchor")
    Q, T = tok(q), tok(c["text"])
    rows.append(dict(id=f"pos-{i:03d}", kind="positive", query_type=kind, question=q, reference=answer, key_claims=claims, gold_chunk=c["chunk_id"], gold_paper=c["paper_id"], quote=quote, anchor=anchor, paper_meta=c["meta"], section=c["section"], year=c["year"], category=c["category"], lexical_overlap=round(len(Q & T) / len(Q), 2)))
count = lambda k: dict(collections.Counter(r[k] for r in rows))
print(len(rows), count("query_type"), count("paper_meta"), count("section"))
by = collections.defaultdict(list)
for r in rows: by[r["query_type"]].append(r["lexical_overlap"])
print({k: round(sum(v) / len(v), 2) for k, v in by.items()})
print(*errors, sep="\n")
if errors or len(rows) != 100: sys.exit(f"{len(errors)} errors, {len(rows)} rows")
(HERE / "data/positives.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
