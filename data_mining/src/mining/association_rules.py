"""
data_mining/src/mining/association_rules.py
-------------------------------------------
Pillar 1: Frequent Pattern & Association Rule Mining Pipeline (FP-Growth).
Discovers non-trivial co-occurrence patterns across scientific categories
and domain concepts extracted from academic papers.

Adheres strictly to docs/agents/rules/LOGGING_CHECKPOINT_RULES.md:
- Strictly NO emojis/icons.
- Timestamped plain-text logs: [INFO], [SUCCESS], [WARNING], [ERROR].
"""

import os
import re
import json
import logging
from typing import Dict, Any, List
import pandas as pd
import duckdb
from mlxtend.preprocessing import TransactionEncoder
from mlxtend.frequent_patterns import fpgrowth, association_rules

logger = logging.getLogger("association_rules")

# Canonical AI/DS vocabulary keywords for transaction extraction from paper titles and abstracts
KEYWORD_VOCAB = [
    ("diffusion", "diffusion-models"),
    ("transformer", "transformer"),
    ("attention", "attention-mech"),
    ("llm", "large-language-models"),
    ("language model", "large-language-models"),
    ("reinforcement learning", "reinforcement-learning"),
    ("rl", "reinforcement-learning"),
    ("graph neural", "graph-neural-networks"),
    ("gnn", "graph-neural-networks"),
    ("vision-language", "vision-language"),
    ("multimodal", "multimodal-ai"),
    ("distillation", "knowledge-distillation"),
    ("quantization", "model-quantization"),
    ("self-supervised", "self-supervised-learning"),
    ("federated", "federated-learning"),
    ("rag", "retrieval-augmented-gen"),
    ("retrieval", "retrieval-systems"),
    ("alignment", "ai-alignment"),
    ("safety", "ai-safety"),
    ("continual learning", "continual-learning"),
    ("zero-shot", "zero-shot-learning"),
    ("few-shot", "few-shot-learning"),
    ("agent", "autonomous-agents"),
    ("benchmark", "evaluation-benchmarks"),
    ("optimization", "convex-optimization"),
]


