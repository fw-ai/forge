#!/usr/bin/env python3
"""E2E test for Qwen3 LoRA training shapes on Fireworks AI.

Tests that all Qwen3 (and Qwen 3.5) LoRA training shapes are properly
configured for external account usage:

  1. Shape exists and is readable
  2. Shape has at least one version
  3. Shape has a latestValidated version
  4. The latestValidated version is marked public (required for external accounts)
  5. The shape references a valid deployment shape
  6. The shape has correct trainerMode (LORA_TRAINER or FORWARD_ONLY)

Usage:
  FIREWORKS_API_KEY=... python test_qwen3_lora_shapes.py
  FIREWORKS_API_KEY=... python test_qwen3_lora_shapes.py --verbose
  FIREWORKS_API_KEY=... python test_qwen3_lora_shapes.py --account ailabs-account-id
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from typing import Any

import httpx

# All Qwen3 LoRA training shapes (current and legacy).
# These are the shapes that should be available to external customers.
QWEN3_LORA_SHAPES = {
    # Qwen 3.5 (current generation, documented)
    "qwen3p5-9b-256k-lora": {
        "expected_model": "accounts/fireworks/models/qwen3p5-9b",
        "expected_mode": "LORA_TRAINER",
        "documented": True,
    },
    "qwen3p5-27b-256k-lora": {
        "expected_model": "accounts/fireworks/models/qwen3p5-27b",
        "expected_mode": "LORA_TRAINER",
        "documented": True,
    },
    "qwen3p5-35b-a3b-256k-lora": {
        "expected_model": "accounts/fireworks/models/qwen3p5-35b-a3b",
        "expected_mode": "LORA_TRAINER",
        "documented": True,
    },
    "qwen3p5-397b-a17b-256k-lora": {
        "expected_model": "accounts/fireworks/models/qwen3p5-397b-a17b",
        "expected_mode": "LORA_TRAINER",
        "documented": True,
    },
    # Qwen3 legacy LoRA shapes (still referenced internally)
    "qwen3-4b-256k-h200-lora": {
        "expected_model": "accounts/fireworks/models/qwen3-4b",
        "expected_mode": "LORA_TRAINER",
        "documented": False,
    },
    "qwen3-8b-256k-h200-lora": {
        "expected_model": "accounts/fireworks/models/qwen3-8b",
        "expected_mode": "LORA_TRAINER",
        "documented": False,
    },
    "qwen3-4b-minimum-h200-lora": {
        "expected_model": "accounts/fireworks/models/qwen3-4b",
        "expected_mode": "LORA_TRAINER",
        "documented": False,
    },
    "qwen3-4b-minimum-h200-forward-lora": {
        "expected_model": "accounts/fireworks/models/qwen3-4b",
        "expected_mode": "FORWARD_ONLY",
        "documented": False,
    },
    "qwen3-235b-2507-instruct-128k-b200-lora": {
        "expected_model": "accounts/fireworks/models/qwen3-235b-a22b-instruct-2507",
        "expected_mode": "LORA_TRAINER",
        "documented": False,
    },
    "qwen3-235b-2507-instruct-128k-b200-forward-only-lora": {
        "expected_model": "accounts/fireworks/models/qwen3-235b-a22b-instruct-2507",
        "expected_mode": "FORWARD_ONLY",
        "documented": False,
    },
    "qwen3-vl-8b-256k-h200-lora": {
        "expected_model": "accounts/fireworks/models/qwen3-vl-8b-instruct",
        "expected_mode": "LORA_TRAINER",
        "documented": False,
    },
}


@dataclass
class TestResult:
    shape_name: str
    passed: bool
    checks: list[tuple[str, bool, str]] = field(default_factory=list)

    def add_check(self, name: str, passed: bool, detail: str = ""):
        self.checks.append((name, passed, detail))
        if not passed:
            self.passed = False


def get_headers(api_key: str) -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def resolve_account_id(api_key: str, base_url: str) -> str:
    resp = httpx.get(
        f"{base_url}/v1/accounts",
        headers=get_headers(api_key),
        timeout=30,
    )
    resp.raise_for_status()
    accounts = resp.json().get("accounts", [])
    if not accounts:
        raise RuntimeError("No accounts found for this API key")
    return accounts[0]["name"].split("/")[-1]


def test_shape(
    api_key: str,
    shape_short_name: str,
    expected: dict,
    base_url: str,
    verbose: bool = False,
) -> TestResult:
    """Run all checks on a single training shape."""
    headers = get_headers(api_key)
    shape_id = f"accounts/fireworks/trainingShapes/{shape_short_name}"
    result = TestResult(shape_name=shape_short_name, passed=True)

    # 1. Shape exists
    resp = httpx.get(f"{base_url}/v1/{shape_id}", headers=headers, timeout=30)
    result.add_check(
        "shape_exists",
        resp.status_code == 200,
        f"HTTP {resp.status_code}" if resp.status_code != 200 else "OK",
    )
    if resp.status_code != 200:
        return result

    shape_data = resp.json()

    # 2. Correct trainer mode
    actual_mode = shape_data.get("trainerMode", "UNKNOWN")
    expected_mode = expected["expected_mode"]
    result.add_check(
        "trainer_mode",
        actual_mode == expected_mode,
        f"expected={expected_mode} actual={actual_mode}",
    )

    # 3. Correct base model
    actual_model = shape_data.get("baseModel", "")
    expected_model = expected["expected_model"]
    result.add_check(
        "base_model",
        actual_model == expected_model,
        f"expected={expected_model} actual={actual_model}",
    )

    # 4. Has deployment shape version
    deploy_shape = shape_data.get("deploymentShapeVersion", "")
    result.add_check(
        "deployment_shape",
        bool(deploy_shape),
        deploy_shape or "MISSING",
    )

    # 5. Has trainer image tag
    image_tag = shape_data.get("trainerImageTag", "")
    result.add_check(
        "trainer_image_tag",
        bool(image_tag),
        image_tag or "MISSING",
    )

    # 6. Has versions
    resp2 = httpx.get(
        f"{base_url}/v1/{shape_id}/versions", headers=headers, timeout=30
    )
    result.add_check(
        "versions_endpoint",
        resp2.status_code == 200,
        f"HTTP {resp2.status_code}" if resp2.status_code != 200 else "OK",
    )
    if resp2.status_code != 200:
        return result

    versions = resp2.json().get("trainingShapeVersions", [])
    result.add_check(
        "has_versions",
        len(versions) > 0,
        f"{len(versions)} versions",
    )
    if not versions:
        return result

    # 7. Has validated versions
    validated = [v for v in versions if v.get("validated", False)]
    result.add_check(
        "has_validated",
        len(validated) > 0,
        f"{len(validated)} validated out of {len(versions)} total",
    )

    # 8. Has latestValidated version
    latest_validated = [v for v in versions if v.get("latestValidated", False)]
    result.add_check(
        "has_latest_validated",
        len(latest_validated) == 1,
        f"{len(latest_validated)} latestValidated versions",
    )

    # 9. latestValidated version is PUBLIC (critical for external accounts!)
    if latest_validated:
        lv = latest_validated[0]
        is_public = lv.get("public", False)
        result.add_check(
            "latest_validated_is_public",
            is_public,
            f"public={is_public} version={lv['name'].split('/')[-1]}",
        )

        if verbose:
            lv_snapshot = lv.get("snapshot", {})
            result.add_check(
                "version_has_snapshot",
                bool(lv_snapshot),
                "snapshot present" if lv_snapshot else "MISSING snapshot",
            )
    else:
        result.add_check(
            "latest_validated_is_public",
            False,
            "no latestValidated version to check",
        )

    return result


def test_shape_resolution_as_account(
    api_key: str,
    account_id: str,
    shape_short_name: str,
    base_url: str,
) -> tuple[bool, str]:
    """Simulate what the SDK's resolve_training_profile does for an account.

    The SDK finds the latestValidated version with public=True.
    If no such version exists, external accounts will fail.
    """
    headers = get_headers(api_key)
    shape_id = f"accounts/fireworks/trainingShapes/{shape_short_name}"

    resp = httpx.get(
        f"{base_url}/v1/{shape_id}/versions", headers=headers, timeout=30
    )
    if resp.status_code != 200:
        return False, f"Cannot list versions: HTTP {resp.status_code}"

    versions = resp.json().get("trainingShapeVersions", [])

    # The SDK looks for a version that is both latestValidated AND public
    public_validated = [
        v
        for v in versions
        if v.get("latestValidated", False) and v.get("public", False)
    ]

    if public_validated:
        v = public_validated[0]
        return True, v["name"]

    # Check if there's a latestValidated but it's not public
    latest_val = [v for v in versions if v.get("latestValidated", False)]
    if latest_val:
        v = latest_val[0]
        return (
            False,
            f"latestValidated exists ({v['name'].split('/')[-1]}) "
            f"but public={v.get('public', False)} — "
            f"external accounts cannot resolve this shape",
        )

    return False, "No latestValidated version exists"


def main():
    parser = argparse.ArgumentParser(
        description="E2E test for Qwen3 LoRA training shapes"
    )
    parser.add_argument("--api-key", default=None, help="Fireworks API key")
    parser.add_argument(
        "--base-url",
        default="https://api.fireworks.ai",
        help="API base URL",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show all check details"
    )
    parser.add_argument(
        "--account",
        default=None,
        help="Account ID to test resolution against (auto-resolved if not set)",
    )
    parser.add_argument(
        "--only-documented",
        action="store_true",
        help="Only test shapes that are in the current docs",
    )
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("FIREWORKS_API_KEY")
    if not api_key:
        print("Error: FIREWORKS_API_KEY not set")
        sys.exit(1)

    account_id = args.account
    if not account_id:
        account_id = resolve_account_id(api_key, args.base_url)
    print(f"Testing as account: {account_id}")

    shapes_to_test = {
        k: v
        for k, v in QWEN3_LORA_SHAPES.items()
        if not args.only_documented or v.get("documented", False)
    }

    print(f"Testing {len(shapes_to_test)} Qwen3 LoRA training shapes\n")

    all_passed = True
    results: list[TestResult] = []

    for shape_name, expected in shapes_to_test.items():
        documented = expected.get("documented", False)
        tag = "[DOCS]  " if documented else "[LEGACY]"

        result = test_shape(
            api_key=api_key,
            shape_short_name=shape_name,
            expected=expected,
            base_url=args.base_url,
            verbose=args.verbose,
        )
        results.append(result)

        status = "PASS" if result.passed else "FAIL"
        print(f"  {status} {tag} {shape_name}")

        if args.verbose or not result.passed:
            for check_name, check_passed, detail in result.checks:
                marker = "  ✓" if check_passed else "  ✗"
                print(f"       {marker} {check_name}: {detail}")

        if not result.passed:
            all_passed = False

    # Resolution test
    print(f"\n{'='*70}")
    print("Shape resolution test (simulating external account)")
    print(f"{'='*70}\n")

    resolution_failures = []
    for shape_name in shapes_to_test:
        ok, detail = test_shape_resolution_as_account(
            api_key=api_key,
            account_id=account_id,
            shape_short_name=shape_name,
            base_url=args.base_url,
        )
        status = "PASS" if ok else "FAIL"
        documented = shapes_to_test[shape_name].get("documented", False)
        tag = "[DOCS]  " if documented else "[LEGACY]"
        print(f"  {status} {tag} {shape_name}")
        if not ok:
            print(f"       → {detail}")
            resolution_failures.append((shape_name, detail))
            all_passed = False

    # Summary
    print(f"\n{'='*70}")
    total = len(shapes_to_test)
    passed = sum(1 for r in results if r.passed)
    print(f"Shape config:  {passed}/{total} passed")

    resolution_passed = total - len(resolution_failures)
    print(f"Resolution:    {resolution_passed}/{total} passed")

    if resolution_failures:
        print(f"\n⚠ Resolution failures (shapes external accounts CANNOT use):")
        for name, detail in resolution_failures:
            print(f"  • {name}: {detail}")
        print(
            f"\nFix: Mark the latestValidated version as public=True "
            f"for each failing shape."
        )

    if all_passed:
        print(f"\nAll tests passed!")
        return 0
    else:
        print(f"\nSome tests FAILED — see details above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
