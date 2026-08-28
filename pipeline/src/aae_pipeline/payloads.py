from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

from .utils import ensure_dir, sha256_file, write_json


def _public_row(row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in row.items():
        if isinstance(value, float):
            out[key] = round(value, 6)
        else:
            out[key] = value
    return out


def build_payloads(
    payload_dir: Path,
    metadata: dict[str, Any],
    hromada_monthly: list[dict[str, Any]],
    hromada_school_year: list[dict[str, Any]],
    oblast_monthly: list[dict[str, Any]],
    oblast_school_year: list[dict[str, Any]],
    national_monthly: list[dict[str, Any]],
    national_school_year: list[dict[str, Any]],
) -> dict[str, Any]:
    ensure_dir(payload_dir)
    write_json(payload_dir / "metadata.json", metadata)
    write_json(payload_dir / "national_monthly.json", [_public_row(r) for r in national_monthly], compact=True)
    write_json(payload_dir / "national_school_year.json", [_public_row(r) for r in national_school_year], compact=True)
    write_json(payload_dir / "oblast_monthly.json", [_public_row(r) for r in oblast_monthly], compact=True)
    write_json(payload_dir / "oblast_school_year.json", [_public_row(r) for r in oblast_school_year], compact=True)

    by_oblast_month: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_oblast_year: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in hromada_monthly:
        by_oblast_month[row["oblast_id"]].append(_public_row(row))
    for row in hromada_school_year:
        by_oblast_year[row["oblast_id"]].append(_public_row(row))

    month_dir = ensure_dir(payload_dir / "hromada_monthly_by_oblast")
    year_dir = ensure_dir(payload_dir / "hromada_school_year_by_oblast")
    month_manifest = {}
    year_manifest = {}
    for oblast_id, rows in sorted(by_oblast_month.items()):
        name = f"{oblast_id}.json"
        write_json(month_dir / name, rows, compact=True)
        month_manifest[oblast_id] = f"hromada_monthly_by_oblast/{name}"
    for oblast_id, rows in sorted(by_oblast_year.items()):
        name = f"{oblast_id}.json"
        write_json(year_dir / name, rows, compact=True)
        year_manifest[oblast_id] = f"hromada_school_year_by_oblast/{name}"

    files = sorted(path for path in payload_dir.rglob("*") if path.is_file())
    manifest = {
        "version": "0.1",
        "files": {
            "metadata": "metadata.json",
            "national_monthly": "national_monthly.json",
            "national_school_year": "national_school_year.json",
            "oblast_monthly": "oblast_monthly.json",
            "oblast_school_year": "oblast_school_year.json",
            "hromada_monthly_by_oblast": month_manifest,
            "hromada_school_year_by_oblast": year_manifest,
        },
        "payload_files": [
            {
                "path": path.relative_to(payload_dir).as_posix(),
                "size_bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
            for path in files
        ],
    }
    write_json(payload_dir / "payload_manifest.json", manifest)
    return manifest
