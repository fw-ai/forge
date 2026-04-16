#!/usr/bin/env python3
"""E2E test for Qwen 3.5 LoRA training shapes on Fireworks AI.

Tests that all Qwen 3.5 LoRA training shapes are properly configured
and accessible using the exact SDK code paths:

  Phase 1 — resolve_training_profile():
    Uses the real Training SDK to resolve each shape, which calls:
      GET /v1/{shape}/versions?filter=latest_validated=true&pageSize=1
    Verifies the returned profile has valid fields.

  Phase 2 — TrainerJobConfig validation:
    Builds a TrainerJobConfig from the resolved profile and validates
    it passes the SDK's pre-flight checks.

  Phase 3 — Job lifecycle E2E (opt-in via --create-job):
    Creates a real service-mode RLOR trainer job, waits for RUNNING,
    then deletes it.

Usage:
  FIREWORKS_API_KEY=... python test_qwen3_lora_shapes.py
  FIREWORKS_API_KEY=... python test_qwen3_lora_shapes.py --verbose
  FIREWORKS_API_KEY=... python test_qwen3_lora_shapes.py --create-job --shape qwen3p5-9b-256k-lora
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import logging
from dataclasses import dataclass, field
from typing import Any

from fireworks.training.sdk import (
    FireworksClient,
    TrainerJobConfig,
    TrainerJobManager,
)
from fireworks.training.sdk.fireworks_client import TrainingShapeProfile

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────
# Shape catalog
# ─────────────────────────────────────────────────────────────────────

QWEN3P5_LORA_SHAPES: dict[str, dict[str, Any]] = {
    "qwen3p5-9b-256k-lora": {
        "expected_model": "accounts/fireworks/models/qwen3p5-9b",
        "expected_mode": "LORA_TRAINER",
    },
    "qwen3p5-27b-256k-lora": {
        "expected_model": "accounts/fireworks/models/qwen3p5-27b",
        "expected_mode": "LORA_TRAINER",
    },
    "qwen3p5-35b-a3b-256k-lora": {
        "expected_model": "accounts/fireworks/models/qwen3p5-35b-a3b",
        "expected_mode": "LORA_TRAINER",
    },
    "qwen3p5-397b-a17b-256k-lora": {
        "expected_model": "accounts/fireworks/models/qwen3p5-397b-a17b",
        "expected_mode": "LORA_TRAINER",
    },
}


# ─────────────────────────────────────────────────────────────────────
# Test result tracking
# ─────────────────────────────────────────────────────────────────────

@dataclass
class TestResult:
    name: str
    passed: bool = True
    checks: list[tuple[str, bool, str]] = field(default_factory=list)

    def check(self, label: str, ok: bool, detail: str = "") -> bool:
        self.checks.append((label, ok, detail))
        if not ok:
            self.passed = False
        return ok


def print_result(r: TestResult, verbose: bool):
    status = "PASS" if r.passed else "FAIL"
    print(f"  {status}  {r.name}")
    if verbose or not r.passed:
        for label, ok, detail in r.checks:
            marker = "✓" if ok else "✗"
            print(f"       {marker} {label}: {detail}")


# ─────────────────────────────────────────────────────────────────────
# Phase 1: resolve_training_profile (SDK code path)
# ─────────────────────────────────────────────────────────────────────

def test_resolve_profile(
    client: FireworksClient,
    shape_short: str,
    expected: dict,
    verbose: bool,
) -> tuple[TestResult, TrainingShapeProfile | None]:
    """Exercise the SDK's resolve_training_profile() and check the result."""
    shape_id = f"accounts/fireworks/trainingShapes/{shape_short}"
    r = TestResult(name=shape_short)
    profile = None

    try:
        profile = client.resolve_training_profile(shape_id)
    except Exception as e:
        r.check("resolve_training_profile", False, str(e))
        return r, None

    r.check("resolve_training_profile", True, "OK")

    # Verify profile fields
    r.check(
        "training_shape_version",
        bool(profile.training_shape_version),
        profile.training_shape_version or "EMPTY",
    )
    r.check(
        "trainer_mode",
        profile.trainer_mode == expected["expected_mode"],
        f"got={profile.trainer_mode} expected={expected['expected_mode']}",
    )
    r.check(
        "trainer_image_tag",
        bool(profile.trainer_image_tag),
        profile.trainer_image_tag or "EMPTY",
    )
    r.check(
        "deployment_shape_version",
        bool(profile.deployment_shape_version),
        profile.deployment_shape_version or "EMPTY",
    )
    r.check(
        "accelerator_type",
        bool(profile.accelerator_type),
        profile.accelerator_type or "EMPTY",
    )
    r.check(
        "supports_lora",
        profile.supports_lora,
        f"supports_lora={profile.supports_lora}",
    )

    if verbose:
        r.check(
            "accelerator_count",
            True,
            f"{profile.accelerator_count}",
        )
        r.check(
            "node_count",
            True,
            f"{profile.node_count}",
        )
        r.check(
            "max_supported_context_length",
            True,
            f"{profile.max_supported_context_length}",
        )
        r.check(
            "pipeline_parallelism",
            True,
            f"{profile.pipeline_parallelism}",
        )

    return r, profile


