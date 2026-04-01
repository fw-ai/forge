#!/usr/bin/env python3
"""Cross-job checkpoint promotion for Fireworks RFT.

When the original RLOR trainer job has been deleted, `forge rft promote`
fails with HTTP 404 because it tries to list checkpoints on a job that
no longer exists.

This script works around the problem by:
  1. Reading checkpoints.jsonl to find the DCP state_path for the target step.
  2. Spinning up a *temporary* service-mode RLOR trainer with the same base model.
  3. Loading the cross-job DCP checkpoint into the temporary trainer.
  4. Exporting a sampler (HF-format) checkpoint from the loaded weights.
  5. Promoting the sampler checkpoint to a deployable Fireworks model.
  6. Cleaning up (deleting the temporary trainer).

Prerequisites:
  - The Fireworks Training SDK: pip install fireworks-ai[training]
    (provides fireworks.training.sdk with TrainerJobManager, FiretitanServiceClient, etc.)
  - FIREWORKS_API_KEY environment variable set

Usage:
  python cross_job_promote.py \\
      --checkpoints-jsonl rl_logs/rft-clinical-reference-v2-0-1/checkpoints.jsonl \\
      --step 8 \\
      --output-model-id rft-clinical-reference-v2-0-1

  # With explicit training shape:
  python cross_job_promote.py \\
      --checkpoints-jsonl rl_logs/rft-clinical-reference-v2-0-1/checkpoints.jsonl \\
      --step 8 \\
      --output-model-id rft-clinical-reference-v2-0-1 \\
      --training-shape-id accounts/fireworks/trainingShapes/qwen3-8b-128k
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


def _check_sdk():
    """Check that the Training SDK is installed and provide instructions if not."""
    try:
        from fireworks.training.sdk import (  # noqa: F401
            FiretitanServiceClient,
            FireworksClient,
            TrainerJobConfig,
            TrainerJobManager,
        )
    except ImportError:
        print(
            "Error: The Fireworks Training SDK is required but not installed.\n"
            "\n"
            "Install it with:\n"
            "  pip install fireworks-ai[training]\n"
            "\n"
            "The Training SDK provides TrainerJobManager, FiretitanServiceClient,\n"
            "and other components needed for cross-job checkpoint operations.\n"
            "\n"
            "If the [training] extra is not available in your version, check:\n"
            "  https://docs.fireworks.ai/api-reference/training-sdk/overview"
        )
        sys.exit(1)


# ---------------------------------------------------------------------------
# checkpoints.jsonl helpers
# ---------------------------------------------------------------------------

def load_checkpoints(jsonl_path: str) -> list[dict[str, Any]]:
    """Load all checkpoint entries from a checkpoints.jsonl file."""
    entries = []
    with open(jsonl_path) as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))
    return entries


def find_checkpoint(entries: list[dict], step: int | None) -> dict:
    """Find a checkpoint entry by step number.

    If step is None, returns the latest entry that has a state_path
    (for cross-job load) or sampler_path (for direct promotion).
    """
    if step is not None:
        for entry in entries:
            if entry.get("step") == step:
                return entry
        available = sorted(set(e.get("step") for e in entries if e.get("step") is not None))
        raise ValueError(
            f"No checkpoint found at step {step}. "
            f"Available steps: {available}"
        )

    for entry in reversed(entries):
        if entry.get("sampler_path") or entry.get("state_path"):
            return entry

    raise ValueError("No checkpoint with state_path or sampler_path found")


# ---------------------------------------------------------------------------
# Training shape auto-inference
# ---------------------------------------------------------------------------

SHAPE_MAP = {
    "qwen3-4b": "accounts/fireworks/trainingShapes/qwen3-4b-minimum",
    "qwen3-8b": "accounts/fireworks/trainingShapes/qwen3-8b-128k",
    "qwen3-32b": "accounts/fireworks/trainingShapes/qwen3-32b-65k",
    "qwen3-30b-a3b": "accounts/fireworks/trainingShapes/qwen3-30b-a3b-instruct-2507-128k",
    "qwen3-235b": "accounts/fireworks/trainingShapes/qwen3-235b-2507-instruct-128k",
    "qwen3-vl-8b": "accounts/fireworks/trainingShapes/qwen3-vl-8b-65k",
    "llama-v3p3-70b": "accounts/fireworks/trainingShapes/llama70b-policy",
}


def infer_training_shape(base_model: str) -> str:
    """Infer a training shape ID from the base model name."""
    model_lower = base_model.lower()
    for key, shape in SHAPE_MAP.items():
        if key in model_lower:
            return shape
    raise ValueError(
        f"Cannot infer training shape for base model '{base_model}'.\n"
        f"Please specify --training-shape-id explicitly.\n"
        f"Known patterns: {list(SHAPE_MAP.keys())}\n"
        f"See: https://docs.fireworks.ai/fine-tuning/training-sdk/training-shapes"
    )


# ---------------------------------------------------------------------------
# Direct promotion (when sampler_path exists)
# ---------------------------------------------------------------------------

def try_direct_promote(
    api_key: str,
    source_job_id: str,
    sampler_path: str,
    output_model_id: str,
    base_url: str,
) -> dict | None:
    """Attempt to promote directly using an existing sampler_path.

    Returns the model dict on success, or None if the source job is gone.
    """
    from fireworks.training.sdk import FireworksClient

    client = FireworksClient(api_key=api_key, base_url=base_url)
    try:
        return client.promote_checkpoint(
            job_id=source_job_id,
            checkpoint_id=sampler_path,
            output_model_id=output_model_id,
        )
    except Exception as e:
        err_str = str(e)
        if "404" in err_str or "not found" in err_str.lower():
            return None
        raise


# ---------------------------------------------------------------------------
# Cross-job promotion via temporary trainer
# ---------------------------------------------------------------------------

def cross_job_promote(
    api_key: str,
    checkpoint_entry: dict,
    output_model_id: str,
    training_shape_id: str,
    base_url: str = "https://api.fireworks.ai",
) -> dict:
    """Promote a cross-job DCP checkpoint by spinning up a temporary trainer.

    Steps:
      1. Resolve training shape → pinned version
      2. Create temporary service-mode RLOR trainer
      3. Connect FiretitanServiceClient + training client
      4. resolve_checkpoint_path() + load_state() from the dead job's DCP
      5. save_weights_for_sampler_ext() → base sampler checkpoint
      6. promote_checkpoint() → deployable Fireworks model
      7. Delete the temporary trainer
    """
    from fireworks.training.sdk import (
        FiretitanServiceClient,
        TrainerJobConfig,
        TrainerJobManager,
    )

    base_model = checkpoint_entry["base_model"]
    source_job_id = checkpoint_entry["source_job_id"]
    checkpoint_name = checkpoint_entry["name"]
    lora_rank = checkpoint_entry.get("lora_rank", 0)

    print(f"\n{'='*60}")
    print("Cross-job checkpoint promotion")
    print(f"{'='*60}")
    print(f"  Base model:      {base_model}")
    print(f"  Source job:       {source_job_id}")
    print(f"  Checkpoint:      {checkpoint_name}")
    print(f"  Step:            {checkpoint_entry.get('step')}")
    print(f"  Output model:    {output_model_id}")
    print(f"  Training shape:  {training_shape_id}")

    mgr = TrainerJobManager(api_key=api_key, base_url=base_url)

    # 1. Resolve training shape
    print(f"\n[1/7] Resolving training shape...")
    profile = mgr.resolve_training_profile(training_shape_id)
    print(f"  → {profile.training_shape_version}")

    # 2. Create temporary trainer
    config = TrainerJobConfig(
        base_model=base_model,
        training_shape_ref=profile.training_shape_version,
        lora_rank=lora_rank,
        learning_rate=1e-5,
        display_name="cross-job-promote-temp",
    )

    print("[2/7] Creating temporary service-mode trainer (this may take a few minutes)...")
    endpoint = mgr.create_and_wait(config, timeout_s=900)
    temp_job_id = endpoint.job_id
    print(f"  Trainer ready: {temp_job_id}")
    print(f"  Endpoint:      {endpoint.base_url}")

    try:
        # 3. Connect training client
        print("[3/7] Connecting training client...")
        service = FiretitanServiceClient(
            base_url=endpoint.base_url,
            api_key=api_key,
        )
        training_client = service.create_training_client(
            base_model=base_model,
            lora_rank=lora_rank,
        )
        print("  Connected")

        # 4. Load cross-job checkpoint
        print(f"[4/7] Loading cross-job checkpoint '{checkpoint_name}' from job {source_job_id}...")
        checkpoint_ref = training_client.resolve_checkpoint_path(
            checkpoint_name,
            source_job_id=source_job_id,
        )
        training_client.load_state(checkpoint_ref).result()
        print("  Weights loaded (optimizer state not restored — not needed for promotion)")

        # 5. Export sampler checkpoint
        sampler_name = f"promote-{checkpoint_name}"
        print(f"[5/7] Exporting sampler checkpoint '{sampler_name}'...")
        sampler_result = training_client.save_weights_for_sampler_ext(
            sampler_name,
            checkpoint_type="base",
        )
        sampler_snapshot = sampler_result.snapshot_name
        print(f"  Snapshot: {sampler_snapshot}")

        # 6. Promote to model
        print(f"[6/7] Promoting to model '{output_model_id}'...")
        model = mgr.promote_checkpoint(
            job_id=temp_job_id,
            checkpoint_id=sampler_snapshot,
            output_model_id=output_model_id,
        )
        print(f"  Promoted! State: {model.get('state', 'unknown')}")
        return model

    finally:
        # 7. Cleanup
        print(f"\n[7/7] Deleting temporary trainer {temp_job_id}...")
        try:
            mgr.delete(job_id=temp_job_id)
            print("  Deleted")
        except Exception as e:
            print(f"  Warning: cleanup failed: {e}")
            print(f"  Manually delete with: firectl delete rlorTrainerJob {temp_job_id}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Cross-job checkpoint promotion for Fireworks RFT",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:

  # Promote step 8 from a deleted training run:
  python cross_job_promote.py \\
      --checkpoints-jsonl rl_logs/rft-clinical-reference-v2-0-1/checkpoints.jsonl \\
      --step 8 \\
      --output-model-id rft-clinical-reference-v2-0-1

  # Explicit training shape:
  python cross_job_promote.py \\
      --checkpoints-jsonl rl_logs/my-run/checkpoints.jsonl \\
      --step 8 \\
      --output-model-id my-fine-tuned-model \\
      --training-shape-id accounts/fireworks/trainingShapes/qwen3-8b-128k

  # Dry run — see what would happen without creating any resources:
  python cross_job_promote.py \\
      --checkpoints-jsonl rl_logs/my-run/checkpoints.jsonl \\
      --step 8 \\
      --output-model-id my-model \\
      --dry-run
""",
    )

    parser.add_argument(
        "--checkpoints-jsonl",
        required=True,
        help="Path to checkpoints.jsonl from the training run",
    )
    parser.add_argument(
        "--step",
        type=int,
        default=None,
        help="Step number to promote (default: latest checkpoint with state_path or sampler_path)",
    )
    parser.add_argument(
        "--output-model-id",
        required=True,
        help="Model ID for the promoted model (1-63 chars, lowercase a-z, 0-9, hyphen)",
    )
    parser.add_argument(
        "--training-shape-id",
        default=None,
        help="Training shape ID for the temporary trainer "
             "(auto-inferred from base model if omitted). "
             "See https://docs.fireworks.ai/fine-tuning/training-sdk/training-shapes",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="Fireworks API key (default: $FIREWORKS_API_KEY)",
    )
    parser.add_argument(
        "--base-url",
        default="https://api.fireworks.ai",
        help="Fireworks API base URL (default: https://api.fireworks.ai)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without creating any resources",
    )

    args = parser.parse_args()

    # Validate API key
    api_key = args.api_key or os.environ.get("FIREWORKS_API_KEY")
    if not api_key:
        print(
            "Error: FIREWORKS_API_KEY not set.\n"
            "Set it via --api-key or export FIREWORKS_API_KEY=..."
        )
        sys.exit(1)

    # Validate checkpoints file
    jsonl_path = args.checkpoints_jsonl
    if not Path(jsonl_path).exists():
        print(f"Error: {jsonl_path} not found")
        sys.exit(1)

    # Load and find checkpoint
    print(f"Loading checkpoints from {jsonl_path}...")
    entries = load_checkpoints(jsonl_path)
    print(f"  Found {len(entries)} checkpoint entries")

    try:
        checkpoint = find_checkpoint(entries, args.step)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
    step = checkpoint.get("step", "?")
    print(f"  Selected checkpoint at step {step}")

    base_model = checkpoint.get("base_model")
    if not base_model:
        print("Error: Checkpoint entry missing 'base_model' field")
        sys.exit(1)

    source_job_id = checkpoint.get("source_job_id")
    if not source_job_id:
        print("Error: Checkpoint entry missing 'source_job_id' field")
        sys.exit(1)

    # -------------------------------------------------------------------
    # Path A: checkpoint already has sampler_path → try direct promotion
    # -------------------------------------------------------------------
    if checkpoint.get("sampler_path"):
        sampler_path = checkpoint["sampler_path"]
        print(f"\n  Checkpoint has sampler_path: {sampler_path}")

        if args.dry_run:
            print("\n[dry-run] Would attempt direct promotion:")
            print(f"  job_id:          {source_job_id}")
            print(f"  checkpoint_id:   {sampler_path}")
            print(f"  output_model_id: {args.output_model_id}")
            print("\n  If the source job is gone (404), would fall through to")
            print("  cross-job promotion via temporary trainer.")
            # Fall through to show the cross-job plan too
        else:
            _check_sdk()
            print("  Attempting direct promotion...")
            model = try_direct_promote(
                api_key=api_key,
                source_job_id=source_job_id,
                sampler_path=sampler_path,
                output_model_id=args.output_model_id,
                base_url=args.base_url,
            )
            if model is not None:
                print(f"\n  Direct promotion succeeded!")
                print(f"  Model state: {model.get('state', 'unknown')}")
                return
            print("  Direct promotion failed (source job not found)")
            print("  Falling back to cross-job promotion via temporary trainer...")

    # -------------------------------------------------------------------
    # Path B: need cross-job promotion via temporary trainer
    # -------------------------------------------------------------------
    if not checkpoint.get("state_path"):
        print(
            f"\nError: Checkpoint at step {step} has no state_path (DCP reference).\n"
            "Cross-job promotion requires a DCP checkpoint.\n"
            "Only checkpoints saved with kind=STATE or kind=BOTH have a state_path."
        )
        sys.exit(1)

    # Resolve training shape
    training_shape_id = args.training_shape_id
    if not training_shape_id:
        try:
            training_shape_id = infer_training_shape(base_model)
            print(f"  Auto-inferred training shape: {training_shape_id}")
        except ValueError as e:
            print(f"Error: {e}")
            sys.exit(1)

    if args.dry_run:
        print(f"\n[dry-run] Would perform cross-job promotion:")
        print(f"  base_model:        {base_model}")
        print(f"  source_job_id:     {source_job_id}")
        print(f"  checkpoint_name:   {checkpoint['name']}")
        print(f"  state_path:        {checkpoint['state_path']}")
        print(f"  training_shape_id: {training_shape_id}")
        print(f"  output_model_id:   {args.output_model_id}")
        print(f"\n  Steps:")
        print(f"    1. Resolve training shape → pinned version")
        print(f"    2. Create temp service-mode trainer ({base_model})")
        print(f"    3. Wait for trainer to become RUNNING")
        print(f"    4. Connect training client (FiretitanServiceClient)")
        print(f"    5. resolve_checkpoint_path('{checkpoint['name']}', source_job_id='{source_job_id}')")
        print(f"    6. load_state(checkpoint_ref)  — weights only, no optimizer")
        print(f"    7. save_weights_for_sampler_ext('promote-{checkpoint['name']}', checkpoint_type='base')")
        print(f"    8. promote_checkpoint(temp_job_id, snapshot_name, '{args.output_model_id}')")
        print(f"    9. Delete temporary trainer")
        return

    _check_sdk()

    model = cross_job_promote(
        api_key=api_key,
        checkpoint_entry=checkpoint,
        output_model_id=args.output_model_id,
        training_shape_id=training_shape_id,
        base_url=args.base_url,
    )

    print(f"\n{'='*60}")
    print(f"SUCCESS: Model '{args.output_model_id}' promoted!")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
