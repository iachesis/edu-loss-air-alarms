from __future__ import annotations

import csv
import os
import platform
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .acquisition import resolve_github_source, verify_pinned_local_source
from .controlled_inputs import verify_controlled_inputs
from .geography import GeographyIndex
from .governance import load_governed_versions
from .pipeline import REQUIRED_ALARM_COLUMNS
from .utils import read_csv_rows, read_json, sha256_file, utc_now_iso, write_json


def run_preflight(
    *,
    root: Path,
    output_path: Path,
    alarm_source: Path | None = None,
    alarm_source_sha256: str | None = None,
    controlled_input_root: Path | None = None,
    skip_network: bool = False,
    minimum_free_gb: float = 4.0,
) -> dict[str, Any]:
    sources = read_json(root / "config/sources.json")
    assumptions = read_json(root / "config/assumptions.json")
    checks: list[dict[str, Any]] = []

    def add(check_id: str, passed: bool, detail: Any, fatal: bool = True) -> None:
        checks.append({
            "check_id": check_id,
            "status": "PASS" if passed else "FAIL",
            "fatal": fatal,
            "detail": detail,
        })

    add("PYTHON_VERSION", sys.version_info >= (3, 11), platform.python_version())
    try:
        governed = load_governed_versions(root, assumptions)
        add("GOVERNED_VERSION_METADATA", True, governed)
    except Exception as exc:
        add("GOVERNED_VERSION_METADATA", False, str(exc))
    try:
        ZoneInfo(assumptions["timezone"])
        add("TIMEZONE_DATABASE", True, assumptions["timezone"])
    except Exception as exc:
        add("TIMEZONE_DATABASE", False, str(exc))

    usage = shutil.disk_usage(root)
    free_gb = usage.free / (1024 ** 3)
    add("FREE_DISK_SPACE", free_gb >= minimum_free_gb, {"free_gb": round(free_gb, 2), "minimum_gb": minimum_free_gb})

    try:
        with tempfile.NamedTemporaryFile(dir=root, prefix=".aae_write_test_", delete=True) as handle:
            handle.write(b"ok")
            handle.flush()
        add("PROJECT_WRITE_ACCESS", True, str(root))
    except Exception as exc:
        add("PROJECT_WRITE_ACCESS", False, str(exc))

    required_paths = [
        root / "config/assumptions.json",
        root / "config/sources.json",
        root / assumptions["calendar"]["school_years_file"],
        root / assumptions["calendar"]["vacations_file"],
    ]
    required_paths.extend(root / value for value in sources["reference_files"].values())
    missing_paths = [str(path.relative_to(root)) for path in required_paths if not path.exists()]
    add("REQUIRED_LOCAL_FILES", not missing_paths, {"missing": missing_paths, "checked": len(required_paths)})

    try:
        verified_controlled = verify_controlled_inputs(root, controlled_input_root)
        add("CONTROLLED_INPUT_MANIFEST", True, {"verified_files": sorted(verified_controlled)})
    except Exception as exc:
        add("CONTROLLED_INPUT_MANIFEST", False, str(exc))

    try:
        geography = GeographyIndex(root, sources)
        add("GEOGRAPHY_REFERENCE", bool(geography.hromada_by_id), {
            "oblasts": len(geography.oblast_rows),
            "raions": len(geography.raion_rows),
            "hromadas": len(geography.hromada_rows),
        })
    except Exception as exc:
        add("GEOGRAPHY_REFERENCE", False, str(exc))

    calendar_rows = read_csv_rows(root / assumptions["calendar"]["school_years_file"])
    active_years = [r["school_year"] for r in calendar_rows if r.get("is_active", "1") != "0"]
    configured_years = sorted({r["school_year"] for r in sources["education_snapshots"]})
    uncovered_years = [year for year in active_years if year not in configured_years]
    add("EDUCATION_SNAPSHOT_COVERAGE", not uncovered_years, {
        "active_school_years": active_years,
        "missing_snapshot_years": uncovered_years,
    })

    if alarm_source:
        if not alarm_source.exists():
            add("ALARM_SOURCE", False, f"Missing local source: {alarm_source}")
        else:
            try:
                provenance = verify_pinned_local_source(
                    alarm_source,
                    expected_sha256=alarm_source_sha256 or "",
                )
                with alarm_source.open("r", encoding="utf-8-sig", newline="") as handle:
                    reader = csv.reader(handle)
                    header = next(reader)
                schema_ok = header == REQUIRED_ALARM_COLUMNS
                add("ALARM_SOURCE", schema_ok, {
                    "mode": provenance["source_mode"],
                    "filename": alarm_source.name,
                    "size_bytes": alarm_source.stat().st_size,
                    "sha256": sha256_file(alarm_source),
                    "exact_schema": schema_ok,
                })
            except Exception as exc:
                add("ALARM_SOURCE", False, str(exc))
    elif skip_network:
        add("ALARM_SOURCE_NETWORK", True, "Skipped by request", fatal=False)
    else:
        try:
            resolved = resolve_github_source(sources["air_alarm_source"])
            add("ALARM_SOURCE_NETWORK", True, resolved)
        except Exception as exc:
            add("ALARM_SOURCE_NETWORK", False, str(exc))

    fatal_failures = [c for c in checks if c["fatal"] and c["status"] == "FAIL"]
    report = {
        "status": "PASS" if not fatal_failures else "FAIL",
        "checked_at_utc": utc_now_iso(),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "python": sys.version,
        "project_root": str(root.resolve()),
        "checks": checks,
        "fatal_failure_count": len(fatal_failures),
    }
    write_json(output_path, report)
    return report