# ─────────────────────────────────────────────────────────────────────
# Phase 2: TrainerJobConfig validation
# ─────────────────────────────────────────────────────────────────────

def test_config_validation(
    profile: TrainingShapeProfile,
    shape_short: str,
    expected: dict,
    verbose: bool,
) -> TestResult:
    """Build a TrainerJobConfig from the profile and validate it."""
    r = TestResult(name=f"{shape_short} (config)")

    try:
        config = TrainerJobConfig(
            base_model=expected["expected_model"],
            training_shape_ref=profile.training_shape_version,
            lora_rank=16,
            learning_rate=1e-5,
        )
        config.validate()
        r.check("config_validate", True, "OK")
    except Exception as e:
        r.check("config_validate", False, str(e))
        return r

    # Verify shape-owned fields are NOT set (they come from the shape)
    r.check(
        "no_accelerator_type",
        config.accelerator_type is None,
        f"accelerator_type={config.accelerator_type}",
    )
    r.check(
        "no_accelerator_count",
        config.accelerator_count is None,
        f"accelerator_count={config.accelerator_count}",
    )
    r.check(
        "no_node_count",
        config.node_count is None,
        f"node_count={config.node_count}",
    )
    r.check(
        "training_shape_ref_set",
        config.training_shape_ref == profile.training_shape_version,
        config.training_shape_ref or "EMPTY",
    )

    return r


# ─────────────────────────────────────────────────────────────────────
# Phase 3: Job lifecycle E2E
# ─────────────────────────────────────────────────────────────────────