class AssociationRuleMiner:
    """Mines frequent itemsets and high-lift association rules using FP-Growth."""

    def __init__(self, parquet_path: str):
        self.parquet_path = parquet_path

    def _extract_transactions(self) -> List[List[str]]:
        """Constructs market-basket transactions per paper (categories, topics, concepts)."""
        logger.info("[PILLAR 1] Loading papers for basket encoding from: %s", self.parquet_path)
        con = duckdb.connect()

        # Discover available schema columns
        cols_df = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{self.parquet_path}')").fetchdf()
        available_cols = set(cols_df["column_name"].tolist())

        select_cols = ["paper_id", "title"]
        if "abstract" in available_cols:
            select_cols.append("abstract")
        if "categories" in available_cols:
            select_cols.append("categories")
        if "primary_category" in available_cols:
            select_cols.append("primary_category")
        if "topics" in available_cols:
            select_cols.append("topics")
        if "keywords" in available_cols:
            select_cols.append("keywords")

        cols_clause = ", ".join(select_cols)
        df = con.execute(f"SELECT {cols_clause} FROM read_parquet('{self.parquet_path}')").fetchdf()

        transactions: List[List[str]] = []
        for _, row in df.iterrows():
            basket = set()

            # 1. Add arXiv categories (handle numpy.ndarray, list, tuple)
            raw_cats = row.get("categories")
            if raw_cats is not None and hasattr(raw_cats, "__iter__") and not isinstance(raw_cats, str):
                for c in raw_cats:
                    c_str = str(c).strip()
                    if c_str:
                        basket.add(f"cat:{c_str}")
            elif row.get("primary_category"):
                basket.add(f"cat:{str(row['primary_category']).strip()}")

            # 2. Add OpenAlex topics and keywords if present
            raw_topics = row.get("topics")
            if raw_topics is not None and hasattr(raw_topics, "__iter__") and not isinstance(raw_topics, str):
                for t in raw_topics:
                    t_str = str(t).strip()
                    if t_str:
                        basket.add(f"topic:{t_str}")

            raw_kws = row.get("keywords")
            if raw_kws is not None and hasattr(raw_kws, "__iter__") and not isinstance(raw_kws, str):
                for kw in raw_kws:
                    kw_str = str(kw).strip().lower()
                    if kw_str:
                        basket.add(f"kw:{kw_str}")

            # 3. Extract recognized scientific concepts from title + abstract
            text_corpus = (str(row.get("title", "")) + " " + str(row.get("abstract", ""))).lower()
            for pattern, tag in KEYWORD_VOCAB:
                if re.search(r"\b" + re.escape(pattern) + r"\b", text_corpus):
                    basket.add(f"tag:{tag}")

            if len(basket) >= 2:
                transactions.append(list(basket))

        logger.info(
            "[PILLAR 1] Extracted %d multi-item transactions from %d papers (coverage: %.1f%%).",
            len(transactions),
            len(df),
            (len(transactions) * 100.0 / max(1, len(df))),
        )
        return transactions

    def mine_rules(
        self,
        min_support: float = 0.02,
        min_lift: float = 1.2,
        top_k: int = 50,
        min_abs_transactions: int = 25,
    ) -> Dict[str, Any]:
        """Executes FP-Growth algorithm, deduplicates symmetric rules, and filters by support/lift."""
        transactions = self._extract_transactions()
        if not transactions:
            logger.warning("[PILLAR 1] [WARNING] No transactions found. Returning empty rules.")
            return {"frequent_itemsets": [], "rules": [], "summary": {}}

        # 1. One-hot encode variable-length transactions
        logger.info("[PILLAR 1] Encoding transaction matrix via TransactionEncoder...")
        te = TransactionEncoder()
        te_ary = te.fit_transform(transactions)
        df_encoded = pd.DataFrame(te_ary, columns=te.columns_)

        # 2. Discover frequent itemsets via FP-Growth
        logger.info("[PILLAR 1] Running FP-Growth with min_support=%.4f...", min_support)
        frequent_itemsets = fpgrowth(df_encoded, min_support=min_support, use_colnames=True)
        logger.info("[PILLAR 1] Found %d frequent itemsets.", len(frequent_itemsets))

        if frequent_itemsets.empty:
            logger.warning("[PILLAR 1] No itemsets met min_support=%.4f, trying fallback min_support=0.01", min_support)
            min_support = 0.01
            frequent_itemsets = fpgrowth(df_encoded, min_support=min_support, use_colnames=True)

        if frequent_itemsets.empty:
            return {"frequent_itemsets": [], "rules": [], "summary": {}}

        # 3. Generate rules by Lift
        logger.info("[PILLAR 1] Generating association rules with min_lift=%.2f...", min_lift)
        rules = association_rules(frequent_itemsets, metric="lift", min_threshold=min_lift)

        if rules.empty:
            logger.warning("[PILLAR 1] No rules met min_lift threshold. Falling back to lift=1.0.")
            rules = association_rules(frequent_itemsets, metric="lift", min_threshold=1.0)

        # 4. Filter by minimum absolute transaction count
        total_tx = len(transactions)
        if "support" in rules.columns:
            rules = rules[rules["support"] * total_tx >= min_abs_transactions]

        # 5. Sort by Lift and Confidence
        sorted_rules = rules.sort_values(by=["lift", "confidence"], ascending=[False, False])

        # 6. Deduplicate symmetric rules (A -> B vs B -> A: keep the higher confidence one)
        deduped_rows = []
        seen_pairs = set()
        for _, row in sorted_rules.iterrows():
            ant = tuple(sorted(list(row["antecedents"])))
            con = tuple(sorted(list(row["consequents"])))
            pair_key = frozenset([ant, con])
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)
            deduped_rows.append(row)

        top_rules = pd.DataFrame(deduped_rows).head(top_k) if deduped_rows else pd.DataFrame()

        # Format output for JSON serialization and Frontend consumption
        formatted_itemsets = []
        for _, row in frequent_itemsets.sort_values(by="support", ascending=False).head(40).iterrows():
            formatted_itemsets.append({
                "itemset": list(row["itemsets"]),
                "support": round(float(row["support"]), 4),
            })

        formatted_rules = []
        if not top_rules.empty:
            for _, row in top_rules.iterrows():
                formatted_rules.append({
                    "antecedents": list(row["antecedents"]),
                    "consequents": list(row["consequents"]),
                    "support": round(float(row["support"]), 4),
                    "confidence": round(float(row["confidence"]), 4),
                    "lift": round(float(row["lift"]), 4),
                    "leverage": round(float(row["leverage"]), 4),
                    "conviction": (
                        round(float(row["conviction"]), 4)
                        if row["conviction"] != float("inf")
                        else 999.0
                    ),
                })

        result = {
            "summary": {
                "total_transactions": len(transactions),
                "total_unique_items": len(te.columns_),
                "frequent_itemsets_count": len(frequent_itemsets),
                "mined_rules_count": len(formatted_rules),
                "min_support_used": min_support,
                "min_lift_threshold": min_lift,
            },
            "frequent_itemsets": formatted_itemsets,
            "rules": formatted_rules,
        }

        logger.info(
            "[PILLAR 1] [SUCCESS] Mined %d deduplicated association rules (top lift: %.3f).",
            len(formatted_rules),
            formatted_rules[0]["lift"] if formatted_rules else 0.0,
        )
        return result

    def save_rules(self, output_path: str, min_support: float = 0.02, min_lift: float = 1.2) -> None:
        """Runs association rule mining and writes formatted JSON to disk."""
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        results = self.mine_rules(min_support=min_support, min_lift=min_lift)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        logger.info("[PILLAR 1] [SUCCESS] Saved rules to: %s", output_path)
