from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Iterable

from .utils import stable_id


def merge_allocated_intervals(records: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in records:
        groups[row["hromada_id"]].append(row)

    merged: list[dict[str, Any]] = []
    for hromada_id, rows in groups.items():
        rows.sort(key=lambda r: (r["started_at"], r["finished_at"], r["source_row_id"]))
        current: dict[str, Any] | None = None
        for row in rows:
            if current is None:
                current = _new_current(row)
                continue
            if row["started_at"] <= current["finished_at"]:
                if row["finished_at"] > current["finished_at"]:
                    current["finished_at"] = row["finished_at"]
                current["source_levels"].add(row["source_level"])
                current["source_row_ids"].append(row["source_row_id"])
                current["precision_labels"].add(row["precision_label"])
            else:
                merged.append(_finish_current(current))
                current = _new_current(row)
        if current is not None:
            merged.append(_finish_current(current))
    merged.sort(key=lambda r: (r["hromada_id"], r["started_at"], r["finished_at"]))
    return merged


def _new_current(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "hromada_id": row["hromada_id"],
        "oblast_id": row["oblast_id"],
        "raion_id": row["raion_id"],
        "started_at": row["started_at"],
        "finished_at": row["finished_at"],
        "source_levels": {row["source_level"]},
        "precision_labels": {row["precision_label"]},
        "source_row_ids": [row["source_row_id"]],
    }


def _finish_current(current: dict[str, Any]) -> dict[str, Any]:
    episode_id = "E-" + stable_id(
        current["hromada_id"],
        current["started_at"].isoformat(),
        current["finished_at"].isoformat(),
    )
    return {
        **current,
        "episode_id": episode_id,
        "source_levels": sorted(current["source_levels"]),
        "precision_labels": sorted(current["precision_labels"]),
        "source_row_count": len(current["source_row_ids"]),
    }


def overlap_seconds(start_a: datetime, end_a: datetime, start_b: datetime, end_b: datetime) -> int:
    start = max(start_a, start_b)
    end = min(end_a, end_b)
    return max(0, int((end - start).total_seconds()))
