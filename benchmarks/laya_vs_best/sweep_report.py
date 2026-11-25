"""Ranks the sweep output. Questions whose gold chunk is not in the corpus cannot be hit, so hit@k counts only the rest."""
import json, sys
rows = json.load(open(sys.argv[1]))
ever = set()
for r in rows:
    ever |= {x["id"] for x in r["ranks"] if x["rank"]}
print("configs", len(rows), "questions", len(rows[0]["ranks"]), "ever hit", len(ever))
out = []
for r in rows:
    R = r["ranks"]; n = len(R)
    h = lambda k: sum(1 for x in R if x["rank"] and x["rank"] <= k)
    mrr = sum(1 / x["rank"] for x in R if x["rank"]) / n
    p = sum(1 for x in R if x["paperRank"])
    out.append((h(5), round(mrr, 4), h(1), h(3), p, r["nprobe"], r["authority"], r["expand"]))
print("hit5 mrr5 hit1 hit3 paperHit5 nprobe authority expand")
for o in sorted(out, reverse=True):
    print(*o)
