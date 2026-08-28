from __future__ import annotations

import csv
import gzip
from collections import Counter
from contextlib import ExitStack
from datetime import datetime
from pathlib import Path
from typing import Any

from .geography import GeographyIndex, normalize_level
from .pipeline import REQUIRED_ALARM_COLUMNS
from .utils import clean_dir, ensure_dir, iso_utc, parse_datetime_utc, sha256_file, stable_id, write_csv_rows, write_json


class DetailedMappingError(RuntimeError):
    def __init__(self, summary: dict[str, Any]):
        self.summary = summary
        super().__init__(
            "Detailed source mapping failed for "
            f"{summary['detailed_mapping_failure_count']} valid unique official row(s); "
            "see prepared_source/audit/detailed_mapping_results.csv.gz"
        )


class SourceContractError(RuntimeError):
    def __init__(self, summary: dict[str, Any]):
        self.summary = summary
        super().__init__(
            "Official source contract failed for "
            f"{summary['source_contract_violation_count']} row(s); "
            "see prepared_source/audit/source_contract_violations.csv"
        )


def prepare_alarm_source(
    *,
    alarm_source: Path,
    output_dir: Path,
    geography: GeographyIndex,
    assumptions: dict[str, Any],
    source_contract: dict[str, Any] | None = None,
    clean: bool = True,
) -> dict[str, Any]:
    """Validate, map, deduplicate and partition the complete official source."""
    if clean:
        clean_dir(output_dir)
    else:
        ensure_dir(output_dir)
    partitions_dir = ensure_dir(output_dir / "partitions")
    audit_dir = ensure_dir(output_dir / "audit")

    source_contract = source_contract or {}
    expected_columns = list(source_contract.get("columns") or REQUIRED_ALARM_COLUMNS)
    if expected_columns != REQUIRED_ALARM_COLUMNS:
        raise ValueError("Configured source columns disagree with the executable contract")
    allowed_sources = set(source_contract.get("allowed_source_values") or ["official"])
    if not allowed_sources:
        raise ValueError("At least one allowed source-domain value is required")

    invalid: list[dict[str, Any]] = []
    duplicates: list[dict[str, Any]] = []
    long_rows: list[dict[str, Any]] = []
    mapping_failures: list[dict[str, Any]] = []
    contract_violations: list[dict[str, Any]] = []
    seen: set[tuple[str, ...]] = set()
    partition_counts: dict[str, int] = {}
    input_count = valid_count = mapped_count = duplicate_count = 0
    min_start: datetime | None = None
    max_finish: datetime | None = None
    long_limit = float(assumptions["alarm_intervals"]["long_interval_review_hours"])
    level_counts: Counter[str] = Counter()
    route_counts: Counter[str] = Counter()
    unmapped_by_level: Counter[str] = Counter()
    source_value_counts: Counter[str] = Counter()

    fieldnames = list(REQUIRED_ALARM_COLUMNS)
    mapping_fields = [
        "row_number",
        "declared_level",
        "mapping_route",
        "mapping_status",
        "canonical_oblast_id",
        "target_hromada_count",
        "issue",
        "oblast",
        "raion",
        "hromada",
    ]
    mapping_path = audit_dir / "detailed_mapping_results.csv.gz"

    with ExitStack() as stack:
        writers: dict[str, csv.DictWriter] = {}
        mapping_handle = stack.enter_context(gzip.open(mapping_path, "wt", encoding="utf-8", newline=""))
        mapping_writer = csv.DictWriter(mapping_handle, fieldnames=mapping_fields)
        mapping_writer.writeheader()

        def writer_for(oblast_id: str) -> csv.DictWriter:
            if oblast_id not in writers:
                path = partitions_dir / f"{oblast_id}.csv.gz"
                handle = stack.enter_context(gzip.open(path, "wt", encoding="utf-8", newline=""))
                writer = csv.DictWriter(handle, fieldnames=fieldnames)
                writer.writeheader()
                writers[oblast_id] = writer
                partition_counts[oblast_id] = 0
            return writers[oblast_id]

        with alarm_source.open("r", encoding="utf-8-sig", newline="") as source_handle:
            reader = csv.DictReader(source_handle)
            actual_columns = list(reader.fieldnames or [])
            if actual_columns != fieldnames:
                raise ValueError(
                    "Alarm source schema mismatch: "
                    f"expected exact columns {fieldnames}, received {actual_columns}"
                )

            for row_number, row in enumerate(reader, start=2):
                input_count += 1
                normalized = {key: (row.get(key) or "").strip() for key in fieldnames}
                source_value_counts[normalized["source"]] += 1
                if normalized["source"] not in allowed_sources:
                    violation = {
                        "row_number": row_number,
                        "issue": f"unsupported source-domain value: {normalized['source'] or '<blank>'}",
                        **normalized,
                    }
                    invalid.append(violation)
                    contract_violations.append(violation)
                    continue

                # The accepted analytical deduplication key intentionally excludes the
                # source field. The strict source-domain invariant above makes that safe.
                source_key = tuple(normalized[c] for c in fieldnames[:-1])
                if source_key in seen:
                    duplicate_count += 1
                    duplicates.append({"row_number": row_number, "issue": "exact duplicate source row", **normalized})
                    continue
                seen.add(source_key)

                try:
                    started = parse_datetime_utc(normalized["started_at"])
                    finished = parse_datetime_utc(normalized["finished_at"])
                except Exception as exc:
                    invalid.append({"row_number": row_number, "issue": f"timestamp parse error: {exc}", **normalized})
                    continue
                if finished <= started:
                    invalid.append({"row_number": row_number, "issue": "finished_at is not after started_at", **normalized})
                    continue

                valid_count += 1
                declared_level = normalize_level(normalized["level"])
                level_counts[declared_level or "<blank>"] += 1
                min_start = started if min_start is None else min(min_start, started)
                max_finish = finished if max_finish is None else max(max_finish, finished)
                duration_hours = (finished - started).total_seconds() / 3600
                if duration_hours > long_limit:
                    long_rows.append({
                        "row_number": row_number,
                        "duration_hours": round(duration_hours, 6),
                        "issue": "long valid interval for review",
                        **normalized,
                    })

                allocations, issue, route = geography.allocate_with_route(normalized)
                route_counts[route] += 1
                canonical_oblast_id = allocations[0].oblast_id if allocations else ""
                mapping_writer.writerow({
                    "row_number": row_number,
                    "declared_level": declared_level,
                    "mapping_route": route,
                    "mapping_status": "PASS" if issue is None else "FAIL",
                    "canonical_oblast_id": canonical_oblast_id,
                    "target_hromada_count": len(allocations),
                    "issue": issue or "",
                    "oblast": normalized["oblast"],
                    "raion": normalized["raion"],
                    "hromada": normalized["hromada"],
                })
                if issue:
                    unmapped_by_level[declared_level or "<blank>"] += 1
                    mapping_failures.append({"row_number": row_number, "issue": issue, **normalized})
                    continue

                mapped_count += 1
                writer_for(canonical_oblast_id).writerow(normalized)
                partition_counts[canonical_oblast_id] += 1

    alert_fields = [
        "row_number", "issue", "duration_hours", "oblast", "raion", "hromada", "level",
        "started_at", "finished_at", "source",
    ]
    write_csv_rows(audit_dir / "invalid_alert_rows.csv", invalid, alert_fields)
    write_csv_rows(audit_dir / "duplicate_alert_rows.csv", duplicates, alert_fields)
    write_csv_rows(audit_dir / "long_interval_review.csv", long_rows, alert_fields)
    write_csv_rows(audit_dir / "detailed_mapping_failures.csv", mapping_failures, alert_fields)
    write_csv_rows(audit_dir / "source_contract_violations.csv", contract_violations, alert_fields)

    partitions = []
    for oblast_id in sorted(partition_counts):
        path = partitions_dir / f"{oblast_id}.csv.gz"
        partitions.append({
            "oblast_id": oblast_id,
            "row_count": partition_counts[oblast_id],
            "path": path.relative_to(output_dir).as_posix(),
            "size_bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        })

    summary = {
        "source_filename": alarm_source.name,
        "source_size_bytes": alarm_source.stat().st_size,
        "source_sha256": sha256_file(alarm_source),
        "input_row_count": input_count,
        "valid_unique_source_row_count": valid_count,
        "valid_unique_partitioned_row_count": mapped_count,
        "mapped_valid_unique_row_count": mapped_count,
        "exact_duplicate_row_count": duplicate_count,
        "invalid_row_count": len(invalid),
        "source_value_counts": dict(sorted(source_value_counts.items())),
        "source_contract_violation_count": len(contract_violations),
        "declared_level_counts": dict(sorted(level_counts.items())),
        "mapping_route_counts": dict(sorted(route_counts.items())),
        "unmapped_by_declared_level": dict(sorted(unmapped_by_level.items())),
        "unmapped_oblast_row_count": route_counts["unmapped_oblast"],
        "unmapped_raion_row_count": route_counts["unmapped_raion"],
        "unmapped_hromada_row_count": route_counts["unmapped_hromada"],
        "unsupported_level_row_count": route_counts["unsupported_level"],
        "ambiguous_mapping_row_count": route_counts["ambiguous_hromada"],
        "detailed_mapping_failure_count": len(mapping_failures),
        "long_interval_review_row_count": len(long_rows),
        "coverage_start_utc": iso_utc(min_start) if min_start else None,
        "coverage_end_utc": iso_utc(max_finish) if max_finish else None,
        "partition_count": len(partitions),
        "partitions": partitions,
        "mapping_audit": {
            "path": mapping_path.relative_to(output_dir).as_posix(),
            "size_bytes": mapping_path.stat().st_size,
            "sha256": sha256_file(mapping_path),
        },
        "preparation_id": "PREP-" + stable_id(
            sha256_file(alarm_source), valid_count, mapped_count, len(partitions), length=16
        ),
    }
    write_json(output_dir / "source_preparation.json", summary)
    if contract_violations:
        raise SourceContractError(summary)
    if mapping_failures:
        raise DetailedMappingError(summary)
    return summary
