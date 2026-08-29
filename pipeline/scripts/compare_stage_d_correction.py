#!/usr/bin/env python3
"""Classify the bounded Stage-D material-correction analytical differential."""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


CANONICAL_TABLES = (
    "hromada_monthly.csv",
    "hromada_school_year.csv",
    "oblast_monthly.csv",
    "oblast_school_year.csv",
    "national_monthly.csv",
    "national_school_year.csv",
)
EXPECTED_MISSINGNESS_FIELDS = {
    "alarm_seconds_average_school_location",
    "alarm_hours_average_school_location",
    "available_school_seconds_average_school_location",
    "expected_school_seconds_average_school_location",
    "affected_school_days_average_school_location",
    "available_school_days_average_school_location",
    "expected_school_days_average_school_location",
    "school_time_alarm_episodes_average_school_location",
}
EXPECTED_DERIVED_FIELDS = {"comparable_school_count", "comparable_hromada_count"}
CATEGORIES = (
    "EXPECTED_MISSINGNESS_WEIGHTING_CORRECTION",
    "EXPECTED_SOURCE_PRECISION_CORRECTION",
    "EXPECTED_DERIVED_METADATA_CHANGE",
    "UNEXPECTED",
)


def row_key(row: dict[str, Any]) -> tuple[str, str, str, str]:
    area_id = row.get("hromada_id") or row.get("area_id")
    if not area_id:
        raise ValueError(f"Missing row area identity: {row}")
    return (
        str(row.get("school_year", "")),
        str(row.get("period_type", "")),
        str(row.get("period_id", "")),
        str(area_id),
    )


def normalize(value: Any) -> Any:
    return None if value == "" else value


def equal(left: Any, right: Any) -> bool:
    left = normalize(left)
    right = normalize(right)
    if left is None or right is None:
        return left is right
    try:
        return Decimal(str(left)) == Decimal(str(right))
    except InvalidOperation:
        return left == right


def classify(
    field: str,
    baseline: Any,
    candidate: Any,
    baseline_row: dict[str, Any],
    candidate_row: dict[str, Any],
) -> str:
    if field in EXPECTED_DERIVED_FIELDS and normalize(baseline) is None:
        return "EXPECTED_DERIVED_METADATA_CHANGE"
    if (
        field == "source_precision_label"
        and baseline == "not applicable"
        and candidate == "mixed"
        and candidate_row.get("area_level") == "oblast"
    ):
        return "EXPECTED_SOURCE_PRECISION_CORRECTION"
    if (
        field in EXPECTED_MISSINGNESS_FIELDS
        and candidate_row.get("area_level") in {"oblast", "national"}
        and (
            candidate_row.get("area_level") == "national"
            or candidate_row.get("coverage_status") in {"not_covered", "unavailable"}
        )
    ):
        return "EXPECTED_MISSINGNESS_WEIGHTING_CORRECTION"
    if field == "school_time_under_alarm_pct":
        try:
            left = Decimal(str(baseline))
            right = Decimal(str(candidate))
            if abs(left - right) <= Decimal("1e-12") and round(left, 6) == round(right, 6):
                return "EXPECTED_DERIVED_METADATA_CHANGE"
        except InvalidOperation:
            pass
    return "UNEXPECTED"


