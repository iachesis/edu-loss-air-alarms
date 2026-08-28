from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable


def precision_label(levels: set[str]) -> str:
    levels = {x for x in levels if x}
    if levels == {"hromada"}:
        return "hromada"
    if levels == {"raion"}:
        return "raion allocation"
    if levels == {"oblast"}:
        return "oblast allocation"
    if len(levels) > 1:
        return "mixed"
    return "not applicable"


def coverage_status(
    available_seconds: float,
    expected_seconds: float,
    component_statuses: Iterable[str] | None = None,
) -> str:
    statuses = [status for status in (component_statuses or []) if status]
    if available_seconds <= 0 and statuses and all(status == "not_covered" for status in statuses):
        return "not_covered"
    if expected_seconds <= 0:
        return "unavailable"
    if available_seconds <= 0:
        return "unavailable"
    if abs(available_seconds - expected_seconds) < 0.5:
        return "complete"
    return "partial"


def aggregate_hromada_periods(
    daily_rows: Iterable[dict[str, Any]],
    education: dict[str, dict[str, Any]],
    hromada_meta: dict[str, dict[str, str]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    daily = list(daily_rows)
    monthly = _aggregate_hromada(daily, education, hromada_meta, period_type="month")
    school_year = _aggregate_hromada(daily, education, hromada_meta, period_type="school_year")
    return monthly, school_year


def _aggregate_hromada(
    daily: list[dict[str, Any]],
    education: dict[str, dict[str, Any]],
    hromada_meta: dict[str, dict[str, str]],
    period_type: str,
) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    for row in daily:
        period_id = row["month"] if period_type == "month" else row["school_year"]
        key = (row["hromada_id"], period_id)
        if key not in groups:
            groups[key] = {
                "hromada_id": row["hromada_id"],
                "school_year": row["school_year"],
                "period_type": period_type,
                "period_id": period_id,
                "alarm_seconds": 0,
                "available_school_seconds": 0,
                "expected_school_seconds": 0,
                "affected_school_days": 0,
                "available_school_days": 0,
                "expected_school_days": 0,
                "episode_ids": set(),
                "source_levels": set(),
                "component_coverage_statuses": [],
            }
        target = groups[key]
        target["alarm_seconds"] += row["alarm_seconds"]
        target["available_school_seconds"] += row["available_school_seconds"]
        target["expected_school_seconds"] += row["expected_school_seconds"]
        target["affected_school_days"] += row["affected_school_day"]
        target["available_school_days"] += 1 if row["available_school_seconds"] > 0 else 0
        target["expected_school_days"] += 1
        target["episode_ids"].update(row["episode_ids"])
        target["source_levels"].update(row["source_levels"])
        target["component_coverage_statuses"].append(row["coverage_status"])

    out: list[dict[str, Any]] = []
    for target in groups.values():
        hromada_id = target["hromada_id"]
        meta = hromada_meta[hromada_id]
        edu = education.get(hromada_id, {})
        alarm = target["alarm_seconds"]
        available = target["available_school_seconds"]
        status = coverage_status(
            available,
            target["expected_school_seconds"],
            target["component_coverage_statuses"],
        )
        unavailable_by_contract = status == "not_covered"
        result = {
            "area_level": "hromada",
            "oblast_id": meta["oblast_id"],
            "raion_id": meta["raion_id"],
            "hromada_id": hromada_id,
            "school_year": target["school_year"],
            "period_type": target["period_type"],
            "period_id": target["period_id"],
            "alarm_seconds": None if unavailable_by_contract else alarm,
            "alarm_hours": None if unavailable_by_contract else round(alarm / 3600, 6),
            "available_school_seconds": available,
            "expected_school_seconds": target["expected_school_seconds"],
            "school_time_under_alarm_pct": None if available <= 0 else alarm / available * 100,
            "affected_school_days": None if unavailable_by_contract else target["affected_school_days"],
            "available_school_days": target["available_school_days"],
            "expected_school_days": target["expected_school_days"],
            "school_time_alarm_episodes": None if unavailable_by_contract else len(target["episode_ids"]),
            "source_precision_label": precision_label(target["source_levels"]),
            "coverage_status": status,
            "school_count": int(edu.get("school_count", 0)),
            "learners_total": int(edu.get("learners_total", 0)),
            "learners_offline": int(edu.get("learners_offline", 0)),
            "learners_online": int(edu.get("learners_online", 0)),
            "learners_mixed": int(edu.get("learners_mixed", 0)),
            "education_snapshot_date": edu.get("snapshot_date"),
        }
        out.append(result)
    return sorted(out, key=lambda r: (r["period_id"], r["oblast_id"], r["hromada_id"]))


def aggregate_multi_area(
    hromada_rows: Iterable[dict[str, Any]],
    area_level: str,
) -> list[dict[str, Any]]:
    rows = list(hromada_rows)
    if area_level not in {"oblast", "national"}:
        raise ValueError(area_level)
    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        area_id = row["oblast_id"] if area_level == "oblast" else "UA"
        groups[(area_id, row["period_type"], row["period_id"])].append(row)

    out: list[dict[str, Any]] = []
    for (area_id, period_type, period_id), members in groups.items():
        weighted_members = [m for m in members if int(m.get("school_count", 0)) > 0]
        total_schools = sum(int(m["school_count"]) for m in weighted_members)
        if total_schools > 0:
            def weighted(field: str) -> float:
                return sum(float(m.get(field) or 0) * int(m["school_count"]) for m in weighted_members) / total_schools
            alarm_seconds = weighted("alarm_seconds")
            available_seconds = weighted("available_school_seconds")
            expected_seconds = weighted("expected_school_seconds")
            affected_days = weighted("affected_school_days")
            available_days = weighted("available_school_days")
            expected_days = weighted("expected_school_days")
            episodes = weighted("school_time_alarm_episodes")
        else:
            alarm_seconds = available_seconds = expected_seconds = 0.0
            affected_days = available_days = expected_days = episodes = 0.0

        status_members = weighted_members if total_schools > 0 else members
        status = coverage_status(
            available_seconds,
            expected_seconds,
            [m.get("coverage_status", "") for m in status_members],
        )
        unavailable_by_contract = status == "not_covered"

        levels = {m["source_precision_label"] for m in members if m["source_precision_label"] != "not applicable"}
        if levels == {"hromada"}:
            precision = "hromada"
        elif levels == {"raion allocation"}:
            precision = "raion allocation"
        elif levels == {"oblast allocation"}:
            precision = "oblast allocation"
        elif len(levels) > 1:
            precision = "mixed"
        else:
            precision = "not applicable"

        out.append({
            "area_level": area_level,
            "area_id": area_id,
            "school_year": members[0]["school_year"],
            "period_type": period_type,
            "period_id": period_id,
            "alarm_seconds_average_school_location": None if unavailable_by_contract else alarm_seconds,
            "alarm_hours_average_school_location": None if unavailable_by_contract else round(alarm_seconds / 3600, 6),
            "available_school_seconds_average_school_location": available_seconds,
            "expected_school_seconds_average_school_location": expected_seconds,
            "school_time_under_alarm_pct": None if available_seconds <= 0 else alarm_seconds / available_seconds * 100,
            "affected_school_days_average_school_location": None if unavailable_by_contract else affected_days,
            "available_school_days_average_school_location": available_days,
            "expected_school_days_average_school_location": expected_days,
            "school_time_alarm_episodes_average_school_location": None if unavailable_by_contract else episodes,
            "source_precision_label": precision,
            "coverage_status": status,
            "school_count": total_schools,
            "learners_total": sum(int(m.get("learners_total", 0)) for m in members),
            "learners_offline": sum(int(m.get("learners_offline", 0)) for m in members),
            "learners_online": sum(int(m.get("learners_online", 0)) for m in members),
            "learners_mixed": sum(int(m.get("learners_mixed", 0)) for m in members),
            "education_snapshot_date": members[0].get("education_snapshot_date"),
            "hromada_count": len(members),
            "weighted_hromada_count": len(weighted_members),
        })
    return sorted(out, key=lambda r: (r["period_id"], r["area_id"]))
