#!/usr/bin/env python3
"""Verify byte identity for the immutable six-table/56-payload golden control."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


CANONICAL_TABLES = (
    "hromada_monthly.csv",
    "hromada_school_year.csv",
    "oblast_monthly.csv",
    "oblast_school_year.csv",
    "national_monthly.csv",
    "national_school_year.csv",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def analytical_payloads(root: Path) -> dict[str, Path]:
    return {
        path.relative_to(root).as_posix(): path
        for path in root.rglob("*.json")
        if path.name not in {"metadata.json", "payload_manifest.json"}
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-package", type=Path, required=True)
    parser.add_argument("--reproduction-final", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    reference_tables = args.reference_package / "analytical"
    reproduced_tables = args.reproduction_final / "analytical"
    table_results = []
    for name in CANONICAL_TABLES:
        reference = reference_tables / name
        reproduced = reproduced_tables / name
        reference_hash = sha256(reference)
        reproduced_hash = sha256(reproduced)
        table_results.append({
            "path": name,
            "reference_sha256": reference_hash,
            "reproduction_sha256": reproduced_hash,
            "byte_identical": reference_hash == reproduced_hash,
        })

    reference_payloads = analytical_payloads(args.reference_package / "payloads")
    reproduced_payloads = analytical_payloads(args.reproduction_final / "payloads")
    payload_paths = sorted(set(reference_payloads) | set(reproduced_payloads))
    payload_results = []
    for name in payload_paths:
        reference = reference_payloads.get(name)
        reproduced = reproduced_payloads.get(name)
        reference_hash = sha256(reference) if reference else None
        reproduced_hash = sha256(reproduced) if reproduced else None
        payload_results.append({
            "path": name,
            "reference_sha256": reference_hash,
            "reproduction_sha256": reproduced_hash,
            "byte_identical": reference_hash is not None and reference_hash == reproduced_hash,
        })

    metadata = json.loads((args.reproduction_final / "payloads/metadata.json").read_text(encoding="utf-8"))
    passed = (
        metadata.get("build_id") == "AAE-FULL-9c94bc374ab5e7cf29"
        and len(table_results) == 6
        and all(item["byte_identical"] for item in table_results)
        and len(payload_results) == 56
        and all(item["byte_identical"] for item in payload_results)
    )
    report = {
        "schema_version": 1,
        "control_id": "AAE-FULL-9c94bc374ab5e7cf29",
        "status": "PASS" if passed else "FAIL",
        "reproduced_build_id": metadata.get("build_id"),
        "canonical_table_count": len(table_results),
        "canonical_tables_byte_identical": sum(item["byte_identical"] for item in table_results),
        "analytical_payload_count": len(payload_results),
        "analytical_payloads_byte_identical": sum(item["byte_identical"] for item in payload_results),
        "canonical_tables": table_results,
        "analytical_payloads": payload_results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in (
        "status", "reproduced_build_id", "canonical_tables_byte_identical",
        "analytical_payloads_byte_identical",
    )}, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
