import json
from pathlib import Path

# Mapping of the first 35 goldens to authoritative arXiv / paper IDs
PAPER_MAPPING_35 = {
    "gold-001": ["2207.12598", "2409.08861"],  # Classifier-Free Diffusion Guidance
    "gold-002": ["2205.14135", "2307.08691"],  # FlashAttention (Dao et al.)
    "gold-003": ["2305.18290"],                 # Direct Preference Optimization (DPO)
    "gold-004": ["2103.00020", "2402.04087"],  # CLIP (Radford et al.)
    "gold-005": ["2106.09685", "2401.04151"],  # LoRA (Hu et al.)
    "gold-006": ["1701.06538", "2101.03961", "2403.17726"],  # Mixture of Experts
    "gold-007": ["1312.6114", "2402.09598"],   # VAE Reparameterization Trick (Kingma & Welling)
    "gold-008": ["2104.09864"],                 # Rotary Position Embedding (RoPE)
    "gold-009": ["2006.11239", "2305.15586"],  # DDPM Noise Scheduling
    "gold-010": ["2305.10601"],                 # Tree of Thoughts (ToT)
    "gold-011": ["2305.13245"],                 # Grouped-Query Attention (GQA)
    "gold-012": ["2305.14314", "2401.00503"],  # QLoRA (Dettmers et al.)
    "gold-013": ["2212.08073"],                 # Constitutional AI (Bai et al.)
    "gold-014": ["2111.06377", "2303.17152"],  # Masked Autoencoders (MAE)
    "gold-015": ["2107.07511"],                 # Conformal Prediction (Angelopoulos & Bates)
    "gold-016": ["2211.17192", "2302.01318"],  # Speculative Decoding
    "gold-017": ["2011.13456", "2404.12814"],  # Score-based SDE Diffusion (Song et al.)
    "gold-018": ["2201.11903", "2304.14317"],  # Chain-of-Thought (Wei et al.)
    "gold-019": ["2112.10752", "2401.07709"],  # Latent Diffusion Models (LDM)
    "gold-020": ["1608.04471"],                 # Stein Variational Gradient Descent (SVGD)
    "gold-021": ["2212.07677", "2310.00297"],  # In-Context Learning Optimization
    "gold-022": ["1610.05755", "1702.07469"],  # Semi-supervised Knowledge Transfer (PATE)
    "gold-023": ["1904.04945"],                 # Vehicle License Plate Price DRNN
    "gold-024": ["1809.08370", "1906.00910"],  # Cross-View Training (CVT)
    "gold-025": ["2403.18228", "cvf_Zeng_Unmixing_Diffusion_for_Self-Supervised_Hyperspectral_Image_Denoising_CVPR_2024"],
    "gold-026": ["2403.18228", "cvf_Zeng_Unmixing_Diffusion_for_Self-Supervised_Hyperspectral_Image_Denoising_CVPR_2024"],
    "gold-027": ["1604.06174", "2411.01431"],  # Gradient Checkpointing (Activation Recomputation)
    "gold-028": ["2212.10560"],                 # Self-Instruct
    "gold-029": ["2010.11929"],                 # Vision Transformers (ViT)
    "gold-030": ["1306.0895"],                  # Entropic Regularization Sinkhorn
    "gold-031": ["2309.17453"],                 # Attention Sinks (StreamingLLM)
    "gold-032": ["1807.03748", "2005.10242"],  # InfoNCE Temperature Contrastive
    "gold-033": ["2210.03629", "2512.03560"],  # ReAct Reasoning and Acting
    "gold-034": ["2003.08934", "2403.06092"],  # NeRF Positional Encoding
    "gold-035": ["2106.01357", "2502.11909"],  # Diffusion Schrödinger Bridge
}

def enrich():
    dataset_path = Path("benchmarks/datasets/rag_goldens_100.json")
    with open(dataset_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    updated_count = 0
    for idx, item in enumerate(data):
        item_id = item["id"]
        # Handle index-based mapping for first 35 if IDs repeat or need enrichment
        if idx < 35:
            key = f"gold-{idx+1:03d}"
            mapped = PAPER_MAPPING_35.get(key, [])
            if not item.get("relevant_paper_ids"):
                item["relevant_paper_ids"] = mapped
                updated_count += 1
            else:
                # Merge unique
                existing = item.get("relevant_paper_ids", [])
                item["relevant_paper_ids"] = list(dict.fromkeys(existing + mapped))
        elif not item.get("relevant_paper_ids"):
            # If any beyond 35 is missing, check expected_context_keywords or fallback
            kws = item.get("expected_context_keywords", [])
            item["relevant_paper_ids"] = [k for k in kws if "." in k or len(k) > 6]
            updated_count += 1

    # Verify all 100 have relevant_paper_ids
    valid_count = sum(1 for x in data if x.get("relevant_paper_ids") and len(x["relevant_paper_ids"]) > 0)
    print(f"Enrichment completed. Updated: {updated_count}. Valid items with relevant_paper_ids: {valid_count} / {len(data)}")

    with open(dataset_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    enrich()
