from __future__ import annotations

import csv
import gzip
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .acquisition import download_verified_source, git_blob_sha1_file
from .aggregate import aggregate_hromada_periods, aggregate_multi_area, coverage_status
from .calendar import build_school_days
from .education import load_education_context
from .geography import GeographyIndex
from .governance import load_governed_versions
from .intervals import merge_allocated_intervals, overlap_seconds
from .payloads import build_payloads
from .utils import (
    clean_dir,
    ensure_dir,
    file_inventory,
    iso_utc,
    iter_csv_rows,
    parse_datetime_utc,
    read_json,
    sha256_file,
    stable_id,
    utc_now_iso,
    write_csv_rows,
    write_json,
)

REQUIRED_ALARM_COLUMNS = [
    "oblast", "raion", "hromada", "level", "started_at", "finished_at", "source"
]


def download_alarm_source(
    url: str,
    destination: Path,
    *,
    expected_size: int | None = None,
    expected_git_blob_sha1: str | None = None,
    expected_sha256: str | None = None,
) -> dict[str, Any]:
    """Compatibility wrapper around the fail-closed verified downloader."""
    return download_verified_source(
        url,
        destination,
        expected_size=expected_size,
        expected_git_blob_sha1=expected_git_blob_sha1,
        expected_sha256=expected_sha256,
    )