def compare_rows(
    baseline_rows: list[dict[str, Any]],
    candidate_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    baseline_by_key = {row_key(row): row for row in baseline_rows}
    candidate_by_key = {row_key(row): row for row in candidate_rows}
    baseline_keys = set(baseline_by_key)
    candidate_keys = set(candidate_by_key)
    missing = baseline_keys - candidate_keys
    added = candidate_keys - baseline_keys
    category_counts: Counter[str] = Counter()
    field_counts: Counter[str] = Counter()
    changed_rows: set[tuple[str, str, str, str]] = set()
    samples: list[dict[str, Any]] = []

    for key in sorted(baseline_keys & candidate_keys):
        baseline_row = baseline_by_key[key]
        candidate_row = candidate_by_key[key]
        for field in sorted(set(baseline_row) | set(candidate_row)):
            baseline = baseline_row.get(field)
            candidate = candidate_row.get(field)
            if equal(baseline, candidate):
                continue
            category = classify(field, baseline, candidate, baseline_row, candidate_row)
            changed_rows.add(key)
            category_counts[category] += 1
            field_counts[field] += 1
            if len(samples) < 20:
                samples.append({
                    "key": list(key),
                    "field": field,
                    "baseline": normalize(baseline),
                    "candidate": normalize(candidate),
                    "category": category,
                })

    category_counts["UNEXPECTED"] += len(missing) + len(added)
    return {
        "baseline_row_count": len(baseline_rows),
        "candidate_row_count": len(candidate_rows),
        "missing_key_count": len(missing),
        "added_key_count": len(added),
        "changed_row_count": len(changed_rows),
        "changed_field_count": sum(category_counts.values()),
        "category_counts": {category: category_counts[category] for category in CATEGORIES},
        "field_counts": dict(sorted(field_counts.items())),
        "samples": samples,
    }


def read_csv(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def payload_files(root: Path) -> dict[str, Path]:
    return {
        path.relative_to(root).as_posix(): path
        for path in root.rglob("*.json")
        if path.name not in {"metadata.json", "payload_manifest.json"}
    }


def combine(results: list[dict[str, Any]]) -> dict[str, Any]:
    categories: Counter[str] = Counter()
    for result in results:
        categories.update(result["category_counts"])
    return {
        "changed_row_count": sum(result["changed_row_count"] for result in results),
        "changed_field_count": sum(result["changed_field_count"] for result in results),
        "missing_key_count": sum(result["missing_key_count"] for result in results),
        "added_key_count": sum(result["added_key_count"] for result in results),
        "category_counts": {category: categories[category] for category in CATEGORIES},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-final", type=Path, required=True)
    parser.add_argument("--candidate-final", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    baseline_metadata = json.loads(
        (args.baseline_final / "payloads/metadata.json").read_text(encoding="utf-8")
    )
    candidate_metadata = json.loads(
        (args.candidate_final / "payloads/metadata.json").read_text(encoding="utf-8")
    )
    canonical = {
        name: compare_rows(
            read_csv(args.baseline_final / "analytical" / name),
            read_csv(args.candidate_final / "analytical" / name),
        )
        for name in CANONICAL_TABLES
    }

    baseline_payloads = payload_files(args.baseline_final / "payloads")
    candidate_payloads = payload_files(args.candidate_final / "payloads")
    payloads: dict[str, dict[str, Any]] = {}
    for name in sorted(set(baseline_payloads) | set(candidate_payloads)):
        if name not in baseline_payloads or name not in candidate_payloads:
            payloads[name] = {
                "baseline_row_count": 0,
                "candidate_row_count": 0,
                "missing_key_count": int(name not in candidate_payloads),
                "added_key_count": int(name not in baseline_payloads),
                "changed_row_count": 0,
                "changed_field_count": 1,
                "category_counts": {category: int(category == "UNEXPECTED") for category in CATEGORIES},
                "field_counts": {},
                "samples": [],
            }
            continue
        payloads[name] = compare_rows(
            json.loads(baseline_payloads[name].read_text(encoding="utf-8")),
            json.loads(candidate_payloads[name].read_text(encoding="utf-8")),
        )

    canonical_summary = combine(list(canonical.values()))
    payload_summary = combine(list(payloads.values()))
    unexpected = (
        canonical_summary["category_counts"]["UNEXPECTED"]
        + payload_summary["category_counts"]["UNEXPECTED"]
    )
    report = {
        "schema_version": 1,
        "status": "PASS" if unexpected == 0 else "FAIL",
        "baseline_build_id": baseline_metadata["build_id"],
        "candidate_build_id": candidate_metadata["build_id"],
        "source_identity": {
            "sha256": candidate_metadata["source_sha256"],
            "upstream_commit": candidate_metadata["source_provenance"]["resolved_upstream_commit_sha"],
            "git_blob_sha1": candidate_metadata["source_provenance"]["upstream_git_blob_sha1"],
        },
        "same_source_sha256": baseline_metadata["source_sha256"] == candidate_metadata["source_sha256"],
        "unexpected_difference_count": unexpected,
        "canonical_summary": canonical_summary,
        "payload_summary": payload_summary,
        "canonical_tables": canonical,
        "analytical_payloads": payloads,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "baseline_build_id": report["baseline_build_id"],
        "candidate_build_id": report["candidate_build_id"],
        "same_source_sha256": report["same_source_sha256"],
        "unexpected_difference_count": report["unexpected_difference_count"],
        "canonical_summary": report["canonical_summary"],
        "payload_summary": report["payload_summary"],
    }, indent=2))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