def test_job_lifecycle(
    mgr: TrainerJobManager,
    profile: TrainingShapeProfile,
    shape_short: str,
    expected: dict,
    verbose: bool,
    wait_timeout: float = 120,
) -> TestResult:
    """Create a real RLOR trainer job using the SDK, wait for RUNNING, delete."""
    r = TestResult(name=f"{shape_short} (job)")

    config = TrainerJobConfig(
        base_model=expected["expected_model"],
        training_shape_ref=profile.training_shape_version,
        lora_rank=16,
        learning_rate=1e-5,
        display_name=f"e2e-test-{shape_short}",
    )

    job_id = None
    try:
        print(f"    Creating job for {shape_short}...")
        created = mgr.create(config)
        job_id = created.job_id
        r.check("job_create", True, f"job_id={job_id}")
        print(f"    Job created: {job_id}")

        # Poll for RUNNING
        deadline = time.time() + wait_timeout
        final_state = "UNKNOWN"
        while time.time() < deadline:
            time.sleep(5)
            try:
                job = mgr.get(job_id)
                final_state = job.get("state", "UNKNOWN")
                if verbose:
                    print(f"      state={final_state}")
                if final_state == "JOB_STATE_RUNNING":
                    break
                if final_state in ("JOB_STATE_FAILED", "JOB_STATE_CANCELLED"):
                    msg = job.get("status", {}).get("message", "")
                    r.check("job_reached_running", False, f"state={final_state} msg={msg}")
                    return r
            except Exception as e:
                if verbose:
                    print(f"      poll error: {e}")

        r.check(
            "job_reached_running",
            final_state == "JOB_STATE_RUNNING",
            f"final_state={final_state}",
        )

    except Exception as e:
        r.check("job_create", False, str(e)[:200])
    finally:
        if job_id:
            print(f"    Deleting job {job_id}...")
            try:
                mgr.delete(job_id)
                r.check("job_delete", True, "OK")
                print(f"    Deleted")
            except Exception as e:
                r.check("job_delete", False, str(e)[:200])

    return r


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="E2E test for Qwen 3.5 LoRA training shapes",
    )
    parser.add_argument("--api-key", default=None, help="Fireworks API key")
    parser.add_argument("--base-url", default="https://api.fireworks.ai")
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument("--shape", default=None, help="Test only this shape")
    parser.add_argument(
        "--create-job",
        action="store_true",
        help="Phase 3: create+delete a real RLOR job (costs GPU time!)",
    )
    parser.add_argument("--wait-timeout", type=float, default=120)
    parser.add_argument("--debug", action="store_true", help="Enable SDK debug logging")
    args = parser.parse_args()

    if args.debug:
        logging.basicConfig(level=logging.DEBUG)
    elif args.verbose:
        logging.basicConfig(level=logging.INFO)

    api_key = args.api_key or os.environ.get("FIREWORKS_API_KEY")
    if not api_key:
        print("Error: FIREWORKS_API_KEY not set")
        sys.exit(1)

    mgr = TrainerJobManager(api_key=api_key, base_url=args.base_url)
    print(f"Account: {mgr.account_id}\n")

    shapes = QWEN3P5_LORA_SHAPES
    if args.shape:
        if args.shape not in shapes:
            print(f"Unknown shape: {args.shape}")
            print(f"Available: {', '.join(shapes.keys())}")
            sys.exit(1)
        shapes = {args.shape: shapes[args.shape]}

    all_passed = True
    profiles: dict[str, TrainingShapeProfile] = {}

    # ── Phase 1: resolve_training_profile ─────────────────────────────
    print(f"Phase 1: resolve_training_profile ({len(shapes)} shapes)")
    print("-" * 60)
    for name, expected in shapes.items():
        r, profile = test_resolve_profile(mgr, name, expected, args.verbose)
        print_result(r, args.verbose)
        if not r.passed:
            all_passed = False
        if profile:
            profiles[name] = profile

    # ── Phase 2: TrainerJobConfig validation ──────────────────────────
    print(f"\nPhase 2: TrainerJobConfig validation")
    print("-" * 60)
    for name, expected in shapes.items():
        if name not in profiles:
            print(f"  SKIP {name} (config) — no profile from phase 1")
            continue
        r = test_config_validation(profiles[name], name, expected, args.verbose)
        print_result(r, args.verbose)
        if not r.passed:
            all_passed = False

    # ── Phase 3: Job lifecycle (opt-in) ───────────────────────────────
    if args.create_job:
        print(f"\nPhase 3: Job lifecycle E2E")
        print("-" * 60)
        for name, expected in shapes.items():
            if name not in profiles:
                print(f"  SKIP {name} (job) — no profile from phase 1")
                continue
            r = test_job_lifecycle(
                mgr, profiles[name], name, expected,
                args.verbose, args.wait_timeout,
            )
            print_result(r, args.verbose)
            if not r.passed:
                all_passed = False

    # ── Summary ───────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    if all_passed:
        print("All tests PASSED")
    else:
        print("Some tests FAILED — see details above")
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
