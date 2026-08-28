from __future__ import annotations

import csv
import hashlib
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def make_test_project(destination: Path) -> tuple[Path, Path]:
    """Create a public-safe project fixture with synthetic school and alarm rows."""
    root = destination / "project"
    for relative in ["src", "config", "data/reference", "data/assumptions"]:
        shutil.copytree(ROOT / relative, root / relative)
    for relative in ["airalarms.py", "run_local.sh", "pyproject.toml", "uv.lock"]:
        shutil.copy2(ROOT / relative, root / relative)

    with (root / "data/reference/hromadas.csv").open(encoding="utf-8-sig", newline="") as handle:
        hromadas = list(csv.DictReader(handle))
    selected = {
        "UA12": next(row["hromada_id"] for row in hromadas if row["oblast_id"] == "UA12"),
        "UA32": next(row["hromada_id"] for row in hromadas if row["oblast_id"] == "UA32"),
    }
    education_dir = root / "data/education"
    education_dir.mkdir(parents=True)
    snapshot_specs = [
        ("2023-01-01", "2022_2023", False, 80, 120),
        ("2024-04-20", "2023_2024", True, 90, 130),
        ("2025-03-20", "2024_2025", True, 100, 140),
        ("2026-03-09", "2025_2026", True, 110, 150),
    ]
    snapshots = []
    manifest_files = []
    for snapshot_date, school_year, include_offline, dnipro_children, kyiv_children in snapshot_specs:
        filename = f"edu_{snapshot_date}.csv"
        path = education_dir / filename
        fields = ["school_id", "hromada_id", "children_total", "children_online", "children_mixed"]
        if include_offline:
            fields.append("children_offline")
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            for school_id, oblast_id, total in [
                (f"S-{school_year}-D", "UA12", dnipro_children),
                (f"S-{school_year}-K", "UA32", kyiv_children),
            ]:
                row = {
                    "school_id": school_id,
                    "hromada_id": selected[oblast_id],
                    "children_total": total,
                    "children_online": 10,
                    "children_mixed": 0,
                }
                if include_offline:
                    row["children_offline"] = total - 10
                writer.writerow(row)
        snapshots.append({
            "snapshot_date": snapshot_date,
            "path": f"data/education/{filename}",
            "school_year": school_year,
            "role": "selected",
        })
        manifest_files.append({
            "expected_filename": filename,
            "snapshot_date": snapshot_date,
            "byte_size": path.stat().st_size,
            "sha256": sha256(path),
            "role": f"synthetic test snapshot for {school_year}",
        })

    sources_path = root / "config/sources.json"
    sources = json.loads(sources_path.read_text(encoding="utf-8"))
    sources["education_snapshots"] = snapshots
    write_json(sources_path, sources)
    write_json(root / "config/controlled_inputs.json", {
        "schema_version": 1,
        "input_class": "synthetic_test_only",
        "publication_policy": "generated_test_fixture",
        "files": manifest_files,
    })

    alarm_source = destination / "synthetic_official_alarm_source.csv"
    rows = [
        {
            "oblast": "Дніпропетровська область",
            "raion": "",
            "hromada": "",
            "level": "oblast",
            "started_at": "2025-01-13T06:00:00+00:00",
            "finished_at": "2025-01-13T07:00:00+00:00",
            "source": "official",
        },
        {
            "oblast": "Київська область",
            "raion": "",
            "hromada": "",
            "level": "oblast",
            "started_at": "2025-01-14T06:30:00+00:00",
            "finished_at": "2025-01-14T07:15:00+00:00",
            "source": "official",
        },
    ]
    with alarm_source.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["oblast", "raion", "hromada", "level", "started_at", "finished_at", "source"],
        )
        writer.writeheader()
        writer.writerows(rows)
    return root, alarm_source
