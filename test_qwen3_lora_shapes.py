#!/usr/bin/env python3
"""E2E test for Qwen3 LoRA training shapes on Fireworks AI.

Tests that all Qwen 3.5 LoRA training shapes are properly configured
and accessible for a given account:

  Phase 1 — Shape metadata validation:
    - Shape exists and is readable
    - Has correct trainerMode, baseModel, deploymentShapeVersion
    - Has at least one version with latestValidated=True and public=True

  Phase 2 — Dependency chain access:
    - Base model is accessible (GET returns 200)
    - Deployment shape and its version are accessible
    - Deployment shape version is public and validated

  Phase 3 — Job lifecycle E2E (opt-in via --create-job):
    - Creates a service-mode RLOR trainer job with LoRA config
    - Verifies job reaches RUNNING state
    - Deletes the job

Usage:
  FIREWORKS_API_KEY=... python test_qwen3_lora_shapes.py
  FIREWORKS_API_KEY=... python test_qwen3_lora_shapes.py --verbose
  FIREWORKS_API_KEY=... python test_qwen3_lora_shapes.py --create-job --shape qwen3p5-9b-256k-lora
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

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
# Helpers
# ─────────────────────────────────────────────────────────────────────

@dataclass
class TestResult:
    name: str
    passed: bool = True
    checks: list[tuple[str, bool, str]] = field(default_factory=list)

    def check(self, label: str, ok: bool, detail: str = ""):
        self.checks.append((label, ok, detail))
        if not ok:
            self.passed = False
        return ok


def headers_for(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def resolve_account_id(api_key: str, base_url: str) -> str:
    resp = httpx.get(f"{base_url}/v1/accounts", headers=headers_for(api_key), timeout=30)
    resp.raise_for_status()
    accounts = resp.json().get("accounts", [])
    if not accounts:
        raise RuntimeError("No accounts found for this API key")
    return accounts[0]["name"].split("/")[-1]


# ─────────────────────────────────────────────────────────────────────
# Phase 1: Shape metadata validation
# ─────────────────────────────────────────────────────────────────────

def test_shape_metadata(
    api_key: str, shape_short: str, expected: dict, base_url: str, verbose: bool
) -> TestResult:
    h = headers_for(api_key)
    shape_id = f"accounts/fireworks/trainingShapes/{shape_short}"
    r = TestResult(name=shape_short)

    # 1. Shape exists
    resp = httpx.get(f"{base_url}/v1/{shape_id}", headers=h, timeout=30)
    if not r.check("shape_exists", resp.status_code == 200, f"HTTP {resp.status_code}"):
        return r
    shape = resp.json()

    # 2. Trainer mode
    r.check(
        "trainer_mode",
        shape.get("trainerMode") == expected["expected_mode"],
        f"got {shape.get('trainerMode')}",
    )

    # 3. Base model
    r.check(
        "base_model",
        shape.get("baseModel") == expected["expected_model"],
        f"got {shape.get('baseModel')}",
    )

    # 4. Has deployment shape version
    deploy_sv = shape.get("deploymentShapeVersion", "")
    r.check("has_deployment_shape_version", bool(deploy_sv), deploy_sv or "MISSING")

    # 5. Has trainer image tag
    r.check("has_trainer_image_tag", bool(shape.get("trainerImageTag")), shape.get("trainerImageTag", "MISSING"))

    # 6. Versions exist
    resp2 = httpx.get(f"{base_url}/v1/{shape_id}/versions", headers=h, timeout=30)
    if not r.check("versions_accessible", resp2.status_code == 200, f"HTTP {resp2.status_code}"):
        return r

    versions = resp2.json().get("trainingShapeVersions", [])
    r.check("has_versions", len(versions) > 0, f"{len(versions)} total")

    # 7. Has latestValidated
    latest = [v for v in versions if v.get("latestValidated")]
    r.check("has_latest_validated", len(latest) == 1, f"{len(latest)} found")

    # 8. latestValidated is public
    if latest:
        lv = latest[0]
        ver_id = lv["name"].split("/")[-1]
        r.check("latest_validated_public", lv.get("public", False), f"version={ver_id} public={lv.get('public')}")
        r.check("latest_validated_validated", lv.get("validated", False), f"validated={lv.get('validated')}")
    else:
        r.check("latest_validated_public", False, "no latestValidated to check")

    return r


# ─────────────────────────────────────────────────────────────────────
# Phase 2: Dependency chain access
# ─────────────────────────────────────────────────────────────────────

def test_dependency_chain(
    api_key: str, shape_short: str, base_url: str, verbose: bool
) -> TestResult:
    h = headers_for(api_key)
    shape_id = f"accounts/fireworks/trainingShapes/{shape_short}"
    r = TestResult(name=f"{shape_short} (deps)")

    resp = httpx.get(f"{base_url}/v1/{shape_id}", headers=h, timeout=30)
    if resp.status_code != 200:
        r.check("shape_read", False, f"HTTP {resp.status_code}")
        return r
    shape = resp.json()

    # 1. Base model accessible
    base_model = shape.get("baseModel", "")
    if base_model:
        resp2 = httpx.get(f"{base_url}/v1/{base_model}", headers=h, timeout=30)
        r.check("base_model_accessible", resp2.status_code == 200, f"{base_model} → HTTP {resp2.status_code}")
        if resp2.status_code == 200:
            model_data = resp2.json()
            r.check(
                "base_model_ready",
                model_data.get("state") == "READY",
                f"state={model_data.get('state')}",
            )

    # 2. Deployment shape version accessible
    deploy_sv = shape.get("deploymentShapeVersion", "")
    if deploy_sv:
        resp3 = httpx.get(f"{base_url}/v1/{deploy_sv}", headers=h, timeout=30)
        r.check("deploy_shape_version_accessible", resp3.status_code == 200, f"{deploy_sv} → HTTP {resp3.status_code}")
        if resp3.status_code == 200:
            dsv_data = resp3.json()
            r.check("deploy_shape_version_public", dsv_data.get("public", False), f"public={dsv_data.get('public')}")
            r.check("deploy_shape_version_validated", dsv_data.get("validated", False), f"validated={dsv_data.get('validated')}")

    # 3. Deployment shape parent accessible
    if deploy_sv:
        deploy_parent = "/".join(deploy_sv.split("/")[:4])
        resp4 = httpx.get(f"{base_url}/v1/{deploy_parent}", headers=h, timeout=30)
        r.check("deploy_shape_parent_accessible", resp4.status_code == 200, f"{deploy_parent} → HTTP {resp4.status_code}")

    # 4. Training shape version snapshot has correct deployment shape ref
    resp5 = httpx.get(f"{base_url}/v1/{shape_id}/versions", headers=h, timeout=30)
    if resp5.status_code == 200:
        versions = resp5.json().get("trainingShapeVersions", [])
        latest = [v for v in versions if v.get("latestValidated")]
        if latest:
            snapshot = latest[0].get("snapshot", {})
            snap_deploy = snapshot.get("deploymentShapeVersion", "")
            r.check(
                "version_snapshot_deploy_shape",
                snap_deploy == deploy_sv,
                f"shape={deploy_sv} snapshot={snap_deploy}",
            )

    return r


# ─────────────────────────────────────────────────────────────────────
# Phase 3: Job lifecycle E2E
# ─────────────────────────────────────────────────────────────────────

def test_job_lifecycle(
    api_key: str,
    shape_short: str,
    account_id: str,
    base_url: str,
    verbose: bool,
    wait_timeout: float = 120,
) -> TestResult:
    h = headers_for(api_key)
    shape_id = f"accounts/fireworks/trainingShapes/{shape_short}"
    r = TestResult(name=f"{shape_short} (job)")

    resp = httpx.get(f"{base_url}/v1/{shape_id}", headers=h, timeout=30)
    if resp.status_code != 200:
        r.check("shape_read", False, f"HTTP {resp.status_code}")
        return r
    shape = resp.json()

    base_model = shape["baseModel"]
    accel_type = shape.get("acceleratorType", "")
    accel_count = shape.get("acceleratorCount", 0)
    node_count = shape.get("nodeCount", 1)

    # Create RLOR job
    create_url = f"{base_url}/v1/accounts/{account_id}/rlorTrainerJobs"
    body: dict[str, Any] = {
        "serviceMode": True,
        "keepAlive": True,
        "displayName": f"e2e-test-{shape_short}",
        "trainingConfig": {
            "baseModel": base_model,
            "loraRank": 16,
            "learningRate": 1e-5,
        },
        "nodeCount": node_count,
    }
    if accel_type:
        body["trainingConfig"]["acceleratorType"] = accel_type
    if accel_count:
        body["trainingConfig"]["acceleratorCount"] = accel_count

    print(f"    Creating job for {shape_short}...")
    resp2 = httpx.post(create_url, headers=h, json=body, timeout=120)
    if not r.check(
        "job_create",
        resp2.status_code in (200, 201),
        f"HTTP {resp2.status_code}: {resp2.text[:200]}",
    ):
        return r

    job_data = resp2.json()
    job_name = job_data.get("name", "")
    job_id = job_name.split("/")[-1]
    print(f"    Job created: {job_id}")

    try:
        # Wait for RUNNING
        deadline = time.time() + wait_timeout
        final_state = job_data.get("state", "UNKNOWN")
        while time.time() < deadline:
            time.sleep(5)
            resp3 = httpx.get(f"{base_url}/v1/{job_name}", headers=h, timeout=30)
            if resp3.status_code != 200:
                continue
            current = resp3.json()
            final_state = current.get("state", "UNKNOWN")
            status = current.get("status", {})

            if verbose:
                print(f"      state={final_state} status={status}")

            if final_state == "JOB_STATE_RUNNING":
                break
            if final_state in ("JOB_STATE_FAILED", "JOB_STATE_CANCELLED"):
                break

        r.check(
            "job_reached_running",
            final_state == "JOB_STATE_RUNNING",
            f"final_state={final_state}",
        )

    finally:
        print(f"    Deleting job {job_id}...")
        del_resp = httpx.delete(f"{base_url}/v1/{job_name}", headers=h, timeout=60)
        r.check(
            "job_delete",
            del_resp.status_code in (200, 204),
            f"HTTP {del_resp.status_code}",
        )
        print(f"    Deleted: HTTP {del_resp.status_code}")

    return r


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def print_result(r: TestResult, verbose: bool):
    status = "PASS" if r.passed else "FAIL"
    print(f"  {status}  {r.name}")
    if verbose or not r.passed:
        for label, ok, detail in r.checks:
            marker = "✓" if ok else "✗"
            print(f"       {marker} {label}: {detail}")


def main():
    parser = argparse.ArgumentParser(
        description="E2E test for Qwen 3.5 LoRA training shapes"
    )
    parser.add_argument("--api-key", default=None, help="Fireworks API key")
    parser.add_argument("--base-url", default="https://api.fireworks.ai", help="API base URL")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show all check details")
    parser.add_argument(
        "--shape",
        default=None,
        help="Test only this shape (e.g. qwen3p5-9b-256k-lora)",
    )
    parser.add_argument(
        "--create-job",
        action="store_true",
        help="Phase 3: actually create+delete an RLOR job (costs GPU time!)",
    )
    parser.add_argument(
        "--wait-timeout",
        type=float,
        default=120,
        help="Seconds to wait for job to reach RUNNING (default: 120)",
    )
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("FIREWORKS_API_KEY")
    if not api_key:
        print("Error: FIREWORKS_API_KEY not set")
        sys.exit(1)

    account_id = resolve_account_id(api_key, args.base_url)
    print(f"Account: {account_id}\n")

    shapes = QWEN3P5_LORA_SHAPES
    if args.shape:
        if args.shape not in shapes:
            print(f"Unknown shape: {args.shape}")
            print(f"Available: {', '.join(shapes.keys())}")
            sys.exit(1)
        shapes = {args.shape: shapes[args.shape]}

    all_passed = True

    # ── Phase 1 ──────────────────────────────────────────────────────
    print(f"Phase 1: Shape metadata ({len(shapes)} shapes)")
    print("-" * 60)
    for name, expected in shapes.items():
        r = test_shape_metadata(api_key, name, expected, args.base_url, args.verbose)
        print_result(r, args.verbose)
        if not r.passed:
            all_passed = False

    # ── Phase 2 ──────────────────────────────────────────────────────
    print(f"\nPhase 2: Dependency chain access")
    print("-" * 60)
    for name in shapes:
        r = test_dependency_chain(api_key, name, args.base_url, args.verbose)
        print_result(r, args.verbose)
        if not r.passed:
            all_passed = False

    # ── Phase 3 (opt-in) ─────────────────────────────────────────────
    if args.create_job:
        print(f"\nPhase 3: Job lifecycle E2E")
        print("-" * 60)
        for name in shapes:
            r = test_job_lifecycle(
                api_key, name, account_id, args.base_url, args.verbose, args.wait_timeout
            )
            print_result(r, args.verbose)
            if not r.passed:
                all_passed = False

    # ── Summary ──────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    if all_passed:
        print("All tests PASSED")
    else:
        print("Some tests FAILED — see details above")
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
