from __future__ import annotations

import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.calendar import build_school_days


class CalendarTests(unittest.TestCase):
    def test_weekdays_vacations_and_seven_hour_window(self):
        assumptions = json.loads((ROOT / "config/assumptions.json").read_text(encoding="utf-8"))
        days = build_school_days(
            ROOT,
            assumptions,
            "2024_2025",
            datetime(2025, 1, 1, tzinfo=timezone.utc),
            datetime(2025, 4, 1, tzinfo=timezone.utc),
        )
        by_date = {row.day.isoformat(): row for row in days}
        self.assertNotIn("2025-01-04", by_date)  # Saturday
        self.assertNotIn("2025-01-03", by_date)  # configured winter vacation
        self.assertIn("2025-01-13", by_date)
        self.assertEqual(by_date["2025-01-13"].expected_seconds, 7 * 3600)
        self.assertEqual(by_date["2025-01-13"].available_seconds, 7 * 3600)
        self.assertEqual(by_date["2024-12-02"].available_seconds, 0)

    def test_kyiv_spring_dst_transition_preserves_seven_local_hours(self):
        assumptions = json.loads((ROOT / "config/assumptions.json").read_text(encoding="utf-8"))
        days = build_school_days(
            ROOT,
            assumptions,
            "2023_2024",
            datetime(2024, 3, 1, tzinfo=timezone.utc),
            datetime(2024, 5, 1, tzinfo=timezone.utc),
        )
        by_date = {row.day.isoformat(): row for row in days}
        self.assertEqual(by_date["2024-03-22"].utc_start.hour, 6)
        self.assertEqual(by_date["2024-04-01"].utc_start.hour, 5)
        self.assertEqual(by_date["2024-03-22"].expected_seconds, 25200)
        self.assertEqual(by_date["2024-04-01"].expected_seconds, 25200)

    def test_kyiv_autumn_dst_transition_preserves_seven_local_hours(self):
        assumptions = json.loads((ROOT / "config/assumptions.json").read_text(encoding="utf-8"))
        days = build_school_days(
            ROOT,
            assumptions,
            "2024_2025",
            datetime(2024, 10, 1, tzinfo=timezone.utc),
            datetime(2024, 11, 15, tzinfo=timezone.utc),
        )
        by_date = {row.day.isoformat(): row for row in days}
        self.assertEqual(by_date["2024-10-25"].utc_start.hour, 5)
        self.assertEqual(by_date["2024-11-04"].utc_start.hour, 6)
        self.assertEqual(by_date["2024-10-25"].expected_seconds, 25200)
        self.assertEqual(by_date["2024-11-04"].expected_seconds, 25200)


if __name__ == "__main__":
    unittest.main()
