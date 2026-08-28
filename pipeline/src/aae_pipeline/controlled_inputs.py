from __future__ import annotations

from pathlib import Path
from typing import Any

from .utils import read_json, sha256_file


def controlled_manifest(root: Path) -> dict[str, Any]:
    manifest = read_json(root / "config/controlled_inputs.json")
    if manifest.get("schema_version") != 1 or not isinstance(manifest.get("files"), list):
        raise ValueError("config/controlled_inputs.json has an unsupported schema")
    return manifest


def verify_controlled_inputs(root: Path, supplied_root: Path | None) -> dict[str, Path]:
    manifest = controlled_manifest(root)
    base = supplied_root or (root / "data/education")
    resolved: dict[str, Path] = {}
    failures: list[str] = []
    for item in manifest["files"]:
        filename = item.get("expected_filename")
        if not filename or Path(filename).name != filename:
            failures.append(f"invalid expected_filename: {filename!r}")
            continue
        path = base / filename
        if not path.is_file():
            failures.append(f"missing {filename}")
            continue
        actual_size = path.stat().st_size
        actual_hash = sha256_file(path)
        if actual_size != item.get("byte_size"):
            failures.append(f"size mismatch for {filename}: {actual_size} != {item.get('byte_size')}")
            continue
        if actual_hash != item.get("sha256"):
            failures.append(f"SHA-256 mismatch for {filename}: {actual_hash} != {item.get('sha256')}")
            continue
        resolved[filename] = path
    if failures:
        raise ValueError("Controlled education inputs failed verification: " + "; ".join(failures))
    return resolved


def resolve_education_snapshot(
    root: Path,
    snapshot_path: str,
    supplied_root: Path | None,
) -> Path:
    filename = Path(snapshot_path).name
    verified = verify_controlled_inputs(root, supplied_root)
    if filename not in verified:
        raise ValueError(f"Education snapshot is not governed by the controlled-input manifest: {filename}")
    return verified[filename]
