#!/usr/bin/env python3
"""Compare two public alarm-source snapshots without publishing source rows."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from bisect import bisect_left
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from aae_pipeline.calendar import build_school_days
from aae_pipeline.utils import parse_datetime_utc, read_csv_rows, read_json, sha256_file


COLUMNS = ("oblast", "raion", "hromada", "level", "started_at", "finished_at", "source")


def git_blob_sha1(path: Path) -> str:
    digest = hashlib.sha1()
    digest.update(f"blob {path.stat().st_size}\0".encode("ascii"))
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_counter(path: Path) -> tuple[Counter[tuple[str, ...]], int]:
    rows: Counter[tuple[str, ...]] = Counter()
    count = 0
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if tuple(reader.fieldnames or ()) != COLUMNS:
            raise ValueError(f"Unexpected source schema: {reader.fieldnames}")
        for row in reader:
            count += 1
            rows[tuple((row.get(column) or "").strip() for column in COLUMNS)] += 1
    return rows, count


def school_time_windows() -> tuple[list[datetime], list[datetime]]:
    assumptions = read_json(ROOT / "config/assumptions.json")
    years = [
        row["school_year"]
        for row in read_csv_rows(ROOT / assumptions["calendar"]["school_years_file"])
        if row.get("is_active", "1") != "0"
    ]
    start_bound = datetime(1900, 1, 1, tzinfo=timezone.utc)
    end_bound = datetime(2100, 1, 1, tzinfo=timezone.utc)
    windows = sorted(
        (day.utc_start, day.utc_end)
        for year in years
        for day in build_school_days(ROOT, assumptions, year, start_bound, end_bound)
    )
    return [item[0] for item in windows], [item[1] for item in windows]


def intersects_school_time(started: datetime, finished: datetime, starts: list[datetime], ends: list[datetime]) -> bool:
    index = bisect_left(starts, finished) - 1
    return index >= 0 and ends[index] > started


def summarize_difference(
    rows: Counter[tuple[str, ...]],
    starts: list[datetime],
    ends: list[datetime],
) -> dict[str, Any]:
    levels: Counter[str] = Counter()
    valid = invalid = intersects = 0
    earliest: datetime | None = None
    latest: datetime | None = None
    for row, multiplicity in rows.items():
        levels[row[3]] += multiplicity
        try:
            started = parse_datetime_utc(row[4])
            finished = parse_datetime_utc(row[5])
            if finished <= started:
                raise ValueError("non-positive interval")
        except Exception:
            invalid += multiplicity
            continue
        valid += multiplicity
        earliest = started if earliest is None else min(earliest, started)
        latest = finished if latest is None else max(latest, finished)
        if intersects_school_time(started, finished, starts, ends):
            intersects += multiplicity
    return {
        "record_count": sum(rows.values()),
        "distinct_record_count": len(rows),
        "valid_interval_count": valid,
        "invalid_interval_count": invalid,
        "declared_level_counts": dict(sorted(levels.items())),
        "coverage_start_utc": earliest.isoformat() if earliest else None,
        "coverage_end_utc": latest.isoformat() if latest else None,
        "intersects_published_assumed_school_time_count": intersects,
    }


def identity(path: Path, label: str) -> dict[str, Any]:
    return {
        "label": label,
        "size_bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "git_blob_sha1": git_blob_sha1(path),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--baseline-label", required=True)
    parser.add_argument("--candidate-label", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    baseline, baseline_count = read_counter(args.baseline)
    candidate, candidate_count = read_counter(args.candidate)
    added = candidate - baseline
    removed = baseline - candidate
    starts, ends = school_time_windows()
    added_summary = summarize_difference(added, starts, ends)
    removed_summary = summarize_difference(removed, starts, ends)
    status = "PASS" if (
        removed_summary["record_count"] == 0
        and added_summary["intersects_published_assumed_school_time_count"] == 0
    ) else "REVIEW_REQUIRED"
    report = {
        "schema_version": 1,
        "status": status,
        "published_window_definition": {
            "school_years": "active governed school-year rows",
            "weekdays": "governed Monday-Friday rule",
            "vacations": "governed configured vacations",
            "operating_window": "08:00-15:00 Europe/Kyiv",
        },
        "baseline": {**identity(args.baseline, args.baseline_label), "input_row_count": baseline_count},
        "candidate": {**identity(args.candidate, args.candidate_label), "input_row_count": candidate_count},
        "added": added_summary,
        "removed": removed_summary,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
