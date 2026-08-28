#!/usr/bin/env python3
"""Produce a bounded field-level differential for two complete analytical builds."""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
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
NUMERIC_MARKERS = (
    "alarm_seconds", "alarm_hours", "school_time_under_alarm_pct", "affected_school_days",
    "available_school_days", "expected_school_days", "school_time_alarm_episodes", "school_count",
    "learners_total", "learners_offline", "learners_online", "learners_mixed",
)
NOT_COVERED_NULL_FIELDS = {
    "alarm_seconds", "alarm_hours", "affected_school_days", "school_time_alarm_episodes",
    "alarm_seconds_average_school_location", "alarm_hours_average_school_location",
    "affected_school_days_average_school_location",
    "school_time_alarm_episodes_average_school_location",
}


def row_key(row: dict[str, Any]) -> tuple[str, ...]:
    area = row.get("hromada_id") or row.get("area_id")
    if not area:
        raise ValueError(f"Analytical row has no area identity: {row}")
    return (
        str(row.get("school_year", "")),
        str(row.get("period_type", "")),
        str(row.get("period_id", "")),
        str(area),
    )


def numeric_equal(left: Any, right: Any) -> bool:
    if left is None or right is None or left == "" or right == "":
        return left in (None, "") and right in (None, "")
    try:
        return Decimal(str(left)) == Decimal(str(right))
    except InvalidOperation:
        return False


def is_numeric_field(field: str) -> bool:
    return field.startswith(("available_school_seconds", "expected_school_seconds")) or any(
        marker in field for marker in NUMERIC_MARKERS
    )


def classify(field: str, baseline: Any, candidate: Any, candidate_row: dict[str, Any]) -> str:
    if field == "coverage_status" and baseline == "unavailable" and candidate == "not_covered":
        return "authorized_not_covered_status"
    if (
        field in NOT_COVERED_NULL_FIELDS
        and candidate_row.get("coverage_status") == "not_covered"
        and baseline in (0, 0.0, "0", "0.0")
        and candidate in (None, "")
    ):
        return "authorized_not_covered_missingness"
    return "prohibited"


def compare_rows(
    baseline_rows: list[dict[str, Any]],
    candidate_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    baseline_by_key = {row_key(row): row for row in baseline_rows}
    candidate_by_key = {row_key(row): row for row in candidate_rows}
    baseline_keys = set(baseline_by_key)
    candidate_keys = set(candidate_by_key)
    aggregates: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "samples": []}
    )
    actual_numeric_changes = 0

    for key in sorted(baseline_keys & candidate_keys):
        baseline = baseline_by_key[key]
        candidate = candidate_by_key[key]
        for field in sorted(set(baseline) | set(candidate)):
            left = baseline.get(field)
            right = candidate.get(field)
            equal = numeric_equal(left, right) if is_numeric_field(field) else left == right
            if equal:
                continue
            category = classify(field, left, right, candidate)
            aggregate = aggregates[(category, field)]
            aggregate["count"] += 1
            if len(aggregate["samples"]) < 5:
                aggregate["samples"].append({
                    "key": list(key),
                    "baseline": left,
                    "candidate": right,
                })
            if is_numeric_field(field) and category == "prohibited":
                actual_numeric_changes += 1

    fields = [
        {"category": category, "field": field, **aggregate}
        for (category, field), aggregate in sorted(aggregates.items())
    ]
    return {
        "baseline_row_count": len(baseline_rows),
        "candidate_row_count": len(candidate_rows),
        "missing_key_count": len(baseline_keys - candidate_keys),
        "added_key_count": len(candidate_keys - baseline_keys),
        "field_differences": fields,
        "authorized_difference_count": sum(
            item["count"] for item in fields if item["category"].startswith("authorized_")
        ),
        "prohibited_difference_count": sum(
            item["count"] for item in fields if item["category"] == "prohibited"
        ),
        "actual_numeric_value_change_count": actual_numeric_changes,
    }


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def payload_files(root: Path) -> dict[str, Path]:
    return {
        path.relative_to(root).as_posix(): path
        for path in root.rglob("*.json")
        if path.name not in {"metadata.json", "payload_manifest.json"}
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-final", type=Path, required=True)
    parser.add_argument("--candidate-final", type=Path, required=True)
    parser.add_argument("--baseline-label", required=True)
    parser.add_argument("--candidate-label", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    canonical: dict[str, Any] = {}
    for name in CANONICAL_TABLES:
        canonical[name] = compare_rows(
            read_csv(args.baseline_final / "analytical" / name),
            read_csv(args.candidate_final / "analytical" / name),
        )

    baseline_payloads = payload_files(args.baseline_final / "payloads")
    candidate_payloads = payload_files(args.candidate_final / "payloads")
    payload_results: dict[str, Any] = {}
    for name in sorted(set(baseline_payloads) | set(candidate_payloads)):
        if name not in baseline_payloads or name not in candidate_payloads:
            payload_results[name] = {
                "missing_from": "baseline" if name not in baseline_payloads else "candidate",
                "prohibited_difference_count": 1,
                "actual_numeric_value_change_count": 0,
                "authorized_difference_count": 0,
            }
            continue
        baseline_rows = json.loads(baseline_payloads[name].read_text(encoding="utf-8"))
        candidate_rows = json.loads(candidate_payloads[name].read_text(encoding="utf-8"))
        payload_results[name] = compare_rows(baseline_rows, candidate_rows)

    sections = list(canonical.values()) + list(payload_results.values())
    prohibited = sum(item["prohibited_difference_count"] for item in sections)
    numeric = sum(item["actual_numeric_value_change_count"] for item in sections)
    missing_or_added = sum(
        item.get("missing_key_count", 0) + item.get("added_key_count", 0) for item in sections
    )
    report = {
        "schema_version": 1,
        "baseline": args.baseline_label,
        "candidate": args.candidate_label,
        "status": "PASS" if prohibited == 0 and numeric == 0 and missing_or_added == 0 else "FAIL",
        "canonical_table_count": len(canonical),
        "analytical_payload_count": len(payload_results),
        "actual_analytical_numeric_value_change_count": numeric,
        "prohibited_field_difference_count": prohibited,
        "missing_or_added_key_count": missing_or_added,
        "authorized_difference_count": sum(item["authorized_difference_count"] for item in sections),
        "canonical_tables": canonical,
        "analytical_payloads": payload_results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in (
        "status", "canonical_table_count", "analytical_payload_count",
        "actual_analytical_numeric_value_change_count", "prohibited_field_difference_count",
        "missing_or_added_key_count", "authorized_difference_count",
    )}, indent=2))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
