from __future__ import annotations

import csv
import gzip
import hashlib
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def stable_id(*parts: object, length: int = 20) -> str:
    raw = "|".join("" if p is None else str(p) for p in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:length]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_datetime_utc(value: str) -> datetime:
    value = value.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_write_text(path: Path, text: str) -> None:
    ensure_dir(path.parent)
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def write_json(path: Path, value: Any, *, compact: bool = False) -> None:
    text = json.dumps(
        value,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
        sort_keys=False,
    )
    atomic_write_text(path, text + "\n")


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def iter_csv_rows(path: Path) -> Iterable[dict[str, str]]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f)


def write_csv_rows(
    path: Path,
    rows: Iterable[Mapping[str, Any]],
    fieldnames: Sequence[str] | None = None,
) -> int:
    ensure_dir(path.parent)
    materialized = list(rows)
    if fieldnames is None:
        fieldnames = list(materialized[0].keys()) if materialized else []
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "wt", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        if fieldnames:
            writer.writeheader()
            for row in materialized:
                writer.writerow({key: _csv_value(row.get(key)) for key in fieldnames})
    return len(materialized)


def _csv_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (list, tuple, set)):
        return "|".join(str(v) for v in value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def file_inventory(root: Path, paths: Iterable[Path]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for path in sorted(set(paths)):
        if path.exists() and path.is_file():
            out.append(
                {
                    "path": path.relative_to(root).as_posix(),
                    "size_bytes": path.stat().st_size,
                    "sha256": sha256_file(path),
                }
            )
    return out
