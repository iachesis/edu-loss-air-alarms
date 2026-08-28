from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from .utils import parse_datetime_utc, read_csv_rows


@dataclass(frozen=True)
class SchoolDay:
    school_year: str
    day: date
    local_start: datetime
    local_end: datetime
    utc_start: datetime
    utc_end: datetime
    expected_seconds: int
    available_start_utc: datetime | None
    available_end_utc: datetime | None
    available_seconds: int


def parse_clock(value: str) -> time:
    parts = [int(x) for x in value.split(":")]
    while len(parts) < 3:
        parts.append(0)
    return time(parts[0], parts[1], parts[2])


def build_school_days(
    root: Path,
    assumptions: dict,
    school_year: str,
    coverage_start_utc: datetime,
    coverage_end_utc: datetime,
) -> list[SchoolDay]:
    years = read_csv_rows(root / assumptions["calendar"]["school_years_file"])
    vacations = read_csv_rows(root / assumptions["calendar"]["vacations_file"])
    year_row = next((r for r in years if r["school_year"] == school_year and r.get("is_active", "1") != "0"), None)
    if not year_row:
        raise ValueError(f"Unknown or inactive school year: {school_year}")

    start_date = date.fromisoformat(year_row["start_date"])
    end_date = date.fromisoformat(year_row["end_date"])
    vacation_ranges = [
        (date.fromisoformat(r["start_date"]), date.fromisoformat(r["end_date"]))
        for r in vacations
        if r["school_year"] == school_year and r.get("is_active", "1") != "0"
    ]
    weekdays = set(int(v) for v in assumptions["calendar"]["school_weekdays"])
    tz = ZoneInfo(assumptions["timezone"])
    start_clock = parse_clock(assumptions["school_operating_window"]["start"])
    end_clock = parse_clock(assumptions["school_operating_window"]["end"])

    out: list[SchoolDay] = []
    cursor = start_date
    while cursor <= end_date:
        in_vacation = any(v_start <= cursor <= v_end for v_start, v_end in vacation_ranges)
        if cursor.isoweekday() in weekdays and not in_vacation:
            local_start = datetime.combine(cursor, start_clock, tzinfo=tz)
            local_end = datetime.combine(cursor, end_clock, tzinfo=tz)
            utc_start = local_start.astimezone(timezone.utc)
            utc_end = local_end.astimezone(timezone.utc)
            available_start = max(utc_start, coverage_start_utc)
            available_end = min(utc_end, coverage_end_utc)
            available_seconds = max(0, int((available_end - available_start).total_seconds()))
            if available_seconds == 0:
                available_start_value = None
                available_end_value = None
            else:
                available_start_value = available_start
                available_end_value = available_end
            out.append(
                SchoolDay(
                    school_year=school_year,
                    day=cursor,
                    local_start=local_start,
                    local_end=local_end,
                    utc_start=utc_start,
                    utc_end=utc_end,
                    expected_seconds=int((utc_end - utc_start).total_seconds()),
                    available_start_utc=available_start_value,
                    available_end_utc=available_end_value,
                    available_seconds=available_seconds,
                )
            )
        cursor += timedelta(days=1)
    return out
