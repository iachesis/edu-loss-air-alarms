from __future__ import annotations

import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from .local_runner import project_fingerprint, project_inventory
from .utils import ensure_dir, file_inventory, read_json, sha256_file, utc_now_iso, write_json


def _copy_tree_clean(source: Path, destination: Path) -> None:
    def ignore(_directory: str, names: list[str]) -> set[str]:
        return {name for name in names if name == "__pycache__" or name.endswith((".pyc", ".pyo")) or name == ".DS_Store"}
    shutil.copytree(source, destination, ignore=ignore)


def create_review_archive(*, root: Path, output_dir: Path, destination: Path | None = None) -> dict[str, Any]:
    final_dir = output_dir / "final"
    qa_path = final_dir / "audit/qa_summary.json"
    if not qa_path.exists():
        raise FileNotFoundError(f"Missing completed QA summary: {qa_path}")
    qa = read_json(qa_path)
    build_id = qa["build_id"]
    if destination is None:
        destination = output_dir / f"AAE_REVIEW_PACKAGE_{build_id}.zip"
    ensure_dir(destination.parent)

    with tempfile.TemporaryDirectory(prefix="aae_review_") as temp:
        package_root = Path(temp) / "AAE_REVIEW_PACKAGE"
        ensure_dir(package_root)
        for relative in ["analytical", "payloads", "audit"]:
            shutil.copytree(final_dir / relative, package_root / relative)
        for relative in ["logs", "state", "preflight", "tests"]:
            source = output_dir / relative
            if source.exists():
                shutil.copytree(source, package_root / relative)

        # The public-safe review package records source identity but deliberately
        # excludes raw alarm bytes and controlled school-level rows.
        build_manifest = read_json(final_dir / "audit/build_manifest.json")
        source_dir = ensure_dir(package_root / "source")
        write_json(source_dir / "source_manifest.json", {
            "publication_policy": "identity_only_raw_source_excluded",
            "source_provenance": build_manifest["source_provenance"],
        })

        # Include the exact executable and local reference/input files needed to reproduce the build.
        execution_dir = ensure_dir(package_root / "execution")
        for relative in ["airalarms.py", "pyproject.toml", "uv.lock", "run_local.sh"]:
            source = root / relative
            if source.exists():
                shutil.copy2(source, execution_dir / relative)
        for relative in ["src", "config", "data/reference", "data/assumptions"]:
            source = root / relative
            if source.exists():
                _copy_tree_clean(source, execution_dir / relative)
        inventory = project_inventory(root)
        write_json(execution_dir / "project_inventory.json", {
            "project_fingerprint": project_fingerprint(root),
            "files": inventory,
        })

        config_snapshot = package_root / "config_snapshot"
        ensure_dir(config_snapshot)
        for relative in [
            "config/assumptions.json",
            "config/sources.json",
            "config/controlled_inputs.json",
            "config/governed_versions.json",
        ]:
            shutil.copy2(root / relative, config_snapshot / Path(relative).name)
        for relative in ["data/assumptions/school_year_windows.csv", "data/assumptions/assumed_vacation_periods.csv"]:
            shutil.copy2(root / relative, config_snapshot / Path(relative).name)

        readme = (
            "Air Alarms and Education full-build review package\n\n"
            f"Build ID: {build_id}\n"
            f"QA status: {qa['status']}\n"
            f"Review status: {qa['review_status']}\n\n"
            "Upload this ZIP to the project conversation for independent review.\n"
            "The archive contains final payloads, analytical tables, source identity, "
            "public-safe executable code, reference inputs, QA metadata, exception reports, "
            "logs, and configuration snapshots. Raw alarm bytes and controlled school-level "
            "education rows are deliberately excluded.\n"
        )
        (package_root / "README.txt").write_text(readme, encoding="utf-8")
        files = [path for path in package_root.rglob("*") if path.is_file()]
        manifest = {
            "build_id": build_id,
            "created_at_utc": utc_now_iso(),
            "qa_status": qa["status"],
            "review_status": qa["review_status"],
            "files": file_inventory(package_root, files),
        }
        write_json(package_root / "REVIEW_MANIFEST.json", manifest)

        temp_zip = destination.with_suffix(destination.suffix + ".part")
        if temp_zip.exists():
            temp_zip.unlink()
        with zipfile.ZipFile(temp_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for path in sorted(package_root.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(Path(temp)).as_posix())
        temp_zip.replace(destination)

    result = {
        "archive_path": str(destination.resolve()),
        "size_bytes": destination.stat().st_size,
        "sha256": sha256_file(destination),
        "build_id": build_id,
        "qa_status": qa["status"],
    }
    write_json(destination.with_suffix(destination.suffix + ".json"), result)
    return result