def run_build(
    root: Path,
    output_dir: Path,
    alarm_source: Path | None,
    school_year: str,
    coverage_start_utc: datetime | None,
    coverage_end_utc: datetime | None,
    oblast_ids: list[str] | None,
    clean: bool = True,
    download_if_missing: bool = True,
    source_filter_start_utc: datetime | None = None,
    source_filter_end_utc: datetime | None = None,
    controlled_input_root: Path | None = None,
    source_provenance: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if clean:
        clean_dir(output_dir)
    else:
        ensure_dir(output_dir)

    assumptions = read_json(root / "config/assumptions.json")
    sources = read_json(root / "config/sources.json")
    governed_versions = load_governed_versions(root, assumptions)
    build_started = utc_now_iso()
    build_id = "AAE-" + stable_id(build_started, school_year, oblast_ids or "all", length=16)

    raw_dir = ensure_dir(output_dir / "raw")
    checkpoints_dir = ensure_dir(output_dir / "checkpoints")
    analytical_dir = ensure_dir(output_dir / "analytical")
    audit_dir = ensure_dir(output_dir / "audit")
    payload_dir = ensure_dir(output_dir / "payloads")

    if alarm_source is None:
        raise ValueError(
            "A single build requires an explicit verified source; use local-build for live GitHub resolution"
        )
    alarm_source = alarm_source.resolve()
    if not alarm_source.exists():
        raise FileNotFoundError(alarm_source)

    geography = GeographyIndex(root, sources)
    selected_hromada_ids = geography.selected_hromada_ids(oblast_ids)
    selected_hromadas = set(selected_hromada_ids)
    selected_oblast_ids = sorted({geography.hromada_by_id[h]["oblast_id"] for h in selected_hromada_ids})

    allocated, invalid_alerts, unmapped_alerts, duplicate_alerts, long_interval_rows, source_summary = _load_and_allocate_alarms(
        alarm_source, geography, selected_hromadas, assumptions,
        source_filter_start_utc=source_filter_start_utc,
        source_filter_end_utc=source_filter_end_utc,
    )
    if coverage_start_utc is None:
        coverage_start_utc = source_summary["min_started_at_utc"]
    if coverage_end_utc is None:
        coverage_end_utc = source_summary["max_finished_at_utc"]
    if coverage_start_utc is None or coverage_end_utc is None or coverage_end_utc <= coverage_start_utc:
        raise ValueError("Could not determine a valid source coverage interval")

    merged = merge_allocated_intervals(allocated)
    school_days = build_school_days(root, assumptions, school_year, coverage_start_utc, coverage_end_utc)
    education, education_issues, education_summary = load_education_context(
        root,
        sources,
        geography,
        school_year,
        selected_hromadas,
        controlled_input_root=controlled_input_root,
    )
    daily_rows = _build_daily_rows(
        school_days,
        selected_hromada_ids,
        merged,
        geography,
        set(sources.get("coverage_exceptions", {}).get("not_covered_oblast_ids", [])),
    )
    hromada_monthly, hromada_school_year = aggregate_hromada_periods(
        daily_rows, education, geography.hromada_by_id
    )
    oblast_monthly = aggregate_multi_area(hromada_monthly, "oblast")
    oblast_school_year = aggregate_multi_area(hromada_school_year, "oblast")
    national_monthly = aggregate_multi_area(hromada_monthly, "national")
    national_school_year = aggregate_multi_area(hromada_school_year, "national")

    _write_checkpoints(checkpoints_dir, allocated, merged, daily_rows)
    _write_analytical(
        analytical_dir,
        hromada_monthly,
        hromada_school_year,
        oblast_monthly,
        oblast_school_year,
        national_monthly,
        national_school_year,
    )

    provenance = source_provenance or {
        "source_mode": "internal_verified_partition" if alarm_source.suffix == ".gz" else "explicit_local_source",
        "source_filename": alarm_source.name,
        "sha256": sha256_file(alarm_source),
        "actual_bytes_received": alarm_source.stat().st_size,
        "recomputed_git_blob_sha1": git_blob_sha1_file(alarm_source),
        "retrieval_started_at_utc": None,
        "retrieval_completed_at_utc": None,
    }
    metadata = {
        "build_id": build_id,
        "build_started_at_utc": build_started,
        **governed_versions,
        "school_year": school_year,
        "coverage_start_utc": iso_utc(coverage_start_utc),
        "coverage_end_utc": iso_utc(coverage_end_utc),
        "selected_oblast_ids": selected_oblast_ids,
        "education_snapshot_date": education_summary["snapshot_date"],
        "alarm_source_filename": alarm_source.name,
        "alarm_source_sha256": sha256_file(alarm_source),
        "alarm_source_row_count": source_summary["input_row_count"],
        "source_provenance": provenance,
        "timezone": assumptions["timezone"],
        "school_operating_window": assumptions["school_operating_window"],
    }
    payload_manifest = build_payloads(
        payload_dir,
        metadata,
        hromada_monthly,
        hromada_school_year,
        oblast_monthly,
        oblast_school_year,
        national_monthly,
        national_school_year,
    )

    audit = _write_audit(
        root=root,
        output_dir=output_dir,
        audit_dir=audit_dir,
        alarm_source=alarm_source,
        metadata=metadata,
        source_summary=source_summary,
        education_summary=education_summary,
        invalid_alerts=invalid_alerts,
        unmapped_alerts=unmapped_alerts,
        duplicate_alerts=duplicate_alerts,
        long_interval_rows=long_interval_rows,
        education_issues=education_issues,
        daily_rows=daily_rows,
        hromada_monthly=hromada_monthly,
        hromada_school_year=hromada_school_year,
        oblast_monthly=oblast_monthly,
        national_monthly=national_monthly,
        payload_manifest=payload_manifest,
        geography=geography,
        selected_oblast_ids=selected_oblast_ids,
    )
    return audit


def _load_and_allocate_alarms(
    alarm_source: Path,
    geography: GeographyIndex,
    selected_hromadas: set[str],
    assumptions: dict[str, Any],
    source_filter_start_utc: datetime | None = None,
    source_filter_end_utc: datetime | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    allocated: list[dict[str, Any]] = []
    invalid: list[dict[str, Any]] = []
    unmapped: list[dict[str, Any]] = []
    duplicates: list[dict[str, Any]] = []
    long_rows: list[dict[str, Any]] = []
    input_count = 0
    valid_source_count = 0
    min_start: datetime | None = None
    max_finish: datetime | None = None
    seen_source_keys: set[tuple[str, ...]] = set()
    duplicate_count = 0
    long_interval_count = 0

    opener = gzip.open if alarm_source.suffix == ".gz" else open
    with opener(alarm_source, "rt", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if list(reader.fieldnames or []) != REQUIRED_ALARM_COLUMNS:
            raise ValueError(
                "Alarm source schema mismatch: "
                f"expected exact columns {REQUIRED_ALARM_COLUMNS}, received {list(reader.fieldnames or [])}"
            )
        for row_number, row in enumerate(reader, start=2):
            input_count += 1
            if (row.get("source") or "").strip() != "official":
                raise ValueError(
                    f"Unsupported source-domain value on row {row_number}: {row.get('source')!r}"
                )
            source_key = tuple((row.get(c) or "").strip() for c in REQUIRED_ALARM_COLUMNS[:-1])
            if source_key in seen_source_keys:
                duplicate_count += 1
                duplicates.append({"row_number": row_number, "issue": "exact duplicate source row", **row})
                continue
            seen_source_keys.add(source_key)
            try:
                started = parse_datetime_utc(row["started_at"])
                finished = parse_datetime_utc(row["finished_at"])
            except Exception as exc:
                invalid.append({"row_number": row_number, "issue": f"timestamp parse error: {exc}", **row})
                continue
            if finished <= started:
                invalid.append({"row_number": row_number, "issue": "finished_at is not after started_at", **row})
                continue
            valid_source_count += 1
            min_start = started if min_start is None else min(min_start, started)
            max_finish = finished if max_finish is None else max(max_finish, finished)
            if source_filter_start_utc is not None and finished <= source_filter_start_utc:
                continue
            if source_filter_end_utc is not None and started >= source_filter_end_utc:
                continue
            duration_hours = (finished - started).total_seconds() / 3600
            if duration_hours > float(assumptions["alarm_intervals"]["long_interval_review_hours"]):
                long_interval_count += 1
                long_rows.append({
                    "row_number": row_number,
                    "duration_hours": round(duration_hours, 6),
                    "issue": "long valid interval for review",
                    **row,
                })
            allocations, issue = geography.allocate(row)
            if issue:
                unmapped.append({"row_number": row_number, "issue": issue, **row})
                continue
            source_row_id = "R-" + stable_id(row_number, *source_key)
            for target in allocations:
                if target.hromada_id not in selected_hromadas:
                    continue
                allocated.append({
                    "source_row_id": source_row_id,
                    "hromada_id": target.hromada_id,
                    "oblast_id": target.oblast_id,
                    "raion_id": target.raion_id,
                    "started_at": started,
                    "finished_at": finished,
                    "source_level": target.source_level,
                    "precision_label": target.precision_label,
                    "source": row.get("source", ""),
                })

    summary = {
        "input_row_count": input_count,
        "valid_unique_source_row_count": valid_source_count,
        "exact_duplicate_source_row_count": duplicate_count,
        "invalid_source_row_count": len(invalid),
        "unmapped_source_row_count": len(unmapped),
        "allocated_interval_row_count": len(allocated),
        "long_interval_review_count": long_interval_count,
        "min_started_at_utc": min_start,
        "max_finished_at_utc": max_finish,
    }
    if unmapped:
        first = unmapped[0]
        raise RuntimeError(
            "Detailed mapping hard gate failed during analytical allocation: "
            f"{len(unmapped)} row(s); first={first.get('issue')}"
        )
    return allocated, invalid, unmapped, duplicates, long_rows, summary


def _build_daily_rows(
    school_days,
    hromada_ids: list[str],
    episodes: list[dict[str, Any]],
    geography: GeographyIndex,
    not_covered_oblast_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    episodes_by_hromada: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for episode in episodes:
        episodes_by_hromada[episode["hromada_id"]].append(episode)

    rows: list[dict[str, Any]] = []
    not_covered_oblast_ids = not_covered_oblast_ids or set()
    for hromada_id in hromada_ids:
        meta = geography.hromada_by_id[hromada_id]
        area_is_covered = meta["oblast_id"] not in not_covered_oblast_ids
        h_episodes = episodes_by_hromada.get(hromada_id, [])
        for school_day in school_days:
            episode_ids: set[str] = set()
            source_levels: set[str] = set()
            alarm_seconds = 0
            available_school_seconds = school_day.available_seconds if area_is_covered else 0
            if available_school_seconds > 0:
                for episode in h_episodes:
                    if episode["finished_at"] <= school_day.available_start_utc:
                        continue
                    if episode["started_at"] >= school_day.available_end_utc:
                        break
                    seconds = overlap_seconds(
                        episode["started_at"],
                        episode["finished_at"],
                        school_day.available_start_utc,
                        school_day.available_end_utc,
                    )
                    if seconds > 0:
                        alarm_seconds += seconds
                        episode_ids.add(episode["episode_id"])
                        source_levels.update(episode["source_levels"])
            if alarm_seconds > available_school_seconds:
                raise AssertionError(
                    f"Daily alarm seconds exceed available school time: {hromada_id} {school_day.day}"
                )
            rows.append({
                "school_year": school_day.school_year,
                "date": school_day.day.isoformat(),
                "month": school_day.day.strftime("%Y-%m"),
                "oblast_id": meta["oblast_id"],
                "raion_id": meta["raion_id"],
                "hromada_id": hromada_id,
                "alarm_seconds": alarm_seconds,
                "available_school_seconds": available_school_seconds,
                "expected_school_seconds": school_day.expected_seconds,
                "affected_school_day": 1 if alarm_seconds > 0 else 0,
                "episode_ids": sorted(episode_ids),
                "source_levels": sorted(source_levels),
                "coverage_status": coverage_status(
                    available_school_seconds,
                    school_day.expected_seconds,
                    ["not_covered"] if not area_is_covered else None,
                ),
            })
    return rows


def _serialise_interval_row(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    for field in ["started_at", "finished_at"]:
        if isinstance(out.get(field), datetime):
            out[field] = iso_utc(out[field])
    return out


def _write_checkpoints(checkpoints_dir: Path, allocated, merged, daily_rows) -> None:
    allocated_fields = [
        "source_row_id", "hromada_id", "oblast_id", "raion_id", "started_at", "finished_at",
        "source_level", "precision_label", "source"
    ]
    merged_fields = [
        "episode_id", "hromada_id", "oblast_id", "raion_id", "started_at", "finished_at",
        "source_levels", "precision_labels", "source_row_count"
    ]
    daily_fields = [
        "school_year", "date", "month", "oblast_id", "raion_id", "hromada_id", "alarm_seconds",
        "available_school_seconds", "expected_school_seconds", "affected_school_day", "episode_ids", "source_levels",
        "coverage_status",
    ]
    write_csv_rows(checkpoints_dir / "01_allocated_intervals.csv.gz", [_serialise_interval_row(r) for r in allocated], allocated_fields)
    write_csv_rows(checkpoints_dir / "02_merged_episodes.csv.gz", [_serialise_interval_row(r) for r in merged], merged_fields)
    write_csv_rows(checkpoints_dir / "03_hromada_school_day.csv.gz", daily_rows, daily_fields)


def _write_analytical(
    analytical_dir: Path,
    hromada_monthly,
    hromada_school_year,
    oblast_monthly,
    oblast_school_year,
    national_monthly,
    national_school_year,
) -> None:
    datasets = {
        "hromada_monthly.csv": hromada_monthly,
        "hromada_school_year.csv": hromada_school_year,
        "oblast_monthly.csv": oblast_monthly,
        "oblast_school_year.csv": oblast_school_year,
        "national_monthly.csv": national_monthly,
        "national_school_year.csv": national_school_year,
    }
    for name, rows in datasets.items():
        write_csv_rows(analytical_dir / name, rows)


def _write_audit(
    *,
    root: Path,
    output_dir: Path,
    audit_dir: Path,
    alarm_source: Path,
    metadata: dict[str, Any],
    source_summary: dict[str, Any],
    education_summary: dict[str, Any],
    invalid_alerts,
    unmapped_alerts,
    duplicate_alerts,
    long_interval_rows,
    education_issues,
    daily_rows,
    hromada_monthly,
    hromada_school_year,
    oblast_monthly,
    national_monthly,
    payload_manifest,
    geography: GeographyIndex,
    selected_oblast_ids: list[str],
) -> dict[str, Any]:
    alert_audit_fields = ["row_number", "issue", "duration_hours", "oblast", "raion", "hromada", "level", "started_at", "finished_at", "source"]
    write_csv_rows(audit_dir / "invalid_alert_rows.csv", invalid_alerts, alert_audit_fields)
    write_csv_rows(audit_dir / "unmapped_alert_geographies.csv", unmapped_alerts, alert_audit_fields)
    write_csv_rows(audit_dir / "duplicate_alert_rows.csv", duplicate_alerts, alert_audit_fields)
    write_csv_rows(audit_dir / "long_interval_review.csv", long_interval_rows, alert_audit_fields)
    write_csv_rows(
        audit_dir / "education_data_issues.csv",
        education_issues,
        ["row_number", "school_id", "hromada_id", "children_total", "issue"],
    )

    coverage_rows = []
    for oblast_id in selected_oblast_ids:
        selected_hromadas = geography.hromadas_by_oblast.get(oblast_id, [])
        coverage_rows.append({
            "oblast_id": oblast_id,
            "oblast_name": geography.oblast_name_by_id.get(oblast_id, ""),
            "reference_hromada_count": len(selected_hromadas),
            "hromadas_with_geometry": sum(int(r.get("has_adm3_geometry", "0") or 0) for r in selected_hromadas),
            "coverage_start_utc": metadata["coverage_start_utc"],
            "coverage_end_utc": metadata["coverage_end_utc"],
        })
    write_csv_rows(audit_dir / "geographic_coverage.csv", coverage_rows)

    checks: list[dict[str, Any]] = []
    daily_over_limit = sum(1 for r in daily_rows if r["alarm_seconds"] > r["available_school_seconds"])
    checks.append({"check_id": "DAILY_OVERLAP_BOUND", "status": "PASS" if daily_over_limit == 0 else "FAIL", "difference": daily_over_limit})

    pct_error = 0.0
    for row in hromada_monthly:
        if row["available_school_seconds"] > 0:
            expected = row["alarm_seconds"] / row["available_school_seconds"] * 100
            pct_error = max(pct_error, abs(expected - row["school_time_under_alarm_pct"]))
    checks.append({"check_id": "PERCENT_RECONCILIATION", "status": "PASS" if pct_error < 1e-9 else "FAIL", "difference": pct_error})

    monthly_alarm_by_hromada: dict[str, float] = defaultdict(float)
    for row in hromada_monthly:
        monthly_alarm_by_hromada[row["hromada_id"]] += float(row.get("alarm_seconds") or 0)
    year_alarm_by_hromada = {
        row["hromada_id"]: float(row.get("alarm_seconds") or 0) for row in hromada_school_year
    }
    max_month_year_diff = max(
        [abs(monthly_alarm_by_hromada.get(h, 0.0) - value) for h, value in year_alarm_by_hromada.items()] or [0.0]
    )
    checks.append({"check_id": "MONTH_TO_YEAR_ALARM_RECONCILIATION", "status": "PASS" if max_month_year_diff < 0.5 else "FAIL", "difference": max_month_year_diff})

    payload_files_missing = []
    for item in payload_manifest["payload_files"]:
        if not (output_dir / "payloads" / item["path"]).exists():
            payload_files_missing.append(item["path"])
    checks.append({"check_id": "PAYLOAD_FILES_EXIST", "status": "PASS" if not payload_files_missing else "FAIL", "difference": len(payload_files_missing)})

    derivation_required = education_summary.get("offline_mode") == "derived_total_minus_online"
    derivation_ok = (
        not derivation_required
        or (
            education_summary.get("derived_offline_rows", 0) == education_summary.get("eligible_school_rows", 0)
            and education_summary.get("negative_derived_offline_rows", 0) == 0
        )
    )
    checks.append({
        "check_id": "EDUCATION_OFFLINE_DERIVATION",
        "status": "PASS" if derivation_ok else "FAIL",
        "difference": 0 if derivation_ok else education_summary.get("eligible_school_rows", 0) - education_summary.get("derived_offline_rows", 0),
    })
    yearly_school_count = sum(int(row.get("school_count", 0)) for row in hromada_school_year)
    yearly_learners_total = sum(int(row.get("learners_total", 0)) for row in hromada_school_year)
    expected_context = education_summary.get("linked_context_totals", {})
    context_ok = (
        yearly_school_count == int(expected_context.get("school_count", -1))
        and yearly_learners_total == int(expected_context.get("learners_total", -1))
    )
    checks.append({
        "check_id": "EDUCATION_CONTEXT_RECONCILIATION",
        "status": "PASS" if context_ok else "FAIL",
        "difference": {
            "school_count": yearly_school_count - int(expected_context.get("school_count", 0)),
            "learners_total": yearly_learners_total - int(expected_context.get("learners_total", 0)),
        },
    })

    write_csv_rows(audit_dir / "indicator_reconciliation.csv", checks)
    pass_status = all(c["status"] == "PASS" for c in checks)
    payload_validation = {
        "status": "PASS" if pass_status else "FAIL",
        "checks": checks,
        "hromada_monthly_rows": len(hromada_monthly),
        "hromada_school_year_rows": len(hromada_school_year),
        "oblast_monthly_rows": len(oblast_monthly),
        "national_monthly_rows": len(national_monthly),
    }
    write_json(audit_dir / "payload_validation.json", payload_validation)

    source_inventory = [
        {
            "source_role": "air_alarm_source",
            "path": alarm_source.name,
            "size_bytes": alarm_source.stat().st_size,
            "sha256": sha256_file(alarm_source),
        },
        {
            "source_role": "assumptions",
            "path": "config/assumptions.json",
            "size_bytes": (root / "config/assumptions.json").stat().st_size,
            "sha256": sha256_file(root / "config/assumptions.json"),
        },
        {
            "source_role": "sources_configuration",
            "path": "config/sources.json",
            "size_bytes": (root / "config/sources.json").stat().st_size,
            "sha256": sha256_file(root / "config/sources.json"),
        },
    ]
    write_csv_rows(audit_dir / "source_inventory.csv", source_inventory)

    output_files = [p for p in output_dir.rglob("*") if p.is_file() and p.name != "build_manifest.json"]
    build_manifest = {
        **metadata,
        "build_completed_at_utc": utc_now_iso(),
        "status": "PASS" if pass_status else "FAIL",
        "source_summary": {
            k: iso_utc(v) if isinstance(v, datetime) else v for k, v in source_summary.items()
        },
        "education_summary": education_summary,
        "audit_counts": {
            "invalid_alert_rows": len(invalid_alerts),
            "unmapped_alert_geographies": len(unmapped_alerts),
            "duplicate_alert_rows": len(duplicate_alerts),
            "long_interval_review_rows": len(long_interval_rows),
            "education_data_issues": len(education_issues),
        },
        "outputs": file_inventory(output_dir, output_files),
    }
    write_json(audit_dir / "build_manifest.json", build_manifest)
    audit_summary = {
        "build_id": metadata["build_id"],
        "status": build_manifest["status"],
        "source_rows": source_summary["input_row_count"],
        "allocated_interval_rows": source_summary["allocated_interval_row_count"],
        "daily_rows": len(daily_rows),
        "hromada_monthly_rows": len(hromada_monthly),
        "oblast_monthly_rows": len(oblast_monthly),
        "national_monthly_rows": len(national_monthly),
        "invalid_alert_rows": len(invalid_alerts),
        "unmapped_alert_rows": len(unmapped_alerts),
        "duplicate_alert_rows": len(duplicate_alerts),
        "long_interval_review_rows": len(long_interval_rows),
        "education_issue_rows": len(education_issues),
        "checks_passed": sum(1 for c in checks if c["status"] == "PASS"),
        "checks_total": len(checks),
    }
    write_json(audit_dir / "audit_summary.json", audit_summary)
    return audit_summary
