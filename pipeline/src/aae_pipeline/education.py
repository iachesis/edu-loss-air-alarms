from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

from .controlled_inputs import resolve_education_snapshot
from .geography import GeographyIndex
from .utils import read_csv_rows


def select_snapshot(sources: dict[str, Any], school_year: str) -> dict[str, Any]:
    candidates = [r for r in sources["education_snapshots"] if r["school_year"] == school_year]
    if not candidates:
        raise ValueError(f"No education snapshot configured for {school_year}")
    selected = next((r for r in candidates if r.get("role") == "selected"), None)
    if selected is None:
        selected = candidates[0]
    return selected


def _parse_optional_count(
    row: dict[str, str],
    source_col: str,
    *,
    index: int,
    school_id: str,
    hromada_id: str,
    learners_total: int,
    audit_rows: list[dict[str, Any]],
) -> int:
    value = row.get(source_col, "")
    if value in (None, ""):
        return 0
    try:
        return int(float(value))
    except (TypeError, ValueError):
        audit_rows.append({
            "row_number": index,
            "school_id": school_id,
            "hromada_id": hromada_id,
            "children_total": row.get("children_total", ""),
            "issue": f"invalid {source_col}",
        })
        return 0


def load_education_context(
    root: Path,
    sources: dict[str, Any],
    geography: GeographyIndex,
    school_year: str,
    selected_hromadas: set[str],
    controlled_input_root: Path | None = None,
) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    snapshot = select_snapshot(sources, school_year)
    snapshot_file = resolve_education_snapshot(root, snapshot["path"], controlled_input_root)
    rows = read_csv_rows(snapshot_file)
    source_columns = set(rows[0]) if rows else set()
    offline_mode = "source_field" if "children_offline" in source_columns else "derived_total_minus_online"

    seen_school_ids: set[str] = set()
    audit_rows: list[dict[str, Any]] = []
    grouped: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "school_count": 0,
        "learners_total": 0,
        "learners_offline": 0,
        "learners_online": 0,
        "learners_mixed": 0,
    })
    eligible_school_rows = 0
    linked_school_rows = 0
    eligible_learners = 0
    linked_learners = 0
    derived_offline_rows = 0
    negative_derived_offline_rows = 0

    for index, row in enumerate(rows, start=2):
        school_id = str(row.get("school_id", "")).strip()
        hromada_id = geography.canonical_hromada_id(row.get("hromada_id", ""))
        try:
            learners_total = int(float(row.get("children_total", "")))
        except (TypeError, ValueError):
            learners_total = -1

        issue = None
        if not school_id:
            issue = "blank school_id"
        elif school_id in seen_school_ids:
            issue = "duplicate school_id"
        elif learners_total <= 0:
            issue = "children_total is not positive"
        elif hromada_id not in geography.hromada_by_id:
            issue = "unmapped hromada_id"

        if school_id:
            seen_school_ids.add(school_id)
        if learners_total > 0:
            eligible_school_rows += 1
            eligible_learners += learners_total

        if issue:
            audit_rows.append({
                "row_number": index,
                "school_id": school_id,
                "hromada_id": hromada_id,
                "children_total": row.get("children_total", ""),
                "issue": issue,
            })
            continue

        online = _parse_optional_count(
            row,
            "children_online",
            index=index,
            school_id=school_id,
            hromada_id=hromada_id,
            learners_total=learners_total,
            audit_rows=audit_rows,
        )
        mixed = _parse_optional_count(
            row,
            "children_mixed",
            index=index,
            school_id=school_id,
            hromada_id=hromada_id,
            learners_total=learners_total,
            audit_rows=audit_rows,
        )
        if offline_mode == "derived_total_minus_online":
            offline = learners_total - online
            derived_offline_rows += 1
            if offline < 0:
                negative_derived_offline_rows += 1
                audit_rows.append({
                    "row_number": index,
                    "school_id": school_id,
                    "hromada_id": hromada_id,
                    "children_total": row.get("children_total", ""),
                    "issue": "derived children_offline is negative",
                })
                offline = 0
        else:
            offline = _parse_optional_count(
                row,
                "children_offline",
                index=index,
                school_id=school_id,
                hromada_id=hromada_id,
                learners_total=learners_total,
                audit_rows=audit_rows,
            )

        if hromada_id not in selected_hromadas:
            continue

        linked_school_rows += 1
        linked_learners += learners_total
        target = grouped[hromada_id]
        target["school_count"] += 1
        target["learners_total"] += learners_total
        target["learners_offline"] += offline
        target["learners_online"] += online
        target["learners_mixed"] += mixed

    context: dict[str, dict[str, Any]] = {}
    for hromada_id in selected_hromadas:
        values = grouped.get(hromada_id, {
            "school_count": 0,
            "learners_total": 0,
            "learners_offline": 0,
            "learners_online": 0,
            "learners_mixed": 0,
        })
        context[hromada_id] = {
            "hromada_id": hromada_id,
            "snapshot_date": snapshot["snapshot_date"],
            **values,
        }

    linked_totals = {
        "school_count": sum(v["school_count"] for v in context.values()),
        "learners_total": sum(v["learners_total"] for v in context.values()),
        "learners_offline": sum(v["learners_offline"] for v in context.values()),
        "learners_online": sum(v["learners_online"] for v in context.values()),
        "learners_mixed": sum(v["learners_mixed"] for v in context.values()),
    }
    summary = {
        "snapshot_date": snapshot["snapshot_date"],
        "snapshot_path": snapshot["path"],
        "source_columns": sorted(source_columns),
        "offline_mode": offline_mode,
        "derived_offline_rows": derived_offline_rows,
        "negative_derived_offline_rows": negative_derived_offline_rows,
        "input_row_count": len(rows),
        "eligible_school_rows": eligible_school_rows,
        "linked_school_rows_in_selected_geography": linked_school_rows,
        "eligible_learners": eligible_learners,
        "linked_learners_in_selected_geography": linked_learners,
        "linked_context_totals": linked_totals,
        "modality_sum_minus_total": (
            linked_totals["learners_offline"]
            + linked_totals["learners_online"]
            + linked_totals["learners_mixed"]
            - linked_totals["learners_total"]
        ),
        "audit_issue_count": len(audit_rows),
    }
    return context, audit_rows, summary
