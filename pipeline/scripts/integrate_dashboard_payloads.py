#!/usr/bin/env python3
"""Integrate one accepted full build into the stable public dashboard contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any


WEBSITE_RELEASE = "AAE-WEB-1.1.0"
DIRECT_PAYLOADS = (
    "national_monthly.json",
    "national_school_year.json",
    "oblast_monthly.json",
    "oblast_school_year.json",
)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def copy_atomic(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{destination.name}.", dir=destination.parent)
    os.close(fd)
    try:
        shutil.copyfile(source, temporary)
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def inventory(data_root: Path, excluded: set[str]) -> list[dict[str, Any]]:
    return [
        {
            "path": path.relative_to(data_root).as_posix(),
            "size_bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in sorted(data_root.rglob("*"))
        if path.is_file() and path.relative_to(data_root).as_posix() not in excluded
    ]


def report_summary(report: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "status",
        "control_id",
        "reproduced_build_id",
        "canonical_table_count",
        "canonical_tables_byte_identical",
        "analytical_payload_count",
        "analytical_payloads_byte_identical",
        "actual_analytical_numeric_value_change_count",
        "prohibited_field_difference_count",
        "missing_or_added_key_count",
        "authorized_difference_count",
    )
    return {key: report[key] for key in keys if key in report}


def _catalogue_availability(rows: list[dict[str, Any]]) -> tuple[bool, str]:
    statuses = {str(row.get("coverage_status", "")) for row in rows}
    if statuses == {"not_covered"}:
        return False, "not_covered"
    if statuses & {"complete", "partial"}:
        return True, "available"
    return False, "unavailable"


def refresh_geography_catalogue(data_root: Path, build_id: str) -> dict[str, int]:
    """Bind the supporting geography catalogue to the integrated payload set."""
    path = data_root / "geography_lookup.json"
    catalogue = read_json(path)
    catalogue["analytical_build_id"] = build_id

    national_rows = read_json(data_root / "national_monthly.json") + read_json(
        data_root / "national_school_year.json"
    )
    oblast_rows = read_json(data_root / "oblast_monthly.json") + read_json(
        data_root / "oblast_school_year.json"
    )
    oblast_rows_by_id: dict[str, list[dict[str, Any]]] = {}
    for row in oblast_rows:
        oblast_rows_by_id.setdefault(str(row["area_id"]), []).append(row)

    hromada_rows_by_id: dict[str, list[dict[str, Any]]] = {}
    for oblast_id in catalogue["oblasts"]:
        rows = read_json(data_root / f"hromada_monthly_{oblast_id}.json") + read_json(
            data_root / f"hromada_school_year_{oblast_id}.json"
        )
        for row in rows:
            hromada_rows_by_id.setdefault(str(row["hromada_id"]), []).append(row)

    not_covered_count = 0

    def update_entry(entry: dict[str, Any], rows: list[dict[str, Any]]) -> None:
        nonlocal not_covered_count
        if not rows:
            raise RuntimeError(f"Geography catalogue entry has no integrated analytical rows: {entry['id']}")
        available, status = _catalogue_availability(rows)
        entry["analytical_data_available"] = available
        entry["analytical_availability_status"] = status
        entry.setdefault("provenance", {})["analytical"] = (
            f"analytical_payload_presence:{build_id}:{status}"
        )
        if status == "not_covered":
            not_covered_count += 1

    update_entry(catalogue["national"]["UA"], national_rows)
    for oblast_id, entry in catalogue["oblasts"].items():
        update_entry(entry, oblast_rows_by_id.get(oblast_id, []))
    for hromada_id, entry in catalogue["hromadas"].items():
        update_entry(entry, hromada_rows_by_id.get(hromada_id, []))

    expected_total = int(catalogue["counts"]["total"])
    updated_total = 1 + len(catalogue["oblasts"]) + len(catalogue["hromadas"])
    if updated_total != expected_total:
        raise RuntimeError(
            f"Geography catalogue count mismatch: expected {expected_total}, updated {updated_total}"
        )
    write_json(path, catalogue)
    return {
        "updated_entry_count": updated_total,
        "not_covered_entry_count": not_covered_count,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pipeline-final", type=Path, required=True)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--golden-control", type=Path, required=True)
    parser.add_argument("--repaired-frozen-differential", type=Path, required=True)
    parser.add_argument("--source-differential", type=Path, required=True)
    parser.add_argument("--current-frozen-differential", type=Path, required=True)
    parser.add_argument("--output-report", type=Path, required=True)
    args = parser.parse_args()

    payload_root = args.pipeline_final / "payloads"
    metadata = read_json(payload_root / "metadata.json")
    qa = read_json(args.pipeline_final / "audit/qa_summary.json")
    golden = read_json(args.golden_control)
    repaired_frozen = read_json(args.repaired_frozen_differential)
    source_diff = read_json(args.source_differential)
    current_frozen = read_json(args.current_frozen_differential)
    required_passes = [golden, repaired_frozen, source_diff, current_frozen]
    if any(report.get("status") != "PASS" for report in required_passes):
        raise RuntimeError("Stage-B integration requires PASS for every frozen/source differential")
    if qa.get("hard_failure_count") != 0 or qa.get("checks_passed") != qa.get("checks_total"):
        raise RuntimeError("Stage-B integration requires a hard-failure-free reconciled build")

    oblast_ids = list(metadata["oblast_ids"])
    if len(oblast_ids) != 26:
        raise ValueError(f"Expected 26 oblast-level territories, received {len(oblast_ids)}")
    sources: dict[str, Path] = {name: payload_root / name for name in DIRECT_PAYLOADS}
    for oblast_id in oblast_ids:
        sources[f"hromada_monthly_{oblast_id}.json"] = (
            payload_root / "hromada_monthly_by_oblast" / f"{oblast_id}.json"
        )
        sources[f"hromada_school_year_{oblast_id}.json"] = (
            payload_root / "hromada_school_year_by_oblast" / f"{oblast_id}.json"
        )
    if len(sources) != 56 or any(not source.is_file() for source in sources.values()):
        raise FileNotFoundError("The accepted build does not contain the complete 56-file analytical payload set")

    integrated = []
    for destination_name, source in sorted(sources.items()):
        destination = args.data_root / destination_name
        copy_atomic(source, destination)
        source_hash = sha256(source)
        destination_hash = sha256(destination)
        if source_hash != destination_hash:
            raise RuntimeError(f"Integrated payload identity mismatch: {destination_name}")
        integrated.append({
            "path": destination_name,
            "size_bytes": destination.stat().st_size,
            "sha256": destination_hash,
        })

    modality = read_json(args.data_root / "modality_rules.json")
    modality["build_id"] = metadata["build_id"]
    write_json(args.data_root / "modality_rules.json", modality)

    geography_refresh = refresh_geography_catalogue(args.data_root, metadata["build_id"])

    payload_schema = read_json(args.data_root / "schemas/payload-row.schema.json")
    payload_schema["properties"]["coverage_status"] = {
        "enum": ["complete", "partial", "not_covered", "unavailable"]
    }
    write_json(args.data_root / "schemas/payload-row.schema.json", payload_schema)
    release_schema = read_json(args.data_root / "schemas/release.schema.json")
    release_schema["properties"]["analytical_build_id"] = {"const": metadata["build_id"]}
    write_json(args.data_root / "schemas/release.schema.json", release_schema)

    validation = {
        "schema_version": 1,
        "governing_issue": "https://github.com/iachesis/edu-loss-air-alarms/issues/4",
        "website_release_id": WEBSITE_RELEASE,
        "analytical_build_id": metadata["build_id"],
        "project_fingerprint": metadata["project_fingerprint"],
        "frozen_executable_control": report_summary(golden),
        "repaired_code_on_frozen_source": report_summary(repaired_frozen),
        "current_source_differential": source_diff,
        "current_build_vs_frozen": report_summary(current_frozen),
        "fresh_build_qa": qa,
        "analytical_numeric_values_changed_vs_frozen": False,
        "authorized_semantic_change": "controlled not-covered status and missingness for UA01 and UA44",
    }
    write_json(args.data_root / "stage_b_validation.json", validation)

    release_path = args.data_root / "release.json"
    release = read_json(release_path)
    provenance = metadata["source_provenance"]
    release.update({
        "website_release_id": WEBSITE_RELEASE,
        "website_release_status": "CANDIDATE_PENDING_INDEPENDENT_ACCEPTANCE",
        "website_release_date": "2026-08-28",
        "analytical_build_id": metadata["build_id"],
        "analytical_build_status": qa["status"],
        "analytical_source_sha256": metadata["source_sha256"],
        "analytical_source_git_blob_sha1": provenance["upstream_git_blob_sha1"],
        "analytical_source_upstream_commit_sha": provenance["resolved_upstream_commit_sha"],
        "source_url": provenance["immutable_resolved_raw_url"],
        "configured_source_url": provenance["configured_source_url"],
        "source_repository": {
            "owner": provenance["repository_owner"],
            "name": provenance["repository_name"],
            "path": provenance["repository_path"],
            "branch": provenance["repository_branch"],
        },
        "source_retrieval_started_at_utc": provenance["retrieval_started_at_utc"],
        "source_retrieval_completed_at_utc": provenance["retrieval_completed_at_utc"],
        "source_retrieved_at_utc": provenance["retrieval_completed_at_utc"],
        "source_http_content_length_declared": provenance["http_content_length_declared"],
        "source_actual_bytes_received": provenance["actual_bytes_received"],
        "source_expected_resolved_byte_size": provenance["expected_resolved_byte_size"],
        "source_coverage_start_utc": metadata["source_coverage_start_utc"],
        "source_coverage_end_utc": metadata["source_coverage_end_utc"],
        "source_retrieval_timestamp_status": "RECORDED_AND_VERIFIED",
        "source_provenance_mode": provenance["source_mode"],
        "source_counts": {
            "input_rows": provenance["input_row_count"],
            "valid_unique_rows": provenance["valid_unique_row_count"],
            "invalid_rows": provenance["invalid_row_count"],
            "exact_duplicate_rows": provenance["exact_duplicate_row_count"],
            "declared_levels": provenance["declared_level_counts"],
            "mapping_routes": provenance["mapping_route_counts"],
            "detailed_mapping_failures": provenance["detailed_mapping_failure_count"],
        },
        "source_differential_vs_frozen": {
            "added_records": source_diff["added"]["record_count"],
            "removed_records": source_diff["removed"]["record_count"],
            "added_records_intersecting_published_assumed_school_time": source_diff["added"]["intersects_published_assumed_school_time_count"],
        },
        "methodology_version": metadata["methodology_version"],
        "indicator_dictionary_version": metadata["indicator_dictionary_version"],
        "input_data_contract_version": metadata["input_data_contract_version"],
        "processing_package_version": metadata["processing_package_version"],
        "local_execution_package_version": metadata["local_execution_package_version"],
        "assumptions_version": metadata["assumptions_version"],
        "analytical_project_fingerprint": metadata["project_fingerprint"],
        "publication_status": "CANDIDATE_PENDING_INDEPENDENT_ACCEPTANCE",
        "package_version": "1.1.0",
        "delivery": {
            "unicef_deliverable": 2,
            "product_status": "CANDIDATE_PENDING_INDEPENDENT_ACCEPTANCE",
            "analytical_numeric_values_changed_vs_frozen": False,
            "not_covered_semantics_corrected": True,
        },
        "release_marker": {
            "visible_element": "#footer-release",
            "machine_readable_source": "data/release.json:website_release_id",
            "value": WEBSITE_RELEASE,
        },
    })
    release["files"] = inventory(args.data_root, {"release.json", "payload_manifest.json"})
    write_json(release_path, release)

    manifest = {
        "version": "1.1.0",
        "release_id": WEBSITE_RELEASE,
        "analytical_build_id": metadata["build_id"],
        "analytical_payload_count": 56,
        "analytical_payloads": integrated,
        "files": inventory(args.data_root, {"payload_manifest.json"}),
    }
    write_json(args.data_root / "payload_manifest.json", manifest)

    result = {
        "schema_version": 1,
        "status": "PASS",
        "website_release_id": WEBSITE_RELEASE,
        "analytical_build_id": metadata["build_id"],
        "analytical_payload_count": len(integrated),
        "payload_identity_mismatch_count": 0,
        "geography_catalogue_updated_entry_count": geography_refresh["updated_entry_count"],
        "geography_catalogue_not_covered_entry_count": geography_refresh["not_covered_entry_count"],
        "release_inventory_file_count": len(release["files"]),
        "payload_manifest_file_count": len(manifest["files"]),
    }
    write_json(args.output_report, result)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
