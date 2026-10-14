from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config.settings import settings
from src.models.embeddings.nomic_v15 import (
    ArtifactManager,
    ModelVerifier,
    NomicV15Spec,
)
from src.utils.logger import setup_pipeline_logging


def _resolve_revision(value: str) -> str:
    if len(value) != 40 or not all(c in "0123456789abcdef" for c in value.lower()):
        raise argparse.ArgumentTypeError(
            f"Invalid revision: must be a 40-character git commit SHA, got '{value}'"
        )
    return value.lower()


def _resolve_local_root(value: str) -> Path:
    p = Path(value).expanduser().resolve()
    if not p.exists():
        p.mkdir(parents=True, exist_ok=True)
    return p


def _main() -> int:
    parser = argparse.ArgumentParser(
        description="Prepare Nomic Embed Text v1.5 model artifact.",
    )
    parser.add_argument(
        "--model",
        default="nomic-ai/nomic-embed-text-v1.5",
        help="Hugging Face model repo id (default: nomic-ai/nomic-embed-text-v1.5)",
    )
    parser.add_argument(
        "--revision",
        type=_resolve_revision,
        default=None,
        help="Pinned Hugging Face commit SHA (40 hex chars). Required for production.",
    )
    parser.add_argument(
        "--local-root",
        type=_resolve_local_root,
        default=str(settings.ROOT_DIR / "models"),
        help=f"Local root directory for model artifacts (default: <root>/models)",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Run full model verification after download.",
    )
    parser.add_argument(
        "--mirror-r2",
        action="store_true",
        help="Upload model artifact to R2 after download.",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Fail if model not found locally (do not attempt download).",
    )
    parser.add_argument(
        "--verify-state-dict",
        action="store_true",
        help="Run strict state-dict audit (requires model downloaded).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print intended actions without executing.",
    )
    args = parser.parse_args()

    setup_pipeline_logging("PREPARE_MODEL")
    logger = logging.getLogger(__name__)

    spec = NomicV15Spec(repo_id=args.model)
    if args.revision:
        spec = NomicV15Spec(repo_id=args.model, revision=args.revision)

    logger.info("Model: %s @ %s", spec.repo_id, spec.revision)
    logger.info("Local root: %s", args.local_root)

    am = ArtifactManager(local_root=args.local_root, spec=spec)

    if args.dry_run:
        logger.info("[DRY RUN] Would resolve model from: %s", am.model_dir)
        logger.info("[DRY RUN] Would download from: %s", spec.repo_id)
        return 0

    try:
        resolved = am.resolve(offline=args.offline)
        logger.info("Model snapshot already present: %s", resolved)
    except FileNotFoundError:
        logger.info("Downloading model from Hugging Face Hub...")
        resolved = am.download_from_hub()
        logger.info("Download complete: %s", resolved)

    manifest = am.write_manifest(
        transformers_version=_get_package_version("transformers"),
        torch_version=_get_package_version("torch"),
        huggingface_hub_version=_get_package_version("huggingface_hub"),
        safetensors_version=_get_package_version("safetensors"),
    )
    logger.info("Manifest: %s", manifest.get("model_id"))

    if args.verify:
        logger.info("Running verification...")
        verifier = ModelVerifier(artifact_manager=am)
        result = verifier.verify()
        if result.all_passed:
            logger.info("Verification PASSED")
        else:
            logger.error("Verification FAILED: %s", _format_verification_failures(result))
            return 1

    if args.verify_state_dict:
        logger.info("Running state-dict audit...")
        from src.models.embeddings.nomic_v15.loader import load_strict_state_dict

        model, state_dict, missing, unexpected = load_strict_state_dict(
            model_dir=resolved,
        )
        param_count = sum(p.numel() for p in model.parameters())
        weight_count = sum(1 for k in state_dict if "weight" in k)
        bias_count = sum(1 for k in state_dict if "bias" in k)
        logger.info(
            "State-dict audit: params=%d weight_tensors=%d bias_tensors=%d "
            "missing=%d unexpected=%d",
            param_count, weight_count, bias_count,
            len(missing), len(unexpected),
        )

    if args.mirror_r2:
        logger.info("Uploading to R2...")
        am.sync_to_r2()
        logger.info("R2 upload complete")

    logger.info("Model prepare complete: %s", am.model_dir)
    return 0


def _get_package_version(package_name: str) -> str:
    import importlib
    try:
        return importlib.import_module(package_name).__version__
    except Exception:
        return "unknown"


def _format_verification_failures(result) -> str:
    failures = []
    if not result.manifest_valid:
        failures.append("manifest_invalid")
    if not result.files_complete:
        failures.append("files_missing")
    if not result.hashes_match:
        failures.append("hash_mismatch")
    if not result.config_readable:
        failures.append("config_unreadable")
    if not result.tokenizer_readable:
        failures.append("tokenizer_unreadable")
    if not result.weights_readable:
        failures.append("weights_unreadable")
    if not result.model_loads:
        failures.append("model_load_failed")
    if not result.test_vector_finite:
        failures.append("test_vector_nonfinite")
    return ", ".join(failures) if failures else "unknown"


if __name__ == "__main__":
    sys.exit(_main())
