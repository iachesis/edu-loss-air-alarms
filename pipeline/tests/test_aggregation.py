from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from aae_pipeline.aggregate import aggregate_multi_area, aggregate_precision_label


class AggregationTests(unittest.TestCase):
    def test_school_location_weighting(self):
        rows = [
            row("H1", school_count=1, alarm_seconds=100, available=1000, affected=1, episodes=2),
            row("H2", school_count=3, alarm_seconds=300, available=1000, affected=3, episodes=4),
        ]
        result = aggregate_multi_area(rows, "oblast")[0]
        self.assertAlmostEqual(result["alarm_seconds_average_school_location"], 250.0)
        self.assertAlmostEqual(result["available_school_seconds_average_school_location"], 1000.0)
        self.assertAlmostEqual(result["school_time_under_alarm_pct"], 25.0)
        self.assertAlmostEqual(result["affected_school_days_average_school_location"], 2.5)
        self.assertEqual(result["school_count"], 4)
        self.assertEqual(result["comparable_school_count"], 4)

    def test_missingness_weighting_keeps_education_context_separate(self):
        rows = [
            row("covered", school_count=2, alarm_seconds=100, available=1000, affected=1, episodes=2),
            row("covered-zero", school_count=3, alarm_seconds=0, available=1000, affected=0, episodes=0),
            row(
                "not-covered",
                school_count=5,
                alarm_seconds=None,
                available=0,
                affected=None,
                episodes=None,
                coverage_status="not_covered",
            ),
        ]
        result = aggregate_multi_area(rows, "oblast")[0]
        self.assertEqual(result["school_count"], 10)
        self.assertEqual(result["comparable_school_count"], 5)
        self.assertEqual(result["coverage_status"], "partial")
        self.assertAlmostEqual(result["alarm_seconds_average_school_location"], 40.0)
        self.assertAlmostEqual(result["available_school_seconds_average_school_location"], 1000.0)
        self.assertAlmostEqual(result["school_time_under_alarm_pct"], 4.0)

    def test_unavailable_member_is_not_zero_imputed(self):
        rows = [
            row("covered", school_count=2, alarm_seconds=100, available=1000, affected=1, episodes=2),
            row(
                "unavailable",
                school_count=8,
                alarm_seconds=None,
                available=0,
                affected=None,
                episodes=None,
                coverage_status="unavailable",
            ),
        ]
        result = aggregate_multi_area(rows, "oblast")[0]
        self.assertEqual(result["school_count"], 10)
        self.assertEqual(result["comparable_school_count"], 2)
        self.assertEqual(result["coverage_status"], "partial")
        self.assertEqual(result["alarm_seconds_average_school_location"], 100)

        unavailable = aggregate_multi_area([rows[1]], "oblast")[0]
        self.assertEqual(unavailable["school_count"], 8)
        self.assertEqual(unavailable["comparable_school_count"], 0)
        self.assertEqual(unavailable["coverage_status"], "unavailable")
        self.assertIsNone(unavailable["alarm_seconds_average_school_location"])
        self.assertIsNone(unavailable["available_school_seconds_average_school_location"])

    def test_aggregate_precision_propagates_mixed(self):
        self.assertEqual(aggregate_precision_label(["mixed"]), "mixed")
        self.assertEqual(aggregate_precision_label(["mixed", "oblast allocation"]), "mixed")
        self.assertEqual(aggregate_precision_label(["hromada"]), "hromada")
        self.assertEqual(aggregate_precision_label(["raion allocation"]), "raion allocation")
        self.assertEqual(aggregate_precision_label(["oblast allocation"]), "oblast allocation")
        self.assertEqual(aggregate_precision_label(["not applicable", ""]), "not applicable")


def row(
    hromada_id,
    school_count,
    alarm_seconds,
    available,
    affected,
    episodes,
    coverage_status="complete",
):
    return {
        "area_level": "hromada",
        "oblast_id": "UA12",
        "raion_id": "R",
        "hromada_id": hromada_id,
        "school_year": "2024_2025",
        "period_type": "month",
        "period_id": "2025-01",
        "alarm_seconds": alarm_seconds,
        "available_school_seconds": available,
        "expected_school_seconds": 1000,
        "affected_school_days": affected,
        "available_school_days": 10,
        "expected_school_days": 10,
        "school_time_alarm_episodes": episodes,
        "source_precision_label": "oblast allocation",
        "coverage_status": coverage_status,
        "school_count": school_count,
        "learners_total": school_count * 100,
        "learners_offline": 0,
        "learners_online": 0,
        "learners_mixed": 0,
        "education_snapshot_date": "2025-03-20",
    }


if __name__ == "__main__":
    unittest.main()
